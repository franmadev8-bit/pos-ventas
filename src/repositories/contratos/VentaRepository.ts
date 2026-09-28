import type { Centavos, IsoUtc, Milesimas, OrigenPrecio, PuntosBasicos, TipoLinea, Unidad, Uuid } from "../../domain/tipos";

/**
 * Lo que se manda a grabar. Todos los ids los genera el cliente (regla 1) y el
 * de la venta es ademas la clave de idempotencia (regla 13): reintentar con el
 * mismo id no duplica nada.
 */
export interface LineaAGrabar {
  readonly id: Uuid;
  readonly orden: number;
  readonly tipoLinea: TipoLinea;
  readonly productoId: Uuid | null;
  readonly descripcion: string;
  readonly unidad: Unidad;
  readonly cantidadMilesimas: Milesimas;
  readonly origenPrecio: OrigenPrecio | null;
  readonly precioUnitarioCentavos: Centavos;
  readonly precioListaCentavos: Centavos | null;
  readonly costoUnitarioCentavos: Centavos | null;
  readonly alicuotaIvaBp: PuntosBasicos;
  readonly importeCentavos: Centavos;
  /** Id del movimiento de stock que genera la linea. Null si no mueve stock. */
  readonly movimientoStockId: Uuid | null;
}

export interface PagoAGrabar {
  readonly id: Uuid;
  readonly orden: number;
  readonly medioPagoId: Uuid;
  readonly medioPagoNombre: string;
  readonly medioPagoTipo: string;
  readonly afectaArqueo: boolean;
  readonly montoCentavos: Centavos;
  readonly recibidoCentavos: Centavos | null;
  readonly vueltoCentavos: Centavos | null;
  /** Numero de autorizacion del POSNET. Opcional siempre. */
  readonly referencia: string | null;
}

export interface VentaAGrabar {
  readonly id: Uuid;
  readonly cajaId: Uuid;
  readonly cajaSesionId: Uuid;
  readonly usuarioId: Uuid;
  readonly fecha: IsoUtc;
  readonly subtotalCentavos: Centavos;
  readonly descuentoCentavos: Centavos;
  readonly totalCentavos: Centavos;
  readonly lineas: readonly LineaAGrabar[];
  readonly pagos: readonly PagoAGrabar[];
}

export interface VentaRegistrada {
  readonly id: Uuid;
  /** Numero interno del ticket. Nunca se mezcla con el fiscal (regla 7). */
  readonly ticketNumero: number;
  readonly fecha: IsoUtc;
  readonly yaExistia: boolean;
}

/** Cabecera de una venta ya grabada, para listados. */
export interface VentaResumen {
  readonly id: Uuid;
  readonly ticketNumero: number;
  readonly fecha: IsoUtc;
  readonly totalCentavos: Centavos;
  readonly cantidadLineas: number;
  /** Medios con los que se cobro, para leer la fila de un vistazo. */
  readonly medios: string;
  readonly anulada: boolean;
}

/** Una venta con todo lo que le cuelga. Es lo que hace falta para anularla. */
export interface VentaDetalle {
  readonly id: Uuid;
  readonly ticketNumero: number;
  readonly fecha: IsoUtc;
  readonly subtotalCentavos: Centavos;
  readonly descuentoCentavos: Centavos;
  readonly totalCentavos: Centavos;
  readonly anulada: boolean;
  readonly lineas: readonly LineaAGrabar[];
  readonly pagos: readonly PagoAGrabar[];
}

/** El ticket espejo que anula a otro. Todos los montos, en negativo. */
export interface AnulacionAGrabar {
  readonly id: Uuid;
  readonly ventaAnuladaId: Uuid;
  readonly cajaId: Uuid;
  readonly cajaSesionId: Uuid;
  readonly usuarioId: Uuid;
  readonly fecha: IsoUtc;
  readonly motivo: string;
  readonly subtotalCentavos: Centavos;
  readonly descuentoCentavos: Centavos;
  readonly totalCentavos: Centavos;
  readonly lineas: readonly LineaAGrabar[];
  readonly pagos: readonly PagoAGrabar[];
}

export interface VentaRepository {
  /**
   * Graba la venta entera en una transaccion. Es la unica escritura del
   * sistema que no pasa por el plugin: va por un comando Rust porque toca
   * cinco tablas y el plugin no expone transacciones.
   */
  registrar(venta: VentaAGrabar): Promise<VentaRegistrada>;
  /**
   * Anula con un ticket espejo, tambien en una transaccion. Las ventas no se
   * editan ni se borran (regla 5): anular es un hecho nuevo, no un borrado.
   */
  anular(anulacion: AnulacionAGrabar): Promise<VentaRegistrada>;
  ultimasDelTurno(cajaSesionId: Uuid, limite: number): Promise<readonly VentaResumen[]>;
  obtenerDetalle(id: Uuid): Promise<VentaDetalle | null>;
}
