import type { Ejecutor } from "../../db/ejecutor";
import type { Uuid } from "../../domain/tipos";
import { ahoraUtc } from "../../lib/fecha";
import { nuevoId } from "../../lib/id";
import { normalizar, palabrasDeBusqueda } from "../../lib/texto";
import type {
  CodigoBarra,
  DatosProducto,
  FiltroProducto,
  Producto,
  ProductoConCodigos,
  ProductoRepository,
} from "../contratos/ProductoRepository";

interface FilaProducto {
  id: string;
  categoria_id: string | null;
  categoria_nombre: string | null;
  descripcion: string;
  unidad: string;
  costo_centavos: number | null;
  precio_venta_centavos: number;
  precio_mayorista_centavos: number | null;
  alicuota_iva_bp: number;
  existencia_milesimas: number | null;
  activo: number;
  creado_en: string;
}

interface FilaCodigo {
  id: string;
  codigo: string;
  tipo: string;
}

const SELECT_BASE = `
  SELECT p.id, p.categoria_id, c.nombre AS categoria_nombre, p.descripcion, p.unidad,
         p.costo_centavos, p.precio_venta_centavos, p.precio_mayorista_centavos,
         p.alicuota_iva_bp, p.activo, p.creado_en,
         s.saldo_milesimas AS existencia_milesimas
    FROM producto p
    LEFT JOIN categoria c     ON c.id = p.categoria_id
    LEFT JOIN v_stock_saldo s ON s.producto_id = p.id`;

function aProducto(f: FilaProducto): Producto {
  return {
    id: f.id,
    categoriaId: f.categoria_id,
    categoriaNombre: f.categoria_nombre,
    descripcion: f.descripcion,
    unidad: f.unidad === "kg" || f.unidad === "paquete" ? f.unidad : "unidad",
    costoCentavos: f.costo_centavos,
    precioVentaCentavos: f.precio_venta_centavos,
    precioMayoristaCentavos: f.precio_mayorista_centavos,
    alicuotaIvaBp: f.alicuota_iva_bp,
    existenciaMilesimas: f.existencia_milesimas ?? 0,
    activo: f.activo === 1,
    creadoEn: f.creado_en,
  };
}

function aCodigo(f: FilaCodigo): CodigoBarra {
  const tipo = f.tipo === "interno" || f.tipo === "balanza" ? f.tipo : "ean";
  return { id: f.id, codigo: f.codigo, tipo };
}

/**
 * Arma el WHERE de la busqueda. Cada palabra tipeada es un LIKE propio y van
 * en AND, asi "coca 2 25" encuentra "COCA COLA 2 25 L" sin importar el orden.
 */
function condiciones(filtro: FiltroProducto): { sql: string; params: unknown[] } {
  const partes: string[] = [];
  const params: unknown[] = [];

  if (filtro.soloActivos !== false) partes.push("p.activo = 1");

  if (filtro.categoriaId) {
    params.push(filtro.categoriaId);
    partes.push(`p.categoria_id = $${params.length}`);
  }

  for (const palabra of palabrasDeBusqueda(filtro.texto ?? "")) {
    params.push(`%${palabra}%`);
    partes.push(`p.descripcion_norm LIKE $${params.length}`);
  }

  return { sql: partes.length ? `WHERE ${partes.join(" AND ")}` : "", params };
}

