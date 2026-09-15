import { useCallback, useMemo, useState } from "react";
import { estadoDeCobro } from "../domain/cobro";
import type { PagoTicket } from "../domain/cobro";
import {
  agregarLinea,
  cambiarCantidad,
  cambiarPrecio,
  quitarLinea,
  totales,
} from "../domain/ticket";
import type { LineaTicket } from "../domain/ticket";
import type { Centavos, Milesimas, Uuid } from "../domain/tipos";
import { nuevoId } from "../lib/id";
import type { ProductoConCodigos } from "../repositories/contratos/ProductoRepository";
import type { Producto } from "../repositories/contratos/ProductoRepository";

/**
 * El ticket en curso. Vive solo en memoria hasta que se cobra: una venta a
 * medio armar no es un hecho del negocio y no tiene por que tocar la base.
 */
export function useVentaEnCurso() {
  const [lineas, setLineas] = useState<readonly LineaTicket[]>([]);
  const [pagos, setPagos] = useState<readonly PagoTicket[]>([]);
  // El id se crea al empezar el ticket, no al grabarlo: si el cobro falla y se
  // reintenta, el comando recibe el MISMO id y no duplica la venta (regla 13).
  const [ventaId, setVentaId] = useState<Uuid>(() => nuevoId());

  const t = useMemo(() => totales(lineas, 0), [lineas]);
  const cobro = useMemo(() => estadoDeCobro(t.totalCentavos, pagos), [t.totalCentavos, pagos]);

  const sumarProducto = useCallback(
    (p: Producto | ProductoConCodigos, cantidadMilesimas: Milesimas = 1000) => {
      setLineas((ls) =>
        agregarLinea(ls, {
          id: nuevoId(),
          tipoLinea: "producto",
          productoId: p.id,
          // Copia, no referencia: si manana cambia el precio, este ticket no.
          descripcion: p.descripcion,
          unidad: p.unidad,
          cantidadMilesimas,
          origenPrecio: "menor",
          precioUnitarioCentavos: p.precioVentaCentavos,
          precioListaCentavos: p.precioVentaCentavos,
          costoUnitarioCentavos: p.costoCentavos,
          alicuotaIvaBp: p.alicuotaIvaBp,
        }),
      );
    },
    [],
  );

  const quitar = useCallback((id: Uuid) => setLineas((ls) => quitarLinea(ls, id)), []);

  const ponerCantidad = useCallback(
    (id: Uuid, cantidad: Milesimas) => setLineas((ls) => cambiarCantidad(ls, id, cantidad)),
    [],
  );

  const ponerPrecio = useCallback(
    (id: Uuid, precio: Centavos) => setLineas((ls) => cambiarPrecio(ls, id, precio)),
    [],
  );

  const vaciar = useCallback(() => {
    setLineas([]);
    setPagos([]);
    setVentaId(nuevoId());
  }, []);

  return {
    ventaId,
    lineas,
    pagos,
    setPagos,
    totales: t,
    cobro,
    sumarProducto,
    quitar,
    ponerCantidad,
    ponerPrecio,
    vaciar,
  };
}
