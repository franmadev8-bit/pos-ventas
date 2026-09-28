import { parsearCantidad } from "./cantidad";
import type { Milesimas } from "./tipos";

export interface EntradaDeVenta {
  /** Lo que hay que buscar: codigo de barras o texto de descripcion. */
  readonly busqueda: string;
  /** Cuanto cargar. Null cuando el cajero no puso multiplicador. */
  readonly cantidadMilesimas: Milesimas | null;
}

/**
 * Separa el multiplicador de lo que se busca.
 *
 * En el mostrador, pasar tres veces la misma botella por el lector es tiempo
 * perdido: se tipea la cantidad, el separador y el codigo.
 *
 *   "3*7790895"  -> 3 unidades de 7790895
 *   "3x7790895"  -> lo mismo, la x esta al lado del teclado numerico
 *   "2 * coca"   -> 2 unidades, buscando por descripcion
 *   "0,5*queso"  -> media unidad; solo vale si el producto se vende por kg,
 *                   y eso lo resuelve quien conoce el producto, no esta funcion
 *   "7790895"    -> sin multiplicador
 *
 * La cantidad se devuelve en milesimas sin saber la unidad: se parsea siempre
 * como kg (que admite decimales) y es el llamador, que ya tiene el producto en
 * la mano, el que rechaza media unidad de algo que no se vende por peso.
 */
export function separarMultiplicador(texto: string): EntradaDeVenta {
  const crudo = texto.trim();
  const m = /^(\d+(?:[.,]\d+)?)\s*[*xX]\s*(.+)$/.exec(crudo);
  if (!m) return { busqueda: crudo, cantidadMilesimas: null };

  const [, cantidad, resto] = m;
  const milesimas = parsearCantidad(cantidad ?? "", "kg");
  const busqueda = (resto ?? "").trim();
  if (milesimas === null || busqueda === "") {
    return { busqueda: crudo, cantidadMilesimas: null };
  }
  return { busqueda, cantidadMilesimas: milesimas };
}
