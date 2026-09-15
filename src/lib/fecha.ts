import type { IsoUtc } from "../domain/tipos";

/** Momento actual en UTC ISO 8601. Todo lo que se persiste usa esto. */
export function ahoraUtc(): IsoUtc {
  return new Date().toISOString();
}

/** Fecha y hora local para mostrar: "10/09/2026 15:04". */
export function aLocal(iso: IsoUtc): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/** Solo la hora local: "15:04". */
export function horaLocal(iso: IsoUtc): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}
