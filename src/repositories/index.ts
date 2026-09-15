import { ejecutorSqlite } from "../db/ejecutor";
import type { CategoriaRepository } from "./contratos/CategoriaRepository";
import type { ConfiguracionRepository } from "./contratos/ConfiguracionRepository";
import type { MedioPagoRepository } from "./contratos/MedioPagoRepository";
import type { ProductoRepository } from "./contratos/ProductoRepository";
import type { TurnoRepository } from "./contratos/TurnoRepository";
import type { VentaRepository } from "./contratos/VentaRepository";
import { crearCategoriaRepository } from "./sqlite/CategoriaRepositorySqlite";
import { crearConfiguracionRepository } from "./sqlite/ConfiguracionRepositorySqlite";
import { crearMedioPagoRepository } from "./sqlite/MedioPagoRepositorySqlite";
import { crearProductoRepository } from "./sqlite/ProductoRepositorySqlite";
import { crearTurnoRepository } from "./sqlite/TurnoRepositorySqlite";
import { crearVentaRepository } from "./sqlite/VentaRepositorySqlite";

export interface Repositorios {
  readonly productos: ProductoRepository;
  readonly categorias: CategoriaRepository;
  readonly ventas: VentaRepository;
  readonly mediosPago: MedioPagoRepository;
  readonly turnos: TurnoRepository;
  readonly configuracion: ConfiguracionRepository;
}

/** Punto unico donde se elige la implementacion. Nada mas la conoce. */
export const repositorios: Repositorios = {
  productos: crearProductoRepository(ejecutorSqlite),
  categorias: crearCategoriaRepository(ejecutorSqlite),
  ventas: crearVentaRepository(ejecutorSqlite),
  mediosPago: crearMedioPagoRepository(ejecutorSqlite),
  turnos: crearTurnoRepository(ejecutorSqlite),
  configuracion: crearConfiguracionRepository(ejecutorSqlite),
};
