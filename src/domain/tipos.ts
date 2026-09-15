/** Identificador UUID v4 generado en el cliente. */
export type Uuid = string;

/** Fecha ISO 8601 en UTC, con Z. Ej: '2026-09-10T15:04:05.123Z'. */
export type IsoUtc = string;

/** Entero. Importe en centavos. 123456 = $1.234,56. Nunca float. */
export type Centavos = number;

/** Entero. Cantidad en milesimas. 1000 = 1 unidad o 1 kg. */
export type Milesimas = number;

/** Entero. Alicuota en puntos basicos. 2100 = 21,00 %. */
export type PuntosBasicos = number;

export type Unidad = "unidad" | "kg" | "paquete";
export type OrigenPrecio = "menor" | "mayor" | "manual";
export type TipoLinea = "producto" | "generica" | "ajuste_redondeo" | "recargo";
export type TipoVenta = "venta" | "anulacion";
export type EstadoTurno = "abierta" | "cerrada";
export type TipoMovimientoCaja = "ingreso" | "egreso";
export type TipoCodigo = "ean" | "interno" | "balanza";
export type RolUsuario = "dueno" | "cajero";
export type TipoMedioPago =
  | "efectivo"
  | "debito"
  | "credito"
  | "transferencia"
  | "qr"
  | "otro";

/** Alicuotas que admite el esquema, en puntos basicos. */
export const ALICUOTAS_IVA: readonly PuntosBasicos[] = [0, 250, 500, 1050, 2100, 2700];
export const ALICUOTA_IVA_DEFAULT: PuntosBasicos = 2100;
