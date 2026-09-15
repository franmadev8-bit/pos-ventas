import { describe, expect, it } from "vitest";
import { formatearAlicuota, formatearCentavos, formatearPesos, formatearPorcentaje } from "./formato";

describe("formato de plata", () => {
  it("usa punto de miles y coma decimal", () => {
    expect(formatearCentavos(123456)).toBe("1.234,56");
    expect(formatearCentavos(845000)).toBe("8.450,00");
    expect(formatearCentavos(0)).toBe("0,00");
  });
  it("el total lleva simbolo", () => {
    expect(formatearPesos(845000)).toBe("$ 8.450,00");
  });
});

describe("porcentajes", () => {
  it("un decimal", () => {
    expect(formatearPorcentaje(0.28552)).toBe("28,6 %");
  });
  it("sin valor muestra guion", () => {
    expect(formatearPorcentaje(null)).toBe("—");
  });
});

describe("alicuotas", () => {
  it("enteras y con decimal", () => {
    expect(formatearAlicuota(2100)).toBe("21 %");
    expect(formatearAlicuota(1050)).toBe("10,5 %");
    expect(formatearAlicuota(0)).toBe("0 %");
  });
});
