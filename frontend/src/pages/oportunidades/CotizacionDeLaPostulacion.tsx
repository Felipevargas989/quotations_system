import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calculator, ExternalLink, Link2, Loader2, Lock } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import ConfirmInline from "../../components/ConfirmInline";
import { NumberInput } from "../../components/inputs";
import { toast } from "../../components/toast/Toast";
import {
  type Anterior,
  type EstadoDeLaCotizacion,
  getCotizacionDeLaPostulacion,
  llevarACotizacion,
} from "../../services/oportunidades.service";
import { getOfertaDeLaPostulacion } from "../../services/postulacion.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { formatCurrency } from "../../utils/currencies";
import {
  claveDeLaCotizacion,
  porcentaje,
  veredicto,
} from "./precioDeLaPostulacion";
import { claveDeLaOferta } from "./vueltaDeLaPostulacion";

// «¿CALZA EL PRECIO?» Y LA COTIZACIÓN DE LA POSTULACIÓN (decisión 29 del
// doc 17, 19-10). Felipe: la propuesta técnica y la cotización "tienen que
// ser equivalentes"; para vincular, "solamente el número y reescribir
// todo"; y el margen "se ajusta como un descuento en dinero, así cuadramos
// al peso". La cotización sale con los precios del catálogo: el descuento
// se decide en la oferta y queda a la vista.
// Desde la decisión 35 (19-10) es UN botón, «Vincular con cotización»:
// crear una nueva o vincular una que existe; las dos quedan iguales a lo
// postulado, con el precio de «Armar postulación», y de solo lectura.

const pesos = (n: number) => formatCurrency(n, "CLP");

function Cifra({
  titulo,
  valor,
  detalle,
}: {
  readonly titulo: string;
  readonly valor: string;
  readonly detalle?: string;
}) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2">
      <dt className="text-xs text-gray-500">{titulo}</dt>
      <dd className="text-base font-semibold text-gray-900">{valor}</dd>
      {detalle && <dd className="text-xs text-gray-500">{detalle}</dd>}
    </div>
  );
}

