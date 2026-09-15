import { v4 as uuidv4 } from "uuid";
import type { Uuid } from "../domain/tipos";

/**
 * UUID v4 generado en el cliente.
 * crypto.randomUUID solo existe en contexto seguro y WebView2 no siempre lo da,
 * asi que la libreria es el camino y crypto es el atajo cuando esta.
 */
export function nuevoId(): Uuid {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return uuidv4();
}
