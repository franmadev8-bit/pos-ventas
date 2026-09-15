import { sumar } from "./dinero";
import type { Centavos, Uuid } from "./tipos";

/** Un pago del ticket. Puede haber varios medios sobre la misma venta. */
export interface PagoTicket {
  readonly id: Uuid;
  readonly medioPagoId: Uuid;
  readonly medioPagoNombre: string;
  readonly medioPagoTipo: string;
  readonly afectaArqueo: boolean;
  readonly montoCentavos: Centavos;
  /** Solo en efectivo: lo que puso el cliente sobre el mostrador. */
  readonly recibidoCentavos: Centavos | null;
}

export interface EstadoCobro {
  readonly totalCentavos: Centavos;
  readonly pagadoCentavos: Centavos;
  /** Lo que falta cubrir. Cero o negativo significa que ya alcanza. */
  readonly pendienteCentavos: Centavos;
  readonly vueltoCentavos: Centavos;
  readonly alcanza: boolean;
}

/**
 * El vuelto es del pago en efectivo, no de la venta: solo lo que se entrego en
 * mano puede volver en mano. Un pago con tarjeta nunca genera vuelto.
 */
export function vueltoDePago(p: PagoTicket): Centavos {
  if (p.recibidoCentavos === null) return 0;
  return p.recibidoCentavos - p.montoCentavos;
}

export function estadoDeCobro(
  totalCentavos: Centavos,
  pagos: readonly PagoTicket[],
): EstadoCobro {
  const pagado = sumar(pagos.map((p) => p.montoCentavos));
  const pendiente = totalCentavos - pagado;
  return {
    totalCentavos,
    pagadoCentavos: pagado,
    pendienteCentavos: pendiente,
    // Solo cuenta lo que efectivamente vuelve. Un recibido menor al pago no es
    // vuelto negativo: es un cobro incompleto, y eso lo dice el pendiente.
    vueltoCentavos: sumar(pagos.map((p) => Math.max(vueltoDePago(p), 0))),
    alcanza: pagado >= totalCentavos,
  };
}

/**
 * Motivo por el que un cobro todavia no se puede grabar, o null si esta listo.
 * El texto dice que hacer, no que fallo.
 */
export function motivoParaNoCobrar(
  totalCentavos: Centavos,
  pagos: readonly PagoTicket[],
): string | null {
  if (totalCentavos <= 0) return "Cargá algo al ticket antes de cobrar.";
  if (pagos.length === 0) return "Elegí con qué te paga.";

  const e = estadoDeCobro(totalCentavos, pagos);
  if (!e.alcanza) return "Todavía falta cubrir el total.";

  for (const p of pagos) {
    // Un medio que no da vuelto no puede recibir de mas: no hay como devolverlo.
    if (p.recibidoCentavos === null && p.montoCentavos > totalCentavos) {
      return `El pago con ${p.medioPagoNombre} es mayor al total.`;
    }
    // En efectivo, lo que entrega el cliente no puede ser menor a lo que cubre.
    if (p.recibidoCentavos !== null && p.recibidoCentavos < p.montoCentavos) {
      return "Lo que te dieron en efectivo es menor a lo que estás cobrando.";
    }
  }
  return null;
}
