import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "../../components/toast/Toast";
import {
  guardarGuia,
  leerGuia,
  TOPES_DE_LA_GUIA,
  type SeccionDeGuia,
} from "../../services/guia.service";
import { humanizeApiError } from "../../utils/apiErrors";

// MI EMPRESA → «GUÍA DE LA CASA» (doc 20 §18; Felipe, 10-11-2026: «quiero
// que BelIA sea un cerebro para guiar a mi personal: que pase los correos
// tipo, mensajes automáticos, horarios, valores, precios, cosas típicas»).
//
// La edita solo administración. El resto del equipo no entra acá: le
// pregunta a BelIA, que lee la guía en su cerebro (y los correos de
// seguimiento también). Se guarda entera con «Guardar guía».

const CLAVE = ["guia-de-la-casa"];

const vacia = (): SeccionDeGuia => ({ titulo: "", texto: "" });

const miles = (n: number) => n.toLocaleString("es-CL");

const cuandoFue = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("es-CL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

export default function GuiaDeLaCasa() {
  const qc = useQueryClient();
  const consulta = useQuery({ queryKey: CLAVE, queryFn: leerGuia });
  const [temas, setTemas] = useState<SeccionDeGuia[]>([]);
  const [guardando, setGuardando] = useState(false);

  // Parte de lo guardado una vez (un refresco no pisa lo que se escribe).
  useEffect(() => {
    if (consulta.data) setTemas(consulta.data.secciones);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consulta.data?.updated_at, consulta.isSuccess]);

  const guardado = consulta.data?.secciones ?? [];
  const cambio = JSON.stringify(temas) !== JSON.stringify(guardado);
  const letras = useMemo(
    () => temas.reduce((n, t) => n + t.titulo.length + t.texto.length, 0),
    [temas],
  );
  const pasado = letras > TOPES_DE_LA_GUIA.total;

  const cambiar = (i: number, campo: keyof SeccionDeGuia, valor: string) =>
    setTemas((p) => p.map((t, j) => (j === i ? { ...t, [campo]: valor } : t)));

  const guardar = async () => {
    setGuardando(true);
    try {
      const g = await guardarGuia(temas);
      qc.setQueryData(CLAVE, g);
      setTemas(g.secciones);
      toast.success("Guía guardada: BelIA ya la conoce.");
    } catch (e) {
      toast.error(humanizeApiError(e, "No pudimos guardar la guía."));
    } finally {
      setGuardando(false);
    }
  };

  if (consulta.isPending) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }
  if (consulta.isError) {
    return (
      <div className="bg-white rounded-lg border border-red-200 p-4 text-sm text-red-700">
        {humanizeApiError(consulta.error, "No pudimos leer la guía.")}
      </div>
    );
  }

  const ultima = consulta.data?.actualizada_por_nombre
    ? `${consulta.data.actualizada_por_nombre} · ${cuandoFue(consulta.data.updated_at)}`
    : null;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 flex flex-wrap items-center gap-4">
        <div className="bg-indigo-100 p-2 rounded-lg">
          <BookOpen className="h-5 w-5 text-indigo-600" />
        </div>
        <div className="flex-1 min-w-[16rem]">
          <h2 className="text-lg font-semibold text-gray-900">
            Guía de la casa
          </h2>
          <p className="text-sm text-gray-600">
            Lo que BelIA sabe para responderle al equipo: horarios, tarifas,
            correos y mensajes tipo.
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-indigo-700 leading-none">
            {temas.length}
          </p>
          <p className="text-xs text-gray-500">temas</p>
        </div>
        <div className="text-right">
          <p
            className={`text-2xl font-bold leading-none ${pasado ? "text-red-600" : "text-gray-800"}`}
          >
            {miles(letras)}
          </p>
          <p className="text-xs text-gray-500">
            de {miles(TOPES_DE_LA_GUIA.total)} letras
          </p>
        </div>
      </div>

      {temas.length === 0 && (
        <div className="bg-white rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
          Todavía no hay temas. Agrega el primero: por ejemplo «Horarios».
        </div>
      )}

      {temas.map((t, i) => (
        <div
          key={i}
          className="bg-white rounded-lg shadow-sm border border-gray-200 border-l-4 border-l-indigo-400 p-4 space-y-2"
        >
          <div className="flex items-center gap-2">
            <input
              value={t.titulo}
              maxLength={TOPES_DE_LA_GUIA.titulo}
              onChange={(e) => cambiar(i, "titulo", e.target.value)}
              placeholder="Tema (ej.: Horarios, Tarifas de cabañas, Correo de seguimiento)"
              className="flex-1 text-base font-semibold text-gray-900 border-0 border-b border-transparent focus:border-indigo-400 focus:ring-0 px-0"
            />
            <button
              type="button"
              onClick={() => setTemas((p) => p.filter((_, j) => j !== i))}
              title="Quitar este tema"
              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <textarea
            value={t.texto}
            maxLength={TOPES_DE_LA_GUIA.texto}
            onChange={(e) => cambiar(i, "texto", e.target.value)}
            rows={Math.min(14, Math.max(3, t.texto.split("\n").length + 1))}
            placeholder="Lo que BelIA debe saber de este tema, tal como lo dirías tú."
            className="w-full text-sm text-gray-800 border border-gray-200 rounded-md focus:border-indigo-400 focus:ring-indigo-200"
          />
          <p className="text-right text-xs text-gray-400">
            {miles(t.texto.length)} / {miles(TOPES_DE_LA_GUIA.texto)}
          </p>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setTemas((p) => [...p, vacia()])}
          disabled={temas.length >= TOPES_DE_LA_GUIA.secciones}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-md disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Agregar tema
        </button>
        <div className="flex-1" />
        {ultima && (
          <span className="text-xs text-gray-500">
            Última edición: {ultima}
          </span>
        )}
        <button
          type="button"
          onClick={guardar}
          disabled={!cambio || guardando || pasado}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {guardando ? "Guardando…" : "Guardar guía"}
        </button>
      </div>
    </div>
  );
}
