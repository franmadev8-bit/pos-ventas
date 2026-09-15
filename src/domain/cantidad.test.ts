import { describe, expect, it } from "vitest";
import { formatearCantidad, parsearCantidad } from "./cantidad";

describe("parsearCantidad por unidad", () => {
  it("acepta enteros", () => {
    expect(parsearCantidad("1", "unidad")).toBe(1000);
    expect(parsearCantidad("12", "unidad")).toBe(12000);
  });
  it("rechaza decimales: no se venden 1,5 alfajores", () => {
    expect(parsearCantidad("1,5", "unidad")).toBeNull();
  });
  it("tolera un cero decimal", () => {
    expect(parsearCantidad("2,0", "unidad")).toBe(2000);
  });
});

describe("parsearCantidad por kg", () => {
  it("acepta hasta tres decimales", () => {
    expect(parsearCantidad("1,250", "kg")).toBe(1250);
    expect(parsearCantidad("0,5", "kg")).toBe(500);
    expect(parsearCantidad("2", "kg")).toBe(2000);
  });
  it("acepta el punto del teclado numerico", () => {
    expect(parsearCantidad("1.250", "kg")).toBe(1250);
  });
  it("rechaza mas de tres decimales", () => {
    expect(parsearCantidad("1,2505", "kg")).toBeNull();
  });
});

describe("parsearCantidad por paquete", () => {
  it("se comporta como la unidad: sin fracciones", () => {
    expect(parsearCantidad("3", "paquete")).toBe(3000);
    expect(parsearCantidad("1,5", "paquete")).toBeNull();
  });
  it("se formatea sin decimales", () => {
    expect(formatearCantidad(3000, "paquete")).toBe("3");
  });
});

describe("parsearCantidad rechaza lo invalido", () => {
  it("cero y negativos y basura", () => {
    expect(parsearCantidad("0", "unidad")).toBeNull();
    expect(parsearCantidad("-1", "unidad")).toBeNull();
    expect(parsearCantidad("", "unidad")).toBeNull();
    expect(parsearCantidad("abc", "kg")).toBeNull();
  });
});

describe("formatearCantidad", () => {
  it("por unidad no muestra decimales", () => {
    expect(formatearCantidad(3000, "unidad")).toBe("3");
  });
  it("por kg muestra los decimales solo si los hay", () => {
    expect(formatearCantidad(1250, "kg")).toBe("1,250");
    expect(formatearCantidad(2000, "kg")).toBe("2");
  });
});
