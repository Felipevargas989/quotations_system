import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { ROLE_GROUPS, tieneDerecho } from "../../constants/permissions";
import { useAuth } from "../../contexts/AuthContext";
import {
  borrarConversacion,
  estadoDeBelia,
  guardarConversacion,
  leerConversacion,
  preguntarABeliaEnVivo,
  responderPropuesta,
  type EventoDeBelia,
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
  paraGuardar,
  textoParaBelia,
  type EstadoDeTarjeta,
} from "./belia";

// EL CEREBRO DE LA VENTANILLA (doc 20 §8 y §8b): la conversación, el ánimo
// de BelIA y cuándo duerme, avisa o celebra. La conversación se guarda en
// Eventia, una por persona (doc 20 §13, migración 182; Felipe, 04-11: "que
// vaya guardando como cierto contexto cuando se cierra la ventana"): sigue
// al cerrar la ventana, al otro día y desde otro equipo. Los avisos se
// acuerdan en el navegador (localStorage), con try/catch: en una ventana
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
  /** Lo que pasó al aplicar (el borrador del seguimiento, doc 20 §17). */
  aviso?: string;
};

/** Un turno en pantalla. `error` no viaja al motor: no es una respuesta.
 *  Las propuestas tampoco: viaja lo que la persona hizo con ellas
 *  (`textoParaBelia`). */
export type TurnoEnPantalla = TurnoDeBelia & {
  error?: boolean;
  propuestas?: PropuestaEnPantalla[];
  /** El turno que BelIA está escribiendo en vivo: no viaja ni se guarda. */
  escribiendo?: boolean;
};

const CLAVE_VISTO = "belia:visto";
const CLAVE_ULTIMO_AVISO = "belia:ultimo-aviso";
const SEGUNDOS_DE_AVISO = 12;
/** Lo que espera la ventanilla, después del último cambio, para guardar. */
const MS_PARA_GUARDAR = 500;
const SEGUNDOS_DE_FIESTA = 4;

const leer = <T>(clave: string, porDefecto: T): T => {
  try {
    const s = localStorage.getItem(clave);
    return s ? (JSON.parse(s) as T) : porDefecto;
  } catch {
    return porDefecto;
  }
};

const guardar = (clave: string, valor: unknown) => {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    // Sin almacenamiento la ventanilla sigue; solo no recuerda los avisos.
  }
};

