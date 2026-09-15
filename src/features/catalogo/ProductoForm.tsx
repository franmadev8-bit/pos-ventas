import { useEffect, useMemo, useRef, useState } from "react";
import { Boton } from "../../components/Boton";
import { Modal } from "../../components/Modal";
import { formatearCantidad, parsearCantidad } from "../../domain/cantidad";
import { parsearMonto } from "../../domain/dinero";
import { mensajeDeError } from "../../domain/errores";
import { gananciaSobreCosto, ivaDesdeBruto, netoDesdeBruto } from "../../domain/iva";
import { ALICUOTA_IVA_DEFAULT } from "../../domain/tipos";
import type { TipoCodigo, Unidad, Uuid } from "../../domain/tipos";
import { formatearCentavos, formatearPorcentaje } from "../../lib/formato";
import type { Categoria } from "../../repositories/contratos/CategoriaRepository";
import type { ProductoConCodigos } from "../../repositories/contratos/ProductoRepository";
import { catalogoService } from "../../services";

interface Props {
  readonly producto: ProductoConCodigos | null;
  readonly categorias: readonly Categoria[];
  readonly onCerrar: () => void;
  readonly onGuardado: (mensaje: string) => void;
}

export function ProductoForm({ producto, categorias, onCerrar, onGuardado }: Props) {
  const esModoEdicion = producto !== null;

  const [codigo, setCodigo] = useState(producto?.codigos[0]?.codigo ?? "");
  const [descripcion, setDescripcion] = useState(producto?.descripcion ?? "");
  const [categoriaId, setCategoriaId] = useState<string>(producto?.categoriaId ?? "");
  const [unidad, setUnidad] = useState<Unidad>(producto?.unidad ?? "unidad");
  const [cantidad, setCantidad] = useState(
    producto ? formatearCantidad(producto.existenciaMilesimas, producto.unidad) : "0",
  );
  const [costo, setCosto] = useState(
    producto?.costoCentavos != null ? formatearCentavos(producto.costoCentavos) : "",
  );
  const [precio, setPrecio] = useState(producto ? formatearCentavos(producto.precioVentaCentavos) : "");
  const [mayorista, setMayorista] = useState(
    producto?.precioMayoristaCentavos != null ? formatearCentavos(producto.precioMayoristaCentavos) : "",
  );
  const [error, setError] = useState<{ texto: string; detalle?: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const formulario = useRef<HTMLFormElement>(null);

  /**
   * Flechas arriba y abajo para recorrer los campos, igual que en la lista.
   * Los selects tambien se cruzan de largo: un campo que se traga las flechas
   * corta el recorrido y obliga a cambiar de mano. La opcion se elige
   * escribiendo la primera letra, o abriendo la lista con Alt+flecha.
   *
   * Mientras la lista de un select esta desplegada, el popup es del sistema
   * operativo y no manda keydown a la pagina: ahi las flechas y el Enter
   * vuelven a ser del select, sin que haya que distinguir nada aca.
   */
  function moverCampo(destinoRelativo: 1 | -1, desde: EventTarget) {
    if (!(desde instanceof HTMLElement)) return false;
    const campos = Array.from(
      formulario.current?.querySelectorAll<HTMLElement>("input:not([hidden]), select") ?? [],
    );
    const i = campos.indexOf(desde);
    if (i === -1) return false;
    const destino = campos[i + destinoRelativo];
    if (!destino) return false;
    destino.focus();
    if (destino instanceof HTMLInputElement) destino.select();
    return true;
  }

  const alicuotaBp = producto?.alicuotaIvaBp ?? ALICUOTA_IVA_DEFAULT;
  const precioCentavos = parsearMonto(precio);
  const costoCentavos = costo.trim() === "" ? null : parsearMonto(costo);
  const mayoristaCentavos = mayorista.trim() === "" ? null : parsearMonto(mayorista);

  const calculo = useMemo(() => {
    if (precioCentavos === null) return null;
    return {
      neto: netoDesdeBruto(precioCentavos, alicuotaBp),
      iva: ivaDesdeBruto(precioCentavos, alicuotaBp),
      ganancia: gananciaSobreCosto(precioCentavos, costoCentavos),
    };
  }, [precioCentavos, alicuotaBp, costoCentavos]);

  useEffect(() => { setError(null); }, [codigo, descripcion, precio, costo, mayorista, cantidad, unidad]);

  async function guardar() {
    if (guardando) return;
    if (descripcion.trim() === "") { setError({ texto: "Poné una descripción para el producto." }); return; }
    if (precioCentavos === null) { setError({ texto: "El precio de venta no es un número válido." }); return; }
    if (costo.trim() !== "" && costoCentavos === null) { setError({ texto: "El costo no es un número válido." }); return; }
    if (mayorista.trim() !== "" && mayoristaCentavos === null) { setError({ texto: "El precio mayorista no es un número válido." }); return; }

    const cantidadTexto = cantidad.trim() === "" ? "0" : cantidad.trim();
    const cantidadMilesimas = cantidadTexto === "0" ? 0 : parsearCantidad(cantidadTexto, unidad);
    if (cantidadMilesimas === null) {
      setError({ texto: unidad === "kg"
        ? "La cantidad actual admite hasta tres decimales."
        : "La cantidad actual tiene que ser un número entero." });
      return;
    }

    setGuardando(true);
    try {
      await catalogoService.guardarProducto(esModoEdicion ? (producto.id as Uuid) : null, {
        categoriaId: categoriaId === "" ? null : (categoriaId as Uuid),
        descripcion,
        unidad,
        costoCentavos,
        precioVentaCentavos: precioCentavos,
        precioMayoristaCentavos: mayoristaCentavos,
        alicuotaIvaBp: alicuotaBp,
        codigos: codigo.trim() === "" ? [] : [{ codigo: codigo.trim(), tipo: "ean" as TipoCodigo }],
        cantidadActualMilesimas: cantidadMilesimas,
      });
      onGuardado(esModoEdicion ? "Producto actualizado." : "Producto guardado.");
    } catch (e) {
      setError(mensajeDeError(e, "No se pudo guardar el producto."));
      setGuardando(false);
    }
  }

  return (
    <Modal
      titulo={esModoEdicion ? "Editar producto" : "Nuevo producto"}
      onCerrar={onCerrar}
      ancho={720}
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
            <Boton tecla="Enter" variante="primario" onClick={() => void guardar()} disabled={guardando}>
              Guardar
            </Boton>
          </span>
        </>
      }
    >
      <form
        className="formulario"
        ref={formulario}
        onSubmit={(e) => { e.preventDefault(); void guardar(); }}
        onKeyDown={(e) => {
          const enSelect = e.target instanceof HTMLElement && e.target.tagName === "SELECT";
          // Alt+flecha despliega la lista del select: eso no se toca.
          if (e.altKey && enSelect) return;
          if (e.key === "ArrowDown" && moverCampo(1, e.target)) e.preventDefault();
          else if (e.key === "ArrowUp" && moverCampo(-1, e.target)) e.preventDefault();
          else if (e.key === "Enter" && enSelect) {
            // Un select cerrado se traga el Enter y vuelve a abrir la lista.
            // Aca Enter significa guardar, igual que en cualquier otro campo.
            e.preventDefault();
            void guardar();
          }
        }}
      >
        <div className="renglon">
          <label htmlFor="f-codigo">Código de barras</label>
          <span className="control">
            <input id="f-codigo" className="entrada mono w-codigo" value={codigo}
              onChange={(e) => setCodigo(e.target.value)} placeholder="Escaneá o escribí" />
          </span>
          <span />
        </div>

        <div className="renglon">
          <label htmlFor="f-desc">Descripción</label>
          <span className="control">
            <input id="f-desc" className="entrada w-desc" value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)} placeholder="Coca-Cola 2,25 L" />
          </span>
          <span />
        </div>

        <div className="renglon">
          <label htmlFor="f-cat">Categoría</label>
          <span className="control">
            <select id="f-cat" className="entrada w-cat" value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}>
              <option value="">Sin categoría</option>
              {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </span>
          <span />
        </div>

        <div className="renglon">
          <label htmlFor="f-unidad">Se vende por</label>
          <span className="control">
            <select id="f-unidad" className="entrada w-cat" value={unidad}
              onChange={(e) => setUnidad(e.target.value as Unidad)}>
              <option value="unidad">Unidad</option>
              <option value="kg">Kilo</option>
              <option value="paquete">Paquete</option>
            </select>
          </span>
          <span />
        </div>

        <div className="renglon">
          <label htmlFor="f-cant">Cantidad actual</label>
          <span className="control">
            <input id="f-cant" className="entrada num w-cant" value={cantidad}
              onChange={(e) => setCantidad(e.target.value)} placeholder="0" />
          </span>
          <span />
        </div>

        <div className="separador"><span>Precios</span><span /></div>

        <div className="renglon">
          <label htmlFor="f-costo">Costo</label>
          <span className="control">
            <input id="f-costo" className="entrada num w-precio" value={costo}
              onChange={(e) => setCosto(e.target.value)} placeholder="0,00" />
          </span>
          <span />
        </div>

        <div className="renglon">
          <label htmlFor="f-precio">Precio de venta</label>
          <span className="control">
            <input id="f-precio" className="entrada num w-precio" value={precio}
              onChange={(e) => setPrecio(e.target.value)} placeholder="0,00" />
          </span>
          <span />
        </div>

        <div className="renglon">
          <label htmlFor="f-may">Precio mayorista</label>
          <span className="control">
            <input id="f-may" className="entrada num w-precio" value={mayorista}
              onChange={(e) => setMayorista(e.target.value)} placeholder="opcional" />
          </span>
          <span />
        </div>

        <div className="renglon">
          <label />
          <span className="control">
            <span className="derivados">
              <span>Neto <b>{calculo ? formatearCentavos(calculo.neto) : "—"}</b></span>
              <span>IVA <b>{calculo ? formatearCentavos(calculo.iva) : "—"}</b></span>
              <span>Ganancia <b>{formatearPorcentaje(calculo?.ganancia ?? null)}</b></span>
            </span>
          </span>
          <span />
        </div>

        {/* Deja que Enter envie el formulario desde cualquier campo. */}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}
