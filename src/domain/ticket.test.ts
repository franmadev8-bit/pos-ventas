import { describe, expect, it } from "vitest";
import {
  agregarLinea,
  cambiarCantidad,
  cambiarPrecio,
  importeLinea,
  quitarLinea,
  totales,
} from "./ticket";
import type { LineaTicket } from "./ticket";
import { estadoDeCobro, motivoParaNoCobrar, vueltoDePago } from "./cobro";
import type { PagoTicket } from "./cobro";

function linea(p: Partial<LineaTicket> & { id: string }): LineaTicket {
  return {
    tipoLinea: "producto",
    productoId: "prod-1",
    descripcion: "Coca-Cola 2,25 L",
    unidad: "unidad",
    cantidadMilesimas: 1000,
    origenPrecio: "menor",
    precioUnitarioCentavos: 270000,
    precioListaCentavos: 270000,
    costoUnitarioCentavos: 185000,
    alicuotaIvaBp: 2100,
    ...p,
  };
}

function efectivo(monto: number, recibido: number | null): PagoTicket {
  return {
    id: "pago-1",
    medioPagoId: "medio-efectivo",
    medioPagoNombre: "Efectivo",
    medioPagoTipo: "efectivo",
    afectaArqueo: true,
    montoCentavos: monto,
    recibidoCentavos: recibido,
  };
}

describe("importe de linea", () => {
  it("una unidad da el precio", () => {
    expect(importeLinea(linea({ id: "a" }))).toBe(270000);
  });
  it("tres unidades multiplican exacto", () => {
    expect(importeLinea(linea({ id: "a", cantidadMilesimas: 3000 }))).toBe(810000);
  });
  it("por peso redondea al centavo una sola vez", () => {
    // 0,325 kg a $9.900 el kilo = 3.217,50 -> 3.217,50 se corta a 3.218 (mitad arriba)
    const l = linea({ id: "a", unidad: "kg", cantidadMilesimas: 325, precioUnitarioCentavos: 990000 });
    expect(importeLinea(l)).toBe(321750);
  });
  it("una fraccion con medio centavo redondea hacia arriba", () => {
    const l = linea({ id: "a", unidad: "kg", cantidadMilesimas: 1, precioUnitarioCentavos: 1500 });
    expect(importeLinea(l)).toBe(2); // 1,5 centavos -> 2
  });
});

describe("totales del ticket", () => {
  it("el subtotal suma importes ya redondeados", () => {
    const ls = [
      linea({ id: "a", unidad: "kg", cantidadMilesimas: 333, precioUnitarioCentavos: 100 }),
      linea({ id: "b", unidad: "kg", cantidadMilesimas: 333, precioUnitarioCentavos: 100 }),
      linea({ id: "c", unidad: "kg", cantidadMilesimas: 333, precioUnitarioCentavos: 100 }),
    ];
    // Cada linea es 33,3 -> 33 centavos. Suma 99, no 100 (que seria redondear al final).
    expect(totales(ls).subtotalCentavos).toBe(99);
  });
  it("total es subtotal menos descuento y cierra exacto", () => {
    const t = totales([linea({ id: "a" }), linea({ id: "b", cantidadMilesimas: 2000 })], 50000);
    expect(t.subtotalCentavos).toBe(810000);
    expect(t.totalCentavos).toBe(760000);
    expect(t.totalCentavos).toBe(t.subtotalCentavos - t.descuentoCentavos);
  });
  it("un ticket vacio no rompe", () => {
    expect(totales([])).toEqual({
      subtotalCentavos: 0,
      descuentoCentavos: 0,
      totalCentavos: 0,
      cantidadLineas: 0,
    });
  });
});

