interface Props {
  readonly tono: "ok" | "malo";
  readonly detalle?: string | undefined;
  readonly children: string;
}

/** Una linea discreta. Nunca un modal para avisar que algo salio bien. */
export function Aviso({ tono, detalle, children }: Props) {
  return (
    <div className={`aviso ${tono}`} role="status">
      <div className="columna" style={{ gap: 2 }}>
        <span>{children}</span>
        {detalle ? <span className="detalle mono">{detalle}</span> : null}
      </div>
    </div>
  );
}
