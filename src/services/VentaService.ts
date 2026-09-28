import { motivoParaNoCobrar, vueltoDePago } from "../domain/cobro";
import type { PagoTicket } from "../domain/cobro";
import { ErrorDeNegocio } from "../domain/errores";
import { importeLinea, totales } from "../domain/ticket";
import type { LineaTicket } from "../domain/ticket";
import type { Centavos, Uuid } from "../domain/tipos";
import { ahoraUtc } from "../lib/fecha";
import { nuevoId } from "../lib/id";
import type { ConfiguracionRepository } from "../repositories/contratos/ConfiguracionRepository";
import type { MedioPago, MedioPagoRepository } from "../repositories/contratos/MedioPagoRepository";
import type { ProductoRepository } from "../repositories/contratos/ProductoRepository";
import type { ProductoConCodigos } from "../repositories/contratos/ProductoRepository";
import type { Turno, TurnoRepository } from "../repositories/contratos/TurnoRepository";
import type {
  LineaAGrabar,
  PagoAGrabar,
  VentaDetalle,
  VentaRegistrada,
  VentaRepository,
  VentaResumen,
} from "../repositories/contratos/VentaRepository";

/** Quien opera y en que caja. Se resuelve una vez y no cambia en la sesion. */
export interface Contexto {
  readonly cajaId: Uuid;
  readonly usuarioId: Uuid;
  readonly turno: Turno;
}

export interface VentaService {
  contexto(): Promise<Contexto>;
  mediosDePago(): Promise<readonly MedioPago[]>;
  buscarPorCodigo(codigo: string): Promise<ProductoConCodigos | null>;
  /**
   * `ventaId` lo genera el cliente al empezar el ticket. Reintentar el cobro
   * con el mismo id no duplica la venta: el comando devuelve la primera.
   */
  cobrar(
    ventaId: Uuid,
    lineas: readonly LineaTicket[],
    pagos: readonly PagoTicket[],
    descuentoCentavos: Centavos,
  ): Promise<VentaRegistrada>;
  ultimasDelTurno(limite: number): Promise<readonly VentaResumen[]>;
  detalle(ventaId: Uuid): Promise<VentaDetalle | null>;
  /**
   * Anula una venta con su ticket espejo. Devuelve el numero del espejo, que
   * es un ticket mas de la caja: la numeracion no saltea ni reusa.
   */
  anular(ventaId: Uuid, motivo: string): Promise<VentaRegistrada>;
}

