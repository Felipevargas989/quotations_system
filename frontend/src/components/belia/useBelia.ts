import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { SECTION_ROLES, tieneDerecho } from "../../constants/permissions";
import { useAuth } from "../../contexts/AuthContext";
import {
  estadoDeBelia,
  preguntarABelia,
  responderPropuesta,
  type EstadoDeBelia,
  type RespuestaDeBelia,
  type TarjetaDePropuesta,
  type TurnoDeBelia,
} from "../../services/asistente.service";
import { humanizeApiError } from "../../utils/apiErrors";
import {
  EVENTO_CELEBRAR,
  celebrarConBelia,
} from "../../utils/celebrarConBelia";
import {
  MINUTOS_ENTRE_AVISOS,
  MINUTOS_PARA_DORMIR,
  SEGUNDOS_PARA_TRABAJAR,
  animoDe,
  animoForzado,
  hayAlgoNuevo,
  pantallaDe,
  textoParaBelia,
  type EstadoDeTarjeta,
} from "./belia";

// EL CEREBRO DE LA VENTANILLA (doc 20 §8 y §8b): la conversación, el ánimo
// de BelIA y cuándo duerme, avisa o celebra. La conversación vive en la
// pestaña (sessionStorage): sigue al cambiar de pantalla y se va al
// cerrarla. Todo acceso al almacenamiento va con try/catch: en una ventana
// privada puede fallar, y la ventanilla igual funciona.

/** El laboratorio, con la misma regla del letrero de Layout.tsx. */
const ES_LABORATORIO = String(import.meta.env.VITE_SUPABASE_URL || "").includes(
  "uonjtbyoxawxvhuikbgx",
);

export type PropuestaEnPantalla = TarjetaDePropuesta & {
  estado: EstadoDeTarjeta;
  /** Lo que respondió el motor si no se pudo. */
  mensaje?: string;
  /** El total que quedó guardado. */
  total_final?: string;
};

/** Un turno en pantalla. `error` no viaja al motor: no es una respuesta.
 *  Las propuestas tampoco: viaja lo que la persona hizo con ellas
 *  (`textoParaBelia`). */
export type TurnoEnPantalla = TurnoDeBelia & {
  error?: boolean;
  propuestas?: PropuestaEnPantalla[];
};

const CLAVE_CONVERSACION = "belia:conversacion";
const CLAVE_VISTO = "belia:visto";
const CLAVE_ULTIMO_AVISO = "belia:ultimo-aviso";
const MAX_TURNOS = 30;
const SEGUNDOS_DE_AVISO = 12;
const SEGUNDOS_DE_FIESTA = 4;

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
  const { pathname, search } = useLocation();
  const queryClient = useQueryClient();

  const [abierta, setAbierta] = useState(false);
  const [turnos, setTurnos] = useState<TurnoEnPantalla[]>(() =>
    leer("session", CLAVE_CONVERSACION, []),
  );
  const [pensando, setPensando] = useState(false);
  const [uso, setUso] = useState<RespuestaDeBelia["uso_del_mes"]>();
  const [dormida, setDormida] = useState(false);
  const [avisando, setAvisando] = useState(false);
  const [celebrando, setCelebrando] = useState(false);
  // Mientras espera la respuesta: piensa y, si tarda, trabaja (doc 20 §8b).
  const [trabajando, setTrabajando] = useState(false);

  useEffect(() => {
    if (!pensando) {
      setTrabajando(false);
      return;
    }
    const t = setTimeout(
      () => setTrabajando(true),
      SEGUNDOS_PARA_TRABAJAR * 1000,
    );
    return () => clearTimeout(t);
  }, [pensando]);

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
        .map((t) => ({ rol: t.rol, texto: textoParaBelia(t) }));
      setTurnos((p) => [...p, { rol: "persona", texto: mensaje }]);
      setPensando(true);
      try {
        const r = await preguntarABelia(
          mensaje,
          historial,
          pantallaDe(pathname),
        );
        setTurnos((p) => [
          ...p,
          {
            rol: "belia",
            texto: r.respuesta,
            ...(r.propuestas?.length
              ? {
                  propuestas: r.propuestas.map((x) => ({
                    ...x,
                    estado: "pendiente" as const,
                  })),
                }
              : {}),
          },
        ]);
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

  // «Sí, aplicar», «No» y «Deshacer» de una tarjeta. El motor vuelve a
  // revisar todo; acá solo se pinta lo que respondió.
  const responder = useCallback(
    async (
      indice: number,
      id: string,
      accion: "aplicar" | "descartar" | "deshacer",
    ) => {
      const cambiar = (c: Partial<PropuestaEnPantalla>) =>
        setTurnos((p) =>
          p.map((t, i) =>
            i !== indice
              ? t
              : {
                  ...t,
                  propuestas: t.propuestas?.map((x) =>
                    x.id === id ? { ...x, ...c } : x,
                  ),
                },
          ),
        );
      const tarjeta = turnos[indice]?.propuestas?.find((x) => x.id === id);
      const antes = tarjeta?.estado ?? "pendiente";
      cambiar({ estado: "enviando", mensaje: undefined });
      try {
        const r = await responderPropuesta(id, accion);
        cambiar({
          estado: r.estado,
          total_final: r.total,
          se_puede_deshacer: r.se_puede_deshacer ?? false,
        });
        if (r.estado === "descartada") return;
        if (r.estado === "aplicada") celebrarConBelia();
        // La cotización cambió: las pantallas abiertas se ponen al día. Si
        // es la que la persona tiene abierta, la página se recarga (la
        // tarjeta lo avisó antes): un formulario viejo podría pisar el
        // cambio al guardar. La conversación sigue (sessionStorage).
        void queryClient.invalidateQueries();
        if (
          tarjeta &&
          pantallaDe(pathname).cotizacion_id === tarjeta.cotizacion_id
        ) {
          setTimeout(() => window.location.reload(), 1500);
        }
      } catch (e) {
        const estado = (e as { response?: { status?: number } })?.response
          ?.status;
        // Un 409 o un 404 no se arregla reintentando: hay que pedirla de
        // nuevo. Lo demás (la red) deja la tarjeta como estaba.
        cambiar({
          estado: estado === 409 || estado === 404 ? "fallo" : antes,
          mensaje: humanizeApiError(e, "No se pudo. Intenta de nuevo."),
        });
      }
    },
    [turnos, pathname, queryClient],
  );

  const animo =
    animoForzado(search, ES_LABORATORIO) ??
    animoDe({
      esperando: pensando ? (trabajando ? "trabajando" : "pensando") : null,
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
    responder,
    /** La cotización que la persona tiene abierta, si tiene una. */
    cotizacionAbierta: pantallaDe(pathname).cotizacion_id ?? null,
    animo,
    estado: datos,
    uso,
    conCotizacion: Boolean(pantallaDe(pathname).cotizacion_id),
  };
}
