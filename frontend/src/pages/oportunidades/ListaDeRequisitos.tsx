import { useState } from "react";
import type {
  ResultadoDeBases,
  ResultadoDeValidacion,
} from "../../services/oportunidades.service";
import {
  ESTILO_DE_REQUISITO,
  FILTROS_DE_REQUISITOS,
  type FiltroDeRequisitos,
  filtrarRequisitos,
  requisitosConEstado,
} from "./oportunidades.utils";

// LO QUE HAY QUE PRESENTAR, UNA SOLA LISTA (Felipe, 17-10: "quedó muy
// desordenado... difícil de leer"). Cada requisito de las bases con lo que
// dijo la última validación al lado (listo, falta, vencido, revisar o sin
// ver), filtros con su conteo y solo los primeros a la vista.

const A_LA_VISTA = 8;

const TIPOS: Record<string, string> = {
  administrativo: "Administrativo",
  tecnico: "Técnico",
  economico: "Económico",
  garantia: "Garantía",
  otro: "Otro",
};

export default function ListaDeRequisitos({
  requisitos,
  validacion,
}: {
  readonly requisitos: ResultadoDeBases["requisitos"];
  readonly validacion: ResultadoDeValidacion["requisitos"] | null;
}) {
  const lista = requisitosConEstado(requisitos, validacion);
  const [filtro, setFiltro] = useState<FiltroDeRequisitos>("todos");
  const [todos, setTodos] = useState(false);
  const visibles = filtrarRequisitos(lista, filtro);
  const mostrados = todos ? visibles : visibles.slice(0, A_LA_VISTA);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">
          Lo que hay que presentar ({lista.length})
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {FILTROS_DE_REQUISITOS.map((f) => {
            const n = filtrarRequisitos(lista, f.value).length;
            if (n === 0 && f.value !== "todos") return null;
            const activo = filtro === f.value;
            return (
              <button
                key={f.value}
                type="button"
                aria-pressed={activo}
                onClick={() => {
                  setFiltro(f.value);
                  setTodos(false);
                }}
                className={`px-2 py-0.5 text-xs rounded border ${
                  activo
                    ? "border-blue-600 bg-blue-50 text-blue-700 font-semibold"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {f.label} {n}
              </button>
            );
          })}
        </div>
      </div>
      {!validacion && (
        <p className="text-xs text-gray-500">
          Cuando valides lo que vas a presentar (en «Mi postulación»), aquí sale
          si cada uno está listo o falta.
        </p>
      )}
      <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
        {mostrados.map((q, i) => {
          const estilo = ESTILO_DE_REQUISITO[q.estado];
          return (
            <li key={`${q.que}-${i}`} className="px-3 py-2 flex gap-3">
              <span
                className={`shrink-0 mt-0.5 h-fit min-w-[4.25rem] px-2 py-0.5 text-center text-xs font-semibold rounded ${estilo.clases}`}
              >
                {estilo.label}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-800">
                  {q.que}
                  {!q.obligatorio && (
                    <span className="ml-1.5 text-xs text-gray-400">
                      (opcional)
                    </span>
                  )}
                </p>
                {q.observacion && (
                  <p className="text-xs text-gray-500">
                    {q.observacion}
                    {q.donde && ` · ${q.donde}`}
                  </p>
                )}
              </div>
              <span
                className="shrink-0 text-xs text-gray-400 text-right"
                title={q.documento}
              >
                {TIPOS[q.tipo] ?? q.tipo}
                {q.pagina > 0 && ` · pág. ${q.pagina}`}
              </span>
            </li>
          );
        })}
      </ul>
      {visibles.length > A_LA_VISTA && (
        <button
          type="button"
          onClick={() => setTodos((v) => !v)}
          className="text-xs font-semibold text-blue-700 hover:text-blue-900"
        >
          {todos
            ? "Ver menos"
            : `Ver los ${visibles.length - A_LA_VISTA} restantes`}
        </button>
      )}
    </div>
  );
}