describe("armado del ticket", () => {
  it("el mismo producto al mismo precio acumula cantidad", () => {
    const ls = agregarLinea([linea({ id: "a" })], linea({ id: "b" }));
    expect(ls).toHaveLength(1);
    expect(ls[0]?.cantidadMilesimas).toBe(2000);
  });
  it("con precio tocado a mano NO acumula", () => {
    const manual = linea({ id: "b", origenPrecio: "manual", precioUnitarioCentavos: 250000 });
    const ls = agregarLinea([linea({ id: "a" })], manual);
    expect(ls).toHaveLength(2);
  });
  it("productos distintos no se mezclan", () => {
    const ls = agregarLinea([linea({ id: "a" })], linea({ id: "b", productoId: "prod-2" }));
    expect(ls).toHaveLength(2);
  });
  it("una venta generica nunca acumula contra otra", () => {
    const g = (id: string): LineaTicket =>
      linea({ id, tipoLinea: "generica", productoId: null, origenPrecio: null, precioListaCentavos: null });
    expect(agregarLinea([g("a")], g("b"))).toHaveLength(2);
  });
  it("cantidad en cero borra la linea", () => {
    expect(cambiarCantidad([linea({ id: "a" })], "a", 0)).toHaveLength(0);
  });
  it("cambiar el precio marca la linea como manual", () => {
    const ls = cambiarPrecio([linea({ id: "a" })], "a", 300000);
    expect(ls[0]?.origenPrecio).toBe("manual");
    expect(ls[0]?.precioUnitarioCentavos).toBe(300000);
    expect(ls[0]?.precioListaCentavos).toBe(270000);
  });
  it("quitar deja el resto intacto", () => {
    const ls = quitarLinea([linea({ id: "a" }), linea({ id: "b", productoId: "prod-2" })], "a");
    expect(ls).toHaveLength(1);
    expect(ls[0]?.id).toBe("b");
  });
});

describe("cobro", () => {
  it("con lo justo no hay vuelto", () => {
    const e = estadoDeCobro(270000, [efectivo(270000, 270000)]);
    expect(e.vueltoCentavos).toBe(0);
    expect(e.pendienteCentavos).toBe(0);
    expect(e.alcanza).toBe(true);
  });
  it("paga con 5.000 un ticket de 2.700 y el vuelto es 2.300", () => {
    const e = estadoDeCobro(270000, [efectivo(270000, 500000)]);
    expect(e.vueltoCentavos).toBe(230000);
  });
  it("un medio sin vuelto nunca devuelve", () => {
    expect(vueltoDePago(efectivo(270000, null))).toBe(0);
  });
  it("pagando de menos queda pendiente", () => {
    const e = estadoDeCobro(270000, [efectivo(100000, 100000)]);
    expect(e.pendienteCentavos).toBe(170000);
    expect(e.alcanza).toBe(false);
    expect(motivoParaNoCobrar(270000, [efectivo(100000, 100000)])).not.toBeNull();
  });
  it("con el total cubierto se puede cobrar", () => {
    expect(motivoParaNoCobrar(270000, [efectivo(270000, 300000)])).toBeNull();
  });
  it("un ticket vacio no se cobra", () => {
    expect(motivoParaNoCobrar(0, [])).not.toBeNull();
  });
  it("sin elegir medio no se cobra", () => {
    expect(motivoParaNoCobrar(270000, [])).not.toBeNull();
  });
  it("una tarjeta por mas del total se rechaza: no hay como devolver", () => {
    const tarjeta: PagoTicket = {
      ...efectivo(300000, null),
      medioPagoNombre: "Débito",
      medioPagoTipo: "debito",
      afectaArqueo: false,
    };
    expect(motivoParaNoCobrar(270000, [tarjeta])).toContain("Débito");
  });
  it("la suma de pagos cubre el total en un pago mixto", () => {
    const tarjeta: PagoTicket = { ...efectivo(200000, null), id: "pago-2", medioPagoTipo: "debito", afectaArqueo: false };
    const e = estadoDeCobro(270000, [tarjeta, efectivo(70000, 100000)]);
    expect(e.pagadoCentavos).toBe(270000);
    expect(e.vueltoCentavos).toBe(30000);
    expect(motivoParaNoCobrar(270000, [tarjeta, efectivo(70000, 100000)])).toBeNull();
  });
});
