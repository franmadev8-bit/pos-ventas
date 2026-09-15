import type { Centavos, Milesimas } from "./tipos";

/** Tope de seguridad: mil millones de pesos en centavos. */
const MAX_CENTAVOS = 100_000_000_000;

/**
 * Division entera con redondeo de mitad hacia arriba en valor absoluto
 * (half-up away from zero). Es el UNICO redondeo de todo el sistema.
 */
export function redondearDivision(numerador: number, denominador: number): number {
  if (!Number.isFinite(numerador) || !Number.isFinite(denominador) || denominador === 0) {
    throw new Error("redondearDivision: argumentos invalidos");
  }
  const negativo = numerador < 0 !== denominador < 0;
  const abs = Math.abs(numerador);
  const den = Math.abs(denominador);
  const cociente = Math.floor((abs + Math.floor(den / 2)) / den);
  return negativo ? -cociente : cociente;
}

/**
 * Importe de una linea de venta.
 * importe = redondear(precio_unitario * cantidad_milesimas / 1000)
 */
export function importeDeLinea(
  precioUnitarioCentavos: Centavos,
  cantidadMilesimas: Milesimas,
): Centavos {
  if (!Number.isInteger(precioUnitarioCentavos) || !Number.isInteger(cantidadMilesimas)) {
    throw new Error("importeDeLinea: los montos y cantidades son enteros");
  }
  const bruto = precioUnitarioCentavos * cantidadMilesimas;
  if (!Number.isSafeInteger(bruto)) {
    throw new Error("importeDeLinea: el importe excede el rango seguro");
  }
  return redondearDivision(bruto, 1000);
}

/** Suma de importes ya redondeados. El total nunca redondea de nuevo. */
export function sumar(importes: readonly Centavos[]): Centavos {
  let total = 0;
  for (const i of importes) {
    if (!Number.isInteger(i)) throw new Error("sumar: los importes son enteros");
    total += i;
  }
  if (Math.abs(total) > MAX_CENTAVOS) throw new Error("sumar: total fuera de rango");
  return total;
}

/**
 * Parsea lo que tipea el cajero a centavos.
 * Acepta el formato argentino y tambien el punto del teclado numerico:
 *   "2100"      -> 210000
 *   "1.234,56"  -> 123456
 *   "21,50"     -> 2150
 *   "21.5"      -> 2150      (punto con 1 o 2 decimales = separador decimal)
 *   "2.100"     -> 210000    (punto con 3 digitos = separador de miles)
 * Devuelve null si no es un monto valido.
 */
export function parsearMonto(texto: string): Centavos | null {
  const limpio = texto.trim().replace(/\s/g, "").replace(/^\$/, "");
  if (limpio === "" || !/^-?[\d.,]+$/.test(limpio)) return null;

  const negativo = limpio.startsWith("-");
  const cuerpo = negativo ? limpio.slice(1) : limpio;
  if (cuerpo === "") return null;

  let entero: string;
  let decimales: string;

  if (cuerpo.includes(",")) {
    const partes = cuerpo.split(",");
    if (partes.length !== 2) return null;
    entero = (partes[0] ?? "").replace(/\./g, "");
    decimales = partes[1] ?? "";
  } else if (cuerpo.includes(".")) {
    const partes = cuerpo.split(".");
    const ultima = partes[partes.length - 1] ?? "";
    if (partes.length === 2 && ultima.length > 0 && ultima.length <= 2) {
      entero = partes[0] ?? "";
      decimales = ultima;
    } else {
      entero = partes.join("");
      decimales = "";
    }
  } else {
    entero = cuerpo;
    decimales = "";
  }

  if (entero === "") entero = "0";
  if (!/^\d*$/.test(entero) || !/^\d*$/.test(decimales)) return null;
  if (decimales.length > 2) return null;

  const centavos = Number(entero) * 100 + Number(decimales.padEnd(2, "0") || "0");
  if (!Number.isSafeInteger(centavos) || centavos > MAX_CENTAVOS) return null;
  return negativo ? -centavos : centavos;
}
