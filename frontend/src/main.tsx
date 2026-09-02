import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "./App.tsx";
import RedDeSeguridad from "./components/RedDeSeguridad";
import { queryClient } from "./lib/queryClient";
import "./index.css";

// CURA DE LA PANTALLA BLANCA (03-08, pillada en vivo por Felipe): si
// una pieza perezosa de la app ya no existe (señal de que se publicó
// una versión nueva mientras la pestaña estaba abierta), la página se
// recarga SOLA una vez y sigue como si nada. El candado de 10 s evita
// un bucle si la recarga tampoco encuentra la pieza.
window.addEventListener("vite:preloadError", (event) => {
  const ultima = Number(sessionStorage.getItem("eventia_recarga") || 0);
  if (Date.now() - ultima > 10_000) {
    event.preventDefault();
    sessionStorage.setItem("eventia_recarga", String(Date.now()));
    window.location.reload();
  }
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* La red bajo TODA la app (02-09): el vigilante de arriba no
        atajó la pantalla blanca del 01-09 — ver RedDeSeguridad. */}
    <RedDeSeguridad>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </RedDeSeguridad>
  </React.StrictMode>,
);
