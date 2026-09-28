import { useEffect, useRef, useState } from "react";
import { Aviso } from "../../components/Aviso";
import { Boton } from "../../components/Boton";
import { Modal } from "../../components/Modal";
import type { PagoTicket } from "../../domain/cobro";
import { formatearCantidad, parsearCantidad } from "../../domain/cantidad";
import { parsearMonto } from "../../domain/dinero";
import { separarMultiplicador } from "../../domain/entrada";
import { mensajeDeError } from "../../domain/errores";
import { importeLinea } from "../../domain/ticket";
import { ALICUOTA_IVA_DEFAULT } from "../../domain/tipos";
import type { Uuid } from "../../domain/tipos";
import { useAsync } from "../../hooks/useAsync";
import { useTickets } from "../../app/TicketsContext";
import { MAX_TICKETS } from "../../hooks/useTicketsEnCurso";
import { formatearCentavos, formatearPesos } from "../../lib/formato";
import type { Producto } from "../../repositories/contratos/ProductoRepository";
import { catalogoService, ventaService } from "../../services";
import { ModalCobro } from "./ModalCobro";
import { ModalGenerica } from "./ModalGenerica";
import { ModalTickets } from "./ModalTickets";

type Edicion = { readonly lineaId: Uuid; readonly campo: "cantidad" | "precio" };

const MAX_SUGERENCIAS = 8;

