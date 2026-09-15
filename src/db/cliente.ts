import Database from "@tauri-apps/plugin-sql";
import { ErrorDeBase } from "../domain/errores";

const URL_BASE = "sqlite:pos.db";

let conexion: Promise<Database> | null = null;

function textoDe(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return String(e);
}

/**
 * Abre la base una sola vez para toda la aplicacion.
 * Las migraciones las corre el plugin al cargar, antes de devolver.
 *
 * Si la apertura falla NO se cachea la promesa rechazada: si se cachea, el
 * primer error deja la app muerta hasta reiniciarla aunque el problema se
 * haya resuelto. El motivo real del plugin viaja adentro del ErrorDeBase;
 * sin eso, una migracion rota se ve igual que una consulta mal escrita.
 */
export function baseDeDatos(): Promise<Database> {
  conexion ??= Database.load(URL_BASE).catch((e: unknown) => {
    conexion = null;
    throw new ErrorDeBase(textoDe(e), `Database.load("${URL_BASE}")`);
  });
  return conexion;
}
