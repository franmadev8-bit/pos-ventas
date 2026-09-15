import type { Centavos } from "../domain/tipos";

const NUM = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 123456 -> "1.234,56". Sin simbolo: para columnas de tabla. */
export function formatearCentavos(centavos: Centavos): string {
  return NUM.format(centavos / 100);
}

/** 123456 -> "$ 1.234,56". Con simbolo: para totales. */
export function formatearPesos(centavos: Centavos): string {
  return `$ ${NUM.format(centavos / 100)}`;
}

/** 0.2855 -> "28,6 %". Devuelve un guion si no hay valor. */
export function formatearPorcentaje(fraccion: number | null): string {
  if (fraccion === null || !Number.isFinite(fraccion)) return "—";
  return `${new Intl.NumberFormat("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(fraccion * 100)} %`;
}

/** 2100 -> "21 %". Alicuota en puntos basicos. */
export function formatearAlicuota(puntosBasicos: number): string {
  const p = puntosBasicos / 100;
  const txt = Number.isInteger(p) ? String(p) : String(p).replace(".", ",");
  return `${txt} %`;
}
