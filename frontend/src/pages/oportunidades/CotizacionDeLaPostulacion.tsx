import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calculator, ExternalLink, Link2, Loader2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import ConfirmInline from "../../components/ConfirmInline";
import { NumberInput } from "../../components/inputs";
import { toast } from "../../components/toast/Toast";
import {
  type Anterior,
  type EstadoDeLaCotizacion,
  type FechasDeLaCotizacion,
  getCotizacionDeLaPostulacion,
  llevarACotizacion,
} from "../../services/oportunidades.service";
import { getOfertaDeLaPostulacion } from "../../services/postulacion.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { formatCurrency } from "../../utils/currencies";
import {
  claveDeLaCotizacion,
  cuadre,
  porcentaje,
  veredicto,
} from "./precioDeLaPostulacion";
import { claveDeLaOferta } from "./vueltaDeLaPostulacion";

// «¿CALZA EL PRECIO?» Y LA COTIZACIÓN DE LA POSTULACIÓN (decisión 29 del
// doc 17, 19-10). Felipe: la propuesta técnica y la cotización "tienen que
// ser equivalentes"; para vincular, "solamente el número y reescribir
// todo"; y el margen "se ajusta como un descuento en dinero, así cuadramos
// al peso". Desde la decisión 35 (19-10) es UN botón: crear una nueva o
// vincular una que existe.
//
// Desde la decisión 69 (22-10, el catamarán). Felipe: "por un tema de una
// diferencia de plata no estamos creando la cotización con lo básico...
// tiene que estar en rojo cuando hay alguna diferencia... y abajo los
// pendientes". La cotización se crea SIEMPRE con lo que hay en el catálogo,
// en las fechas que se eligen; el panel cruza presupuesto, oferta y
// cotización, en rojo cuando no cuadran, y abajo lista lo que falta. La
// cotización se edita a mano para cuadrar; se reescribe con lo postulado
// solo con el botón.

const pesos = (n: number) => formatCurrency(n, "CLP");

function Cifra({
  titulo,
  valor,
  detalle,
  rojo = false,
}: {
  readonly titulo: string;
  readonly valor: string;
  readonly detalle?: string;
  readonly rojo?: boolean;
}) {
  return (
    <div
      className={`rounded-lg px-3 py-2 ${rojo ? "bg-red-50 ring-1 ring-red-200" : "bg-gray-50"}`}
    >
      <dt className={`text-xs ${rojo ? "text-red-700" : "text-gray-500"}`}>
        {titulo}
      </dt>
      <dd
        className={`text-base font-semibold ${rojo ? "text-red-800" : "text-gray-900"}`}
      >
        {valor}
      </dd>
      {detalle && (
        <dd className={`text-xs ${rojo ? "text-red-700" : "text-gray-500"}`}>
          {detalle}
        </dd>
      )}
    </div>
  );
}

