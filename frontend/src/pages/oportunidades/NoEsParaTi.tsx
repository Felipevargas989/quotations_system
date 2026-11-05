import DesistirDeLaLicitacion from "./DesistirDeLaLicitacion";

// NO ES PARA TI (decisión 117, 04-11). Felipe: "un rojo más intenso y las
// letras claras... que se note de, oye, ni la leas... no puedes hacerla
// porque las bases te dejan fuera", y "yo la dejaría en rojo burdeo o un
// rojo vino tinto". Cuando las bases piden el servicio en otro lugar, no
// depende de la empresa: va arriba de «Lo que te deja fuera», en burdeo
// con letra clara, y se desiste de un clic.

export default function NoEsParaTi({
  oportunidadId,
  lugar,
  puedeDesistir,
}: {
  readonly oportunidadId: number;
  /** Dónde piden el servicio, como lo leyó la IA. */
  readonly lugar: string;
  /** Descartada, postulada, ganada o perdida: ya no se desiste. */
  readonly puedeDesistir: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-rose-900 px-4 py-3">
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-semibold text-white">
          No es para ti: las bases te dejan fuera.
        </p>
        {lugar.trim() && (
          <p className="text-sm text-rose-100">
            Piden otro lugar: {lugar.trim()}
          </p>
        )}
      </div>
      {puedeDesistir && (
        <DesistirDeLaLicitacion oportunidadId={oportunidadId} />
      )}
    </div>
  );
}
