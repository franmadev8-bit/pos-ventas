import React from "react";
import ReactDOM from "react-dom/client";

// La tipografia se empaqueta con la app: tiene que andar sin internet.
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";

import "./ui/tokens.css";
import "./ui/base.css";
import { App } from "./app/App";
import { PuertaDeBase } from "./app/PuertaDeBase";
import { TicketsProvider } from "./app/TicketsContext";

const raiz = document.getElementById("root");
if (!raiz) throw new Error("Falta el elemento #root en index.html");

ReactDOM.createRoot(raiz).render(
  <React.StrictMode>
    <PuertaDeBase>
      <TicketsProvider>
        <App />
      </TicketsProvider>
    </PuertaDeBase>
  </React.StrictMode>,
);
