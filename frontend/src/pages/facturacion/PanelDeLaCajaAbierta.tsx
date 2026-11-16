import { useQuery } from "@tanstack/react-query";
import Modal from "../../components/Modal";
import type { MedioDePago } from "../../constants/facturacion";
import {
  getEsperadoDeLaCaja,
  type CajaAbierta,
} from "../../services/caja.service";
import CerrarLaCaja from "./CerrarLaCaja";
import MovimientosDelTurno from "./MovimientosDelTurno";

// EL PANEL DE LA CAJA ABIERTA (doc 19 §9.55). Felipe, 16-11: *"recepción
// igual debe pinchar la caja abierta para cerrarla, finalmente es mover la
// misma sección pero dentro del modal"*. Al pinchar la fila «Abierta» se
// abre a la derecha, en este orden: quién y cuándo abrió y con cuánto; los
// movimientos del turno («Anotar movimiento» solo con su permiso); y el
// cierre por medio de pago (solo quien opera la caja). Quien revisa los
// cierres ve además lo que dice el sistema al lado de cada casilla; los
// demás cierran a ciegas: a ellos nunca se les pide.

const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;
const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
  });

export default function PanelDeLaCajaAbierta({
  abierta,
  nombre,
  cuentaPulseras,
  puedeCerrar,
  puedeAnotar,
  puedeRevisar,
  onCerrar,
  onCerrada,
}: {
  readonly abierta: CajaAbierta;
  readonly nombre: string | null;
  readonly cuentaPulseras: boolean;
  /** «Caja de recepción»: abrir y cerrar. */
  readonly puedeCerrar: boolean;
  /** «Anotar movimientos de caja». */
  readonly puedeAnotar: boolean;
  /** «Revisar cierres de caja»: ve lo que dice el sistema. */
  readonly puedeRevisar: boolean;
  readonly onCerrar: () => void;
  readonly onCerrada: (cerradaEn: string) => void;
}) {
  // Solo quien revisa pide lo esperado: a los demás nunca les llega.
  const esperado = useQuery({
    queryKey: ["caja", "esperado"],
    queryFn: getEsperadoDeLaCaja,
    enabled: puedeRevisar,
  });
  const porMedio = esperado.data?.abierta
    ? (Object.fromEntries(
        esperado.data.abierta.lineas.map((l) => [l.medio, l.esperado]),
      ) as Partial<Record<MedioDePago, number>>)
    : null;

  return (
    <Modal
      lado="derecha"
      ancho="max-w-2xl"
      titulo="Caja abierta"
      onCerrar={onCerrar}
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-700">
          <span className="mr-2 inline-block rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
            Abierta
          </span>
          Abrió <strong>{abierta.abierta_por_nombre}</strong> a las{" "}
          {hora(abierta.abierta_en)} con{" "}
          <strong>{clp(abierta.sencillo_inicial)}</strong>
        </p>
        <MovimientosDelTurno abierta={abierta} puedeAnotar={puedeAnotar} />
        {puedeCerrar && (
          <CerrarLaCaja
            nombre={nombre}
            cuentaPulseras={cuentaPulseras}
            esperado={puedeRevisar ? porMedio : null}
            onCerrada={onCerrada}
          />
        )}
      </div>
    </Modal>
  );
}
