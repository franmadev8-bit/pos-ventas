import { useCallback, useEffect, useState } from "react";
import { mensajeDeError } from "../domain/errores";
import type { MensajeDeError } from "../domain/errores";

export interface EstadoAsync<T> {
  readonly datos: T | null;
  readonly cargando: boolean;
  /** Mensaje listo para pantalla, con el detalle tecnico aparte si existe. */
  readonly error: MensajeDeError | null;
  readonly recargar: () => void;
}

/**
 * Lo minimo para leer de la base sin traer una libreria de cache: las consultas
 * son a SQLite local y tardan milisegundos.
 */
export function useAsync<T>(
  fn: () => Promise<T>,
  deps: readonly unknown[],
  alFallar = "No se pudo leer la información.",
): EstadoAsync<T> {
  const [datos, setDatos] = useState<T | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<MensajeDeError | null>(null);
  const [tick, setTick] = useState(0);

  const recargar = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError(null);
    fn()
      .then((r) => { if (vigente) setDatos(r); })
      .catch((e: unknown) => { if (vigente) setError(mensajeDeError(e, alFallar)); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { datos, cargando, error, recargar };
}
