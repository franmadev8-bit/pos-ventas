/**
 * Error de negocio. El mensaje esta escrito para el cajero: dice que hacer,
 * no que fallo tecnicamente.
 */
export class ErrorDeNegocio extends Error {
  readonly codigo: string;

  constructor(codigo: string, mensaje: string) {
    super(mensaje);
    this.name = "ErrorDeNegocio";
    this.codigo = codigo;
  }
}

/**
 * Falla de la base. Lleva adentro el texto original del motor para poder
 * diagnosticar; la pantalla lo muestra en chico, debajo del mensaje legible.
 */
export class ErrorDeBase extends Error {
  readonly detalle: string;
  readonly sql: string;

  constructor(detalle: string, sql: string) {
    super("La base de datos rechazó la operación.");
    this.name = "ErrorDeBase";
    this.detalle = detalle;
    this.sql = sql.trim().split("\n")[0] ?? "";
  }
}

export function esErrorDeNegocio(e: unknown): e is ErrorDeNegocio {
  return e instanceof ErrorDeNegocio;
}

export interface MensajeDeError {
  readonly texto: string;
  readonly detalle?: string;
}

/**
 * Traduce cualquier error a lo que va en pantalla: una linea entendible y,
 * cuando existe, el detalle tecnico aparte. Nunca deja al usuario con un
 * "no se pudo" sin nada mas.
 */
export function mensajeDeError(e: unknown, alFallar: string): MensajeDeError {
  if (e instanceof ErrorDeNegocio) return { texto: e.message };
  if (e instanceof ErrorDeBase) {
    return { texto: alFallar, detalle: `${e.detalle}${e.sql === "" ? "" : ` · ${e.sql}`}` };
  }
  if (e instanceof Error) return { texto: alFallar, detalle: e.message };
  return { texto: alFallar };
}
