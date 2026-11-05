import {
  BookOpen,
  CalendarDays,
  CalendarPlus,
  CircleHelp,
  ListChecks,
  Mic,
  Minus,
  PawPrint,
  RotateCcw,
  Send,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import ConfirmInline from "../ConfirmInline";
import BeliaAvatar from "./BeliaAvatar";
import PropuestaDeBelia from "./PropuestaDeBelia";
import RespuestaDeBelia from "./RespuestaDeBelia";
import { useBelia } from "./useBelia";
import { useDictado } from "./useDictado";

// LA VENTANILLA DE BELIA (doc 20 §8 y §8b, la lámina de Felipe del 03-11):
// el botón redondo abajo a la derecha y, al pincharlo, el panel al
// costado, sin tapar la pantalla en que se está. En el celular ocupa todo.
// Desde la fase 2 (03-11), lo que BelIA propone cambiar llega como tarjeta
// debajo de su respuesta, con «Sí, aplicar» (PropuestaDeBelia).

const SALUDO =
  "¡Guau! Soy BelIA, tu asistente de Eventia. ¿Qué organizamos hoy?";

const BURBUJA = {
  atencion: "¡Guau! Tienes algo importante que revisar.",
  enojada: "¡Oye! Tenemos demasiado trabajo acumulado. ¡Vamos a resolverlo!",
} as const;

const PREGUNTA_DE_LA_BURBUJA = {
  atencion: "¿Qué tengo que revisar hoy?",
  enojada:
    "¿Qué cotizaciones requieren seguimiento? Empecemos por las más urgentes.",
} as const;

const esCelular = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(max-width: 640px)").matches;

export default function BeliaVentanilla() {
  const b = useBelia();
  const [texto, setTexto] = useState("");
  const [verBurbuja, setVerBurbuja] = useState(false);
  const [confirmandoNueva, setConfirmandoNueva] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);
  const campoRef = useRef<HTMLTextAreaElement>(null);
  // Hablarle (doc 20 §17, mejora 1): lo dictado se suma a lo que ya estaba
  // escrito y queda en el campo, para leerlo antes de «Enviar».
  const escritoRef = useRef("");
  const dictado = useDictado((t, final) => {
    const junto = [escritoRef.current, t].filter(Boolean).join(" ");
    setTexto(junto);
    if (final) {
      escritoRef.current = junto;
      campoRef.current?.focus();
    }
  });

  const burbuja =
    b.animo === "atencion" || b.animo === "enojada" ? b.animo : null;

  // El enojo se dice una vez al aparecer (8 s), no se queda pegado.
  useEffect(() => {
    if (!burbuja) return;
    setVerBurbuja(true);
    const t = setTimeout(() => setVerBurbuja(false), 8000);
    return () => clearTimeout(t);
  }, [burbuja]);

  // Al final de la conversación, también mientras BelIA escribe en vivo.
  const ultimoTexto = b.turnos[b.turnos.length - 1]?.texto.length ?? 0;
  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "end" });
  }, [b.turnos.length, ultimoTexto, b.pensando, b.abierta]);

  const dejarDeEscuchar = dictado.detener;
  useEffect(() => {
    if (b.abierta) {
      campoRef.current?.focus();
      return;
    }
    // La pregunta de «Nueva conversación» no queda abierta para la próxima,
    // y con la ventanilla cerrada no se sigue escuchando.
    setConfirmandoNueva(false);
    dejarDeEscuchar();
  }, [b.abierta, dejarDeEscuchar]);

  if (!b.puede) return null;

  const mandar = (t: string) => {
    if (!t.trim() || b.pensando) return;
    dictado.detener();
    escritoRef.current = "";
    b.enviar(t);
    setTexto("");
  };

  const alternarMicrofono = () => {
    if (dictado.escuchando) {
      dictado.detener();
      return;
    }
    escritoRef.current = texto.trim();
    dictado.empezar();
  };

  const alTeclear = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      mandar(texto);
    }
  };

  // Recepción (doc 20 §13): fechas, los requerimientos que llegan y crear
  // uno. Los pendientes de seguimiento y el catálogo con precios son de
  // quien vende.
  const atajos = b.esRecepcion
    ? [
        {
          icono: CalendarDays,
          texto: "Fechas libres",
          pregunta: "¿Qué fechas tenemos libres este mes?",
        },
        {
          icono: ListChecks,
          texto: "Requerimientos",
          pregunta: "¿Qué requerimientos llegaron hoy?",
        },
        {
          icono: CalendarPlus,
          texto: "Crear requerimiento",
          pregunta: "Quiero crear un requerimiento nuevo.",
        },
        { icono: CircleHelp, texto: "Ayuda", pregunta: "¿Qué puedes hacer?" },
      ]
    : [
        {
          icono: ListChecks,
          texto: "Ver pendientes",
          pregunta: "¿Qué cotizaciones requieren seguimiento?",
        },
        {
          icono: CalendarDays,
          texto: "Calendario",
          pregunta: "¿Qué eventos tenemos esta semana?",
        },
        b.conCotizacion
          ? {
              icono: BookOpen,
              texto: "Esta cotización",
              pregunta: "Resúmeme esta cotización.",
            }
          : {
              icono: BookOpen,
              texto: "Catálogo",
              pregunta: "¿Qué menús de cena tenemos y cuánto valen?",
            },
        // «Crear evento», de la lámina de Felipe (doc 20 §8b): BelIA pregunta
        // lo que falta y propone la cotización con «Sí, crear».
        {
          icono: CalendarPlus,
          texto: "Crear evento",
          pregunta: "Quiero crear un evento nuevo.",
        },
        { icono: CircleHelp, texto: "Ayuda", pregunta: "¿Qué puedes hacer?" },
      ];

  if (!b.abierta) {
    return (
      <div className="fixed bottom-6 right-6 z-40 flex items-end gap-3">
        {burbuja && verBurbuja && (
          <button
            type="button"
            onClick={() => {
              b.abrir();
              mandar(PREGUNTA_DE_LA_BURBUJA[burbuja]);
            }}
            className={`max-w-[240px] rounded-2xl rounded-br-sm px-4 py-3 text-left text-sm font-medium shadow-lg ${
              burbuja === "enojada"
                ? "bg-rose-600 text-white"
                : "bg-white text-slate-800 ring-1 ring-slate-200"
            }`}
          >
            {BURBUJA[burbuja]}
          </button>
        )}
        <button
          type="button"
          onClick={b.abrir}
          aria-label="Abrir BelIA"
          title="BelIA"
          className="rounded-full shadow-lg shadow-blue-900/20 transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300"
        >
          <BeliaAvatar animo={b.animo} tamano={60} />
        </button>
      </div>
    );
  }

  const gastado = b.uso?.gastado_usd ?? null;
  const tope = b.uso?.tope_usd ?? null;
  const cerca = gastado != null && tope != null && gastado >= tope * 0.8;

  return (
    <section
      aria-label="BelIA, la asistente de Eventia"
      onKeyDown={(e) => e.key === "Escape" && b.cerrar()}
      className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-white sm:inset-auto sm:bottom-6 sm:right-6 sm:h-[min(640px,calc(100vh-3rem))] sm:w-[380px] sm:rounded-2xl sm:border sm:border-slate-200 sm:shadow-2xl"
    >
      <header className="flex items-center gap-3 bg-[#0d2a5e] px-4 py-3 text-white">
        <BeliaAvatar animo={b.animo} tamano={40} />
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold leading-tight">BelIA</p>
          <p className="text-xs text-blue-100">Asistente de Eventia</p>
        </div>
        <button
          type="button"
          onClick={b.cerrar}
          aria-label="Minimizar"
          className="rounded-lg p-2 text-blue-100 hover:bg-white/10 hover:text-white"
        >
          <Minus size={18} />
        </button>
        {/* La «×» solo cierra: la conversación queda guardada (Felipe,
            04-11-2026: «acabo de actualizar y no se guardó la
            conversación»; la «×» la borraba). Borrarla es «Nueva
            conversación», abajo, después de preguntar. */}
        <button
          type="button"
          onClick={b.cerrar}
          aria-label="Cerrar"
          title="Cerrar: la conversación queda guardada"
          className="rounded-lg p-2 text-blue-100 hover:bg-white/10 hover:text-white"
        >
          <X size={18} />
        </button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-4">
        <div className="rounded-2xl rounded-tl-sm bg-blue-50 px-4 py-3 text-sm text-slate-800">
          <p className="flex items-center gap-1.5 font-semibold">
            ¡Hola{b.nombre ? `, ${b.nombre}` : ""}!
            <PawPrint size={15} className="text-blue-600" aria-hidden="true" />
          </p>
          <p className="mt-1">{SALUDO}</p>
        </div>

        {b.turnos.length === 0 && (
          <div className="grid grid-cols-2 gap-2">
            {atajos.map(({ icono: Icono, texto: t, pregunta }) => (
              <button
                key={t}
                type="button"
                onClick={() => mandar(pregunta)}
                className="flex min-h-[44px] items-center gap-2 rounded-xl bg-white px-3 py-2 text-left text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-blue-50 hover:ring-blue-200"
              >
                <Icono
                  size={16}
                  className="shrink-0 text-blue-700"
                  aria-hidden="true"
                />
                {t}
              </button>
            ))}
          </div>
        )}

        {b.turnos.map((t, i) =>
          t.rol === "persona" ? (
            <div key={i} className="flex justify-end">
              <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-blue-600 px-3.5 py-2.5 text-sm text-white">
                {t.texto}
              </p>
            </div>
          ) : (
            <div key={i} className="space-y-2">
              <div
                className={`rounded-2xl rounded-tl-sm px-3.5 py-2.5 ring-1 ${
                  t.error
                    ? "bg-amber-50 ring-amber-200"
                    : "bg-white ring-slate-200"
                }`}
              >
                <RespuestaDeBelia
                  texto={t.texto}
                  alNavegar={() => esCelular() && b.cerrar()}
                />
              </div>
              {t.propuestas?.map((p) => (
                <PropuestaDeBelia
                  key={p.id}
                  p={p}
                  esLaAbierta={
                    Boolean(p.cotizacion_id) &&
                    b.cotizacionAbierta === p.cotizacion_id
                  }
                  onAplicar={() => void b.responder(i, p.id, "aplicar")}
                  onDescartar={() => void b.responder(i, p.id, "descartar")}
                  onDeshacer={() => void b.responder(i, p.id, "deshacer")}
                  alNavegar={() => esCelular() && b.cerrar()}
                />
              ))}
            </div>
          ),
        )}

        {b.pensando && !b.escribiendo && (
          <p
            className="flex items-center gap-2 text-sm text-slate-500"
            role="status"
          >
            <span className="flex gap-1" aria-hidden="true">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-500 [animation-delay:-0.2s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-500 [animation-delay:-0.1s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-500" />
            </span>
            BelIA está pensando…
          </p>
        )}
        <div ref={finRef} />
      </div>

      <div className="border-t border-slate-200 bg-white px-3 py-3">
        {b.turnos.length > 0 && !b.pensando && (
          <div className="mb-2 flex justify-start">
            {confirmandoNueva ? (
              <ConfirmInline
                question="¿Borrar esta conversación?"
                yesLabel="Sí, borrar"
                onYes={() => {
                  setConfirmandoNueva(false);
                  b.nuevaConversacion();
                }}
                onNo={() => setConfirmandoNueva(false)}
              />
            ) : (
              <button
                type="button"
                onClick={() => setConfirmandoNueva(true)}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              >
                <RotateCcw size={12} aria-hidden="true" />
                Nueva conversación
              </button>
            )}
          </div>
        )}
        <div className="flex items-end gap-2">
          <label htmlFor="belia-mensaje" className="sr-only">
            Mensaje para BelIA
          </label>
          <textarea
            id="belia-mensaje"
            ref={campoRef}
            rows={1}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={alTeclear}
            placeholder={
              dictado.escuchando ? "Te escucho..." : "Escribe tu mensaje..."
            }
            className="max-h-32 min-h-[44px] flex-1 resize-none rounded-2xl border border-slate-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
          {dictado.puede && (
            <button
              type="button"
              onClick={alternarMicrofono}
              aria-pressed={dictado.escuchando}
              aria-label={
                dictado.escuchando ? "Dejar de escuchar" : "Dictar el mensaje"
              }
              title={
                dictado.escuchando
                  ? "Te escucho. Toca para terminar"
                  : "Dictar: tu navegador convierte la voz en texto"
              }
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border ${
                dictado.escuchando
                  ? "animate-pulse border-red-500 bg-red-500 text-white"
                  : "border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Mic size={18} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            onClick={() => mandar(texto)}
            disabled={b.pensando || !texto.trim()}
            aria-label="Enviar"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
          >
            <Send size={18} />
          </button>
        </div>
        {dictado.aviso && (
          <p className="mt-1 text-xs text-amber-700" role="status">
            {dictado.aviso}
          </p>
        )}
        {b.esAdmin && gastado != null && tope != null && (
          <p
            className={`mt-2 text-center text-xs ${cerca ? "font-medium text-amber-700" : "text-slate-400"}`}
          >
            Este mes: US$ {gastado.toLocaleString("es-CL")} de {tope}
            {cerca ? " · cerca del tope" : ""}
          </p>
        )}
      </div>
    </section>
  );
}
