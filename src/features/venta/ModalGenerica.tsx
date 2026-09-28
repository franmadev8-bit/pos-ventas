import { useState } from "react";
import { Boton } from "../../components/Boton";
import { Modal } from "../../components/Modal";
import { parsearMonto } from "../../domain/dinero";
import { ivaDesdeBruto, netoDesdeBruto } from "../../domain/iva";
import { ALICUOTA_IVA_DEFAULT } from "../../domain/tipos";
import type { Centavos } from "../../domain/tipos";
import { formatearCentavos } from "../../lib/formato";

interface Props {
  readonly onCerrar: () => void;
  readonly onAgregar: (descripcion: string, importeCentavos: Centavos) => void;
}

/** Descripcion por defecto. Es lo que el comerciante pone en el ticket cuando
 *  vende algo que no tiene cargado. */
const DESCRIPCION_DEFAULT = "Varios";

/**
 * Monto suelto: lo que se vende sin estar en el catalogo. El importe es el
 * precio final, con IVA adentro, igual que el de cualquier producto (regla 9).
 */
export function ModalGenerica({ onCerrar, onAgregar }: Props) {
  const [importe, setImporte] = useState("");
  const [descripcion, setDescripcion] = useState("");

  const centavos = importe.trim() === "" ? null : parsearMonto(importe);
  const motivo =
    importe.trim() === ""
      ? "Escribí cuánto sale."
      : centavos === null
        ? "Ese no es un importe válido."
        : centavos <= 0
          ? "El importe tiene que ser mayor a cero."
          : null;

  function agregar() {
    if (motivo !== null || centavos === null) return;
    onAgregar(descripcion.trim() === "" ? DESCRIPCION_DEFAULT : descripcion.trim(), centavos);
  }

  return (
    <Modal
      titulo="Monto suelto"
      ancho={480}
      onCerrar={onCerrar}
      pie={
        <>
          {motivo && importe.trim() !== "" ? <span className="motivo">{motivo}</span> : null}
          <span className="derecha">
            <Boton tecla="Esc" onClick={onCerrar}>Cancelar</Boton>
            <Boton tecla="Enter" variante="primario" disabled={motivo !== null} onClick={agregar}>
              Agregar al ticket
            </Boton>
          </span>
        </>
      }
    >
      <form className="formulario" onSubmit={(e) => { e.preventDefault(); agregar(); }}>
        <div className="renglon">
          <label htmlFor="g-importe">Importe</label>
          <span className="control">
            <input
              id="g-importe"
              autoFocus
              className="entrada num w-precio"
              value={importe}
              onChange={(e) => setImporte(e.target.value)}
              placeholder="0,00"
            />
          </span>
          <span />
        </div>

        <div className="renglon">
          <label htmlFor="g-desc">Descripción</label>
          <span className="control">
            <input
              id="g-desc"
              className="entrada w-desc"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder={DESCRIPCION_DEFAULT}
            />
          </span>
          <span />
        </div>

        <div className="renglon">
          <label />
          <span className="control">
            <span className="derivados">
              <span>
                Neto{" "}
                <b>{centavos === null ? "—" : formatearCentavos(netoDesdeBruto(centavos, ALICUOTA_IVA_DEFAULT))}</b>
              </span>
              <span>
                IVA{" "}
                <b>{centavos === null ? "—" : formatearCentavos(ivaDesdeBruto(centavos, ALICUOTA_IVA_DEFAULT))}</b>
              </span>
            </span>
          </span>
          <span />
        </div>

        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}
