import type { ReactNode } from "react";

// «MI POSTULACIÓN» EN TRES PASOS (decisión 79 del doc 17, 26-10). Felipe:
// "necesito que esto tenga una secuencia lógica". El número de cada bloque
// (1 El precio, 2 Tus documentos, 3 Subir a Mercado Público) con su título.

export default function TituloDeBloque({
  numero,
  children,
}: {
  readonly numero: number;
  readonly children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-gray-300 text-xs font-semibold text-gray-600"
      >
        {numero}
      </span>
      {children}
    </span>
  );
}
