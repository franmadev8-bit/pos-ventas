import type { Milesimas, Unidad } from "./tipos";

export const UNA_UNIDAD: Milesimas = 1000;

/**
 * Parsea la cantidad que tipea el cajero.
 * Por unidad solo admite enteros: no se venden 1,5 alfajores.
 * Por kg admite hasta 3 decimales: 1,250 kg = 1250 milesimas.
 * Devuelve null si no es valida.
 */
export function parsearCantidad(texto: string, unidad: Unidad): Milesimas | null {
  const limpio = texto.trim().replace(/\s/g, "").replace(",", ".");
  if (limpio === "" || !/^\d*\.?\d*$/.test(limpio) || limpio === ".") return null;

  const [enteroRaw, decimalRaw] = limpio.split(".");
  const entero = enteroRaw === "" ? "0" : (enteroRaw ?? "0");
  const decimal = decimalRaw ?? "";

  // Solo el kilo admite fracciones: no se venden 1,5 alfajores ni 1,5 paquetes.
  if (unidad !== "kg" && decimal.replace(/0+$/, "") !== "") return null;
  if (decimal.length > 3) return null;

  const milesimas = Number(entero) * 1000 + Number(decimal.padEnd(3, "0") || "0");
  if (!Number.isSafeInteger(milesimas) || milesimas <= 0) return null;
  return milesimas;
}

/** Formatea para pantalla: 1000 -> "1", 1250 -> "1,250". */
export function formatearCantidad(milesimas: Milesimas, unidad: Unidad): string {
  if (unidad !== "kg") return String(Math.trunc(milesimas / 1000));
  const entero = Math.trunc(milesimas / 1000);
  const resto = Math.abs(milesimas % 1000);
  return resto === 0 ? String(entero) : `${entero},${String(resto).padStart(3, "0")}`;
}
