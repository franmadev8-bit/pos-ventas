import type { IsoUtc, Uuid } from "../../domain/tipos";

export interface Categoria {
  readonly id: Uuid;
  readonly nombre: string;
  readonly orden: number;
  readonly activo: boolean;
  readonly cantidadProductos: number;
  readonly creadoEn: IsoUtc;
}

export interface NuevaCategoria {
  readonly id: Uuid;
  readonly nombre: string;
  readonly orden: number;
}

export interface CambiosCategoria {
  readonly nombre: string;
  readonly orden: number;
  readonly activo: boolean;
}

export interface CategoriaRepository {
  listar(soloActivas: boolean): Promise<readonly Categoria[]>;
  obtenerPorId(id: Uuid): Promise<Categoria | null>;
  nombreEstaEnUso(nombreNormalizado: string, excluyendoId?: Uuid): Promise<boolean>;
  crear(categoria: NuevaCategoria): Promise<void>;
  actualizar(id: Uuid, cambios: CambiosCategoria): Promise<void>;
  cantidadDeProductosActivos(id: Uuid): Promise<number>;
}
