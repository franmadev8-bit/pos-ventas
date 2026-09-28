import type { Ejecutor } from "../../db/ejecutor";
import type { TipoMedioPago } from "../../domain/tipos";
import type { MedioPagoRepository } from "../contratos/MedioPagoRepository";

interface Fila {
  id: string;
  nombre: string;
  tipo: string;
  afecta_arqueo: number;
  permite_vuelto: number;
  orden: number;
}

const TIPOS: readonly string[] = [
  "efectivo", "tarjeta", "debito", "credito",
  "transferencia", "qr", "cuenta_corriente", "otro",
];

export function crearMedioPagoRepository(ej: Ejecutor): MedioPagoRepository {
  return {
    async listar(soloActivos) {
      const filas = await ej.select<Fila>(
        `SELECT id, nombre, tipo, afecta_arqueo, permite_vuelto, orden
           FROM medio_pago ${soloActivos ? "WHERE activo = 1" : ""}
          ORDER BY orden, nombre`,
      );
      return filas.map((f) => ({
        id: f.id,
        nombre: f.nombre,
        tipo: (TIPOS.includes(f.tipo) ? f.tipo : "otro") as TipoMedioPago,
        afectaArqueo: f.afecta_arqueo === 1,
        permiteVuelto: f.permite_vuelto === 1,
        orden: f.orden,
      }));
    },
  };
}
