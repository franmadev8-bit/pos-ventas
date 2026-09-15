import { importeDeLinea, sumar } from "./dinero";
import type {
  Centavos,
  Milesimas,
  OrigenPrecio,
  PuntosBasicos,
  TipoLinea,
  Unidad,
  Uuid,
} from "./tipos";

/**
 * Una linea del ticket en curso, todavia en memoria.
 *
 * Los datos del producto son una COPIA, no una referencia (regla 6): si el
 * duenio cambia el precio mientras hay un ticket abierto, ese ticket mantiene
 * el precio con el que se cargo.
 */
export interface LineaTicket {
  readonly id: Uuid;
  readonly tipoLinea: TipoLinea;
  readonly productoId: Uuid | null;
  readonly descripcion: string;
  readonly unidad: Unidad;
  readonly cantidadMilesimas: Milesimas;
  readonly origenPrecio: OrigenPrecio | null;
  readonly precioUnitarioCentavos: Centavos;
  /** Precio de lista al momento de cargarla. Sirve para ver si hubo cambio manual. */
  readonly precioListaCentavos: Centavos | null;
  readonly costoUnitarioCentavos: Centavos | null;
  readonly alicuotaIvaBp: PuntosBasicos;
}

export interface TotalesTicket {
  readonly subtotalCentavos: Centavos;
  readonly descuentoCentavos: Centavos;
  readonly totalCentavos: Centavos;
  readonly cantidadLineas: number;
}

/** El importe NO se guarda en la linea: se deriva. Una sola fuente de verdad. */
export function importeLinea(l: LineaTicket): Centavos {
  return importeDeLinea(l.precioUnitarioCentavos, l.cantidadMilesimas);
}

/**
 * Totales del ticket. El subtotal es la suma de importes YA redondeados, no
 * el redondeo de la suma: asi el total coincide con lo que el cliente ve
 * sumando el ticket a mano.
 */
export function totales(
  lineas: readonly LineaTicket[],
  descuentoCentavos: Centavos = 0,
): TotalesTicket {
  const subtotal = sumar(lineas.map(importeLinea));
  return {
    subtotalCentavos: subtotal,
    descuentoCentavos,
    totalCentavos: subtotal - descuentoCentavos,
    cantidadLineas: lineas.length,
  };
}

/**
 * Suma una linea al ticket. Si el mismo producto ya esta cargado con el mismo
 * precio, acumula la cantidad en vez de repetir el renglon: en el mostrador se
 * pasan tres gaseosas iguales por el lector y el ticket tiene que decir 3, no
 * tres renglones de 1.
 *
 * No acumula cuando el precio se toco a mano: esos son dos hechos distintos y
 * juntarlos borraria uno.
 */
export function agregarLinea(
  lineas: readonly LineaTicket[],
  nueva: LineaTicket,
): readonly LineaTicket[] {
  const i = lineas.findIndex(
    (l) =>
      l.productoId !== null &&
      l.productoId === nueva.productoId &&
      l.precioUnitarioCentavos === nueva.precioUnitarioCentavos &&
      l.origenPrecio === nueva.origenPrecio &&
      l.origenPrecio !== "manual",
  );
  if (i === -1) return [...lineas, nueva];
  const actual = lineas[i];
  if (!actual) return [...lineas, nueva];
  return lineas.map((l, j) =>
    j === i
      ? { ...actual, cantidadMilesimas: actual.cantidadMilesimas + nueva.cantidadMilesimas }
      : l,
  );
}

export function quitarLinea(
  lineas: readonly LineaTicket[],
  id: Uuid,
): readonly LineaTicket[] {
  return lineas.filter((l) => l.id !== id);
}

/** Cambiar la cantidad a cero equivale a borrar la linea. */
export function cambiarCantidad(
  lineas: readonly LineaTicket[],
  id: Uuid,
  cantidadMilesimas: Milesimas,
): readonly LineaTicket[] {
  if (cantidadMilesimas <= 0) return quitarLinea(lineas, id);
  return lineas.map((l) => (l.id === id ? { ...l, cantidadMilesimas } : l));
}

/** Tocar el precio a mano deja la linea marcada como 'manual' para siempre. */
export function cambiarPrecio(
  lineas: readonly LineaTicket[],
  id: Uuid,
  precioUnitarioCentavos: Centavos,
): readonly LineaTicket[] {
  return lineas.map((l) =>
    l.id === id
      ? {
          ...l,
          precioUnitarioCentavos,
          origenPrecio: l.tipoLinea === "producto" ? ("manual" as OrigenPrecio) : l.origenPrecio,
        }
      : l,
  );
}
