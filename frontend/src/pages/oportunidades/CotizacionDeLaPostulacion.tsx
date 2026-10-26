import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ExternalLink, Link2, Loader2 } from "lucide-react";
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
import {
  getOfertaDeLaPostulacion,
  vincularCotizacion,
} from "../../services/postulacion.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { formatCurrency } from "../../utils/currencies";
import { desgloseDeOferta } from "./oportunidades.utils";
import { precioDeLosAnexos } from "./postuladasDeAntes";
import {
  claveDeLaCotizacion,
  cuadre,
  fechasEnPalabras,
  porcentaje,
  veredicto,
} from "./precioDeLaPostulacion";
import TituloDeBloque from "./TituloDeBloque";
import { useGeneraciones } from "./useGeneraciones";
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
//
// Desde la decisión 73 (23-10, el Día de Campo con la N° 493). Felipe:
// "podemos ordenarlo"; "no se reescribe"; "el crear cotización pregunta los
// días, pero no debería leer las bases". Dos bloques: «Crear una nueva»
// con las fechas de las bases ya puestas («Cambiar» las abre) y «Vincular
// una que ya tienes», que la une sin reescribirla, con su confirmación ahí
// mismo.
//
// Desde la decisión 79 (26-10) es el paso 1 de «Mi postulación», «El
// precio». Felipe: "lo que falta conseguir no debería ser un análisis que ya
// está en exigencias de la licitación... debería estar mi postulación
// finalmente, con centrado en los anexos, lo que tengo que presentar, el
// precio". Tres cifras (presupuesto, tu oferta con su neto y quién ganó el
// año pasado) y una línea: si calza y si la cotización cuadra. Lo que le
// falta a la cotización ya no se lista aquí: queda en su comentario
// interno, y lo que hay que conseguir, en «Bases y criterios».

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

/** Lo que no calza, con qué hacer. Lo que calza lo dice la línea. */
function Aviso({ texto }: { readonly texto: string }) {
  return (
    <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      {texto}
    </p>
  );
}

