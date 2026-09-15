import type { Ejecutor } from "../../db/ejecutor";
import { ahoraUtc } from "../../lib/fecha";
import { normalizar } from "../../lib/texto";
import type {
  CambiosCategoria,
  Categoria,
  CategoriaRepository,
  NuevaCategoria,
} from "../contratos/CategoriaRepository";
import type { Uuid } from "../../domain/tipos";

interface FilaCategoria {
  id: string;
  nombre: string;
  orden: number;
  activo: number;
  creado_en: string;
  cantidad_productos: number;
}

const SELECT_BASE = `
  SELECT c.id, c.nombre, c.orden, c.activo, c.creado_en,
         (SELECT COUNT(*) FROM producto p
           WHERE p.categoria_id = c.id AND p.activo = 1) AS cantidad_productos
    FROM categoria c`;

function aCategoria(f: FilaCategoria): Categoria {
  return {
    id: f.id,
    nombre: f.nombre,
    orden: f.orden,
    activo: f.activo === 1,
    cantidadProductos: f.cantidad_productos,
    creadoEn: f.creado_en,
  };
}

export function crearCategoriaRepository(ej: Ejecutor): CategoriaRepository {
  return {
    async listar(soloActivas) {
      const where = soloActivas ? "WHERE c.activo = 1" : "";
      const filas = await ej.select<FilaCategoria>(
        `${SELECT_BASE} ${where} ORDER BY c.orden, c.nombre`,
      );
      return filas.map(aCategoria);
    },

    async obtenerPorId(id) {
      const filas = await ej.select<FilaCategoria>(`${SELECT_BASE} WHERE c.id = $1`, [id]);
      const f = filas[0];
      return f ? aCategoria(f) : null;
    },

    async nombreEstaEnUso(nombreNormalizado, excluyendoId) {
      // La condicion se arma segun haga falta en vez de pasar un parametro
      // nulo: un placeholder repetido o en NULL no viaja bien por el plugin.
      const sql = excluyendoId
        ? `SELECT COUNT(*) AS n FROM categoria
            WHERE nombre_norm = $1 AND activo = 1 AND id <> $2`
        : `SELECT COUNT(*) AS n FROM categoria
            WHERE nombre_norm = $1 AND activo = 1`;
      const params = excluyendoId ? [nombreNormalizado, excluyendoId] : [nombreNormalizado];
      const filas = await ej.select<{ n: number }>(sql, params);
      return (filas[0]?.n ?? 0) > 0;
    },

    async crear(categoria: NuevaCategoria) {
      const t = ahoraUtc();
      await ej.execute(
        `INSERT INTO categoria (id, nombre, nombre_norm, orden, activo, creado_en, actualizado_en)
         VALUES ($1, $2, $3, $4, 1, $5, $6)`,
        [categoria.id, categoria.nombre, normalizar(categoria.nombre), categoria.orden, t, t],
      );
    },

    async actualizar(id: Uuid, cambios: CambiosCategoria) {
      await ej.execute(
        `UPDATE categoria
            SET nombre = $2, nombre_norm = $3, orden = $4, activo = $5, actualizado_en = $6
          WHERE id = $1`,
        [id, cambios.nombre, normalizar(cambios.nombre), cambios.orden, cambios.activo ? 1 : 0, ahoraUtc()],
      );
    },

    async cantidadDeProductosActivos(id) {
      const filas = await ej.select<{ n: number }>(
        `SELECT COUNT(*) AS n FROM producto WHERE categoria_id = $1 AND activo = 1`,
        [id],
      );
      return filas[0]?.n ?? 0;
    },
  };
}
