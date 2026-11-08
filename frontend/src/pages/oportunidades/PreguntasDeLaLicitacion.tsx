import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import type { FichaDeOportunidad } from "../../services/oportunidades.service";
import { getOfertaDeLaPostulacion } from "../../services/postulacion.service";
import PreguntasAntesDeArmar from "./PreguntasAntesDeArmar";
import {
  claveDeLaOferta,
  preguntasPendientes,
  totalDetenido,
} from "./vueltaDeLaPostulacion";

// LAS PREGUNTAS DE UN ARMADO DETENIDO, AL ENTRAR A LA LICITACIÓN (decisión
// 119, parte 3, 07-11). Felipe: "vuelvo a la licitación, me aparece el
// modal de lo que me falta". Vive en la página, no en «Mi postulación»: se
// abre solo una vez por visita, en la pestaña que sea, y cambiar de
// pestaña no lo vuelve a abrir. «Responder» (en «Armar postulación») lo
// abre cuando se quiera. La misma consulta de la oferta que «Armar
// postulación».

export default function PreguntasDeLaLicitacion({
  ficha,
  abierta,
  onAbrir,
  onCerrar,
}: {
  readonly ficha: FichaDeOportunidad;
  readonly abierta: boolean;
  readonly onAbrir: () => void;
  readonly onCerrar: () => void;
}) {
  const qc = useQueryClient();
  const congelada = ficha.estado === "postulada" || ficha.estado === "ganada";
  const { data: oferta } = useQuery({
    queryKey: claveDeLaOferta(ficha.id),
    queryFn: () => getOfertaDeLaPostulacion(ficha.id),
  });
  const pendientes = congelada
    ? []
    : preguntasPendientes(oferta, ficha.exigencias_marcadas);

  const yaSeAbrio = useRef(false);
  useEffect(() => {
    if (pendientes.length === 0 || yaSeAbrio.current) return;
    yaSeAbrio.current = true;
    onAbrir();
  }, [pendientes.length, onAbrir]);

  if (!abierta || pendientes.length === 0) return null;
  return (
    <PreguntasAntesDeArmar
      oportunidadId={ficha.id}
      total={totalDetenido(oferta) ?? 0}
      preguntas={pendientes}
      onCerrar={onCerrar}
      onArmando={(fila) => {
        qc.setQueryData(claveDeLaOferta(ficha.id), fila);
        onCerrar();
      }}
    />
  );
}
