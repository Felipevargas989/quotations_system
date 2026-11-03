import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { SECTION_ROLES, tieneDerecho } from "../../constants/permissions";
import { useAuth } from "../../contexts/AuthContext";
import {
  estadoDeBelia,
  preguntarABelia,
  type EstadoDeBelia,
  type RespuestaDeBelia,
  type TurnoDeBelia,
} from "../../services/asistente.service";
import { humanizeApiError } from "../../utils/apiErrors";
import {
  MINUTOS_ENTRE_AVISOS,
  MINUTOS_PARA_DORMIR,
  animoDe,
  hayAlgoNuevo,
  pantallaDe,
} from "./belia";

// EL CEREBRO DE LA VENTANILLA (doc 20 §8 y §8b): la conversación, el ánimo
// de BelIA y cuándo duerme, avisa o celebra. La conversación vive en la
// pestaña (sessionStorage): sigue al cambiar de pantalla y se va al
// cerrarla. Todo acceso al almacenamiento va con try/catch: en una ventana
// privada puede fallar, y la ventanilla igual funciona.

/** Un turno en pantalla. `error` no viaja al motor: no es una respuesta. */
export type TurnoEnPantalla = TurnoDeBelia & { error?: boolean };

const CLAVE_CONVERSACION = "belia:conversacion";
const CLAVE_VISTO = "belia:visto";
const CLAVE_ULTIMO_AVISO = "belia:ultimo-aviso";
const MAX_TURNOS = 30;
const SEGUNDOS_DE_AVISO = 12;
const SEGUNDOS_DE_FIESTA = 4;

/** Las otras pantallas la hacen celebrar con
 *  `window.dispatchEvent(new Event(EVENTO_CELEBRAR))` (doc 20 §8b). */
export const EVENTO_CELEBRAR = "belia:celebra";

const leer = <T>(
  almacen: "session" | "local",
  clave: string,
  porDefecto: T,
): T => {
  try {
    const s = (almacen === "session" ? sessionStorage : localStorage).getItem(
      clave,
    );
    return s ? (JSON.parse(s) as T) : porDefecto;
  } catch {
    return porDefecto;
  }
};

const guardar = (
  almacen: "session" | "local",
  clave: string,
  valor: unknown,
) => {
  try {
    (almacen === "session" ? sessionStorage : localStorage).setItem(
      clave,
      JSON.stringify(valor),
    );
  } catch {
    // Sin almacenamiento la ventanilla sigue; solo no recuerda.
  }
};

