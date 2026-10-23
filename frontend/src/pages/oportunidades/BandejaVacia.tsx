import { CheckCircle2, SearchX } from "lucide-react";
import type { BandejaVacia as Caso } from "./bandeja";
import type { Vista } from "./oportunidades.utils";

// LA BANDEJA VACÍA QUE SIRVE (Felipe, 17-10, con «Verdes 0, Amarillas 0»
// en pantalla: "¿se podrá mejorar este front?"). En vez de "nada con
// estos filtros": si ya revisaste todo, lo dice, avisa a qué hora vuelve
// a mirar el radar y deja a un clic «Mis licitaciones» y las rojas.

const VACIO_DE_LA_VISTA: Record<Exclude<Vista, "nueva">, string> = {
  descartada: "No hay descartadas",
  seguida:
    "No sigues ninguna: en el resumen de una licitación, «Seguir» la deja aquí",
  historial: "No hay nada a la vista",
};

export default function BandejaVacia({
  caso,
  vista,
  proxima,
  rojas,
  enCurso,
  onVerRojas,
  onQuitarFiltros,
  onIrAMisLicitaciones,
}: {
  readonly caso: Caso;
  readonly vista: Vista;
  /** «02:07» (`proximaPasada`). */
  readonly proxima: string;
  /** Las rojas del reciclaje escondidas por el semáforo (decisión 72: la
   *  basura no se ofrece); 0 si ya están a la vista. */
  readonly rojas: number;
  /** Cuántas hay en curso en «Mis licitaciones». */
  readonly enCurso: number;
  readonly onVerRojas: () => void;
  readonly onQuitarFiltros: () => void;
  readonly onIrAMisLicitaciones: () => void;
}) {
  if (caso === "sin_datos") {
    return (
      <p className="py-10 text-center text-sm text-gray-500">
        Todavía no hay oportunidades leídas. El radar las trae solo: la próxima
        pasada es a las {proxima}.
      </p>
    );
  }

  const enlace = "font-semibold text-blue-700 hover:text-blue-900";
  return (
    <div className="flex flex-col items-center gap-1.5 px-4 py-10 text-center text-sm text-gray-500 border border-dashed border-gray-300 rounded-lg">
      {caso === "al_dia" ? (
        <>
          <CheckCircle2 size={28} className="text-green-600" />
          <p className="text-base font-semibold text-gray-900">
            Revisaste todo lo nuevo
          </p>
          <p>La próxima pasada del radar es a las {proxima}.</p>
          {enCurso > 0 && (
            <button
              type="button"
              onClick={onIrAMisLicitaciones}
              className={enlace}
            >
              {enCurso === 1
                ? "Tu marcada está en «Mis licitaciones»"
                : `Tus ${enCurso} marcadas están en «Mis licitaciones»`}
            </button>
          )}
        </>
      ) : caso === "con_filtros" ? (
        <>
          <SearchX size={28} className="text-gray-400" />
          <p className="text-base font-semibold text-gray-900">
            Nada con estos filtros
          </p>
          <button type="button" onClick={onQuitarFiltros} className={enlace}>
            Quitar filtros
          </button>
        </>
      ) : (
        <p className="text-base font-semibold text-gray-900">
          {vista === "nueva" ? "Nada por revisar" : VACIO_DE_LA_VISTA[vista]}
        </p>
      )}
      {rojas > 0 && (
        <button
          type="button"
          onClick={onVerRojas}
          className="mt-2 text-gray-600 underline decoration-dotted hover:text-gray-900"
        >
          {rojas === 1
            ? "Ver la del reciclaje (la IA dice que no, pero es de tu zona)"
            : `Ver las ${rojas} del reciclaje (la IA dice que no, pero son de tu zona)`}
        </button>
      )}
    </div>
  );
}
