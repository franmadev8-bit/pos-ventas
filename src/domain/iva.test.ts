import { describe, expect, it } from "vitest";
import { gananciaSobreCosto, ivaDesdeBruto, netoDesdeBruto } from "./iva";

describe("neto e IVA a partir del precio de gondola", () => {
  it("Coca-Cola 2,25 L a $2.100 con IVA 21 %", () => {
    expect(netoDesdeBruto(210000, 2100)).toBe(173554);
    expect(ivaDesdeBruto(210000, 2100)).toBe(36446);
  });
  it("el mismo producto por mayor, a $1.900", () => {
    expect(netoDesdeBruto(190000, 2100)).toBe(157025);
    expect(ivaDesdeBruto(190000, 2100)).toBe(32975);
  });
  it("neto mas IVA da el bruto, siempre y al centavo", () => {
    for (const bp of [0, 250, 500, 1050, 2100, 2700]) {
      for (const bruto of [1, 99, 100, 12345, 210000, 999999, 1234567]) {
        expect(netoDesdeBruto(bruto, bp) + ivaDesdeBruto(bruto, bp)).toBe(bruto);
      }
    }
  });
  it("con alicuota cero el neto es el bruto", () => {
    expect(netoDesdeBruto(210000, 0)).toBe(210000);
    expect(ivaDesdeBruto(210000, 0)).toBe(0);
  });
  it("alicuota 10,5 %", () => {
    expect(netoDesdeBruto(110500, 1050)).toBe(100000);
    expect(ivaDesdeBruto(110500, 1050)).toBe(10500);
  });
});

describe("gananciaSobreCosto", () => {
  it("costo 500,00 y precio 5.000,00 dan 900 %", () => {
    expect(gananciaSobreCosto(500000, 50000)).toBe(9);
  });
  it("duplicar el costo es 100 %", () => {
    expect(gananciaSobreCosto(248000, 124000)).toBe(1);
  });
  it("sin costo cargado no hay ganancia", () => {
    expect(gananciaSobreCosto(210000, null)).toBeNull();
  });
  it("costo en cero no divide por cero", () => {
    expect(gananciaSobreCosto(210000, 0)).toBeNull();
  });
  it("vender por debajo del costo da negativo", () => {
    expect(gananciaSobreCosto(90000, 100000) as number).toBeLessThan(0);
  });
});