function Aviso({
  tono,
  texto,
}: {
  readonly tono: "calza" | "rojo";
  readonly texto: string;
}) {
  return (
    <p
      className={`rounded px-3 py-2 text-sm ${
        tono === "calza"
          ? "bg-green-50 text-green-800 border border-green-200"
          : "bg-red-50 text-red-800 border border-red-200"
      }`}
    >
      {texto}
    </p>
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
  const [reescribiendo, setReescribiendo] = useState(false);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [faltaFecha, setFaltaFecha] = useState<string | null>(null);

  const llevar = useMutation({
    mutationFn: (p: { numero?: number; fechas?: FechasDeLaCotizacion }) =>
      llevarACotizacion(oportunidadId, p.numero, total, p.fechas),
    onSuccess: (nuevo, p) => {
      guardar(nuevo);
      setEligiendo(false);
      setConfirmando(false);
      setReescribiendo(false);
      setNumero(undefined);
      const n = nuevo.cotizacion?.numero ?? "";
      toast.success(
        p.fechas
          ? `Cotización N° ${n} creada con lo que tienes en tu catálogo.${nuevo.faltan.length > 0 ? " Lo que falta quedó en su comentario interno." : ""}`
          : p.numero
            ? `Cotización N° ${n} vinculada y reescrita con lo postulado.`
            : `Cotización N° ${n} reescrita con lo postulado.`,
      );
    },
    onError: (e) =>
      toast.error(humanizeApiError(e, "No se pudo armar la cotización.")),
  });

  if (isPending || !estado) {
    return (
      <section className="bg-white rounded-lg shadow p-5">
        <p className="text-sm text-gray-500">Cargando el precio…</p>
      </section>
    );
  }

  const c = estado.cotizacion;
  const faltan = estado.faltan ?? [];
  const ganador = anterior?.ganadores?.[0] ?? null;
  const montoDelAnterior = (anterior?.ganadores ?? []).reduce(
    (suma, g) => suma + (g.monto ?? 0),
    0,
  );
  const oferta = total ?? c?.total ?? 0;
  const dice = veredicto(estado.presupuesto, oferta);
  const cuadra = cuadre(oferta, c ? c.total : null);

  const abrir = () => {
    setDesde(estado.fechas?.desde ?? "");
    setHasta(estado.fechas?.hasta ?? "");
    setFaltaFecha(null);
    setEligiendo(true);
  };
  const crear = () => {
    if (!desde) {
      setFaltaFecha("Elige desde qué día.");
      return;
    }
    if (hasta && hasta < desde) {
      setFaltaFecha("El «hasta» tiene que ser después del «desde».");
      return;
    }
    setFaltaFecha(null);
    llevar.mutate({ fechas: { desde, hasta: hasta || null } });
  };

  return (
    <section className="bg-white rounded-lg shadow p-5 space-y-4">
      <div className="space-y-0.5">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <Calculator size={15} /> ¿Calza el precio?
        </h2>
        <p className="text-xs text-gray-500">
          Cruza el presupuesto de la licitación, tu oferta y tu cotización. La
          cotización lleva lo que tienes en tu catálogo; lo que se subcontrata o
          no tienes queda abajo y en su comentario interno.
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
          titulo="Tu oferta"
          valor={oferta > 0 ? pesos(oferta) : "—"}
          detalle={oferta > 0 ? "Lo que postulas, con IVA" : undefined}
          rojo={dice?.tono === "se_pasa"}
        />
        <Cifra
          titulo="Tu cotización"
          valor={c ? pesos(c.total) : "—"}
          detalle={
            c
              ? `N° ${c.numero} · catálogo ${pesos(c.catalogo)}${c.descuento > 0 ? ` · descuento ${pesos(c.descuento)} (${porcentaje(c.descuento, c.catalogo)})` : ""}`
              : "Sin cotización todavía"
          }
          rojo={Boolean(cuadra && cuadra.tono !== "calza")}
        />
        <Cifra
          titulo="Ganó el año pasado"
          valor={montoDelAnterior > 0 ? pesos(montoDelAnterior) : "Sin datos"}
          detalle={ganador?.nombre}
        />
      </dl>

      {dice && (
        <Aviso
          tono={dice.tono === "calza" ? "calza" : "rojo"}
          texto={dice.texto}
        />
      )}
      {cuadra && (
        <Aviso
          tono={cuadra.tono === "calza" ? "calza" : "rojo"}
          texto={cuadra.texto}
        />
      )}

      {faltan.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 space-y-1">
          <p className="text-sm font-semibold text-amber-900">
            Lo que falta en la cotización ({faltan.length})
          </p>
          <ul className="list-disc pl-5 text-sm text-amber-900 space-y-0.5">
            {faltan.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
          <p className="text-xs text-amber-800">
            Va también en el comentario interno de la cotización, para compras y
            seguimiento.
          </p>
        </div>
      )}

      {c ? (
        <div className="space-y-2">
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
          <p className="text-xs text-gray-500">
            Puedes editarla: agrégale lo que falta (por ejemplo, el servicio que
            subcontratas) para cuadrar con tu oferta.
          </p>
          {!reescribiendo ? (
            <button
              type="button"
              onClick={() => setReescribiendo(true)}
              disabled={llevar.isPending}
              className="px-3 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-50"
            >
              Reescribir con lo postulado
            </button>
          ) : (
            <ConfirmInline
              question={`¿Reescribir la N° ${c.numero} con lo postulado? Lo que le agregaste a mano se reemplaza; queda anotado en su bitácora.`}
              yesLabel="Sí, reescribir"
              tono="normal"
              busy={llevar.isPending}
              onYes={() => llevar.mutate({})}
              onNo={() => setReescribiendo(false)}
            />
          )}
        </div>
      ) : !estado.propuesta ? (
        <p className="text-sm text-gray-600">
          Primero arma la postulación (arriba): de ella sale la cotización.
        </p>
      ) : !eligiendo ? (
        <button
          type="button"
          onClick={abrir}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
        >
          <Link2 size={14} /> Crear o vincular cotización
        </button>
      ) : (
        <div className="rounded-lg border border-gray-200 p-3 space-y-3">
          <p className="text-sm text-gray-700">
            Se crea con lo que tienes en tu catálogo
            {total ? ` y tu oferta de ${pesos(total)}` : ""}; lo que falta queda
            en su comentario interno. ¿Qué días ocupa en tu calendario?
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label
                htmlFor="cotizacion-desde"
                className="block text-xs text-gray-600"
              >
                Desde
              </label>
              <input
                id="cotizacion-desde"
                type="date"
                value={desde}
                onChange={(e) => {
                  setDesde(e.target.value);
                  setFaltaFecha(null);
                }}
                className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label
                htmlFor="cotizacion-hasta"
                className="block text-xs text-gray-600"
              >
                Hasta
              </label>
              <input
                id="cotizacion-hasta"
                type="date"
                value={hasta}
                min={desde || undefined}
                onChange={(e) => {
                  setHasta(e.target.value);
                  setFaltaFecha(null);
                }}
                className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg"
              />
            </div>
            <button
              type="button"
              onClick={crear}
              disabled={llevar.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {llevar.isPending && !numero && (
                <Loader2 size={14} className="animate-spin" />
              )}
              Crear una nueva
            </button>
          </div>
          <p className="text-xs text-gray-500">
            Propuestas desde las bases: corrígelas si tus servicios son otros
            días (en el catamarán, la comida es del 6 al 8 aunque el catamarán
            parta antes).
          </p>
          {faltaFecha && <p className="text-xs text-red-600">{faltaFecha}</p>}
          <div className="flex flex-wrap items-end gap-3">
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
              question={`La N° ${numero} se reescribe entera con lo postulado. Lo que tenía queda anotado en su bitácora.`}
              yesLabel="Sí, vincular"
              tono="normal"
              busy={llevar.isPending}
              onYes={() => llevar.mutate({ numero })}
              onNo={() => setConfirmando(false)}
            />
          )}
        </div>
      )}
    </section>
  );
}
