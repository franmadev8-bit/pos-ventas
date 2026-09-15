import type { TipoMedioPago, Uuid } from "../../domain/tipos";

export interface MedioPago {
  readonly id: Uuid;
  readonly nombre: string;
  readonly tipo: TipoMedioPago;
  /** Si entra al arqueo de caja: solo el efectivo esta en el cajon. */
  readonly afectaArqueo: boolean;
  readonly permiteVuelto: boolean;
  readonly orden: number;
}

export interface MedioPagoRepository {
  listar(soloActivos: boolean): Promise<readonly MedioPago[]>;
}
