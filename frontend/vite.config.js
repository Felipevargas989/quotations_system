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
            "@dinero": path.resolve(__dirname, "../api-rest/src/quotations/utils/money.ts"),
        },
    },
    server: {
        // El dev server debe poder leer api-rest/ (está fuera de frontend/)
        fs: { allow: [path.resolve(__dirname, "..")] },
    },
});
