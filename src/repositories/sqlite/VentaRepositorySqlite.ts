import { comando } from "../../db/comandos";
import type { Ejecutor } from "../../db/ejecutor";
import type { OrigenPrecio, TipoLinea, Unidad, Uuid } from "../../domain/tipos";
import type {
  AnulacionAGrabar,
  LineaAGrabar,
  PagoAGrabar,
  VentaAGrabar,
  VentaDetalle,
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
  medios: string | null;
  anulada: number;
}

interface FilaCabecera {
  id: string;
  ticket_numero: number;
  fecha: string;
  subtotal_centavos: number;
  descuento_centavos: number;
  total_centavos: number;
  anulada: number;
}

interface FilaLinea {
  id: string;
  orden: number;
  tipo_linea: string;
  producto_id: string | null;
  descripcion: string;
  unidad: string;
  cantidad_milesimas: number;
  origen_precio: string | null;
  precio_unitario_centavos: number;
  precio_lista_centavos: number | null;
  costo_unitario_centavos: number | null;
  alicuota_iva_bp: number;
  importe_centavos: number;
}

interface FilaPago {
  id: string;
  orden: number;
  medio_pago_id: string;
  medio_pago_nombre: string;
  medio_pago_tipo: string;
  afecta_arqueo: number;
  monto_centavos: number;
  recibido_centavos: number | null;
  vuelto_centavos: number | null;
  referencia: string | null;
}

/** Marca si la venta tiene una anulacion que la referencia. */
const ANULADA = `EXISTS (SELECT 1 FROM venta a WHERE a.venta_anulada_id = v.id)`;

export function crearVentaRepository(ej: Ejecutor): VentaRepository {
  return {
    async registrar(venta: VentaAGrabar): Promise<VentaRegistrada> {
      // El nombre del argumento tiene que coincidir con el parametro del
      // comando Rust (`venta`), y las claves con sus campos en camelCase.
      return comando<VentaRegistrada>("registrar_venta", { venta });
    },

    async anular(anulacion: AnulacionAGrabar): Promise<VentaRegistrada> {
      return comando<VentaRegistrada>("anular_venta", { anulacion });
    },

    async ultimasDelTurno(cajaSesionId: Uuid, limite: number): Promise<readonly VentaResumen[]> {
      const filas = await ej.select<FilaResumen>(
        `SELECT v.id, v.ticket_numero, v.fecha, v.total_centavos, ${ANULADA} AS anulada,
                (SELECT COUNT(*) FROM venta_linea l WHERE l.venta_id = v.id) AS cantidad_lineas,
                (SELECT group_concat(DISTINCT p.medio_pago_nombre)
                   FROM venta_pago p WHERE p.venta_id = v.id) AS medios
           FROM venta v
          WHERE v.caja_sesion_id = $1 AND v.tipo = 'venta'
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
        medios: (f.medios ?? "").split(",").join(" + "),
        anulada: f.anulada === 1,
      }));
    },

    async obtenerDetalle(id: Uuid): Promise<VentaDetalle | null> {
      const cabeceras = await ej.select<FilaCabecera>(
        `SELECT v.id, v.ticket_numero, v.fecha, v.subtotal_centavos,
                v.descuento_centavos, v.total_centavos, ${ANULADA} AS anulada
           FROM venta v WHERE v.id = $1`,
        [id],
      );
      const c = cabeceras[0];
      if (!c) return null;

      const lineas = await ej.select<FilaLinea>(
        `SELECT id, orden, tipo_linea, producto_id, descripcion, unidad, cantidad_milesimas,
                origen_precio, precio_unitario_centavos, precio_lista_centavos,
                costo_unitario_centavos, alicuota_iva_bp, importe_centavos
           FROM venta_linea WHERE venta_id = $1 ORDER BY orden`,
        [id],
      );
      const pagos = await ej.select<FilaPago>(
        `SELECT id, orden, medio_pago_id, medio_pago_nombre, medio_pago_tipo, afecta_arqueo,
                monto_centavos, recibido_centavos, vuelto_centavos, referencia
           FROM venta_pago WHERE venta_id = $1 ORDER BY orden`,
        [id],
      );

      return {
        id: c.id,
        ticketNumero: c.ticket_numero,
        fecha: c.fecha,
        subtotalCentavos: c.subtotal_centavos,
        descuentoCentavos: c.descuento_centavos,
        totalCentavos: c.total_centavos,
        anulada: c.anulada === 1,
        lineas: lineas.map(
          (l): LineaAGrabar => ({
            id: l.id,
            orden: l.orden,
            tipoLinea: l.tipo_linea as TipoLinea,
            productoId: l.producto_id,
            descripcion: l.descripcion,
            unidad: l.unidad as Unidad,
            cantidadMilesimas: l.cantidad_milesimas,
            origenPrecio: l.origen_precio as OrigenPrecio | null,
            precioUnitarioCentavos: l.precio_unitario_centavos,
            precioListaCentavos: l.precio_lista_centavos,
            costoUnitarioCentavos: l.costo_unitario_centavos,
            alicuotaIvaBp: l.alicuota_iva_bp,
            importeCentavos: l.importe_centavos,
            movimientoStockId: null,
          }),
        ),
        pagos: pagos.map(
          (p): PagoAGrabar => ({
            id: p.id,
            orden: p.orden,
            medioPagoId: p.medio_pago_id,
            medioPagoNombre: p.medio_pago_nombre,
            medioPagoTipo: p.medio_pago_tipo,
            afectaArqueo: p.afecta_arqueo === 1,
            montoCentavos: p.monto_centavos,
            recibidoCentavos: p.recibido_centavos,
            vueltoCentavos: p.vuelto_centavos,
            referencia: p.referencia,
          }),
        ),
      };
    },
  };
}
