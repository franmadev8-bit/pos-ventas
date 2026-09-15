/**
 * Normaliza para buscar: mayusculas, sin acentos, y la puntuacion pasa a
 * espacio. Asi "Coca-Cola 2,25 L" queda "COCA COLA 2 25 L" y el cajero la
 * encuentra escribiendo "coca 2 25".
 */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/** Parte lo que tipeo el cajero en palabras normalizadas, sin vacias. */
export function palabrasDeBusqueda(texto: string): string[] {
  const n = normalizar(texto);
  return n === "" ? [] : n.split(" ");
}
