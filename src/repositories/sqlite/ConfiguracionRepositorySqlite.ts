import type { Ejecutor } from "../../db/ejecutor";
import { ahoraUtc } from "../../lib/fecha";
import type {
  ClaveConfiguracion,
  ConfiguracionRepository,
} from "../contratos/ConfiguracionRepository";

export function crearConfiguracionRepository(ej: Ejecutor): ConfiguracionRepository {
  return {
    async leer(clave: ClaveConfiguracion) {
      const filas = await ej.select<{ valor: string }>(
        `SELECT valor FROM configuracion WHERE clave = $1`,
        [clave],
      );
      return filas[0]?.valor ?? null;
    },

    async escribir(clave: ClaveConfiguracion, valor: string) {
      await ej.execute(
        `INSERT INTO configuracion (clave, valor, actualizado_en) VALUES ($1, $2, $3)
         ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor,
                                          actualizado_en = excluded.actualizado_en`,
        [clave, valor, ahoraUtc()],
      );
    },
  };
}
