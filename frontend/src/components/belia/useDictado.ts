import { useCallback, useEffect, useRef, useState } from "react";

// HABLARLE A BELIA (doc 20 §17, mejora 1; Felipe, 04-11-2026: «¿podemos
// ponerle algo para que escuche y yo le pueda hablar?»).
//
// El dictado del propio navegador (Chrome y Safari; Firefox no lo trae y el
// botón no aparece): gratis y sin llaves. El audio lo procesa Google o
// Apple, y Eventia no lo guarda. Lo dictado cae en el campo de texto y sale
// con «Enviar», para leerlo antes. BelIA sigue respondiendo por escrito y sin
// sonido (*"es sin sonido esto"*).

/** Lo que usamos del reconocimiento de voz del navegador. */
type Reconocimiento = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult:
    | ((e: {
        results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
      }) => void)
    | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

type ConReconocimiento = {
  SpeechRecognition?: new () => Reconocimiento;
  webkitSpeechRecognition?: new () => Reconocimiento;
};

const delNavegador = (): (new () => Reconocimiento) | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as ConReconocimiento;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

/** Lo dictado hasta ahora: el texto de todos los trozos y si ya es el final
 *  (sin trozos provisorios). */
export const loDictado = (
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>,
): { texto: string; final: boolean } => {
  let texto = "";
  let final = true;
  for (let i = 0; i < results.length; i++) {
    texto += results[i][0].transcript;
    if (!results[i].isFinal) final = false;
  }
  return { texto: texto.replace(/\s+/g, " ").trim(), final };
};

/** Lo que dice el aviso cuando el dictado falla; null si no hay que decir
 *  nada (no habló, o se cortó a propósito). */
export const avisoDelDictado = (error: string): string | null => {
  if (error === "no-speech" || error === "aborted") return null;
  if (error === "not-allowed" || error === "service-not-allowed") {
    return "El navegador no tiene permiso para usar el micrófono.";
  }
  if (error === "audio-capture") return "No encuentro un micrófono.";
  return "No pude escucharte. Prueba de nuevo.";
};

/** Un dictado a la vez: lo que se va oyendo llega a `alDictar`, con `final`
 *  cuando el navegador cierra la frase (al hacer una pausa). */
export function useDictado(alDictar: (texto: string, final: boolean) => void) {
  const [escuchando, setEscuchando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const actual = useRef<Reconocimiento | null>(null);
  const alDictarRef = useRef(alDictar);
  useEffect(() => {
    alDictarRef.current = alDictar;
  });
  const [Constructor] = useState(delNavegador);

  // Al cerrar la ventanilla o salir de la app, se deja de escuchar.
  useEffect(() => () => actual.current?.abort(), []);

  const empezar = useCallback(() => {
    if (!Constructor || actual.current) return;
    const r = new Constructor();
    r.lang = "es-CL";
    r.interimResults = true;
    r.continuous = false;
    r.maxAlternatives = 1;
    r.onresult = (e) => {
      const { texto, final } = loDictado(e.results);
      if (texto) alDictarRef.current(texto, final);
    };
    r.onerror = (e) => setAviso(avisoDelDictado(e.error));
    r.onend = () => {
      actual.current = null;
      setEscuchando(false);
    };
    actual.current = r;
    setAviso(null);
    setEscuchando(true);
    try {
      r.start();
    } catch {
      actual.current = null;
      setEscuchando(false);
      setAviso("No pude escucharte. Prueba de nuevo.");
    }
  }, [Constructor]);

  const detener = useCallback(() => actual.current?.stop(), []);

  return {
    puede: Constructor != null,
    escuchando,
    aviso,
    empezar,
    detener,
  };
}
