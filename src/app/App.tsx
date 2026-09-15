import { useEffect, useState } from "react";
import { PantallaCategorias } from "../features/catalogo/PantallaCategorias";
import { PantallaProductos } from "../features/catalogo/PantallaProductos";
import { PantallaVenta } from "../features/venta/PantallaVenta";
import { horaLocal } from "../lib/fecha";
import { ahoraUtc } from "../lib/fecha";

type Modulo = "venta" | "catalogo" | "caja" | "resumen" | "comprobantes" | "config";
type Vista = "productos" | "categorias";

const MODULOS: readonly { id: Modulo; tecla: string; nombre: string; listo: boolean }[] = [
  { id: "venta", tecla: "F1", nombre: "Venta", listo: true },
  { id: "catalogo", tecla: "F3", nombre: "Catálogo", listo: true },
  { id: "caja", tecla: "F4", nombre: "Caja", listo: false },
  { id: "resumen", tecla: "F6", nombre: "Resumen", listo: false },
  { id: "comprobantes", tecla: "F7", nombre: "Comprobantes", listo: false },
  { id: "config", tecla: "F8", nombre: "Configuración", listo: false },
];

const COLOR: Record<Modulo, string> = {
  venta: "var(--mod-venta)",
  catalogo: "var(--mod-catalogo)",
  caja: "var(--mod-caja)",
  resumen: "var(--mod-caja)",
  comprobantes: "var(--mod-comprobantes)",
  config: "var(--mod-catalogo)",
};

/**
 * Teclas que la app se reserva. El webview tiene funciones propias en varias
 * (F3 abre el buscador, F5 recarga, F6 mueve el foco al chrome, F12 abre
 * devtools): se cancelan en captura, antes de que llegue al navegador.
 */
const TECLAS_RESERVADAS = new Set([
  "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",
]);

export function App() {
  const [modulo, setModulo] = useState<Modulo>("venta");
  const [vista, setVista] = useState<Vista>("productos");
  const [hora, setHora] = useState(() => horaLocal(ahoraUtc()));

  useEffect(() => {
    const t = setInterval(() => setHora(horaLocal(ahoraUtc())), 20_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    function alTeclado(e: KeyboardEvent) {
      if (!TECLAS_RESERVADAS.has(e.key)) return;
      e.preventDefault();
      const destino = MODULOS.find((m) => m.tecla === e.key);
      if (destino?.listo) setModulo(destino.id);
    }
    window.addEventListener("keydown", alTeclado, true);
    return () => window.removeEventListener("keydown", alTeclado, true);
  }, []);

  const actual = MODULOS.find((m) => m.id === modulo);

  return (
    <div className="app">
      <nav className="modulos">
        {MODULOS.map((m) => (
          <button
            key={m.id}
            type="button"
            className="modulo"
            disabled={!m.listo}
            tabIndex={-1}
            onClick={() => { if (m.listo) setModulo(m.id); }}
            aria-current={m.id === modulo ? "page" : undefined}
            style={m.id === modulo ? { borderBottomColor: COLOR[m.id] } : undefined}
            title={m.listo ? undefined : "Todavía no está construido"}
          >
            <span className="tecla">{m.tecla}</span>
            <span>{m.nombre}</span>
          </button>
        ))}
        <span className="derecha">Mi Kiosco · Caja 1 · Dueño</span>
      </nav>

      <div className="seccion">
        <span className="barra" style={{ background: COLOR[modulo] }} />
        <h1>{actual?.nombre}</h1>
        {modulo === "catalogo" ? (
          <span className="fila" style={{ marginLeft: 20, gap: 2 }}>
            <button
              type="button"
              className="solapa"
              aria-current={vista === "productos" ? "page" : undefined}
              onClick={() => setVista("productos")}
            >
              Productos
            </button>
            <button
              type="button"
              className="solapa"
              aria-current={vista === "categorias" ? "page" : undefined}
              onClick={() => setVista("categorias")}
            >
              Categorías
            </button>
          </span>
        ) : null}
      </div>

      <main className="contenido">
        {modulo === "venta" ? (
          <PantallaVenta />
        ) : vista === "productos" ? (
          <PantallaProductos />
        ) : (
          <PantallaCategorias />
        )}
      </main>

      <footer className="estado">
        <span>Caja 1</span>
        <span>Turno abierto</span>
        <span className="derecha num">{hora}</span>
      </footer>
    </div>
  );
}
