import { useQuery } from "@tanstack/react-query";
import ConfirmInline from "../../components/ConfirmInline";
import { avisoDeReabrir } from "../../services/people.service";

const clp = (n: number) => "$" + Math.round(n || 0).toLocaleString("es-CL");

/** «$20.000 de propina repartida entre 5 personas». */
function textoDelAviso(a: { monto: number; personas: number }) {
  const quien = a.personas === 1 ? "1 persona" : `${a.personas} personas`;
  return `${clp(a.monto)} de propina repartida entre ${quien}`;
}

/**
 * LA PROPINA NO SE DESHACE A MEDIAS (doc 10 §14, 19-11-2026). La
 * pregunta de siempre para devolver algo a Liquidación, más cuánta
 * propina repartida hay adentro y qué le pasa: al reabrir queda escrita;
 * si después se baja el pozo a $0 o se marca «sin propina», se borra.
 * El 19-11 se reabrió el día 14 con $20.000 repartidos sin que nadie lo
 * viera, y quedaron escondidos en un día «sin propina».
 *
 * Mientras lee el aviso, «Sí» espera. Quien la usa manda
 * `confirmado: true` al motor: ya vio el aviso.
 */
export default function ConfirmarReabrir({
  origen,
  pregunta,
  yesLabel = "Reabrir",
  busy = false,
  onYes,
  onNo,
}: {
  readonly origen: { quotation_id?: string; day?: string };
  readonly pregunta: string;
  readonly yesLabel?: string;
  readonly busy?: boolean;
  readonly onYes: () => void;
  readonly onNo: () => void;
}) {
  const { data: aviso, isLoading } = useQuery({
    queryKey: ["people", "aviso-reabrir", origen],
    queryFn: () => avisoDeReabrir(origen),
    staleTime: 0,
  });
  const extra =
    aviso && aviso.monto > 0
      ? ` Tiene ${textoDelAviso(aviso)}: queda escrita. Si después bajas el pozo a $0 o marcas «sin propina», se borra.`
      : "";
  return (
    <ConfirmInline
      question={isLoading ? "Revisando la propina…" : pregunta + extra}
      yesLabel={yesLabel}
      tono="peligro"
      busy={busy || isLoading}
      onYes={onYes}
      onNo={onNo}
    />
  );
}