export function useBelia() {
  const { userRole, company, userName } = useAuth();
  // De vendedor para arriba (Felipe, 03-11: "lo usa administración y
  // vendedores"), y solo la empresa con el módulo propio. El motor niega
  // igual.
  const puede =
    Boolean(userRole) &&
    SECTION_ROLES.quotations.includes(userRole as never) &&
    tieneDerecho(company, "asistente");
  const esAdmin = userRole === "administrador";
  const { pathname } = useLocation();

  const [abierta, setAbierta] = useState(false);
  const [turnos, setTurnos] = useState<TurnoEnPantalla[]>(() =>
    leer("session", CLAVE_CONVERSACION, []),
  );
  const [pensando, setPensando] = useState(false);
  const [uso, setUso] = useState<RespuestaDeBelia["uso_del_mes"]>();
  const [dormida, setDormida] = useState(false);
  const [avisando, setAvisando] = useState(false);
  const [celebrando, setCelebrando] = useState(false);

  useEffect(() => {
    guardar("session", CLAVE_CONVERSACION, turnos.slice(-MAX_TURNOS));
  }, [turnos]);

  // El humor de fondo: lo vencido y lo nuevo de hoy, cada 5 minutos.
  const estado = useQuery({
    queryKey: ["belia", "estado"],
    queryFn: estadoDeBelia,
    enabled: puede,
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });

  // Se duerme si nadie usa Eventia por unos minutos. Despierta solo al
  // pincharla (o si llega algo importante): moverse por la app no la
  // despierta, como pidió Felipe.
  useEffect(() => {
    if (!puede) return;
    let reloj: ReturnType<typeof setTimeout>;
    const actividad = () => {
      clearTimeout(reloj);
      reloj = setTimeout(() => setDormida(true), MINUTOS_PARA_DORMIR * 60_000);
    };
    const eventos = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    eventos.forEach((e) =>
      window.addEventListener(e, actividad, { passive: true }),
    );
    actividad();
    return () => {
      clearTimeout(reloj);
      eventos.forEach((e) => window.removeEventListener(e, actividad));
    };
  }, [puede]);

  // «¡Guau! Tienes algo importante que revisar»: cuando llega algo nuevo,
  // como mucho una vez por hora y nunca con la ventanilla abierta.
  const datos = estado.data;
  useEffect(() => {
    if (!datos) return;
    const visto = leer<EstadoDeBelia | undefined>(
      "local",
      CLAVE_VISTO,
      undefined,
    );
    guardar("local", CLAVE_VISTO, datos);
    if (abierta || !hayAlgoNuevo(datos, visto)) return;
    const ultimo = leer<number>("local", CLAVE_ULTIMO_AVISO, 0);
    if (Date.now() - ultimo < MINUTOS_ENTRE_AVISOS * 60_000) return;
    guardar("local", CLAVE_ULTIMO_AVISO, Date.now());
    setDormida(false);
    setAvisando(true);
    const t = setTimeout(() => setAvisando(false), SEGUNDOS_DE_AVISO * 1000);
    return () => clearTimeout(t);
    // Solo cuando cambian los números, no al abrir o cerrar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datos]);

  // Celebra cuando otra pantalla avisa que algo salió bien.
  useEffect(() => {
    if (!puede) return;
    let t: ReturnType<typeof setTimeout>;
    const celebrar = () => {
      setDormida(false);
      setCelebrando(true);
      clearTimeout(t);
      t = setTimeout(() => setCelebrando(false), SEGUNDOS_DE_FIESTA * 1000);
    };
    window.addEventListener(EVENTO_CELEBRAR, celebrar);
    return () => {
      clearTimeout(t);
      window.removeEventListener(EVENTO_CELEBRAR, celebrar);
    };
  }, [puede]);

  const enviando = useRef(false);
  const enviar = useCallback(
    async (texto: string) => {
      const mensaje = texto.trim();
      if (!mensaje || enviando.current) return;
      enviando.current = true;
      const historial = turnos
        .filter((t) => !t.error)
        .map(({ rol, texto: t }) => ({ rol, texto: t }));
      setTurnos((p) => [...p, { rol: "persona", texto: mensaje }]);
      setPensando(true);
      try {
        const r = await preguntarABelia(
          mensaje,
          historial,
          pantallaDe(pathname),
        );
        setTurnos((p) => [...p, { rol: "belia", texto: r.respuesta }]);
        if (r.uso_del_mes) setUso(r.uso_del_mes);
      } catch (e) {
        setTurnos((p) => [
          ...p,
          {
            rol: "belia",
            texto: humanizeApiError(
              e,
              "No pude responder. Intenta de nuevo en un rato.",
            ),
            error: true,
          },
        ]);
      } finally {
        setPensando(false);
        enviando.current = false;
      }
    },
    [turnos, pathname],
  );

  const animo = animoDe({
    pensando,
    celebrando,
    avisando,
    dormida,
    vencidos: datos?.vencidos ?? 0,
  });

  return {
    puede,
    esAdmin,
    nombre: userName?.split(" ")[0] ?? null,
    abierta,
    abrir: () => {
      setDormida(false);
      setAvisando(false);
      setAbierta(true);
    },
    cerrar: () => setAbierta(false),
    nuevaConversacion: () => setTurnos([]),
    turnos,
    pensando,
    enviar,
    animo,
    estado: datos,
    uso,
    conCotizacion: Boolean(pantallaDe(pathname).cotizacion_id),
  };
}
