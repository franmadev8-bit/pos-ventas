import { useEffect, useMemo, useRef, useState } from "react";
import { Boton } from "../../components/Boton";
import { Modal } from "../../components/Modal";
import { estadoDeCobro, motivoParaNoCobrar } from "../../domain/cobro";
import type { PagoTicket } from "../../domain/cobro";
import { parsearMonto } from "../../domain/dinero";
import type { Centavos } from "../../domain/tipos";
import { formatearCentavos, formatearPesos } from "../../lib/formato";
import type { MedioPago } from "../../repositories/contratos/MedioPagoRepository";
import { nuevoId } from "../../lib/id";

interface Props {
  readonly totalCentavos: Centavos;
  readonly medios: readonly MedioPago[];
  readonly guardando: boolean;
  readonly error: { texto: string; detalle?: string } | null;
  readonly onCerrar: () => void;
  readonly onCobrar: (pagos: readonly PagoTicket[]) => void;
}

/**
 * Cobro en efectivo. En el corte 2 hay un solo medio; el modal ya devuelve una
 * lista de pagos para que el pago mixto del corte 3 no lo tenga que rehacer.
 */
export function ModalCobro({ totalCentavos, medios, guardando, error, onCerrar, onCobrar }: Props) {
  const efectivo = useMemo(() => medios.find((m) => m.tipo === "efectivo") ?? medios[0], [medios]);
  const [recibido, setRecibido] = useState("");
  const entrada = useRef<HTMLInputElement>(null);

  useEffect(() => { entrada.current?.focus(); }, []);

  const recibidoCentavos = recibido.trim() === "" ? null : parsearMonto(recibido);
  const textoInvalido = recibido.trim() !== "" && recibidoCentavos === null;

  // Con el campo vacio se cobra justo: es el caso mas comun del mostrador.
  const entregado = recibidoCentavos ?? totalCentavos;

  const pagos: readonly PagoTicket[] = useMemo(() => {
    if (!efectivo) return [];
    return [{
      id: nuevoId(),
      medioPagoId: efectivo.id,
      medioPagoNombre: efectivo.nombre,
      medioPagoTipo: efectivo.tipo,
      afectaArqueo: efectivo.afectaArqueo,
      montoCentavos: totalCentavos,
      recibidoCentavos: entregado,
    }];
    // El id se regenera solo cuando cambian los datos del pago.
  }, [efectivo, totalCentavos, entregado]);

  const estado = estadoDeCobro(totalCentavos, pagos);
  const motivo = textoInvalido
    ? "Eso no es un monto válido."
    : motivoParaNoCobrar(totalCentavos, pagos);

  function confirmar() {
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
          ) : motivo ? (
            <span className="motivo">{motivo}</span>
          ) : null}
          <span className="derecha">
            <Boton tecla="Esc" onClick={onCerrar}>Cancelar</Boton>
            <Boton
              tecla="Enter"
              variante="primario"
              disabled={motivo !== null || guardando}
              onClick={confirmar}
            >
              {guardando ? "Grabando…" : "Cobrar"}
            </Boton>
          </span>
        </>
      }
    >
      <div className="cobro">
        <div className="cobro-fila">
          <span>Total</span>
          <b className="num cobro-total">{formatearPesos(totalCentavos)}</b>
        </div>

        <div className="renglon" style={{ marginTop: 6 }}>
          <label htmlFor="c-recibido">Recibí</label>
          <span className="control">
            <input
              id="c-recibido"
              ref={entrada}
              className="entrada num w-precio"
              value={recibido}
              onChange={(e) => setRecibido(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confirmar(); } }}
              placeholder={formatearCentavos(totalCentavos)}
            />
          </span>
          <span />
        </div>

        <div className="cobro-fila cobro-vuelto">
          <span>Vuelto</span>
          <b className="num">{formatearPesos(estado.vueltoCentavos)}</b>
        </div>
      </div>
    </Modal>
  );
}
