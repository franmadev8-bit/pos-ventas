import type { ButtonHTMLAttributes, ReactNode } from "react";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly tecla?: string;
  readonly variante?: "normal" | "primario" | "peligro";
  readonly chico?: boolean;
  /** Por que esta deshabilitado. Se muestra al lado: nunca un boton gris mudo. */
  readonly motivo?: string;
  readonly children: ReactNode;
}

export function Boton({ tecla, variante = "normal", chico, motivo, children, ...resto }: Props) {
  const clases = ["btn"];
  if (variante !== "normal") clases.push(variante);
  if (chico) clases.push("chico");

  const boton = (
    <button type="button" className={clases.join(" ")} {...resto}>
      {tecla ? <span className="tecla">{tecla}</span> : null}
      <span>{children}</span>
    </button>
  );

  if (resto.disabled && motivo) {
    return (
      <span className="fila">
        {boton}
        <span className="motivo">{motivo}</span>
      </span>
    );
  }
  return boton;
}
