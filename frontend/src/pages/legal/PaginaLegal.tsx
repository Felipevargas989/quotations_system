import { ReactNode, useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { EMPRESA, ULTIMA_ACTUALIZACION } from "./datosLegales";

// LAS PÁGINAS LEGALES (18-09-2026, paso 6 del roadmap de venta).
//
// El registro decía "aceptas nuestros términos y condiciones" sin que
// existiera la página. Texto propuesto y APROBADO por Felipe el 18-09
// (borrador y decisiones en la carpeta maestra,
// 00_DOCUMENTACION/12_TERMINOS_Y_PRIVACIDAD_BORRADOR.md).
//
// Lenguaje llano a propósito: el cliente de Eventia es una banquetería
// o un centro de eventos, no un abogado. Y todo lo que dicen está
// medido contra cómo funciona el sistema de verdad (prueba de 7 días,
// gracia de 7 días, cambio de plan, dónde viven los datos): si el
// sistema cambia, estas páginas cambian en el mismo commit. Los datos
// de la empresa viven en datosLegales.ts.

export default function PaginaLegal({
  titulo,
  otra,
  children,
}: {
  readonly titulo: string;
  readonly otra: { a: string; texto: string };
  readonly children: ReactNode;
}) {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft size={20} />
            <span>Volver al inicio</span>
          </Link>
          <span className="text-xl font-bold text-gray-900">Eventia</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">{titulo}</h1>
        <p className="text-sm text-gray-500 mb-8">
          Última actualización: {ULTIMA_ACTUALIZACION}
        </p>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 sm:p-10 space-y-8 text-gray-700 text-[15px] leading-relaxed">
          {children}
        </div>
        <p className="text-sm text-gray-500 mt-8 text-center">
          Ver también{" "}
          <Link to={otra.a} className="text-blue-600 hover:underline">
            {otra.texto}
          </Link>
          . ¿Dudas? Escríbenos a{" "}
          <a
            href={`mailto:${EMPRESA.correo}`}
            className="text-blue-600 hover:underline"
          >
            {EMPRESA.correo}
          </a>
          .
        </p>
      </main>
    </div>
  );
}

export function Seccion({
  n,
  titulo,
  children,
}: {
  readonly n: number;
  readonly titulo: string;
  readonly children: ReactNode;
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 mb-3">
        {n}. {titulo}
      </h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

export function Lista({ items }: { readonly items: ReactNode[] }) {
  return (
    <ul className="list-disc pl-5 space-y-1">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}
