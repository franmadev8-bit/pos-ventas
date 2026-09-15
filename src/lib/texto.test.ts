import { describe, expect, it } from "vitest";
import { normalizar, palabrasDeBusqueda } from "./texto";

describe("normalizar", () => {
  it("saca acentos y pasa a mayusculas", () => {
    expect(normalizar("Café con azúcar")).toBe("CAFE CON AZUCAR");
  });
  it("convierte la puntuacion en espacio", () => {
    expect(normalizar("Coca-Cola 2,25 L")).toBe("COCA COLA 2 25 L");
  });
  it("colapsa espacios y recorta", () => {
    expect(normalizar("  Pan   lactal  ")).toBe("PAN LACTAL");
  });
});

describe("palabrasDeBusqueda", () => {
  it("parte en palabras", () => {
    expect(palabrasDeBusqueda("coca 2 25")).toEqual(["COCA", "2", "25"]);
  });
  it("una busqueda vacia no devuelve palabras", () => {
    expect(palabrasDeBusqueda("   ")).toEqual([]);
  });
  it("lo que tipea el cajero encuentra al producto", () => {
    const norm = normalizar("Coca-Cola 2,25 L");
    for (const p of palabrasDeBusqueda("coca 2 25")) {
      expect(norm.includes(p)).toBe(true);
    }
  });
});
