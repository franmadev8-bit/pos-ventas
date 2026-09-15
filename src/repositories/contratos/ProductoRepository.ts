import type {
  Centavos,
  IsoUtc,
  Milesimas,
  PuntosBasicos,
  TipoCodigo,
  Unidad,
  Uuid,
} from "../../domain/tipos";

export interface CodigoBarra {
  readonly id: Uuid;
  readonly codigo: string;
  readonly tipo: TipoCodigo;
}

export interface Producto {
  readonly id: Uuid;
  readonly categoriaId: Uuid | null;
  readonly categoriaNombre: string | null;
  readonly descripcion: string;
  readonly unidad: Unidad;
  readonly costoCentavos: Centavos | null;
  readonly precioVentaCentavos: Centavos;
  readonly precioMayoristaCentavos: Centavos | null;
  readonly alicuotaIvaBp: PuntosBasicos;
  /** Derivada de stock_movimiento, nunca un campo guardado (regla 4). */
  readonly existenciaMilesimas: Milesimas;
  readonly activo: boolean;
  readonly creadoEn: IsoUtc;
}

export interface ProductoConCodigos extends Producto {
  readonly codigos: readonly CodigoBarra[];
}

export interface DatosProducto {
  readonly categoriaId: Uuid | null;
  readonly descripcion: string;
  readonly unidad: Unidad;
  readonly costoCentavos: Centavos | null;
  readonly precioVentaCentavos: Centavos;
  readonly precioMayoristaCentavos: Centavos | null;
  readonly alicuotaIvaBp: PuntosBasicos;
  readonly codigos: readonly { readonly codigo: string; readonly tipo: TipoCodigo }[];
  /**
   * Existencia que el duenio declara en la pantalla. No se guarda como campo:
   * en un alta genera un movimiento 'inicial' y en una edicion, un 'ajuste'
   * por la diferencia contra el saldo actual.
   */
  readonly cantidadActualMilesimas: Milesimas;
}

export interface FiltroProducto {
  /** Texto crudo tal como lo tipeo el cajero. El repositorio lo normaliza. */
  readonly texto?: string;
  readonly categoriaId?: Uuid;
  readonly soloActivos?: boolean;
  readonly limite?: number;
  readonly desplazamiento?: number;
}

export interface ProductoRepository {
  buscar(filtro: FiltroProducto): Promise<readonly Producto[]>;
  contar(filtro: FiltroProducto): Promise<number>;
  obtenerPorId(id: Uuid): Promise<ProductoConCodigos | null>;
  obtenerPorCodigo(codigo: string): Promise<ProductoConCodigos | null>;
  codigoEstaEnUso(codigo: string, excluyendoProductoId?: Uuid): Promise<boolean>;
  crear(id: Uuid, datos: DatosProducto): Promise<void>;
  actualizar(id: Uuid, datos: DatosProducto): Promise<void>;
  desactivar(id: Uuid): Promise<void>;
}
