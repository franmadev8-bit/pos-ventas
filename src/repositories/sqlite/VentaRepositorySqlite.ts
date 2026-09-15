import { comando } from "../../db/comandos";
import type { Ejecutor } from "../../db/ejecutor";
import type { Uuid } from "../../domain/tipos";
import type {
  VentaAGrabar,
  VentaRegistrada,
  VentaRepository,
  VentaResumen,
} from "../contratos/VentaRepository";

interface FilaResumen {
  id: string;
  ticket_numero: number;
  fecha: string;
  total_centavos: number;
  cantidad_lineas: number;
}

export function crearVentaRepository(ej: Ejecutor): VentaRepository {
  return {
    async registrar(venta: VentaAGrabar): Promise<VentaRegistrada> {
      // El nombre del argumento tiene que coincidir con el parametro del
      // comando Rust (`venta`), y las claves con sus campos en camelCase.
      return comando<VentaRegistrada>("registrar_venta", { venta });
    },

    async ultimasDelTurno(cajaSesionId: Uuid, limite: number): Promise<readonly VentaResumen[]> {
      const filas = await ej.select<FilaResumen>(
        `SELECT v.id, v.ticket_numero, v.fecha, v.total_centavos,
                (SELECT COUNT(*) FROM venta_linea l WHERE l.venta_id = v.id) AS cantidad_lineas
           FROM v_venta_vigente v
          WHERE v.caja_sesion_id = $1
          ORDER BY v.ticket_numero DESC
          LIMIT ${Math.trunc(limite)}`,
        [cajaSesionId],
      );
      return filas.map((f) => ({
        id: f.id,
        ticketNumero: f.ticket_numero,
        fecha: f.fecha,
        totalCentavos: f.total_centavos,
        cantidadLineas: f.cantidad_lineas,
      }));
    },
  };
}
