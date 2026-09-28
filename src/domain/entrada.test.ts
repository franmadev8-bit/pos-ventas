import { describe, expect, it } from "vitest";
import { separarMultiplicador } from "./entrada";

describe("separarMultiplicador", () => {
  it("3*codigo carga tres unidades", () => {
    expect(separarMultiplicador("3*7790895000123")).toEqual({
      busqueda: "7790895000123",
      cantidadMilesimas: 3000,
    });
  });
  it("la x tambien sirve: esta al lado del teclado numerico", () => {
    expect(separarMultiplicador("3x7790895")).toEqual({
      busqueda: "7790895",
      cantidadMilesimas: 3000,
    });
    expect(separarMultiplicador("3X7790895")?.cantidadMilesimas).toBe(3000);
  });
  it("tolera espacios alrededor del separador", () => {
    expect(separarMultiplicador(" 2 * coca cola ")).toEqual({
      busqueda: "coca cola",
      cantidadMilesimas: 2000,
    });
  });
  it("admite decimales para lo que se vende por peso", () => {
    expect(separarMultiplicador("0,5*queso")).toEqual({
      busqueda: "queso",
      cantidadMilesimas: 500,
    });
    expect(separarMultiplicador("1.250*queso")?.cantidadMilesimas).toBe(1250);
  });
  it("sin multiplicador devuelve el texto tal cual", () => {
    expect(separarMultiplicador("7790895000123")).toEqual({
      busqueda: "7790895000123",
      cantidadMilesimas: null,
    });
  });
  it("una descripcion con x adentro no se parte", () => {
    expect(separarMultiplicador("caja x 6")).toEqual({
      busqueda: "caja x 6",
      cantidadMilesimas: null,
    });
  });
  it("cantidad cero no es multiplicador", () => {
    expect(separarMultiplicador("0*coca").cantidadMilesimas).toBeNull();
  });
  it("sin nada despues del separador no es multiplicador", () => {
    expect(separarMultiplicador("3*").cantidadMilesimas).toBeNull();
  });
  it("un codigo que empieza con digitos no se confunde", () => {
    expect(separarMultiplicador("779089").cantidadMilesimas).toBeNull();
  });
});
