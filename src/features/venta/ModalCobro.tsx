import { useEffect, useRef, useState } from "react";
import { Boton } from "../../components/Boton";
import { Modal } from "../../components/Modal";
import { estadoDeCobro, motivoParaNoCobrar, repartirEfectivo } from "../../domain/cobro";
import type { PagoTicket } from "../../domain/cobro";
import { parsearMonto } from "../../domain/dinero";
import { sumar } from "../../domain/dinero";
import type { Centavos } from "../../domain/tipos";
import { formatearCentavos, formatearPesos } from "../../lib/formato";
import { nuevoId } from "../../lib/id";
import type { MedioPago } from "../../repositories/contratos/MedioPagoRepository";

interface Props {
  readonly totalCentavos: Centavos;
  readonly medios: readonly MedioPago[];
  readonly guardando: boolean;
  readonly error: { texto: string; detalle?: string } | null;
  readonly onCerrar: () => void;
  readonly onCobrar: (pagos: readonly PagoTicket[]) => void;
}

/**
 * Cobro. Tiene dos modos y el simple es el que se usa casi siempre.
 *
 * SIMPLE: un medio y un importe cargado con el total. Enter y listo.
 * VARIOS: cada medio con su propio importe. Se prende a proposito con el check,
 * porque partir un pago es la excepcion y no tiene que estorbar al resto.
 *
 * En los dos modos, el efectivo admite tipear mas de lo que se debe: la
 * diferencia es el vuelto. Los demas medios no, porque no hay como devolver.
 */