export function crearVentaService(
  ventas: VentaRepository,
  productos: ProductoRepository,
  mediosPago: MedioPagoRepository,
  turnos: TurnoRepository,
  configuracion: ConfiguracionRepository,
): VentaService {
  let cache: Contexto | null = null;

  /**
   * Turno implicito: si no hay ninguno abierto en esta caja, se abre con fondo
   * cero. En V1 el cierre es manual y la apertura con fondo tiene su pantalla
   * en el corte 4; hasta entonces la venta no puede quedar sin turno, porque
   * caja_sesion_id es obligatorio en la venta.
   */
  async function asegurarTurno(cajaId: Uuid, usuarioId: Uuid): Promise<Turno> {
    const abierto = await turnos.abierto(cajaId);
    if (abierto) return abierto;
    const nuevo: Turno = {
      id: nuevoId(),
      cajaId,
      usuarioAperturaId: usuarioId,
      abiertaEn: ahoraUtc(),
      fondoInicialCentavos: 0,
    };
    await turnos.abrir(nuevo);
    return nuevo;
  }

  async function obtenerContexto(): Promise<Contexto> {
    if (cache) return cache;
    const cajaId = await configuracion.leer("caja_actual_id");
    const usuarioId = await configuracion.leer("usuario_actual_id");
    if (!cajaId || !usuarioId) {
      throw new ErrorDeNegocio(
        "sin_configuracion",
        "Falta configurar la caja y el usuario. Andá a Configuración antes de vender.",
      );
    }
    cache = { cajaId, usuarioId, turno: await asegurarTurno(cajaId, usuarioId) };
    return cache;
  }

  return {
    contexto: obtenerContexto,

    mediosDePago() {
      return mediosPago.listar(true);
    },

    buscarPorCodigo(codigo: string) {
      return productos.obtenerPorCodigo(codigo);
    },

    async cobrar(ventaId, lineas, pagos, descuentoCentavos) {
      const t = totales(lineas, descuentoCentavos);

      const motivo = motivoParaNoCobrar(t.totalCentavos, pagos);
      if (motivo !== null) throw new ErrorDeNegocio("cobro_invalido", motivo);
      if (descuentoCentavos < 0 || descuentoCentavos > t.subtotalCentavos) {
        throw new ErrorDeNegocio("descuento_invalido", "El descuento no puede superar el subtotal.");
      }

      const ctx = await obtenerContexto();
      const fecha = ahoraUtc();

      const lineasAGrabar: LineaAGrabar[] = lineas.map((l, i) => ({
        id: l.id,
        orden: i + 1,
        tipoLinea: l.tipoLinea,
        productoId: l.productoId,
        descripcion: l.descripcion,
        unidad: l.unidad,
        cantidadMilesimas: l.cantidadMilesimas,
        origenPrecio: l.origenPrecio,
        precioUnitarioCentavos: l.precioUnitarioCentavos,
        precioListaCentavos: l.precioListaCentavos,
        costoUnitarioCentavos: l.costoUnitarioCentavos,
        alicuotaIvaBp: l.alicuotaIvaBp,
        importeCentavos: importeLinea(l),
        // Solo las lineas de producto mueven stock. La venta generica no
        // apunta a ningun articulo, asi que no hay nada que descontar.
        movimientoStockId: l.productoId === null ? null : nuevoId(),
      }));

      // El ultimo pago absorbe el excedente como vuelto; el resto va exacto.
      const pagosAGrabar: PagoAGrabar[] = pagos.map((p, i) => ({
        id: p.id,
        orden: i + 1,
        medioPagoId: p.medioPagoId,
        medioPagoNombre: p.medioPagoNombre,
        medioPagoTipo: p.medioPagoTipo,
        afectaArqueo: p.afectaArqueo,
        montoCentavos: p.montoCentavos,
        recibidoCentavos: p.recibidoCentavos,
        vueltoCentavos: p.recibidoCentavos === null ? null : vueltoDePago(p),
        referencia: p.referencia,
      }));

      return ventas.registrar({
        id: ventaId,
        cajaId: ctx.cajaId,
        cajaSesionId: ctx.turno.id,
        usuarioId: ctx.usuarioId,
        fecha,
        subtotalCentavos: t.subtotalCentavos,
        descuentoCentavos: t.descuentoCentavos,
        totalCentavos: t.totalCentavos,
        lineas: lineasAGrabar,
        pagos: pagosAGrabar,
      });
    },

    detalle(ventaId: Uuid) {
      return ventas.obtenerDetalle(ventaId);
    },

    async anular(ventaId: Uuid, motivo: string) {
      if (motivo.trim() === "") {
        throw new ErrorDeNegocio("motivo_vacio", "Escribí por qué se anula el ticket.");
      }
      const original = await ventas.obtenerDetalle(ventaId);
      if (!original) {
        throw new ErrorDeNegocio("venta_inexistente", "Ese ticket ya no está.");
      }
      if (original.anulada) {
        throw new ErrorDeNegocio("ya_anulada", "Ese ticket ya fue anulado.");
      }

      const ctx = await obtenerContexto();

      // El espejo es el original con todos los signos dados vuelta. Los ids
      // son nuevos: son filas nuevas, no copias de las viejas.
      const lineas: LineaAGrabar[] = original.lineas.map((l) => ({
        ...l,
        id: nuevoId(),
        cantidadMilesimas: -l.cantidadMilesimas,
        importeCentavos: -l.importeCentavos,
        movimientoStockId: l.productoId === null ? null : nuevoId(),
      }));
      const pagos: PagoAGrabar[] = original.pagos.map((p) => ({
        ...p,
        id: nuevoId(),
        montoCentavos: -p.montoCentavos,
        // El espejo no devuelve vuelto: lo que vuelve es la plata del pago.
        recibidoCentavos: null,
        vueltoCentavos: null,
        referencia: null,
      }));

      return ventas.anular({
        id: nuevoId(),
        ventaAnuladaId: original.id,
        cajaId: ctx.cajaId,
        cajaSesionId: ctx.turno.id,
        usuarioId: ctx.usuarioId,
        fecha: ahoraUtc(),
        motivo: motivo.trim(),
        subtotalCentavos: -original.subtotalCentavos,
        descuentoCentavos: -original.descuentoCentavos,
        totalCentavos: -original.totalCentavos,
        lineas,
        pagos,
      });
    },

    async ultimasDelTurno(limite: number) {
      const ctx = await obtenerContexto();
      return ventas.ultimasDelTurno(ctx.turno.id, limite);
    },
  };
}
