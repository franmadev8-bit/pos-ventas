import { repositorios } from "../repositories";
import { crearCatalogoService } from "./CatalogoService";
import { crearVentaService } from "./VentaService";

export const catalogoService = crearCatalogoService(
  repositorios.productos,
  repositorios.categorias,
);

export const ventaService = crearVentaService(
  repositorios.ventas,
  repositorios.productos,
  repositorios.mediosPago,
  repositorios.turnos,
  repositorios.configuracion,
);
