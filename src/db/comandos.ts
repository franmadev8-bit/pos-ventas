import { invoke } from "@tauri-apps/api/core";
import { ErrorDeBase } from "../domain/errores";

/**
 * Envoltura tipada de los comandos Rust.
 *
 * Es el segundo camino a la base, al lado del plugin: por aca van las
 * operaciones que tocan varias tablas y necesitan una transaccion de verdad.
 * El error que devuelve un comando es un string, no un Error, asi que se
 * normaliza igual que el del plugin para que la pantalla lo muestre igual.
 */
export async function comando<T>(nombre: string, argumentos: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(nombre, argumentos);
  } catch (e) {
    const detalle = e instanceof Error ? e.message : typeof e === "string" ? e : String(e);
    throw new ErrorDeBase(detalle, `invoke("${nombre}")`);
  }
}
