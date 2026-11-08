import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// FASE 1.2 (27-07-2026): la fórmula del dinero vive en el backend
// (api-rest/src/quotations/utils/money.ts) y el frontend la importa TAL
// CUAL con el alias @dinero. UNA cuenta para cotizador, Post-Venta y
// backend; si cambia, cambia para los tres a la vez.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@dinero": path.resolve(
        __dirname,
        "../api-rest/src/quotations/utils/money.ts",
      ),
      // 03-11-2026: lo que lleva cada evento (insumos, mobiliario, costo),
      // la misma cuenta para las pantallas y para BelIA.
      "@consolidacion": path.resolve(
        __dirname,
        "../api-rest/src/logistics/utils/consolidacion.ts",
      ),
      // 08-11-2026 (decisión 119, parte 3b): quién hace cada papel que
      // piden las bases, la misma regla para «Armar postulación» y para
      // «Lo que tienes que presentar».
      "@los-papeles": path.resolve(
        __dirname,
        "../api-rest/src/oportunidades/postulacion/los-papeles.ts",
      ),
    },
  },
  server: {
    // El dev server debe poder leer api-rest/ (está fuera de frontend/)
    fs: { allow: [path.resolve(__dirname, "..")] },
  },
});
