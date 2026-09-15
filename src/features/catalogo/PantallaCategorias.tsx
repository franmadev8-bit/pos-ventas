import { useEffect, useRef, useState } from "react";
import { Aviso } from "../../components/Aviso";
import { Boton } from "../../components/Boton";
import { Modal } from "../../components/Modal";
import { mensajeDeError } from "../../domain/errores";
import type { Uuid } from "../../domain/tipos";
import { useAsync } from "../../hooks/useAsync";
import type { Categoria } from "../../repositories/contratos/CategoriaRepository";
import { catalogoService } from "../../services";

export function PantallaCategorias() {
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [editandoId, setEditandoId] = useState<Uuid | null>(null);
  const [nombreEditado, setNombreEditado] = useState("");
  const [aBajar, setABajar] = useState<Categoria | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [aviso, setAviso] = useState<
    { tono: "ok" | "malo"; texto: string; detalle?: string } | null
  >(null);
  const nuevo = useRef<HTMLInputElement>(null);
  const cuerpo = useRef<HTMLTableSectionElement>(null);

  const { datos, cargando, recargar } = useAsync(() => catalogoService.listarCategorias(true), []);
  const categorias = datos ?? [];

  useEffect(() => { if (!showConfirmModal) nuevo.current?.focus(); }, [showConfirmModal]);

  async function correr(fn: () => Promise<void>, exito: string) {
    try {
      await fn();
      setAviso({ tono: "ok", texto: exito });
      recargar();
    } catch (e) {
      const m = mensajeDeError(e, "No se pudo guardar la categoría.");
      setAviso({ tono: "malo", texto: m.texto, ...(m.detalle ? { detalle: m.detalle } : {}) });
    }
  }

  function agregar() {
    if (nombreNuevo.trim() === "") return;
    void correr(async () => {
      await catalogoService.guardarCategoria(null, nombreNuevo, categorias.length);
      setNombreNuevo("");
    }, "Categoría agregada.");
  }

  /** Mueve el foco entre filas. La fila enfocada ES la fila seleccionada. */
  function moverFoco(desde: number, salto: 1 | -1) {
    const filas = cuerpo.current?.querySelectorAll<HTMLTableRowElement>("tr");
    if (!filas || filas.length === 0) return;
    filas[Math.min(Math.max(desde + salto, 0), filas.length - 1)]?.focus();
  }

  /** Reordenar y devolverle el foco a la misma categoria, que cambio de fila. */
  function mover(c: Categoria, hacia: "arriba" | "abajo", i: number) {
    const destino = hacia === "arriba" ? i - 1 : i + 1;
    void correr(async () => {
      await catalogoService.moverCategoria(c.id, hacia);
      requestAnimationFrame(() => {
        cuerpo.current?.querySelectorAll<HTMLTableRowElement>("tr")[destino]?.focus();
      });
    }, "Orden actualizado.");
  }

  function pedirBaja(c: Categoria) {
    if (c.cantidadProductos > 0) {
      setAviso({
        tono: "malo",
        texto: `«${c.nombre}» tiene ${c.cantidadProductos} producto${c.cantidadProductos === 1 ? "" : "s"}. Movelos a otra categoría antes de darla de baja.`,
      });
      return;
    }
    setABajar(c);
    setShowConfirmModal(true);
  }

  async function confirmarBaja() {
    if (!aBajar) return;
    const nombre = aBajar.nombre;
    setShowConfirmModal(false);
    setABajar(null);
    await correr(() => catalogoService.desactivarCategoria(aBajar.id), `«${nombre}» salió del catálogo.`);
  }

  return (
    <>
      <div className="herramientas">
        <input
          ref={nuevo}
          className="entrada buscador"
          value={nombreNuevo}
          onChange={(e) => setNombreNuevo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); agregar(); }
            else if (e.key === "ArrowDown" && categorias.length > 0) {
              e.preventDefault();
              cuerpo.current?.querySelector<HTMLTableRowElement>("tr")?.focus();
            }
          }}
          placeholder="Nombre de la categoría nueva"
        />
        <Boton
          tecla="Enter"
          variante="primario"
          disabled={nombreNuevo.trim() === ""}
          motivo={nombreNuevo.trim() === "" ? "escribí un nombre" : undefined}
          onClick={agregar}
        >
          Agregar
        </Boton>
      </div>

      {aviso ? <Aviso tono={aviso.tono} detalle={aviso.detalle}>{aviso.texto}</Aviso> : null}

      {cargando ? null : categorias.length === 0 ? (
        <div className="vacio">
          <div>Todavía no hay categorías.</div>
          <div className="pista">La categoría es opcional: un producto puede no tener ninguna.</div>
        </div>
      ) : (
        <div className="tabla-scroll">
          <table className="grilla">
            <thead>
              <tr>
                <th>Nombre</th>
                <th className="der" style={{ width: 120 }}>Productos</th>
                <th style={{ width: 240 }} />
              </tr>
            </thead>
            <tbody ref={cuerpo}>
              {categorias.map((c, i) => (
                <tr
                  key={c.id}
                  tabIndex={0}
                  className="fila-producto"
                  onDoubleClick={() => { setEditandoId(c.id); setNombreEditado(c.nombre); }}
                  onKeyDown={(e) => {
                    // Mientras se renombra, las teclas son del input.
                    if (editandoId !== null) return;
                    if (e.key === "Enter") {
                      e.preventDefault();
                      setEditandoId(c.id);
                      setNombreEditado(c.nombre);
                    } else if (e.key === "Delete") {
                      e.preventDefault();
                      pedirBaja(c);
                    } else if (e.key === "ArrowDown") {
                      e.preventDefault();
                      // Alt cambia el orden en vez de mover el foco.
                      if (e.altKey) { if (i < categorias.length - 1) mover(c, "abajo", i); }
                      else moverFoco(i, 1);
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      if (e.altKey) { if (i > 0) mover(c, "arriba", i); }
                      else if (i === 0) nuevo.current?.focus();
                      else moverFoco(i, -1);
                    } else if (e.key === "Tab" && !e.shiftKey) {
                      e.preventDefault();
                      nuevo.current?.select();
                      nuevo.current?.focus();
                    }
                  }}
                >
                  <td>
                    {editandoId === c.id ? (
                      <input
                        autoFocus
                        className="entrada chica"
                        value={nombreEditado}
                        onChange={(e) => setNombreEditado(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void correr(async () => {
                              await catalogoService.guardarCategoria(c.id, nombreEditado, c.orden);
                              setEditandoId(null);
                            }, "Categoría actualizada.");
                          } else if (e.key === "Escape") {
                            e.stopPropagation();
                            setEditandoId(null);
                          }
                        }}
                        onBlur={() => setEditandoId(null)}
                      />
                    ) : c.nombre}
                  </td>
                  <td className="der num">{c.cantidadProductos}</td>
                  <td className="der">
                    <span className="fila" style={{ justifyContent: "flex-end" }}>
                      <Boton chico tabIndex={-1} disabled={i === 0}
                        onClick={(e) => { e.stopPropagation(); mover(c, "arriba", i); }}>↑</Boton>
                      <Boton chico tabIndex={-1} disabled={i === categorias.length - 1}
                        onClick={(e) => { e.stopPropagation(); mover(c, "abajo", i); }}>↓</Boton>
                      <Boton chico tecla="Supr" variante="peligro" tabIndex={-1}
                        onClick={(e) => { e.stopPropagation(); pedirBaja(c); }}>
                        Dar de baja
                      </Boton>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
              <Boton variante="peligro" onClick={() => void confirmarBaja()}>Dar de baja</Boton>
            </span>
          }
        >
          <p style={{ margin: 0 }}>
            ¿Dar de baja <b>«{aBajar.nombre}»</b>?
          </p>
          <p style={{ margin: "8px 0 0", color: "var(--ink-2)" }}>
            Deja de aparecer al cargar productos. No se borra: los productos que
            la tuvieron siguen como estaban.
          </p>
        </Modal>
      ) : null}
    </>
  );
}
