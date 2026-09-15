import type { Ejecutor } from "../../db/ejecutor";
import type { Uuid } from "../../domain/tipos";
import type { Turno, TurnoRepository } from "../contratos/TurnoRepository";

interface Fila {
  id: string;
  caja_id: string;
  usuario_apertura_id: string;
  abierta_en: string;
  fondo_inicial_centavos: number;
}

export function crearTurnoRepository(ej: Ejecutor): TurnoRepository {
  return {
    async abierto(cajaId: Uuid) {
      const filas = await ej.select<Fila>(
        `SELECT id, caja_id, usuario_apertura_id, abierta_en, fondo_inicial_centavos
           FROM caja_sesion
          WHERE caja_id = $1 AND estado = 'abierta'
          LIMIT 1`,
        [cajaId],
      );
      const f = filas[0];
      if (!f) return null;
      return {
        id: f.id,
        cajaId: f.caja_id,
        usuarioAperturaId: f.usuario_apertura_id,
        abiertaEn: f.abierta_en,
        fondoInicialCentavos: f.fondo_inicial_centavos,
      };
    },

    async abrir(t: Turno) {
      // El indice unico parcial sobre estado='abierta' garantiza que no haya
      // dos turnos abiertos en la misma caja: si se corre dos veces, la
      // segunda falla en el motor, no en una comprobacion nuestra.
      await ej.execute(
        `INSERT INTO caja_sesion
           (id, caja_id, estado, usuario_apertura_id, abierta_en, fondo_inicial_centavos)
         VALUES ($1, $2, 'abierta', $3, $4, $5)`,
        [t.id, t.cajaId, t.usuarioAperturaId, t.abiertaEn, t.fondoInicialCentavos],
      );
    },
  };
}
