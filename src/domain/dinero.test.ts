import { describe, expect, it } from "vitest";
import { importeDeLinea, parsearMonto, redondearDivision, sumar } from "./dinero";

describe("redondearDivision — mitad hacia arriba en valor absoluto", () => {
  it("redondea para arriba en la mitad exacta", () => {
    expect(redondearDivision(5, 10)).toBe(1);
    expect(redondearDivision(15, 10)).toBe(2);
    expect(redondearDivision(25, 10)).toBe(3);
  });
  it("se aleja del cero con negativos", () => {
    expect(redondearDivision(-5, 10)).toBe(-1);
    expect(redondearDivision(-15, 10)).toBe(-2);
  });
  it("no redondea lo que ya es exacto", () => {
    expect(redondearDivision(1000, 10)).toBe(100);
    expect(redondearDivision(-1000, 10)).toBe(-100);
  });
  it("rechaza dividir por cero", () => {
    expect(() => redondearDivision(1, 0)).toThrow();
  });
});

describe("importeDeLinea", () => {
  it("una unidad entera", () => {
    expect(importeDeLinea(210000, 1000)).toBe(210000);
  });
  it("varias unidades", () => {
    expect(importeDeLinea(85000, 3000)).toBe(255000);
  });
  it("venta por peso, 1,250 kg a $5.800 el kilo", () => {
    expect(importeDeLinea(580000, 1250)).toBe(725000);
  });
  it("redondea el medio centavo hacia arriba", () => {
    // 333 centavos x 0,5 = 166,5 -> 167
    expect(importeDeLinea(333, 500)).toBe(167);
  });
  it("una anulacion invierte el signo sin perder el centavo", () => {
    expect(importeDeLinea(333, -500)).toBe(-167);
  });
  it("rechaza cantidades no enteras", () => {
    expect(() => importeDeLinea(100, 1.5)).toThrow();
  });
});

describe("el ticket de ejemplo cierra exacto", () => {
  it("suma 8.450,00", () => {
    const lineas = [
      importeDeLinea(210000, 1000), // 1 x Coca 2,25 L
      importeDeLinea(85000, 3000), //  3 x Alfajor Jorgito
      importeDeLinea(240000, 1000), // 1 x Papas Lays
      importeDeLinea(70000, 2000), //  2 x Chicles Beldent
    ];
    expect(lineas).toEqual([210000, 255000, 240000, 140000]);
    const total = sumar(lineas);
    expect(total).toBe(845000);
    expect(1000000 - total).toBe(155000); // vuelto de $1.550,00
  });
});

describe("parsearMonto", () => {
  it("entero sin separadores", () => {
    expect(parsearMonto("2100")).toBe(210000);
  });
  it("coma decimal", () => {
    expect(parsearMonto("21,50")).toBe(2150);
  });
  it("punto de miles y coma decimal", () => {
    expect(parsearMonto("1.234,56")).toBe(123456);
  });
  it("punto del teclado numerico como decimal", () => {
    expect(parsearMonto("21.5")).toBe(2150);
    expect(parsearMonto("21.50")).toBe(2150);
  });
  it("punto con tres digitos es separador de miles", () => {
    expect(parsearMonto("2.100")).toBe(210000);
  });
  it("tolera espacios y el signo pesos", () => {
    expect(parsearMonto(" $ 1.234,56 ")).toBe(123456);
  });
  it("acepta negativos", () => {
    expect(parsearMonto("-250")).toBe(-25000);
  });
  it("rechaza basura", () => {
    expect(parsearMonto("")).toBeNull();
    expect(parsearMonto("abc")).toBeNull();
    expect(parsearMonto("1,2,3")).toBeNull();
    expect(parsearMonto("1,234")).toBeNull(); // 3 decimales no existen en pesos
  });
});

describe("sumar", () => {
  it("suma vacia da cero", () => {
    expect(sumar([])).toBe(0);
  });
  it("rechaza no enteros", () => {
    expect(() => sumar([1.5])).toThrow();
  });
});
