import { useEffect, useRef, useState } from "react";
import { Aviso } from "../../components/Aviso";
import { Boton } from "../../components/Boton";
import { Modal } from "../../components/Modal";
import { formatearCantidad } from "../../domain/cantidad";
import { mensajeDeError } from "../../domain/errores";
import type { Uuid } from "../../domain/tipos";
import { useAsync } from "../../hooks/useAsync";
import { horaLocal } from "../../lib/fecha";
import { formatearCentavos, formatearPesos } from "../../lib/formato";
import type { VentaDetalle } from "../../repositories/contratos/VentaRepository";
import { ventaService } from "../../services";

interface Props {
  readonly onCerrar: () => void;
}

const MAX_TICKETS_LISTADOS = 100;

/**
 * Los tickets cobrados en este turno. Es donde se va a buscar uno que salio
 * mal, asi que lo unico que se puede hacer desde aca es mirarlo y anularlo:
 * no hay forma de editar una venta (regla 5).
 */
export function ModalTickets({ onCerrar }: Props) {
  const [detalle, setDetalle] = useState<VentaDetalle | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [anulando, setAnulando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<{ texto: string; detalle?: string } | null>(null);
  const cuerpo = useRef<HTMLTableSectionElement>(null);

  const lista = useAsync(
    () => ventaService.ultimasDelTurno(MAX_TICKETS_LISTADOS),
    [aviso],
    "No se pudieron leer los tickets del turno.",
  );
  const tickets = lista.datos ?? [];

  useEffect(() => {
    if (!detalle && !showConfirmModal) {
      cuerpo.current?.querySelector<HTMLTableRowElement>("tr")?.focus();
    }
  }, [detalle, showConfirmModal, tickets.length]);

  async function abrirDetalle(id: Uuid) {
    try {
      setDetalle(await ventaService.detalle(id));
    } catch (e) {
      setError(mensajeDeError(e, "No se pudo abrir el ticket."));
    }
  }

  function moverFoco(desde: number, salto: 1 | -1) {
    const filas = cuerpo.current?.querySelectorAll<HTMLTableRowElement>("tr");
    if (!filas || filas.length === 0) return;
    filas[Math.min(Math.max(desde + salto, 0), filas.length - 1)]?.focus();
  }

  async function confirmarAnulacion() {
    if (!detalle || anulando) return;
    setAnulando(true);
    setError(null);
    try {
      const r = await ventaService.anular(detalle.id, motivo);
      setShowConfirmModal(false);
      setDetalle(null);
      setMotivo("");
      setAviso(
        `Ticket ${detalle.ticketNumero} anulado. Se registró el ticket ${r.ticketNumero} en negativo.`,
      );
    } catch (e) {
      setError(mensajeDeError(e, "No se pudo anular el ticket."));
    } finally {
      setAnulando(false);
    }
  }

  // --- Detalle de un ticket ---
  if (detalle) {
    return (
      <>
        <Modal
          titulo={`Ticket ${detalle.ticketNumero}`}
          ancho={680}
          onCerrar={() => setDetalle(null)}
          pie={
            <>
              {error ? (
                <span className="columna" style={{ gap: 2 }}>
                  <span className="motivo" style={{ color: "var(--rojo)" }}>{error.texto}</span>
                  {error.detalle ? (
                    <span className="motivo mono" style={{ opacity: 0.8 }}>{error.detalle}</span>
                  ) : null}
                </span>
              ) : null}
              <span className="derecha">
                <Boton tecla="Esc" onClick={() => setDetalle(null)}>Volver</Boton>
                <Boton
                  variante="peligro"
                  disabled={detalle.anulada}
                  motivo={detalle.anulada ? "ya está anulado" : undefined}
                  onClick={() => { setMotivo(""); setShowConfirmModal(true); }}
                >
                  Anular ticket
                </Boton>
              </span>
            </>
          }
        >
          <div className="detalle-venta">
            <div className="detalle-cabecera">
              <span>{horaLocal(detalle.fecha)}</span>
              {detalle.anulada ? <span className="marca-anulada">ANULADO</span> : <span />}
              <b className="num">{formatearPesos(detalle.totalCentavos)}</b>
            </div>

            <table className="grilla">
              <thead>
                <tr>
                  <th>Descripción</th>
                  <th className="der" style={{ width: 100 }}>Cantidad</th>
                  <th className="der" style={{ width: 120 }}>Precio</th>
                  <th className="der" style={{ width: 130 }}>Importe</th>
                </tr>
              </thead>
              <tbody>
                {detalle.lineas.map((l) => (
                  <tr key={l.id}>
                    <td>{l.descripcion}</td>
                    <td className="der num">{formatearCantidad(l.cantidadMilesimas, l.unidad)}</td>
                    <td className="der num">{formatearCentavos(l.precioUnitarioCentavos)}</td>
                    <td className="der num fuerte">{formatearCentavos(l.importeCentavos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="pagos-cargados" style={{ marginTop: 12 }}>
              {detalle.pagos.map((p) => (
                <div key={p.id} className="pago-cargado">
                  <span>{p.medioPagoNombre}</span>
                  <span className="num">{formatearCentavos(p.montoCentavos)}</span>
                  <span className="derivado">
                    {p.vueltoCentavos !== null && p.vueltoCentavos > 0
                      ? `vuelto ${formatearCentavos(p.vueltoCentavos)}`
                      : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Modal>

        {showConfirmModal ? (
          <Modal
            titulo="Anular el ticket"
            ancho={520}
            onCerrar={() => setShowConfirmModal(false)}
            pie={
              <span className="derecha">
                <Boton onClick={() => setShowConfirmModal(false)}>No anular</Boton>
                <Boton
                  variante="peligro"
                  disabled={motivo.trim() === "" || anulando}
                  motivo={motivo.trim() === "" ? "falta el motivo" : undefined}
                  onClick={() => void confirmarAnulacion()}
                >
                  {anulando ? "Anulando…" : "Anular"}
                </Boton>
              </span>
            }
          >
            <p style={{ margin: "0 0 12px" }}>
              El ticket <b>{detalle.ticketNumero}</b> por{" "}
              <b>{formatearPesos(detalle.totalCentavos)}</b> no se borra: se registra un ticket
              nuevo en negativo que lo referencia. El stock vuelve y el efectivo sale de la caja.
            </p>
            <div className="renglon">
              <label htmlFor="a-motivo">Motivo</label>
              <span className="control">
                <input
                  id="a-motivo"
                  autoFocus
                  className="entrada w-desc"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && motivo.trim() !== "") {
                      e.preventDefault();
                      void confirmarAnulacion();
                    }
                  }}
                  placeholder="Se cargó mal, el cliente se arrepintió…"
                />
              </span>
              <span />
            </div>
          </Modal>
        ) : null}
      </>
    );
  }

  // --- Lista del turno ---
  return (
    <Modal
      titulo="Tickets del turno"
      ancho={760}
      onCerrar={onCerrar}
      pie={
        <span className="derecha">
          <Boton tecla="Esc" onClick={onCerrar}>Cerrar</Boton>
        </span>
      }
    >
      {aviso ? <Aviso tono="ok">{aviso}</Aviso> : null}
      {error ? (
        <Aviso tono="malo" {...(error.detalle ? { detalle: error.detalle } : {})}>{error.texto}</Aviso>
      ) : null}
      {lista.error ? (
        <Aviso tono="malo" {...(lista.error.detalle ? { detalle: lista.error.detalle } : {})}>
          {lista.error.texto}
        </Aviso>
      ) : null}

      {lista.cargando ? null : tickets.length === 0 ? (
        <div className="vacio">
          <div>Todavía no cobraste nada en este turno.</div>
        </div>
      ) : (
        <div className="tabla-scroll" style={{ maxHeight: 420 }}>
          <table className="grilla">
            <thead>
              <tr>
                <th className="der" style={{ width: 70 }}>Ticket</th>
                <th style={{ width: 70 }}>Hora</th>
                <th>Medio de pago</th>
                <th className="der" style={{ width: 80 }}>Líneas</th>
                <th className="der" style={{ width: 130 }}>Total</th>
              </tr>
            </thead>
            <tbody ref={cuerpo}>
              {tickets.map((t, i) => (
                <tr
                  key={t.id}
                  tabIndex={0}
                  className={`fila-producto ${t.anulada ? "fila-anulada" : ""}`}
                  onDoubleClick={() => void abrirDetalle(t.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); void abrirDetalle(t.id); }
                    else if (e.key === "ArrowDown") { e.preventDefault(); moverFoco(i, 1); }
                    else if (e.key === "ArrowUp") { e.preventDefault(); moverFoco(i, -1); }
                  }}
                >
                  <td className="der num fuerte">{t.ticketNumero}</td>
                  <td className="num">{horaLocal(t.fecha)}</td>
                  <td>
                    {t.medios}
                    {t.anulada ? <span className="marca-anulada"> ANULADO</span> : null}
                  </td>
                  <td className="der num derivado">{t.cantidadLineas}</td>
                  <td className="der num fuerte">{formatearCentavos(t.totalCentavos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
