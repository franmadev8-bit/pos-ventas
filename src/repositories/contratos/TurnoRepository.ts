import type { Centavos, IsoUtc, Uuid } from "../../domain/tipos";

/**
 * Turno de caja. El cierre es manual, nunca por horario: un turno arranca
 * cuando alguien abre la caja y termina cuando alguien la cierra, aunque eso
 * cruce la medianoche.
 */
export interface Turno {
  readonly id: Uuid;
  readonly cajaId: Uuid;
  readonly usuarioAperturaId: Uuid;
  readonly abiertaEn: IsoUtc;
  readonly fondoInicialCentavos: Centavos;
}

export interface TurnoRepository {
  abierto(cajaId: Uuid): Promise<Turno | null>;
  abrir(turno: Turno): Promise<void>;
}
