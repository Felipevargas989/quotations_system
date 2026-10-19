import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calculator, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import ConfirmInline from "../../components/ConfirmInline";
import { NumberInput } from "../../components/inputs";
import { toast } from "../../components/toast/Toast";
import {
  type Anterior,
  type EstadoDeLaCotizacion,
  fijarOfertaDeLaPostulacion,
  getCotizacionDeLaPostulacion,
  llevarACotizacion,
} from "../../services/oportunidades.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { formatCurrency } from "../../utils/currencies";
import {
  claveDeLaCotizacion,
  porcentaje,
  veredicto,
} from "./precioDeLaPostulacion";

// «¿CALZA EL PRECIO?» Y LA COTIZACIÓN DE LA POSTULACIÓN (decisión 29 del
// doc 17, 19-10). Felipe: la propuesta técnica y la cotización "tienen que
// ser equivalentes"; para vincular, "solamente el número y reescribir
// todo"; y el margen "se ajusta como un descuento en dinero, así cuadramos
// al peso". La cotización sale con los precios del catálogo: el descuento
// se decide en la oferta y queda a la vista.

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

  const [numero, setNumero] = useState<number | undefined>(undefined);
  const [preguntando, setPreguntando] = useState<
    "vincular" | "actualizar" | null
  >(null);
  const llevar = useMutation({
    mutationFn: (n?: number) => llevarACotizacion(oportunidadId, n),
    onSuccess: (nuevo) => {
      guardar(nuevo);
      setPreguntando(null);
      setNumero(undefined);
      toast.success(
        `Cotización N° ${nuevo.cotizacion?.numero ?? ""} lista con los productos de la propuesta técnica.`,
      );
    },
    onError: (e) =>
      toast.error(humanizeApiError(e, "No se pudo armar la cotización.")),
  });

  const [oferta, setOferta] = useState<number | undefined>(undefined);
  const ofertar = useMutation({
    mutationFn: (total: number) =>
      fijarOfertaDeLaPostulacion(oportunidadId, total),
    onSuccess: (nuevo) => {
      guardar(nuevo);
      setOferta(undefined);
      toast.success("Oferta aplicada: la cotización cuadra al peso.");
    },
    onError: (e) =>
      toast.error(humanizeApiError(e, "No se pudo aplicar la oferta.")),
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
  const ofertaVista = oferta ?? c?.total ?? 0;
  const dice = c ? veredicto(estado.presupuesto, ofertaVista) : null;
  const ocupado = llevar.isPending || ofertar.isPending;

  return (
    <section className="bg-white rounded-lg shadow p-5 space-y-4">
      <div className="space-y-0.5">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <Calculator size={15} /> ¿Calza el precio?
        </h2>
        <p className="text-xs text-gray-500">
          La propuesta técnica y la cotización son la misma oferta: los
          productos de la propuesta, con los precios de tu catálogo. Si ofreces
          menos, la diferencia queda como descuento en la cotización.
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
          valor={c ? pesos(c.total) : "—"}
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

      {!c ? (
        !estado.propuesta ? (
          <p className="text-sm text-gray-600">
            Primero crea la propuesta técnica (abajo, en «Crear documentos con
            IA»): de ella salen los productos de la cotización.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-700">
              La propuesta técnica ofrece {estado.propuesta.productos}{" "}
              {estado.propuesta.productos === 1 ? "producto" : "productos"} de
              tu catálogo. Llévalos a una cotización para ver el precio real.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <button
                type="button"
                onClick={() => llevar.mutate(undefined)}
                disabled={ocupado}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {llevar.isPending && (
                  <Loader2 size={14} className="animate-spin" />
                )}
                Crear cotización
              </button>
              <div className="flex items-end gap-2">
                <div className="w-36">
                  <label
                    htmlFor="numero-a-vincular"
                    className="block text-xs text-gray-600"
                  >
                    o vincular la N°
                  </label>
                  <NumberInput
                    id="numero-a-vincular"
                    value={numero}
                    onChange={setNumero}
                    min={1}
                    placeholder="Ej: 598"
                    disabled={ocupado}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setPreguntando("vincular")}
                  disabled={ocupado || !numero}
                  className="px-3 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-50"
                >
                  Vincular
                </button>
              </div>
            </div>
            {preguntando === "vincular" && numero && (
              <ConfirmInline
                question={`La N° ${numero} se reescribe entera con los productos de la propuesta técnica. Lo que tenía queda anotado en su bitácora.`}
                yesLabel="Sí, vincular y reescribir"
                tono="normal"
                busy={llevar.isPending}
                onYes={() => llevar.mutate(numero)}
                onNo={() => setPreguntando(null)}
              />
            )}
          </div>
        )
      ) : (
        <div className="space-y-3">
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
            {estado.propuesta && (
              <button
                type="button"
                onClick={() => setPreguntando("actualizar")}
                disabled={ocupado}
                className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900 disabled:opacity-50"
              >
                <RefreshCw size={12} /> Actualizar con la propuesta
              </button>
            )}
          </p>
          {preguntando === "actualizar" && (
            <ConfirmInline
              question={`La N° ${c.numero} se reescribe con los productos de la última propuesta técnica. Lo que tenía queda en su bitácora y la oferta vuelve al precio del catálogo.`}
              yesLabel="Sí, actualizar"
              tono="normal"
              busy={llevar.isPending}
              onYes={() => llevar.mutate(undefined)}
              onNo={() => setPreguntando(null)}
            />
          )}
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-48">
              <label
                htmlFor="oferta-de-la-postulacion"
                className="block text-xs font-semibold text-gray-700"
              >
                Tu oferta, con IVA
              </label>
              <NumberInput
                id="oferta-de-la-postulacion"
                value={oferta ?? c.total}
                onChange={setOferta}
                min={1}
                currency
                disabled={ocupado}
              />
            </div>
            <button
              type="button"
              onClick={() => oferta && ofertar.mutate(oferta)}
              disabled={ocupado || !oferta || oferta === c.total}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {ofertar.isPending && (
                <Loader2 size={14} className="animate-spin" />
              )}
              Aplicar oferta
            </button>
          </div>
          <p className="text-xs text-gray-500">
            Si es menor que tu catálogo, la diferencia entra como descuento en
            dinero y la cotización cuadra al peso. Para subirla, agrega
            productos en la cotización: nunca un precio a dedo.
          </p>
        </div>
      )}
    </section>
  );
}
