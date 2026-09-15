import { redondearDivision } from "./dinero";
import type { Centavos, PuntosBasicos } from "./tipos";

/**
 * Neto a partir de un precio CON IVA incluido (regla 9 del proyecto).
 * neto = redondear(bruto / (1 + alicuota))
 */
export function netoDesdeBruto(
  brutoCentavos: Centavos,
  alicuotaBp: PuntosBasicos,
): Centavos {
  if (!Number.isInteger(brutoCentavos) || !Number.isInteger(alicuotaBp)) {
    throw new Error("netoDesdeBruto: se esperan enteros");
  }
  if (alicuotaBp < 0) throw new Error("netoDesdeBruto: alicuota negativa");
  return redondearDivision(brutoCentavos * 10_000, 10_000 + alicuotaBp);
}

/** El IVA es la diferencia, no un calculo aparte: asi neto + iva cierra exacto. */
export function ivaDesdeBruto(
  brutoCentavos: Centavos,
  alicuotaBp: PuntosBasicos,
): Centavos {
  return brutoCentavos - netoDesdeBruto(brutoCentavos, alicuotaBp);
}

/**
 * Ganancia sobre el costo, como fraccion (2.6 = 260 %).
 *
 * Compara peso contra peso: el costo es lo que el duenio pago y el precio es
 * lo que cobra, los dos con IVA adentro (regla 9). Es el numero con el que un
 * kiosquero arma sus precios y el unico que puede verificar a mano.
 *
 * Para un responsable inscripto queda optimista, porque ignora el IVA que va a
 * ingresar. El neto y el IVA se muestran al lado, asi que ese calculo esta a
 * la vista; el analisis fino es cosa de los reportes de V2.
 *
 * Devuelve null si no hay costo cargado o si el costo es cero.
 */
export function gananciaSobreCosto(
  precioConIvaCentavos: Centavos,
  costoCentavos: Centavos | null,
): number | null {
  if (costoCentavos === null || costoCentavos === 0) return null;
  return (precioConIvaCentavos - costoCentavos) / costoCentavos;
}