export function PantallaVenta() {
  const venta = useTickets();
  const [texto, setTexto] = useState("");
  const [showCobro, setShowCobro] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showGenerica, setShowGenerica] = useState(false);
  const [showTickets, setShowTickets] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [edicion, setEdicion] = useState<Edicion | null>(null);
  const [borrador, setBorrador] = useState("");
  const [error, setError] = useState<{ texto: string; detalle?: string } | null>(null);
  // El error del cobro es suyo: si compartiera estado con la busqueda, el modal
  // mostraria "no hay ningun producto con..." abajo del boton de Cobrar.
  const [errorCobro, setErrorCobro] = useState<{ texto: string; detalle?: string } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const entrada = useRef<HTMLInputElement>(null);
  const cuerpo = useRef<HTMLTableSectionElement>(null);

  const medios = useAsync(() => ventaService.mediosDePago(), []);
  // El turno se abre al entrar, no al cobrar: si algo falla con la caja, que se
  // vea ahora y no con el cliente esperando en el mostrador.
  const contexto = useAsync(() => ventaService.contexto(), [], "No se pudo abrir el turno de caja.");

  // "3*coca" es tres unidades de coca: el multiplicador se separa antes de
  // buscar, si no el texto del codigo nunca coincidiria con nada.
  const entradaTipeada = separarMultiplicador(texto);
  const aBuscar = entradaTipeada.busqueda;

  const sugerencias = useAsync(
    () =>
      aBuscar.trim().length < 2
        ? Promise.resolve([])
        : catalogoService.listarProductos({ texto: aBuscar, soloActivos: true, limite: MAX_SUGERENCIAS }),
    [aBuscar],
  );
  const opciones = aBuscar.trim().length < 2 ? [] : (sugerencias.datos ?? []);

  // El foco vive en el buscador. Vuelve solo despues de cada accion.
  function volverAlBuscador() {
    entrada.current?.focus();
    entrada.current?.select();
  }
  useEffect(() => {
    if (!showCobro && !showConfirmModal && !showGenerica && !showTickets && edicion === null) {
      volverAlBuscador();
    }
  }, [showCobro, showConfirmModal, showGenerica, showTickets, edicion]);

  function sumar(p: Producto, cantidadMilesimas: number | null) {
    // Media unidad de algo que no se vende por peso no existe. Recien aca se
    // sabe: el multiplicador se tipea antes de saber que producto es.
    if (cantidadMilesimas !== null && p.unidad !== "kg" && cantidadMilesimas % 1000 !== 0) {
      setError({ texto: `«${p.descripcion}» se vende por ${p.unidad}: la cantidad tiene que ser entera.` });
      return;
    }
    venta.sumarProducto(p, cantidadMilesimas ?? 1000);
    setTexto("");
    setError(null);
    volverAlBuscador();
  }

  /**
   * Enter en el buscador. El lector de codigo de barras emula teclado y manda
   * Enter, asi que este es el mismo camino para el lector y para la mano.
   */
  async function alConfirmarBusqueda() {
    const { busqueda, cantidadMilesimas } = separarMultiplicador(texto);
    if (busqueda === "") {
      if (venta.lineas.length > 0) { setErrorCobro(null); setShowCobro(true); }
      return;
    }
    try {
      const porCodigo = await ventaService.buscarPorCodigo(busqueda);
      if (porCodigo) { sumar(porCodigo, cantidadMilesimas); return; }
    } catch (e) {
      setError(mensajeDeError(e, "No se pudo buscar el producto."));
      return;
    }
    const unica = opciones.length === 1 ? opciones[0] : undefined;
    if (unica) { sumar(unica, cantidadMilesimas); return; }
    if (opciones.length === 0) setError({ texto: `No hay ningún producto con «${busqueda}».` });
  }

  function abrirEdicion(lineaId: Uuid, campo: Edicion["campo"]) {
    const l = venta.lineas.find((x) => x.id === lineaId);
    if (!l) return;
    setBorrador(
      campo === "cantidad"
        ? formatearCantidad(l.cantidadMilesimas, l.unidad)
        : formatearCentavos(l.precioUnitarioCentavos),
    );
    setEdicion({ lineaId, campo });
  }

  function confirmarEdicion() {
    if (!edicion) return;
    const l = venta.lineas.find((x) => x.id === edicion.lineaId);
    if (!l) { setEdicion(null); return; }

    if (edicion.campo === "cantidad") {
      const c = parsearCantidad(borrador, l.unidad);
      if (c === null) {
        setError({ texto: l.unidad === "kg"
          ? "La cantidad admite hasta tres decimales."
          : "La cantidad tiene que ser un número entero." });
        return;
      }
      venta.ponerCantidad(l.id, c);
    } else {
      const p = parsearMonto(borrador);
      if (p === null || p < 0) { setError({ texto: "Ese no es un precio válido." }); return; }
      venta.ponerPrecio(l.id, p);
    }
    setError(null);
    setEdicion(null);
  }

  /**
   * Cierra el ticket activo. Si esta vacio se va sin preguntar —es el caso de
   * haberlo abierto sin querer— y si tiene algo cargado pide confirmacion,
   * porque eso es tirar trabajo del cajero.
   */
  function pedirCerrarTicket() {
    // Con un solo ticket vacio no hay nada que cerrar.
    if (venta.lineas.length === 0 && venta.tickets.length === 1) return;
    setShowConfirmModal(true);
  }

  function moverFoco(desde: number, salto: 1 | -1) {
    const filas = cuerpo.current?.querySelectorAll<HTMLTableRowElement>("tr");
    if (!filas || filas.length === 0) return;
    filas[Math.min(Math.max(desde + salto, 0), filas.length - 1)]?.focus();
  }

  async function cobrar(pagos: readonly PagoTicket[]) {
    if (guardando) return;
    setGuardando(true);
    setErrorCobro(null);
    try {
      const r = await ventaService.cobrar(venta.ventaId, venta.lineas, pagos, 0);
      setShowCobro(false);
      venta.cerrarTicket();
      setTexto("");
      setAviso(`Ticket ${r.ticketNumero} cobrado por ${formatearPesos(venta.totales.totalCentavos)}.`);
    } catch (e) {
      setErrorCobro(mensajeDeError(e, "No se pudo grabar la venta."));
    } finally {
      setGuardando(false);
    }
  }

  // Atajos de la pantalla. Pocos y siempre visibles en algun boton.
  useEffect(() => {
    function alTeclado(e: KeyboardEvent) {
      if (showCobro || showConfirmModal || showGenerica || showTickets) return;
      if (e.key === "F12" && venta.lineas.length > 0) { e.preventDefault(); setErrorCobro(null); setShowCobro(true); }
      else if (e.key === "F2") {
        e.preventDefault();
        if (!venta.abrirTicket()) {
          setError({ texto: `No podés tener más de ${MAX_TICKETS} tickets abiertos a la vez.` });
        } else {
          setError(null);
          setTexto("");
        }
      } else if (e.key === "F9") {
        e.preventDefault();
        setShowGenerica(true);
      } else if (e.key === "F10") {
        e.preventDefault();
        setShowTickets(true);
      } else if (e.key === "F5" && venta.tickets.length > 1) {
        e.preventDefault();
        venta.rotar();
        setTexto("");
      } else if (e.key === "Escape" && texto.trim() === "") {
        // Con texto tipeado, Esc limpia el buscador (lo maneja el input).
        // Con el buscador vacio, Esc cierra el ticket.
        e.preventDefault();
        pedirCerrarTicket();
      }
    }
    window.addEventListener("keydown", alTeclado);
    return () => window.removeEventListener("keydown", alTeclado);
  }, [showCobro, showConfirmModal, showGenerica, showTickets, venta, texto]);

  return (
    <>
      {/* Solapas de tickets. Solo aparecen cuando hay mas de uno: con uno solo
          son ruido en la pantalla que se mira todo el dia. */}
      {venta.tickets.length > 1 ? (
        <div className="solapas-ticket">
          {venta.tickets.map((t, i) => (
            <span
              key={t.id}
              className="solapa-ticket"
              aria-current={i === venta.indice ? "page" : undefined}
            >
              <button type="button" tabIndex={-1} className="solapa-ir" onClick={() => venta.irA(i)}>
                <span>Ticket {i + 1}</span>
                <span className="num">
                  {formatearCentavos(venta.resumen[i]?.totalCentavos ?? 0)}
                </span>
              </button>
              <button
                type="button"
                tabIndex={-1}
                className="solapa-cerrar"
                title="Cerrar este ticket"
                aria-label={`Cerrar el ticket ${i + 1}`}
                onClick={() => { venta.irA(i); pedirCerrarTicket(); }}
              >
                ×
              </button>
            </span>
          ))}
          <span className="derecha pista">F5 cambia · F2 abre otro · Esc cierra</span>
        </div>
      ) : null}

      <div className="herramientas">
        <input
          ref={entrada}
          className="entrada buscador"
          value={texto}
          onChange={(e) => { setTexto(e.target.value); setError(null); setAviso(null); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); void alConfirmarBusqueda(); }
            else if (e.key === "ArrowDown") {
              e.preventDefault();
              if (opciones.length > 0) {
                document.getElementById("sug-0")?.focus();
              } else {
                cuerpo.current?.querySelector<HTMLTableRowElement>("tr")?.focus();
              }
            } else if (e.key === "Escape" && texto !== "") { e.preventDefault(); setTexto(""); }
          }}
          placeholder="Código de barras o descripción…"
          autoComplete="off"
        />
        <Boton tecla="F9" onClick={() => setShowGenerica(true)}>Monto suelto</Boton>
        <Boton tecla="F10" onClick={() => setShowTickets(true)}>Tickets</Boton>
        <Boton
          tecla="F2"
          disabled={venta.tickets.length >= MAX_TICKETS}
          motivo={venta.tickets.length >= MAX_TICKETS ? `máximo ${MAX_TICKETS}` : undefined}
          onClick={() => { venta.abrirTicket(); setTexto(""); }}
        >
          Otro ticket
        </Boton>
        <Boton
          tecla="F12"
          variante="primario"
          disabled={venta.lineas.length === 0}
          motivo={venta.lineas.length === 0 ? "el ticket está vacío" : undefined}
          onClick={() => { setErrorCobro(null); setShowCobro(true); }}
        >
          Cobrar
        </Boton>
      </div>

      {opciones.length > 0 ? (
        <div className="sugerencias">
          {opciones.map((p, i) => (
            <button
              key={p.id}
              id={`sug-${i}`}
              type="button"
              className="sugerencia"
              onClick={() => sumar(p, entradaTipeada.cantidadMilesimas)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  document.getElementById(`sug-${Math.min(i + 1, opciones.length - 1)}`)?.focus();
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  if (i === 0) volverAlBuscador();
                  else document.getElementById(`sug-${i - 1}`)?.focus();
                } else if (e.key === "Escape") { e.preventDefault(); setTexto(""); }
              }}
            >
              <span className="sug-desc">{p.descripcion}</span>
              <span className="sug-cat">{p.categoriaNombre ?? ""}</span>
              <span className="num sug-precio">{formatearCentavos(p.precioVentaCentavos)}</span>
            </button>
          ))}
        </div>
      ) : null}

      {aviso ? <Aviso tono="ok">{aviso}</Aviso> : null}
      {error ? (
        <Aviso tono="malo" {...(error.detalle ? { detalle: error.detalle } : {})}>{error.texto}</Aviso>
      ) : null}
      {contexto.error ? (
        <Aviso tono="malo" {...(contexto.error.detalle ? { detalle: contexto.error.detalle } : {})}>
          {contexto.error.texto}
        </Aviso>
      ) : null}

      <div className="ticket">
        <div className="tabla-scroll">
          {venta.lineas.length === 0 ? (
            <div className="vacio">
              <div>Ticket vacío.</div>
              <div className="pista">Pasá un producto por el lector o escribí para buscarlo.</div>
            </div>
          ) : (
            <table className="grilla">
              <thead>
                <tr>
                  <th style={{ width: 44 }} className="der">#</th>
                  <th>Descripción</th>
                  <th className="der" style={{ width: 110 }}>Cantidad</th>
                  <th className="der" style={{ width: 120 }}>Precio</th>
                  <th className="der" style={{ width: 130 }}>Importe</th>
                </tr>
              </thead>
              <tbody ref={cuerpo}>
                {venta.lineas.map((l, i) => (
                  <tr
                    key={l.id}
                    tabIndex={0}
                    className="fila-producto"
                    onKeyDown={(e) => {
                      if (edicion !== null) return;
                      if (e.key === "Delete") { e.preventDefault(); venta.quitar(l.id); volverAlBuscador(); }
                      else if (e.key === "Enter") { e.preventDefault(); abrirEdicion(l.id, "cantidad"); }
                      else if (e.key === "ArrowDown") { e.preventDefault(); moverFoco(i, 1); }
                      else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        if (i === 0) volverAlBuscador(); else moverFoco(i, -1);
                      } else if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); volverAlBuscador(); }
                    }}
                  >
                    <td className="der num derivado">{i + 1}</td>
                    <td>{l.descripcion}</td>
                    <td className="der num" onDoubleClick={() => abrirEdicion(l.id, "cantidad")}>
                      {edicion?.lineaId === l.id && edicion.campo === "cantidad" ? (
                        <CampoEnLinea
                          valor={borrador}
                          onValor={setBorrador}
                          onConfirmar={confirmarEdicion}
                          onCancelar={() => setEdicion(null)}
                        />
                      ) : (
                        formatearCantidad(l.cantidadMilesimas, l.unidad)
                      )}
                    </td>
                    <td
                      className={`der num ${l.origenPrecio === "manual" ? "precio-tocado" : ""}`}
                      onDoubleClick={() => abrirEdicion(l.id, "precio")}
                    >
                      {edicion?.lineaId === l.id && edicion.campo === "precio" ? (
                        <CampoEnLinea
                          valor={borrador}
                          onValor={setBorrador}
                          onConfirmar={confirmarEdicion}
                          onCancelar={() => setEdicion(null)}
                        />
                      ) : (
                        formatearCentavos(l.precioUnitarioCentavos)
                      )}
                    </td>
                    <td className="der num fuerte">{formatearCentavos(importeLinea(l))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="total-barra">
          <span className="total-rotulo">
            {venta.totales.cantidadLineas === 0
              ? "Sin artículos"
              : `${venta.totales.cantidadLineas} ${venta.totales.cantidadLineas === 1 ? "artículo" : "artículos"}`}
          </span>
          <span className="total-monto num">{formatearPesos(venta.totales.totalCentavos)}</span>
        </div>
      </div>

      {showTickets ? <ModalTickets onCerrar={() => setShowTickets(false)} /> : null}

      {showGenerica ? (
        <ModalGenerica
          onCerrar={() => setShowGenerica(false)}
          onAgregar={(descripcion, importe) => {
            venta.sumarGenerica(descripcion, importe, ALICUOTA_IVA_DEFAULT);
            setShowGenerica(false);
            setError(null);
          }}
        />
      ) : null}

      {showConfirmModal ? (
        <Modal
          titulo="Cerrar el ticket"
          ancho={470}
          onCerrar={() => setShowConfirmModal(false)}
          pie={
            <span className="derecha">
              <Boton onClick={() => setShowConfirmModal(false)}>Seguir con el ticket</Boton>
              <Boton
                variante="peligro"
                onClick={() => {
                  venta.cerrarTicket();
                  setShowConfirmModal(false);
                  setTexto("");
                }}
              >
                {venta.totales.cantidadLineas === 0 ? "Cerrar" : "Cerrar y perder"}
              </Boton>
            </span>
          }
        >
          {venta.totales.cantidadLineas === 0 ? (
            <p style={{ margin: 0 }}>Este ticket está vacío. ¿Lo cerrás?</p>
          ) : (
            <>
              <p style={{ margin: 0 }}>
                Este ticket tiene <b>{venta.totales.cantidadLineas}</b>{" "}
                {venta.totales.cantidadLineas === 1 ? "artículo" : "artículos"} por{" "}
                <b>{formatearPesos(venta.totales.totalCentavos)}</b>.
              </p>
              <p style={{ margin: "8px 0 0", color: "var(--ink-2)" }}>
                Si lo cerrás se pierde lo cargado. No se graba ninguna venta.
              </p>
            </>
          )}
        </Modal>
      ) : null}

      {showCobro ? (
        <ModalCobro
          totalCentavos={venta.totales.totalCentavos}
          medios={medios.datos ?? []}
          guardando={guardando}
          error={errorCobro}
          onCerrar={() => { setShowCobro(false); setErrorCobro(null); }}
          onCobrar={(pagos) => void cobrar(pagos)}
        />
      ) : null}
    </>
  );
}

/** Input que reemplaza a la celda mientras se edita. Enter confirma, Esc sale. */
function CampoEnLinea({
  valor,
  onValor,
  onConfirmar,
  onCancelar,
}: {
  readonly valor: string;
  readonly onValor: (v: string) => void;
  readonly onConfirmar: () => void;
  readonly onCancelar: () => void;
}) {
  return (
    <input
      autoFocus
      className="entrada chica num"
      style={{ width: "100%" }}
      value={valor}
      onChange={(e) => onValor(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") { e.preventDefault(); onConfirmar(); }
        else if (e.key === "Escape") { e.preventDefault(); onCancelar(); }
      }}
      onBlur={onConfirmar}
    />
  );
}
