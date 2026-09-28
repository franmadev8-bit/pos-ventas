import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import { useTicketsEnCurso } from "../hooks/useTicketsEnCurso";

type Tickets = ReturnType<typeof useTicketsEnCurso>;

const Contexto = createContext<Tickets | null>(null);

/**
 * Los tickets en curso viven ACA, arriba de la navegacion entre modulos.
 *
 * Si el estado viviera en la pantalla de venta, irse a Catalogo a corregir un
 * precio desmontaria el componente y se perderia el ticket armado. Un ticket
 * abierto queda abierto hasta que se cobra o se cierra a proposito, sin
 * importar por donde ande el cajero mientras tanto.
 */
export function TicketsProvider({ children }: { readonly children: ReactNode }) {
  return <Contexto.Provider value={useTicketsEnCurso()}>{children}</Contexto.Provider>;
}

export function useTickets(): Tickets {
  const v = useContext(Contexto);
  if (!v) throw new Error("useTickets se usa adentro de TicketsProvider");
  return v;
}
