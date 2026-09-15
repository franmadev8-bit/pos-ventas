import { useEffect, useRef, useState } from "react";
import { Aviso } from "../../components/Aviso";
import { Boton } from "../../components/Boton";
import type { PagoTicket } from "../../domain/cobro";
import { formatearCantidad, parsearCantidad } from "../../domain/cantidad";
import { parsearMonto } from "../../domain/dinero";
import { mensajeDeError } from "../../domain/errores";
import { importeLinea } from "../../domain/ticket";
import type { Uuid } from "../../domain/tipos";
import { useAsync } from "../../hooks/useAsync";
import { useVentaEnCurso } from "../../hooks/useVentaEnCurso";
import { formatearCentavos, formatearPesos } from "../../lib/formato";
import type { Producto } from "../../repositories/contratos/ProductoRepository";
import { catalogoService, ventaService } from "../../services";
import { ModalCobro } from "./ModalCobro";

type Edicion = { readonly lineaId: Uuid; readonly campo: "cantidad" | "precio" };

const MAX_SUGERENCIAS = 8;

export function PantallaVenta() {
  const venta = useVentaEnCurso();
  const [texto, setTexto] = useState("");
  const [showCobro, setShowCobro] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [edicion, setEdicion] = useState<Edicion | null>(null);
  const [borrador, setBorrador] = useState("");
  const [error, setError] = useState<{ texto: string; detalle?: string } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const entrada = useRef<HTMLInputElement>(null);
  const cuerpo = useRef<HTMLTableSectionElement>(null);

  const medios = useAsync(() => ventaService.mediosDePago(), []);
  // El turno se abre al entrar, no al cobrar: si algo falla con la caja, que se
  // vea ahora y no con el cliente esperando en el mostrador.
  const contexto = useAsync(() => ventaService.contexto(), [], "No se pudo abrir el turno de caja.");

  const sugerencias = useAsync(
    () =>
      texto.trim().length < 2
        ? Promise.resolve([])
        : catalogoService.listarProductos({ texto, soloActivos: true, limite: MAX_SUGERENCIAS }),
    [texto],
  );
  const opciones = texto.trim().length < 2 ? [] : (sugerencias.datos ?? []);

  // El foco vive en el buscador. Vuelve solo despues de cada accion.
  function volverAlBuscador() {
    entrada.current?.focus();
    entrada.current?.select();
  }
  useEffect(() => { if (!showCobro && edicion === null) volverAlBuscador(); }, [showCobro, edicion]);

  function sumar(p: Producto) {
    venta.sumarProducto(p);
    setTexto("");
    setError(null);
    volverAlBuscador();
  }

  /**
   * Enter en el buscador. El lector de codigo de barras emula teclado y manda
   * Enter, asi que este es el mismo camino para el lector y para la mano.
   */
  async function alConfirmarBusqueda() {
    const t = texto.trim();
    if (t === "") {
      if (venta.lineas.length > 0) setShowCobro(true);
      return;
    }
    try {
      const porCodigo = await ventaService.buscarPorCodigo(t);
      if (porCodigo) { sumar(porCodigo); return; }
    } catch (e) {
      setError(mensajeDeError(e, "No se pudo buscar el producto."));
      return;
    }
    const unica = opciones.length === 1 ? opciones[0] : undefined;
    if (unica) { sumar(unica); return; }
    if (opciones.length === 0) setError({ texto: `No hay ningún producto con «${t}».` });
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

  function moverFoco(desde: number, salto: 1 | -1) {
    const filas = cuerpo.current?.querySelectorAll<HTMLTableRowElement>("tr");
    if (!filas || filas.length === 0) return;
    filas[Math.min(Math.max(desde + salto, 0), filas.length - 1)]?.focus();
  }

  async function cobrar(pagos: readonly PagoTicket[]) {
    if (guardando) return;
    setGuardando(true);
    setError(null);
    try {
      const r = await ventaService.cobrar(venta.ventaId, venta.lineas, pagos, 0);
      setShowCobro(false);
      venta.vaciar();
      setTexto("");
      setAviso(`Ticket ${r.ticketNumero} cobrado por ${formatearPesos(venta.totales.totalCentavos)}.`);
    } catch (e) {
      setError(mensajeDeError(e, "No se pudo grabar la venta."));
    } finally {
      setGuardando(false);
    }
  }

  // F12 cobra desde cualquier lado de la pantalla.
  useEffect(() => {
    function alTeclado(e: KeyboardEvent) {
      if (showCobro) return;
      if (e.key === "F12" && venta.lineas.length > 0) { e.preventDefault(); setShowCobro(true); }
    }
    window.addEventListener("keydown", alTeclado);
    return () => window.removeEventListener("keydown", alTeclado);
  }, [showCobro, venta.lineas.length]);

  return (
    <>
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
        <Boton
          tecla="F12"
          variante="primario"
          disabled={venta.lineas.length === 0}
          motivo={venta.lineas.length === 0 ? "el ticket está vacío" : undefined}
          onClick={() => setShowCobro(true)}
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
              onClick={() => sumar(p)}
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

      {showCobro ? (
        <ModalCobro
          totalCentavos={venta.totales.totalCentavos}
          medios={medios.datos ?? []}
          guardando={guardando}
          error={error}
          onCerrar={() => { setShowCobro(false); setError(null); }}
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
