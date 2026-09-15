import { ErrorDeBase } from "../domain/errores";
import { baseDeDatos } from "./cliente";

/**
 * Lo unico que conocen las implementaciones SQLite de los repositorios.
 * Mantener esta interfaz chica es lo que deja cambiar el plugin por comandos
 * Rust mas adelante sin tocar nada mas.
 */
export interface Ejecutor {
  select<T>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  execute(sql: string, params?: readonly unknown[]): Promise<number>;
}

function detalleDe(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return String(e);
}

export const ejecutorSqlite: Ejecutor = {
  // baseDeDatos() va DENTRO del try: si falla la apertura de la base, esa
  // excepcion tambien tiene que llegar a la pantalla como ErrorDeBase.
  async select<T>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
    try {
      const db = await baseDeDatos();
      return await db.select<T[]>(sql, params as unknown[]);
    } catch (e) {
      if (e instanceof ErrorDeBase) throw e;
      throw new ErrorDeBase(detalleDe(e), sql);
    }
  },
  async execute(sql: string, params: readonly unknown[] = []): Promise<number> {
    try {
      const db = await baseDeDatos();
      const r = await db.execute(sql, params as unknown[]);
      return r.rowsAffected;
    } catch (e) {
      if (e instanceof ErrorDeBase) throw e;
      throw new ErrorDeBase(detalleDe(e), sql);
    }
  },
};
