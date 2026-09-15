import { useEffect, useRef, type ReactNode } from "react";

interface Props {
  readonly titulo: string;
  readonly onCerrar: () => void;
  readonly pie: ReactNode;
  readonly children: ReactNode;
  readonly ancho?: number;
}

const FOCALIZABLES =
  'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/**
 * Modal con el foco encerrado adentro: mientras esta abierto, Tab no puede
 * llegar a los controles de la pantalla de atras. Al abrir enfoca el primer
 * campo; al cerrar devuelve el foco a donde estaba.
 */
export function Modal({ titulo, onCerrar, pie, children, ancho = 640 }: Props) {
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null;
    const primero = caja.current?.querySelector<HTMLElement>(FOCALIZABLES);
    primero?.focus();
    return () => previo?.focus();
  }, []);

  useEffect(() => {
    function alTeclado(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCerrar();
        return;
      }
      if (e.key !== "Tab" || !caja.current) return;

      const focalizables = Array.from(
        caja.current.querySelectorAll<HTMLElement>(FOCALIZABLES),
      ).filter((el) => el.offsetParent !== null);
      if (focalizables.length === 0) return;

      const primero = focalizables[0];
      const ultimo = focalizables[focalizables.length - 1];
      if (!primero || !ultimo) return;

      const activo = document.activeElement;
      const dentro = caja.current.contains(activo);

      if (!dentro) {
        e.preventDefault();
        primero.focus();
      } else if (e.shiftKey && activo === primero) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && activo === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    }
    window.addEventListener("keydown", alTeclado, true);
    return () => window.removeEventListener("keydown", alTeclado, true);
  }, [onCerrar]);

  return (
    <div className="fondo-modal" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="modal" style={{ width: ancho }} ref={caja}>
        <header>
          <h2>{titulo}</h2>
        </header>
        <div className="cuerpo">{children}</div>
        <footer>{pie}</footer>
      </div>
    </div>
  );
}
