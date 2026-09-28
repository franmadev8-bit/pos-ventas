import { useCallback, useMemo, useState } from "react";
import { estadoDeCobro } from "../domain/cobro";
import type { PagoTicket } from "../domain/cobro";
import {
  agregarLinea,
  cambiarCantidad,
  cambiarPrecio,
  quitarLinea,
  totales,
} from "../domain/ticket";
import type { LineaTicket } from "../domain/ticket";
import type { Centavos, Milesimas, PuntosBasicos, Uuid } from "../domain/tipos";
import { nuevoId } from "../lib/id";
import type { Producto, ProductoConCodigos } from "../repositories/contratos/ProductoRepository";

/** Cuantos tickets se pueden tener abiertos a la vez. */
export const MAX_TICKETS = 4;

interface TicketEnCurso {
  /**
   * Id de la venta. Se crea al abrir el ticket, no al grabarlo: si el cobro
   * falla y se reintenta, el comando recibe el MISMO id y no duplica la venta.
   */
  readonly id: Uuid;
  readonly lineas: readonly LineaTicket[];
  readonly pagos: readonly PagoTicket[];
}

function ticketVacio(): TicketEnCurso {
  return { id: nuevoId(), lineas: [], pagos: [] };
}

/**
 * Los tickets en curso. Viven solo en memoria hasta que se cobran: una venta a
 * medio armar no es un hecho del negocio y no tiene por que tocar la base.
 *
 * Son varios porque en el mostrador pasa seguido que un cliente deja el ticket
 * a medias y hay que atender al que viene atras. Sin esto, o se lo hace
 * esperar o se pierde lo cargado.
 */
export function useTicketsEnCurso() {
  const [tickets, setTickets] = useState<readonly TicketEnCurso[]>(() => [ticketVacio()]);
  const [activo, setActivo] = useState(0);

  const indice = Math.min(activo, tickets.length - 1);
  const ticket = tickets[indice] ?? ticketVacio();

  const t = useMemo(() => totales(ticket.lineas, 0), [ticket.lineas]);
  const cobro = useMemo(
    () => estadoDeCobro(t.totalCentavos, ticket.pagos),
    [t.totalCentavos, ticket.pagos],
  );

  /** Aplica un cambio solo sobre el ticket activo. */
  const cambiar = useCallback(
    (fn: (t: TicketEnCurso) => TicketEnCurso) =>
      setTickets((ts) => ts.map((x, i) => (i === indice ? fn(x) : x))),
    [indice],
  );

  const sumarProducto = useCallback(
    (p: Producto | ProductoConCodigos, cantidadMilesimas: Milesimas = 1000) =>
      cambiar((x) => ({
        ...x,
        lineas: agregarLinea(x.lineas, {
          id: nuevoId(),
          tipoLinea: "producto",
          productoId: p.id,
          // Copia, no referencia: si manana cambia el precio, este ticket no.
          descripcion: p.descripcion,
          unidad: p.unidad,
          cantidadMilesimas,
          origenPrecio: "menor",
          precioUnitarioCentavos: p.precioVentaCentavos,
          precioListaCentavos: p.precioVentaCentavos,
          costoUnitarioCentavos: p.costoCentavos,
          alicuotaIvaBp: p.alicuotaIvaBp,
        }),
      })),
    [cambiar],
  );

  /**
   * Venta generica: una linea con importe y descripcion, sin producto detras.
   * Es para lo que no esta en el catalogo. No mueve stock (no hay que mover) y
   * nunca acumula contra otra: dos montos sueltos son dos hechos distintos.
   */
  const sumarGenerica = useCallback(
    (descripcion: string, importeCentavos: Centavos, alicuotaIvaBp: PuntosBasicos) =>
      cambiar((x) => ({
        ...x,
        lineas: [
          ...x.lineas,
          {
            id: nuevoId(),
            tipoLinea: "generica" as const,
            productoId: null,
            descripcion,
            unidad: "unidad" as const,
            cantidadMilesimas: 1000,
            origenPrecio: null,
            precioUnitarioCentavos: importeCentavos,
            precioListaCentavos: null,
            costoUnitarioCentavos: null,
            alicuotaIvaBp,
          },
        ],
      })),
    [cambiar],
  );

  const quitar = useCallback(
    (id: Uuid) => cambiar((x) => ({ ...x, lineas: quitarLinea(x.lineas, id) })),
    [cambiar],
  );

  const ponerCantidad = useCallback(
    (id: Uuid, cantidad: Milesimas) =>
      cambiar((x) => ({ ...x, lineas: cambiarCantidad(x.lineas, id, cantidad) })),
    [cambiar],
  );

  const ponerPrecio = useCallback(
    (id: Uuid, precio: Centavos) =>
      cambiar((x) => ({ ...x, lineas: cambiarPrecio(x.lineas, id, precio) })),
    [cambiar],
  );

  const ponerPagos = useCallback(
    (pagos: readonly PagoTicket[]) => cambiar((x) => ({ ...x, pagos })),
    [cambiar],
  );

  /** Abre un ticket nuevo y se para en el. Devuelve false si ya no entran mas. */
  const abrirTicket = useCallback((): boolean => {
    if (tickets.length >= MAX_TICKETS) return false;
    setTickets((ts) => [...ts, ticketVacio()]);
    setActivo(tickets.length);
    return true;
  }, [tickets.length]);

  /**
   * Cierra el ticket activo. Si era el ultimo, queda uno vacio: la pantalla de
   * venta nunca se queda sin ticket donde cargar.
   */
  const cerrarTicket = useCallback(() => {
    const quedan = tickets.filter((_, i) => i !== indice);
    const nuevos = quedan.length === 0 ? [ticketVacio()] : quedan;
    setTickets(nuevos);
    setActivo(Math.min(indice, nuevos.length - 1));
  }, [tickets, indice]);

  /** Rota al siguiente ticket. Con uno solo no hace nada. */
  const rotar = useCallback(
    () => setActivo((a) => (tickets.length === 0 ? 0 : (a + 1) % tickets.length)),
    [tickets.length],
  );

  return {
    tickets,
    indice,
    ventaId: ticket.id,
    lineas: ticket.lineas,
    pagos: ticket.pagos,
    totales: t,
    cobro,
    sumarProducto,
    sumarGenerica,
    quitar,
    ponerCantidad,
    ponerPrecio,
    ponerPagos,
    abrirTicket,
    cerrarTicket,
    rotar,
    irA: setActivo,
    /** Totales de cada ticket, para rotular las solapas. */
    resumen: tickets.map((x) => totales(x.lineas, 0)),
  };
}