export default function CotizacionDeLaPostulacion({
  oportunidadId,
  anterior,
}: {
  readonly oportunidadId: number;
  readonly anterior: Anterior | null;
}) {
  const qc = useQueryClient();
  const clave = claveDeLaCotizacion(oportunidadId);
  const { data: estado, isPending } = useQuery({
    queryKey: clave,
    queryFn: () => getCotizacionDeLaPostulacion(oportunidadId),
  });
  const guardar = (nuevo: EstadoDeLaCotizacion) =>
    qc.setQueryData(clave, nuevo);

  // El precio de «Armar postulación» (decisión 35).
  const { data: armada } = useQuery({
    queryKey: claveDeLaOferta(oportunidadId),
    queryFn: () => getOfertaDeLaPostulacion(oportunidadId),
  });
  const total =
    armada?.estado === "listo"
      ? armada.parametros?.postulacion?.total
      : undefined;

  const [eligiendo, setEligiendo] = useState(false);
  const [numero, setNumero] = useState<number | undefined>(undefined);
  const [confirmando, setConfirmando] = useState(false);
  const llevar = useMutation({
    mutationFn: (n?: number) => llevarACotizacion(oportunidadId, n, total),
    onSuccess: (nuevo) => {
      guardar(nuevo);
      setEligiendo(false);
      setConfirmando(false);
      setNumero(undefined);
      toast.success(
        `Cotización N° ${nuevo.cotizacion?.numero ?? ""} vinculada: es lo postulado y queda de solo lectura.`,
      );
    },
    onError: (e) =>
      toast.error(humanizeApiError(e, "No se pudo vincular la cotización.")),
  });

  if (isPending || !estado) {
    return (
      <section className="bg-white rounded-lg shadow p-5">
        <p className="text-sm text-gray-500">Cargando el precio…</p>
      </section>
    );
  }

  const c = estado.cotizacion;
  const ganador = anterior?.ganadores?.[0] ?? null;
  const montoDelAnterior = (anterior?.ganadores ?? []).reduce(
    (suma, g) => suma + (g.monto ?? 0),
    0,
  );
  const precio = c?.total ?? total ?? 0;
  const dice = veredicto(estado.presupuesto, precio);

  return (
    <section className="bg-white rounded-lg shadow p-5 space-y-4">
      <div className="space-y-0.5">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <Calculator size={15} /> ¿Calza el precio?
        </h2>
        <p className="text-xs text-gray-500">
          La cotización es lo postulado: los productos de «Qué ofreces», con los
          precios de tu catálogo. Si tu precio es menor, la diferencia queda
          como descuento en la cotización.
        </p>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cifra
          titulo="Presupuesto de la licitación"
          valor={
            estado.presupuesto ? pesos(estado.presupuesto) : "No lo publicaron"
          }
        />
        <Cifra
          titulo="Tu catálogo"
          valor={c ? pesos(c.catalogo) : "—"}
          detalle={c ? `Cotización N° ${c.numero}` : "Sin cotización todavía"}
        />
        <Cifra
          titulo="Tu oferta"
          valor={precio > 0 ? pesos(precio) : "—"}
          detalle={
            c && c.descuento > 0
              ? `Descuento ${pesos(c.descuento)} (${porcentaje(c.descuento, c.catalogo)})`
              : undefined
          }
        />
        <Cifra
          titulo="Ganó el año pasado"
          valor={montoDelAnterior > 0 ? pesos(montoDelAnterior) : "Sin datos"}
          detalle={ganador?.nombre}
        />
      </dl>

      {dice && (
        <p
          className={`rounded px-3 py-2 text-sm ${
            dice.tono === "calza"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {dice.texto}
        </p>
      )}

      {c ? (
        <div className="space-y-1">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-700">
            <span>
              Cotización N° {c.numero} · {c.estado}
              {c.cliente ? ` · ${c.cliente}` : ""}
            </span>
            <Link
              to={`/negocio/${c.id}`}
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900"
            >
              <ExternalLink size={12} /> Ver la cotización
            </Link>
          </p>
          <p className="flex items-center gap-1.5 text-xs text-gray-500">
            <Lock size={12} /> De solo lectura: es lo postulado. Si cambias el
            precio o la oferta, vuelve a armar la postulación y la cotización se
            actualiza sola.
          </p>
        </div>
      ) : !estado.propuesta ? (
        <p className="text-sm text-gray-600">
          Primero arma la postulación (arriba): de ella sale la cotización.
        </p>
      ) : !eligiendo ? (
        <button
          type="button"
          onClick={() => setEligiendo(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
        >
          <Link2 size={14} /> Vincular con cotización
        </button>
      ) : (
        <div className="rounded-lg border border-gray-200 p-3 space-y-3">
          <p className="text-sm text-gray-700">
            ¿Creas una cotización nueva o vinculas una que ya existe? Las dos
            quedan iguales a lo postulado
            {total ? `, por ${pesos(total)},` : ""} y de solo lectura.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <button
              type="button"
              onClick={() => llevar.mutate(undefined)}
              disabled={llevar.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {llevar.isPending && !numero && (
                <Loader2 size={14} className="animate-spin" />
              )}
              Crear una nueva
            </button>
            <span className="pb-2 text-sm text-gray-500">o</span>
            <div className="w-36">
              <label
                htmlFor="numero-a-vincular"
                className="block text-xs text-gray-600"
              >
                Vincular la N°
              </label>
              <NumberInput
                id="numero-a-vincular"
                value={numero}
                onChange={setNumero}
                min={1}
                placeholder="Ej: 598"
                disabled={llevar.isPending}
              />
            </div>
            <button
              type="button"
              onClick={() => setConfirmando(true)}
              disabled={llevar.isPending || !numero}
              className="px-3 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-50"
            >
              Vincular
            </button>
            <button
              type="button"
              onClick={() => {
                setEligiendo(false);
                setConfirmando(false);
              }}
              className="pb-2 text-sm text-gray-500 hover:text-gray-800"
            >
              Cancelar
            </button>
          </div>
          {confirmando && numero && (
            <ConfirmInline
              question={`La N° ${numero} se reescribe entera con lo postulado y queda de solo lectura. Lo que tenía queda anotado en su bitácora.`}
              yesLabel="Sí, vincular"
              tono="normal"
              busy={llevar.isPending}
              onYes={() => llevar.mutate(numero)}
              onNo={() => setConfirmando(false)}
            />
          )}
        </div>
      )}
    </section>
  );
}
