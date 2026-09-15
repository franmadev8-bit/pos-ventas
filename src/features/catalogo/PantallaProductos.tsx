import { useEffect, useRef, useState } from "react";
import { Aviso } from "../../components/Aviso";
import { Boton } from "../../components/Boton";
import { Modal } from "../../components/Modal";
import { formatearCantidad } from "../../domain/cantidad";
import { mensajeDeError } from "../../domain/errores";
import { gananciaSobreCosto } from "../../domain/iva";
import type { Uuid } from "../../domain/tipos";
import { useAsync } from "../../hooks/useAsync";
import { formatearCentavos, formatearPorcentaje } from "../../lib/formato";
import type {
  Producto,
  ProductoConCodigos,
} from "../../repositories/contratos/ProductoRepository";
import { catalogoService } from "../../services";
import { ProductoForm } from "./ProductoForm";

export function PantallaProductos() {
  const [texto, setTexto] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [enEdicion, setEnEdicion] = useState<ProductoConCodigos | null>(null);
  const [aBajar, setABajar] = useState<Producto | null>(null);
  const [aviso, setAviso] = useState<
    { tono: "ok" | "malo"; texto: string; detalle?: string } | null
  >(null);
  const busqueda = useRef<HTMLInputElement>(null);
  const cuerpo = useRef<HTMLTableSectionElement>(null);

  const cats = useAsync(() => catalogoService.listarCategorias(true), []);
  const lista = useAsync(
    () =>
      catalogoService.listarProductos({
        texto,
        ...(categoriaId === "" ? {} : { categoriaId: categoriaId as Uuid }),
        soloActivos: true,
      }),
    [texto, categoriaId, showModal],
  );
  const productos = lista.datos ?? [];
  const hayModal = showModal || showConfirmModal;

  useEffect(() => { if (!hayModal) busqueda.current?.focus(); }, [hayModal]);

  function abrirNuevo() {
    setEnEdicion(null);
    setShowModal(true);
  }

  async function abrirEdicion(id: Uuid) {
    const p = await catalogoService.obtenerProducto(id);
    if (p) { setEnEdicion(p); setShowModal(true); }
  }

  async function confirmarBaja() {
    if (!aBajar) return;
    try {
      await catalogoService.desactivarProducto(aBajar.id);
      setAviso({ tono: "ok", texto: `«${aBajar.descripcion}» salió del catálogo. Su código quedó libre.` });
      lista.recargar();
    } catch (e) {
      const m = mensajeDeError(e, "No se pudo dar de baja el producto.");
      setAviso({ tono: "malo", texto: m.texto, ...(m.detalle ? { detalle: m.detalle } : {}) });
    } finally {
      setShowConfirmModal(false);
      setABajar(null);
    }
  }

  /** Mueve el foco entre filas. La fila enfocada ES la fila seleccionada. */
  function moverFoco(desde: number, salto: 1 | -1) {
    const filas = cuerpo.current?.querySelectorAll<HTMLTableRowElement>("tr");
    if (!filas || filas.length === 0) return;
    const destino = Math.min(Math.max(desde + salto, 0), filas.length - 1);
    filas[destino]?.focus();
  }

  // Unico atajo global de la pantalla.
  useEffect(() => {
    function alTeclado(e: KeyboardEvent) {
      if (hayModal) return;
      if (e.key === "F2") { e.preventDefault(); abrirNuevo(); }
    }
    window.addEventListener("keydown", alTeclado);
    return () => window.removeEventListener("keydown", alTeclado);
  }, [hayModal]);

  return (
    <>
      <div className="herramientas">
        <input
          ref={busqueda}
          className="entrada buscador"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && productos.length > 0) {
              e.preventDefault();
              cuerpo.current?.querySelector<HTMLTableRowElement>("tr")?.focus();
            }
          }}
          placeholder="Buscar por descripción…"
        />
        <select
          className="entrada"
          style={{ width: "auto" }}
          value={categoriaId}
          onChange={(e) => setCategoriaId(e.target.value)}
        >
          <option value="">Todas las categorías</option>
          {(cats.datos ?? []).map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>
        <Boton tecla="F2" variante="primario" onClick={abrirNuevo}>Nuevo producto</Boton>
      </div>

      {aviso ? <Aviso tono={aviso.tono} detalle={aviso.detalle}>{aviso.texto}</Aviso> : null}
      {lista.error ? (
        <Aviso tono="malo" {...(lista.error.detalle ? { detalle: lista.error.detalle } : {})}>
          {lista.error.texto}
        </Aviso>
      ) : null}

      {lista.cargando ? null : productos.length === 0 ? (
        <div className="vacio">
          <div>{texto === "" ? "Todavía no hay productos." : `Nada con «${texto}».`}</div>
          <div className="pista">
            {texto === "" ? "Agregá el primero con F2." : "Probá con menos palabras."}
          </div>
        </div>
      ) : (
        <div className="tabla-scroll">
          <table className="grilla">
            <thead>
              <tr>
                <th>Descripción</th>
                <th style={{ width: 160 }}>Categoría</th>
                <th className="der" style={{ width: 100 }}>Existencia</th>
                <th className="der" style={{ width: 105 }}>Costo</th>
                <th className="der" style={{ width: 105 }}>Precio</th>
                <th className="der" style={{ width: 105 }}>Mayorista</th>
                <th className="der" style={{ width: 95 }}>Ganancia</th>
                <th style={{ width: 130 }} />
              </tr>
            </thead>
            <tbody ref={cuerpo}>
              {productos.map((p, i) => (
                <tr
                  key={p.id}
                  tabIndex={0}
                  className="fila-producto"
                  onDoubleClick={() => void abrirEdicion(p.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); void abrirEdicion(p.id); }
                    else if (e.key === "Delete") { e.preventDefault(); setABajar(p); setShowConfirmModal(true); }
                    else if (e.key === "ArrowDown") { e.preventDefault(); moverFoco(i, 1); }
                    else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      if (i === 0) busqueda.current?.focus(); else moverFoco(i, -1);
                    }
                    else if (e.key === "Tab" && !e.shiftKey) {
                      // Desde la lista, Tab vuelve al buscador: es el ciclo
                      // buscar -> elegir -> buscar de nuevo, sin sacar la mano del teclado.
                      e.preventDefault();
                      busqueda.current?.select();
                      busqueda.current?.focus();
                    }
                  }}
                >
                  <td>{p.descripcion}</td>
                  <td>{p.categoriaNombre ?? <span className="derivado">—</span>}</td>
                  <td className="der num">{formatearCantidad(p.existenciaMilesimas, p.unidad)}</td>
                  <td className="der num">
                    {p.costoCentavos === null ? "—" : formatearCentavos(p.costoCentavos)}
                  </td>
                  <td className="der num fuerte">{formatearCentavos(p.precioVentaCentavos)}</td>
                  <td className="der num">
                    {p.precioMayoristaCentavos === null ? "—" : formatearCentavos(p.precioMayoristaCentavos)}
                  </td>
                  <td className="der num derivado">
                    {formatearPorcentaje(gananciaSobreCosto(p.precioVentaCentavos, p.costoCentavos))}
                  </td>
                  <td className="der">
                    <Boton
                      chico
                      variante="peligro"
                      tecla="Supr"
                      tabIndex={-1}
                      onClick={(e) => {
                        e.stopPropagation();
                        setABajar(p);
                        setShowConfirmModal(true);
                      }}
                    >
                      Dar de baja
                    </Boton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal ? (
        <ProductoForm
          producto={enEdicion}
          categorias={cats.datos ?? []}
          onCerrar={() => setShowModal(false)}
          onGuardado={(m) => {
            setShowModal(false);
            setAviso({ tono: "ok", texto: m });
            lista.recargar();
          }}
        />
      ) : null}

      {showConfirmModal && aBajar ? (
        <Modal
          titulo="Dar de baja"
          ancho={480}
          onCerrar={() => { setShowConfirmModal(false); setABajar(null); }}
          pie={
            <span className="derecha">
              <Boton tecla="Esc" onClick={() => { setShowConfirmModal(false); setABajar(null); }}>
                Cancelar
              </Boton>
              <Boton variante="peligro" onClick={() => void confirmarBaja()}>
                Dar de baja
              </Boton>
            </span>
          }
        >
          <p style={{ margin: 0 }}>
            ¿Dar de baja <b>«{aBajar.descripcion}»</b>?
          </p>
          <p style={{ margin: "8px 0 0", color: "var(--ink-2)" }}>
            Sale del catálogo y deja de aparecer en la venta. Su código de barras queda libre
            para otro producto. Las ventas donde ya figura no cambian.
          </p>
        </Modal>
      ) : null}
    </>
  );
}
