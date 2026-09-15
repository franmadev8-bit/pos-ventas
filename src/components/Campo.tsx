import type { InputHTMLAttributes, ReactNode } from "react";

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "children"> {
  readonly etiqueta: string;
  readonly ayuda?: ReactNode;
  readonly error?: string;
  readonly numerico?: boolean;
}

export function Campo({ etiqueta, ayuda, error, numerico, className, ...resto }: Props) {
  const clases = [numerico ? "num" : "", className ?? ""].filter(Boolean).join(" ");
  return (
    <label className="campo">
      <span className="etiqueta">{etiqueta}</span>
      <input className={clases === "" ? undefined : clases} {...resto} />
      {error ? <span className="malo">{error}</span> : ayuda ? <span className="ayuda">{ayuda}</span> : null}
    </label>
  );
}

interface PropsSelect {
  readonly etiqueta: string;
  readonly valor: string;
  readonly onValorChange: (valor: string) => void;
  readonly opciones: readonly { readonly valor: string; readonly texto: string }[];
  readonly ayuda?: ReactNode;
}

export function CampoSelect({ etiqueta, valor, onValorChange, opciones, ayuda }: PropsSelect) {
  return (
    <label className="campo">
      <span className="etiqueta">{etiqueta}</span>
      <select value={valor} onChange={(e) => onValorChange(e.target.value)}>
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>{o.texto}</option>
        ))}
      </select>
      {ayuda ? <span className="ayuda">{ayuda}</span> : null}
    </label>
  );
}
