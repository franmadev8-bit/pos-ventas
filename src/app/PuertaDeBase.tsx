import { useEffect, useState } from "react";
import { baseDeDatos } from "../db/cliente";
import { mensajeDeError } from "../domain/errores";
import type { MensajeDeError } from "../domain/errores";
import { Boton } from "../components/Boton";

type Estado = "abriendo" | "lista" | "falla";

interface Props {
  readonly children: React.ReactNode;
}

/**
 * Abre la base antes de dejar entrar a la aplicacion. Sin base no hay POS:
 * mostrar las pantallas vacias y un cartel chico por cada consulta que falla
 * esconde el problema. Aca se dice una sola vez, con el texto del motor y
 * que hacer al respecto.
 */
export function PuertaDeBase({ children }: Props) {
  const [estado, setEstado] = useState<Estado>("abriendo");
  const [error, setError] = useState<MensajeDeError | null>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vigente = true;
    setEstado("abriendo");
    baseDeDatos()
      .then(() => { if (vigente) setEstado("lista"); })
      .catch((e: unknown) => {
        if (!vigente) return;
        setError(mensajeDeError(e, "No se pudo abrir la base de datos."));
        setEstado("falla");
      });
    return () => { vigente = false; };
  }, [intento]);

  if (estado === "abriendo") return <div className="arranque">Abriendo la base…</div>;

  if (estado === "falla") {
    return (
      <div className="arranque">
        <div className="tarjeta-falla">
          <h1>No se pudo abrir la base de datos</h1>
          <p>
            La aplicación no puede funcionar hasta resolverlo. Este es el mensaje
            exacto del motor:
          </p>
          <pre className="detalle-falla">{error?.detalle ?? error?.texto}</pre>
          <p>
            Si dice que una migración fue modificada, es la base de desarrollo
            vieja: cerrá la aplicación y borrá el archivo{" "}
            <code>%APPDATA%\com.francisco-martinez.pos-ventas\pos.db</code>.
          </p>
          <Boton variante="primario" onClick={() => setIntento((n) => n + 1)}>
            Reintentar
          </Boton>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
