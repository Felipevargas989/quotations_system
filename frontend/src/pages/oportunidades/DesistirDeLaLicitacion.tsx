import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "../../components/toast/Toast";
import type { MotivoDelDescarte } from "../../services/decisiones";
import { actualizarOportunidad } from "../../services/oportunidades.service";
import { humanizeApiError } from "../../utils/apiErrors";
import PorQueDescartas from "./PorQueDescartas";

// «DESISTIR DE ESTA LICITACIÓN» (decisión 37; desde la 113, el modal del
// porqué también confirma). Aparte desde la decisión 117 (04-11): lo usan
// «Lo que tienes que ofrecer», cuando marcas «No puedo», y «Lo que te deja
// fuera», cuando las bases piden otro lugar.

const claveDeLaFicha = (id: number) => ["oportunidades", "ficha", id];

export default function DesistirDeLaLicitacion({
  oportunidadId,
}: {
  readonly oportunidadId: number;
}) {
  const qc = useQueryClient();
  const [desistiendo, setDesistiendo] = useState(false);
  const desistir = useMutation({
    mutationFn: (motivo: MotivoDelDescarte | null) =>
      actualizarOportunidad(oportunidadId, {
        estado: "descartada",
        motivo: motivo ?? undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: claveDeLaFicha(oportunidadId) });
      toast.success("Desististe de esta licitación: quedó en «Descartadas».");
      setDesistiendo(false);
    },
    onError: (e) => toast.error(humanizeApiError(e, "No se pudo desistir.")),
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setDesistiendo(true)}
        className="px-3 py-1.5 text-sm font-semibold text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-100"
      >
        Desistir de esta licitación
      </button>
      {desistiendo && (
        <PorQueDescartas
          titulo="¿Por qué desistes?"
          subtitulo="Queda en «Descartadas» y se puede recuperar. Así el semáforo aprende."
          sinMotivo="Desistir sin motivo"
          ocupado={desistir.isPending}
          onElegir={(motivo) => desistir.mutate(motivo)}
          onCancelar={() => setDesistiendo(false)}
        />
      )}
    </>
  );
}