export default function CotizacionDeLaPostulacion({
  oportunidadId,
  anterior,
  congelada = false,
}: {
  readonly oportunidadId: number;
  readonly anterior: Anterior | null;
  /** Postulada o ganada: la cotización ya no se crea, vincula ni reescribe
   *  (el motor lo corta, decisión 33). */
  readonly congelada?: boolean;
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
  // Una postulada antes de «Armar postulación» (19-10): su precio quedó en
  // los anexos (postuladasDeAntes.ts).
  const { data: generaciones } = useGeneraciones(oportunidadId);

  const [eligiendo, setEligiendo] = useState(false);
  const [numero, setNumero] = useState<number | undefined>(undefined);
  const [confirmando, setConfirmando] = useState(false);
  const [reescribiendo, setReescribiendo] = useState(false);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [faltaFecha, setFaltaFecha] = useState<string | null>(null);
  const [cambiandoFechas, setCambiandoFechas] = useState(false);

  const llevar = useMutation({
    mutationFn: (p: { fechas?: FechasDeLaCotizacion }) =>
      llevarACotizacion(oportunidadId, total, p.fechas),
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
          : `Cotización N° ${n} reescrita con lo postulado.`,
      );
    },
    onError: (e) =>
      toast.error(humanizeApiError(e, "No se pudo armar la cotización.")),
  });

  // Vincular sin reescribir (decisión 73): quedan sus productos y precios.
  const vincular = useMutation({
    mutationFn: (n: number) => vincularCotizacion(oportunidadId, n),
    onSuccess: (nuevo, n) => {
      guardar(nuevo);
      setEligiendo(false);
      setConfirmando(false);
      setNumero(undefined);
      toast.success(
        `Cotización N° ${n} vinculada: sus productos y precios no cambian.`,
      );
    },
    onError: (e) =>
      toast.error(humanizeApiError(e, "No se pudo vincular la cotización.")),
  });
  const ocupado = llevar.isPending || vincular.isPending;

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
  const oferta = total ?? c?.total ?? precioDeLosAnexos(generaciones) ?? 0;
  const dice = veredicto(estado.presupuesto, oferta);
  const cuadra = cuadre(oferta, c ? c.total : null);

  const deLasBases = fechasEnPalabras(estado.fechas);
  const abrir = () => {
    setDesde(estado.fechas?.desde ?? "");
    // Un solo día: el «hasta» es el mismo, así no parece que falte.
    setHasta(estado.fechas?.hasta ?? estado.fechas?.desde ?? "");
    setCambiandoFechas(!estado.fechas?.desde);
    setFaltaFecha(null);
    setNumero(undefined);
    setConfirmando(false);
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
    llevar.mutate({
      fechas: { desde, hasta: hasta && hasta !== desde ? hasta : null },
    });
  };

  const desglose = oferta > 0 ? desgloseDeOferta(oferta) : null;

  return (
    <section className="bg-white rounded-lg shadow p-5 space-y-3">
      <h2 className="text-sm font-semibold text-gray-900">
        <TituloDeBloque numero={1}>El precio</TituloDeBloque>
      </h2>

      <dl className="grid gap-3 sm:grid-cols-3">
        <Cifra
          titulo="Presupuesto"
          valor={
            estado.presupuesto ? pesos(estado.presupuesto) : "No lo publicaron"
          }
        />
        <Cifra
          titulo="Tu oferta"
          valor={desglose ? pesos(oferta) : "—"}
          detalle={desglose ? `neto ${pesos(desglose.neto)} + IVA` : undefined}
          rojo={dice?.tono === "se_pasa"}
        />
        <Cifra
          titulo="Ganó el año pasado"
          valor={montoDelAnterior > 0 ? pesos(montoDelAnterior) : "Sin datos"}
          detalle={ganador?.nombre}
        />
      </dl>

      {(dice || c) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-700">
          {dice && (
            <span
              title={dice.texto}
              className={`rounded px-2 py-0.5 text-xs font-semibold ${
                dice.tono === "calza"
                  ? "bg-green-100 text-green-800"
                  : "bg-red-100 text-red-800"
              }`}
            >
              {dice.corto}
            </span>
          )}
          {c && (
            <>
              <span
                title={
                  c.descuento > 0
                    ? `Catálogo ${pesos(c.catalogo)} · descuento ${pesos(c.descuento)} (${porcentaje(c.descuento, c.catalogo)})`
                    : undefined
                }
                className={
                  cuadra && cuadra.tono !== "calza"
                    ? "font-semibold text-red-700"
                    : undefined
                }
              >
                Cotización N° {c.numero}
                {cuadra
                  ? cuadra.tono === "calza"
                    ? ` ${cuadra.corto}`
                    : `: ${cuadra.corto}`
                  : ""}
              </span>
              <Link
                to={`/negocio/${c.id}`}
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900"
              >
                <ExternalLink size={12} /> Ver la cotización
              </Link>
              {!reescribiendo && !congelada && (
                <button
                  type="button"
                  onClick={() => setReescribiendo(true)}
                  disabled={llevar.isPending}
                  className="text-xs text-gray-500 hover:text-gray-800 disabled:opacity-50"
                >
                  Reescribir con lo postulado
                </button>
              )}
            </>
          )}
        </div>
      )}
      {dice?.tono === "se_pasa" && <Aviso texto={dice.texto} />}
      {cuadra && cuadra.tono !== "calza" && <Aviso texto={cuadra.texto} />}
      {c && reescribiendo && (
        <ConfirmInline
          question={`¿Reescribir la N° ${c.numero} con lo postulado? Lo que le agregaste a mano se reemplaza; queda anotado en su bitácora.`}
          yesLabel="Sí, reescribir"
          tono="normal"
          busy={llevar.isPending}
          onYes={() => llevar.mutate({})}
          onNo={() => setReescribiendo(false)}
        />
      )}

      {c ? null : congelada ? (
        <p className="text-sm text-gray-600">
          Se postuló sin cotización vinculada.
        </p>
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
        <div className="space-y-3">
          <div className="rounded-lg border border-gray-200 p-3 space-y-2">
            <p className="text-sm font-semibold text-gray-900">
              Crear una nueva
            </p>
            <p className="text-xs text-gray-600">
              Con lo que tienes en tu catálogo
              {total ? ` y tu oferta de ${pesos(total)}` : ""}. Lo que falta
              queda en su comentario interno.
            </p>
            {deLasBases && !cambiandoFechas ? (
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-green-800">
                <CalendarDays size={14} aria-hidden />
                {deLasBases.unDia
                  ? `Para el ${deLasBases.texto}, según las bases.`
                  : `Para los días ${deLasBases.texto}, según las bases.`}
                <button
                  type="button"
                  onClick={() => setCambiandoFechas(true)}
                  className="text-xs font-semibold text-blue-700 hover:text-blue-900"
                >
                  Cambiar
                </button>
              </p>
            ) : (
              <>
                <p className="text-xs text-gray-600">
                  {deLasBases
                    ? "Vienen de las bases. Cámbialas si tus servicios son otros días."
                    : "¿Qué días ocupa en tu calendario?"}
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
                </div>
              </>
            )}
            {faltaFecha && <p className="text-xs text-red-600">{faltaFecha}</p>}
            <button
              type="button"
              onClick={crear}
              disabled={ocupado}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {llevar.isPending && (
                <Loader2 size={14} className="animate-spin" />
              )}
              Crear la cotización
            </button>
          </div>

          <div className="rounded-lg border border-gray-200 p-3 space-y-2">
            <p className="text-sm font-semibold text-gray-900">
              Vincular una que ya tienes
            </p>
            <p className="text-xs text-gray-600">
              Se une a esta licitación sin cambiar sus productos ni precios
              {deLasBases ? ", y pasa a la fecha de las bases" : ""}.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-36">
                <label
                  htmlFor="numero-a-vincular"
                  className="block text-xs text-gray-600"
                >
                  N°
                </label>
                <NumberInput
                  id="numero-a-vincular"
                  value={numero}
                  onChange={(n) => {
                    setNumero(n);
                    setConfirmando(false);
                  }}
                  min={1}
                  placeholder="Ej: 598"
                  disabled={ocupado}
                />
              </div>
              <button
                type="button"
                onClick={() => setConfirmando(true)}
                disabled={ocupado || !numero}
                className="px-3 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-50"
              >
                Vincular
              </button>
            </div>
            {confirmando && numero && (
              <ConfirmInline
                question={`La N° ${numero} se une a esta licitación sin cambiar sus productos ni precios${
                  deLasBases
                    ? deLasBases.unDia
                      ? `, y pasa al ${deLasBases.texto}, la fecha de las bases`
                      : `, y pasa a los días de las bases, ${deLasBases.texto}`
                    : ""
                }.`}
                yesLabel="Sí, vincular"
                tono="normal"
                busy={vincular.isPending}
                onYes={() => vincular.mutate(numero)}
                onNo={() => setConfirmando(false)}
              />
            )}
          </div>

          <div className="text-right">
            <button
              type="button"
              onClick={() => {
                setEligiendo(false);
                setConfirmando(false);
              }}
              className="text-sm text-gray-500 hover:text-gray-800"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
