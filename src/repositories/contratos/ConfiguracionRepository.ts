/**
 * Claves de la tabla configuracion. Son pocas y fijas: se enumeran para que un
 * error de tipeo no devuelva undefined en silencio.
 */
export type ClaveConfiguracion =
  | "caja_actual_id"
  | "usuario_actual_id"
  | "alicuota_iva_default";

export interface ConfiguracionRepository {
  leer(clave: ClaveConfiguracion): Promise<string | null>;
  escribir(clave: ClaveConfiguracion, valor: string): Promise<void>;
}