export function crearProductoRepository(ej: Ejecutor): ProductoRepository {
  async function codigosDe(productoId: Uuid): Promise<CodigoBarra[]> {
    const filas = await ej.select<FilaCodigo>(
      `SELECT id, codigo, tipo FROM producto_codigo
        WHERE producto_id = $1 AND activo = 1 ORDER BY creado_en`,
      [productoId],
    );
    return filas.map(aCodigo);
  }

  /**
   * Ajusta la existencia escribiendo un movimiento. Nunca toca un campo del
   * producto: el saldo es la suma de los movimientos (regla 4).
   */
  async function ajustarExistencia(
    productoId: Uuid,
    objetivoMilesimas: number,
    tipo: "inicial" | "ajuste",
  ): Promise<void> {
    const filas = await ej.select<{ saldo: number | null }>(
      `SELECT saldo_milesimas AS saldo FROM v_stock_saldo WHERE producto_id = $1`,
      [productoId],
    );
    const actual = filas[0]?.saldo ?? 0;
    const delta = objetivoMilesimas - actual;
    if (delta === 0) return;

    await ej.execute(
      `INSERT INTO stock_movimiento
         (id, producto_id, tipo, cantidad_milesimas, motivo, usuario_id, creado_en)
       VALUES ($1, $2, $3, $4, $5,
               (SELECT valor FROM configuracion WHERE clave = 'usuario_actual_id'), $6)`,
      [nuevoId(), productoId, tipo, delta,
       tipo === "inicial" ? "Carga inicial" : "Ajuste desde la ficha del producto",
       ahoraUtc()],
    );
  }

  async function reemplazarCodigos(
    productoId: Uuid,
    codigos: DatosProducto["codigos"],
  ): Promise<void> {
    await ej.execute(`UPDATE producto_codigo SET activo = 0 WHERE producto_id = $1`, [productoId]);
    const t = ahoraUtc();
    for (const c of codigos) {
      await ej.execute(
        `INSERT INTO producto_codigo (id, producto_id, codigo, tipo, activo, creado_en)
         VALUES ($1, $2, $3, $4, 1, $5)`,
        [nuevoId(), productoId, c.codigo.trim(), c.tipo, t],
      );
    }
  }

  return {
    async buscar(filtro) {
      const { sql, params } = condiciones(filtro);
      const limite = filtro.limite ?? 200;
      const desp = filtro.desplazamiento ?? 0;
      const filas = await ej.select<FilaProducto>(
        `${SELECT_BASE} ${sql} ORDER BY p.descripcion LIMIT ${limite} OFFSET ${desp}`,
        params,
      );
      return filas.map(aProducto);
    },

    async contar(filtro) {
      const { sql, params } = condiciones(filtro);
      const filas = await ej.select<{ n: number }>(
        `SELECT COUNT(*) AS n FROM producto p ${sql}`,
        params,
      );
      return filas[0]?.n ?? 0;
    },

    async obtenerPorId(id) {
      const filas = await ej.select<FilaProducto>(`${SELECT_BASE} WHERE p.id = $1`, [id]);
      const f = filas[0];
      if (!f) return null;
      return { ...aProducto(f), codigos: await codigosDe(id) } satisfies ProductoConCodigos;
    },

    async obtenerPorCodigo(codigo) {
      const filas = await ej.select<FilaProducto>(
        `${SELECT_BASE}
          WHERE p.activo = 1
            AND p.id = (SELECT producto_id FROM producto_codigo
                         WHERE codigo = $1 AND activo = 1 LIMIT 1)`,
        [codigo.trim()],
      );
      const f = filas[0];
      if (!f) return null;
      return { ...aProducto(f), codigos: await codigosDe(f.id) } satisfies ProductoConCodigos;
    },

    async codigoEstaEnUso(codigo, excluyendoProductoId) {
      const sql = excluyendoProductoId
        ? `SELECT COUNT(*) AS n FROM producto_codigo
            WHERE codigo = $1 AND activo = 1 AND producto_id <> $2`
        : `SELECT COUNT(*) AS n FROM producto_codigo
            WHERE codigo = $1 AND activo = 1`;
      const params = excluyendoProductoId
        ? [codigo.trim(), excluyendoProductoId]
        : [codigo.trim()];
      const filas = await ej.select<{ n: number }>(sql, params);
      return (filas[0]?.n ?? 0) > 0;
    },

    async crear(id, d) {
      const t = ahoraUtc();
      await ej.execute(
        `INSERT INTO producto (id, categoria_id, descripcion, descripcion_norm, unidad,
                               costo_centavos, precio_venta_centavos, precio_mayorista_centavos,
                               alicuota_iva_bp, activo, creado_en, actualizado_en)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1,$10,$11)`,
        [id, d.categoriaId, d.descripcion.trim(), normalizar(d.descripcion), d.unidad,
         d.costoCentavos, d.precioVentaCentavos, d.precioMayoristaCentavos, d.alicuotaIvaBp, t, t],
      );
      await reemplazarCodigos(id, d.codigos);
      await ajustarExistencia(id, d.cantidadActualMilesimas, "inicial");
    },

    async actualizar(id, d) {
      await ej.execute(
        `UPDATE producto
            SET categoria_id = $2, descripcion = $3, descripcion_norm = $4, unidad = $5,
                costo_centavos = $6, precio_venta_centavos = $7, precio_mayorista_centavos = $8,
                alicuota_iva_bp = $9, actualizado_en = $10
          WHERE id = $1`,
        [id, d.categoriaId, d.descripcion.trim(), normalizar(d.descripcion), d.unidad,
         d.costoCentavos, d.precioVentaCentavos, d.precioMayoristaCentavos, d.alicuotaIvaBp, ahoraUtc()],
      );
      await reemplazarCodigos(id, d.codigos);
      await ajustarExistencia(id, d.cantidadActualMilesimas, "ajuste");
    },

    async desactivar(id) {
      const t = ahoraUtc();
      await ej.execute(`UPDATE producto SET activo = 0, actualizado_en = $2 WHERE id = $1`, [id, t]);
      // Los codigos se liberan con el producto: el indice unico es parcial
      // sobre los activos, asi que el EAN queda disponible para otro articulo.
      await ej.execute(`UPDATE producto_codigo SET activo = 0 WHERE producto_id = $1`, [id]);
    },
  };
}