export function useBelia() {
  const { userRole, company, userName } = useAuth();
  // De vendedor para arriba (Felipe, 03-11: "lo usa administración y
  // vendedores") y, desde el 04-11, también recepción (doc 20 §13), solo en
  // la empresa con el módulo propio. A recepción el motor le da las
  // herramientas sin plata; y niega igual lo que no corresponde.
  const puede =
    Boolean(userRole) &&
    ROLE_GROUPS.RECEPTION_AND_UP.includes(userRole as never) &&
    tieneDerecho(company, "asistente");
  const esRecepcion = userRole === "recepcion";
  const esAdmin = userRole === "administrador";
  const { pathname, search } = useLocation();
  const queryClient = useQueryClient();

  const [abierta, setAbierta] = useState(false);
  const [turnos, setTurnos] = useState<TurnoEnPantalla[]>([]);
  // Hasta que llega la conversación guardada no se guarda nada: una
  // pestaña nueva, todavía vacía, no puede pisar la que quedó en Eventia.
  const [cargada, setCargada] = useState(false);
  const ultimaGuardada = useRef("");
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

  // La conversación guardada de esta persona (la de la sesión). Si no se
  // pudo leer, se conversa igual, pero sin guardar. Se vuelve a leer si
  // cambia el cargo: con otro cargo, el motor la entrega vacía.
  useEffect(() => {
    if (!puede) return;
    setCargada(false);
    let vigente = true;
    leerConversacion()
      .then((guardados) => {
        if (!vigente) return;
        // Las tarjetas vuelven tal como la ventanilla las guardó.
        const deEventia = guardados as unknown as TurnoEnPantalla[];
        ultimaGuardada.current = JSON.stringify(paraGuardar(deEventia));
        setTurnos(deEventia);
        setCargada(true);
      })
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, [puede, userRole]);

  // Cada cambio se guarda, salvo mientras BelIA escribe.
  useEffect(() => {
    if (!cargada || turnos.some((t) => t.escribiendo)) return;
    const datos = paraGuardar(turnos);
    const huella = JSON.stringify(datos);
    if (huella === ultimaGuardada.current) return;
    const reloj = setTimeout(() => {
      ultimaGuardada.current = huella;
      guardarConversacion(userRole ?? "", datos)
        .then((r) => {
          if (!r?.reiniciada) return;
          ultimaGuardada.current = JSON.stringify([]);
          setTurnos([]);
        })
        .catch(() => {
          // Se reintenta con el próximo cambio.
          ultimaGuardada.current = "";
        });
    }, MS_PARA_GUARDAR);
    return () => clearTimeout(reloj);
  }, [turnos, cargada, userRole]);

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
    const visto = leer<EstadoDeBelia | undefined>(CLAVE_VISTO, undefined);
    guardar(CLAVE_VISTO, datos);
    if (abierta || !hayAlgoNuevo(datos, visto)) return;
    const ultimo = leer<number>(CLAVE_ULTIMO_AVISO, 0);
    if (Date.now() - ultimo < MINUTOS_ENTRE_AVISOS * 60_000) return;
    guardar(CLAVE_ULTIMO_AVISO, Date.now());
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
      // La respuesta en vivo (doc 20 §9): el texto aparece mientras BelIA
      // lo escribe. Si va a buscar algo, lo escrito hasta ahí se borra: la
      // respuesta es lo que escribe al final.
      const alEscribir = (e: EventoDeBelia) =>
        setTurnos((p) => {
          if (e.tipo === "herramientas") return p.filter((t) => !t.escribiendo);
          const ultimo = p[p.length - 1];
          return ultimo?.escribiendo
            ? [...p.slice(0, -1), { ...ultimo, texto: ultimo.texto + e.texto }]
            : [...p, { rol: "belia", texto: e.texto, escribiendo: true }];
        });
      try {
        const r = await preguntarABeliaEnVivo(
          mensaje,
          historial,
          pantallaDe(pathname),
          alEscribir,
        );
        setTurnos((p) => [
          ...p.filter((t) => !t.escribiendo),
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
          ...p.filter((t) => !t.escribiendo),
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
          aviso: r.aviso,
          se_puede_deshacer: r.se_puede_deshacer ?? false,
          // Un evento nuevo recién tiene N° al crearse.
          ...(r.numero != null && r.enlace
            ? { numero: r.numero, enlace: r.enlace }
            : {}),
        });
        if (r.estado === "descartada") return;
        if (r.estado === "aplicada") celebrarConBelia();
        // La cotización cambió: las pantallas abiertas se ponen al día. Si
        // es la que la persona tiene abierta, la página se recarga (la
        // tarjeta lo avisó antes): un formulario viejo podría pisar el
        // cambio al guardar. La conversación sigue: queda guardada en
        // Eventia antes de que se recargue.
        void queryClient.invalidateQueries();
        if (
          tarjeta?.cotizacion_id &&
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
    esRecepcion,
    nombre: userName?.split(" ")[0] ?? null,
    abierta,
    abrir: () => {
      setDormida(false);
      setAvisando(false);
      setAbierta(true);
    },
    cerrar: () => setAbierta(false),
    // «Nueva conversación»: parte de cero también en Eventia.
    nuevaConversacion: () => {
      setTurnos([]);
      ultimaGuardada.current = JSON.stringify([]);
      void borrarConversacion().catch(() => undefined);
    },
    turnos,
    pensando,
    /** BelIA ya está escribiendo la respuesta (en vivo). */
    escribiendo: turnos.some((t) => t.escribiendo),
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
