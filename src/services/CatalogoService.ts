import { ErrorDeNegocio } from "../domain/errores";
import { ALICUOTAS_IVA } from "../domain/tipos";
import type { Uuid } from "../domain/tipos";
import { nuevoId } from "../lib/id";
import { normalizar } from "../lib/texto";
import type {
  CambiosCategoria,
  Categoria,
  CategoriaRepository,
} from "../repositories/contratos/CategoriaRepository";
import type {
  DatosProducto,
  FiltroProducto,
  Producto,
  ProductoConCodigos,
  ProductoRepository,
} from "../repositories/contratos/ProductoRepository";

export interface CatalogoService {
  listarProductos(filtro: FiltroProducto): Promise<readonly Producto[]>;
  contarProductos(filtro: FiltroProducto): Promise<number>;
  obtenerProducto(id: Uuid): Promise<ProductoConCodigos | null>;
  /** Devuelve el id: el mismo si era edicion, uno nuevo si era alta. */
  guardarProducto(id: Uuid | null, datos: DatosProducto): Promise<Uuid>;
  desactivarProducto(id: Uuid): Promise<void>;

  listarCategorias(soloActivas: boolean): Promise<readonly Categoria[]>;
  guardarCategoria(id: Uuid | null, nombre: string, orden: number): Promise<Uuid>;
  desactivarCategoria(id: Uuid): Promise<void>;
  moverCategoria(id: Uuid, direccion: "arriba" | "abajo"): Promise<void>;
}

export function crearCatalogoService(
  productos: ProductoRepository,
  categorias: CategoriaRepository,
): CatalogoService {
  async function validarProducto(id: Uuid | null, d: DatosProducto): Promise<void> {
    if (d.descripcion.trim() === "") {
      throw new ErrorDeNegocio("descripcion_vacia", "Poné una descripción para el producto.");
    }
    if (!Number.isInteger(d.precioVentaCentavos) || d.precioVentaCentavos < 0) {
      throw new ErrorDeNegocio("precio_invalido", "El precio de venta no es válido.");
    }
    if (d.costoCentavos !== null && (!Number.isInteger(d.costoCentavos) || d.costoCentavos < 0)) {
      throw new ErrorDeNegocio("costo_invalido", "El costo no es válido.");
    }
    if (
      d.precioMayoristaCentavos !== null &&
      (!Number.isInteger(d.precioMayoristaCentavos) || d.precioMayoristaCentavos < 0)
    ) {
      throw new ErrorDeNegocio("mayorista_invalido", "El precio mayorista no es válido.");
    }
    if (!ALICUOTAS_IVA.includes(d.alicuotaIvaBp)) {
      throw new ErrorDeNegocio("alicuota_invalida", "Elegí una alícuota de IVA de la lista.");
    }
    if (!Number.isInteger(d.cantidadActualMilesimas) || d.cantidadActualMilesimas < 0) {
      throw new ErrorDeNegocio("cantidad_invalida", "La cantidad actual no es válida.");
    }

    const vistos = new Set<string>();
    for (const c of d.codigos) {
      const codigo = c.codigo.trim();
      if (codigo === "") {
        throw new ErrorDeNegocio("codigo_vacio", "Hay un código de barras vacío. Borralo o completalo.");
      }
      if (vistos.has(codigo)) {
        throw new ErrorDeNegocio("codigo_repetido", `El código ${codigo} está dos veces en este producto.`);
      }
      vistos.add(codigo);
      if (await productos.codigoEstaEnUso(codigo, id ?? undefined)) {
        throw new ErrorDeNegocio(
          "codigo_en_uso",
          `El código ${codigo} ya es de otro producto. Buscalo y sacáselo primero.`,
        );
      }
    }
  }

  return {
    listarProductos: (filtro) => productos.buscar(filtro),
    contarProductos: (filtro) => productos.contar(filtro),
    obtenerProducto: (id) => productos.obtenerPorId(id),

    async guardarProducto(id, datos) {
      await validarProducto(id, datos);
      if (id === null) {
        const nuevo = nuevoId();
        await productos.crear(nuevo, datos);
        return nuevo;
      }
      await productos.actualizar(id, datos);
      return id;
    },

    async desactivarProducto(id) {
      const p = await productos.obtenerPorId(id);
      if (!p) throw new ErrorDeNegocio("no_existe", "Ese producto ya no está.");
      await productos.desactivar(id);
    },

    listarCategorias: (soloActivas) => categorias.listar(soloActivas),

    async guardarCategoria(id, nombre, orden) {
      const limpio = nombre.trim();
      if (limpio === "") {
        throw new ErrorDeNegocio("nombre_vacio", "Poné un nombre para la categoría.");
      }
      if (await categorias.nombreEstaEnUso(normalizar(limpio), id ?? undefined)) {
        throw new ErrorDeNegocio("nombre_repetido", `Ya existe una categoría "${limpio}".`);
      }
      if (id === null) {
        const nuevo = nuevoId();
        await categorias.crear({ id: nuevo, nombre: limpio, orden });
        return nuevo;
      }
      const actual = await categorias.obtenerPorId(id);
      if (!actual) throw new ErrorDeNegocio("no_existe", "Esa categoría ya no está.");
      const cambios: CambiosCategoria = { nombre: limpio, orden, activo: actual.activo };
      await categorias.actualizar(id, cambios);
      return id;
    },

    async desactivarCategoria(id) {
      const cantidad = await categorias.cantidadDeProductosActivos(id);
      if (cantidad > 0) {
        throw new ErrorDeNegocio(
          "categoria_con_productos",
          `No se puede dar de baja: la categoría tiene ${cantidad} producto${cantidad === 1 ? "" : "s"} activo${cantidad === 1 ? "" : "s"}. Movelos a otra primero.`,
        );
      }
      const actual = await categorias.obtenerPorId(id);
      if (!actual) throw new ErrorDeNegocio("no_existe", "Esa categoría ya no está.");
      await categorias.actualizar(id, { nombre: actual.nombre, orden: actual.orden, activo: false });
    },

    async moverCategoria(id, direccion) {
      const lista = [...(await categorias.listar(true))];
      const i = lista.findIndex((c) => c.id === id);
      if (i < 0) return;
      const j = direccion === "arriba" ? i - 1 : i + 1;
      const a = lista[i];
      const b = lista[j];
      if (!a || !b) return;
      await categorias.actualizar(a.id, { nombre: a.nombre, orden: j, activo: a.activo });
      await categorias.actualizar(b.id, { nombre: b.nombre, orden: i, activo: b.activo });
    },
  };
}