export function ModalCobro({ totalCentavos, medios, guardando, error, onCerrar, onCobrar }: Props) {
  const [varios, setVarios] = useState(false);
  const [medioId, setMedioId] = useState<string>("");
  const [valor, setValor] = useState(() => formatearCentavos(totalCentavos));
  const [montos, setMontos] = useState<Record<string, string>>({});
  const campo = useRef<HTMLInputElement>(null);

  // Arranca en efectivo, o en el primero que haya si no existe.
  useEffect(() => {
    if (medioId !== "" || medios.length === 0) return;
    setMedioId((medios.find((m) => m.tipo === "efectivo") ?? medios[0])?.id ?? "");
  }, [medios, medioId]);

  useEffect(() => {
    if (varios) document.getElementById(`c-${medios[0]?.id ?? ""}`)?.focus();
    else campo.current?.select();
  }, [varios, medios]);

  const medio = medios.find((m) => m.id === medioId);
  const indiceMedio = medios.findIndex((m) => m.id === medioId);

  function centavosDe(texto: string | undefined): Centavos | null {
    const t = (texto ?? "").trim();
    return t === "" ? null : parsearMonto(t);
  }

  const hayInvalido = varios
    ? medios.some((m) => (montos[m.id] ?? "").trim() !== "" && centavosDe(montos[m.id]) === null)
    : valor.trim() !== "" && centavosDe(valor) === null;

  /**
   * Arma los pagos con lo que hay tipeado.
   *
   * El efectivo se resuelve al final: cubre lo que quedo despues de los demas
   * medios y el excedente es vuelto. Por eso no se puede mirar cada campo por
   * separado, hay que mirarlos juntos.
   */
  function construirPagos(): readonly PagoTicket[] {
    const entradas = (varios ? medios : medio ? [medio] : [])
      .map((m) => ({ m, centavos: centavosDe(varios ? montos[m.id] : valor) }))
      .filter((e): e is { m: MedioPago; centavos: Centavos } => e.centavos !== null && e.centavos > 0);

    const sinVuelto = sumar(entradas.filter((e) => !e.m.permiteVuelto).map((e) => e.centavos));

    return entradas
      .map((e) => {
        const base = {
          id: nuevoId(),
          medioPagoId: e.m.id,
          medioPagoNombre: e.m.nombre,
          medioPagoTipo: e.m.tipo,
          afectaArqueo: e.m.afectaArqueo,
          referencia: null,
        };
        if (!e.m.permiteVuelto) {
          return { ...base, montoCentavos: e.centavos, recibidoCentavos: null };
        }
        const { montoCentavos } = repartirEfectivo(
          Math.max(totalCentavos - sinVuelto, 0),
          e.centavos,
        );
        return { ...base, montoCentavos, recibidoCentavos: e.centavos };
      })
      // Un pago en cero no existe: pasa si el efectivo sobra porque los otros
      // medios ya cubrieron todo.
      .filter((p) => p.montoCentavos !== 0);
  }

  const pagos = construirPagos();
  const estado = estadoDeCobro(totalCentavos, pagos);
  const motivo = hayInvalido ? "Ese no es un monto válido." : motivoParaNoCobrar(totalCentavos, pagos);

  /** Mueve el foco entre los renglones de medios. Solo en modo varios. */
  function moverFoco(desde: number, salto: 1 | -1) {
    const destino = medios[Math.min(Math.max(desde + salto, 0), medios.length - 1)];
    if (destino) document.getElementById(`c-${destino.id}`)?.focus();
  }

  /**
   * Enter en un renglon carga ahi lo que falta, SUMANDO a lo que ya tenga.
   * Sumar y no reemplazar es lo que hace que no se pueda perder un numero ya
   * tipeado por apretar Enter de mas. Cuando ya no falta nada, Enter cobra.
   */
  function alEnterEn(m: MedioPago) {
    if (estado.pendienteCentavos <= 0) { cobrar(); return; }
    const actual = centavosDe(montos[m.id]) ?? 0;
    setMontos((x) => ({ ...x, [m.id]: formatearCentavos(actual + estado.pendienteCentavos) }));
  }

  function elegirMedio(i: number) {
    const m = medios[Math.min(Math.max(i, 0), medios.length - 1)];
    if (m) setMedioId(m.id);
  }

  /** Al prender varios medios, lo tipeado no se pierde: pasa a su renglon. */
  function cambiarModo(activar: boolean) {
    if (activar) {
      setMontos(medio ? { [medio.id]: valor } : {});
    } else {
      setValor(formatearCentavos(totalCentavos));
    }
    setVarios(activar);
  }

  function cobrar() {
    if (motivo !== null || guardando) return;
    onCobrar(pagos);
  }

  return (
    <Modal
      titulo="Cobrar"
      ancho={520}
      onCerrar={onCerrar}
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
            <Boton tecla="Esc" onClick={onCerrar}>Cancelar</Boton>
            <Boton
              tecla="Enter"
              variante="primario"
              disabled={motivo !== null || guardando}
              motivo={motivo ?? undefined}
              onClick={cobrar}
            >
              {guardando ? "Grabando…" : "Cobrar"}
            </Boton>
          </span>
        </>
      }
    >
      <div
        className="cobro"
        onKeyDown={(e) => {
          if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
          const salto = e.key === "ArrowDown" ? 1 : -1;
          e.preventDefault();
          // Mismas teclas en los dos modos: con un medio cambian cual es, con
          // varios bajan al renglon siguiente. El foco vive en un campo de
          // numero, asi que las flechas verticales estan libres.
          if (varios) {
            const i = medios.findIndex((m) => `c-${m.id}` === (e.target as HTMLElement).id);
            moverFoco(i === -1 ? 0 : i, salto);
          } else {
            elegirMedio(indiceMedio + salto);
          }
        }}
      >
        <div className="cobro-fila">
          <span>Total</span>
          <b className="num cobro-total">{formatearPesos(totalCentavos)}</b>
        </div>

        {varios ? (
          <div className="medios-lista">
            {medios.map((m) => (
              <div key={m.id} className="renglon">
                <label htmlFor={`c-${m.id}`}>{m.nombre}</label>
                <span className="control">
                  <input
                    id={`c-${m.id}`}
                    className="entrada num w-precio"
                    value={montos[m.id] ?? ""}
                    onChange={(e) => setMontos((x) => ({ ...x, [m.id]: e.target.value }))}
                    onFocus={(e) => e.currentTarget.select()}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); alEnterEn(m); } }}
                    placeholder="0,00"
                  />
                </span>
                <span />
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="medios">
              {medios.map((m, i) => (
                <button
                  key={m.id}
                  type="button"
                  tabIndex={-1}
                  className="medio"
                  aria-pressed={m.id === medioId}
                  onClick={() => elegirMedio(i)}
                >
                  {m.nombre}
                </button>
              ))}
              <span className="medios-teclas" title="Las flechas cambian el medio">↑↓</span>
            </div>

            <div className="renglon">
              <label htmlFor="c-valor">Importe</label>
              <span className="control">
                <input
                  id="c-valor"
                  ref={campo}
                  autoFocus
                  className="entrada num w-precio"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  onFocus={(e) => e.currentTarget.select()}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); cobrar(); } }}
                />
              </span>
              <span />
            </div>
          </>
        )}

        {varios ? (
          <div className="pista-cobro">↑↓ cambia de renglón · Enter carga ahí lo que falta</div>
        ) : null}

        <label className="check-varios">
          <input
            type="checkbox"
            checked={varios}
            onChange={(e) => cambiarModo(e.target.checked)}
          />
          <span>Pagar con más de un medio</span>
        </label>

        <div className="cobro-fila cobro-vuelto">
          {estado.pendienteCentavos > 0 ? (
            <>
              <span>Falta cubrir</span>
              <b className="num falta">{formatearPesos(estado.pendienteCentavos)}</b>
            </>
          ) : (
            <>
              <span>Vuelto</span>
              <b className="num">{formatearPesos(estado.vueltoCentavos)}</b>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
