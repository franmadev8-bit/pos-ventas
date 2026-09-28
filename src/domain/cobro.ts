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
  /** Numero de autorizacion del POSNET. Opcional siempre. */
  readonly referencia: string | null;
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
  return {
    totalCentavos,
    pagadoCentavos: pagado,
    pendienteCentavos: totalCentavos - pagado,
    // Solo cuenta lo que efectivamente vuelve. Un recibido menor al pago no es
    // vuelto negativo: es un cobro incompleto, y eso lo dice el pendiente.
    vueltoCentavos: sumar(pagos.map((p) => Math.max(vueltoDePago(p), 0))),
    alcanza: pagado >= totalCentavos,
  };
}

/**
 * Cuanto proponer para el proximo pago: lo que falta, nunca menos de cero.
 * En un pago mixto el cajero carga primero lo que entra por tarjeta y el
 * efectivo se ofrece solo por la diferencia.
 */
export function pendienteParaProximoPago(
  totalCentavos: Centavos,
  pagos: readonly PagoTicket[],
): Centavos {
  return Math.max(estadoDeCobro(totalCentavos, pagos).pendienteCentavos, 0);
}

/**
 * Reparte lo que el cliente entrega en efectivo entre lo que cubre del ticket
 * y lo que vuelve como vuelto.
 *
 * El cajero tipea UN solo numero: lo que le ponen sobre el mostrador. De ahi
 * salen los dos que necesita la venta. Si entrega menos de lo que falta, cubre
 * todo lo que entrego y no hay vuelto: es un pago parcial, y lo que resta lo
 * paga con otro medio.
 */
export function repartirEfectivo(
  pendienteCentavos: Centavos,
  entregadoCentavos: Centavos,
): { readonly montoCentavos: Centavos; readonly vueltoCentavos: Centavos } {
  const monto = Math.min(entregadoCentavos, pendienteCentavos);
  return { montoCentavos: monto, vueltoCentavos: entregadoCentavos - monto };
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

  if (!estadoDeCobro(totalCentavos, pagos).alcanza) return "Todavía falta cubrir el total.";

  // Lo que se cobra por medios que no devuelven vuelto no puede pasar el total:
  // ese excedente no habria forma de devolverlo. El efectivo si puede pasarse,
  // porque vuelve como vuelto.
  const sinVuelto = sumar(
    pagos.filter((p) => p.recibidoCentavos === null).map((p) => p.montoCentavos),
  );
  if (sinVuelto > totalCentavos) {
    return "Estás cobrando de más con un medio que no da vuelto. Bajá el monto.";
  }

  // En efectivo, lo que entrega el cliente no puede ser menor a lo que cubre.
  for (const p of pagos) {
    if (p.recibidoCentavos !== null && p.recibidoCentavos < p.montoCentavos) {
      return "Lo que te dieron en efectivo es menor a lo que estás cobrando.";
    }
  }
  return null;
}
