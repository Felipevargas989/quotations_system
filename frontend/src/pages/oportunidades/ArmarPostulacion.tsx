import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { NumberInput } from "../../components/inputs";
import { toast } from "../../components/toast/Toast";
import {
  crearPropuestaTecnica,
  generarAnexos,
  getAnalisis,
  getOferente,
  type Generacion,
  type GeneracionesDeOportunidad,
  type TipoDeGeneracion,
} from "../../services/oportunidades.service";
import { getExperiencia } from "../../services/experiencia.service";
import {
  armarPostulacion,
  getOfertaDeLaPostulacion,
} from "../../services/postulacion.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { formatCurrency } from "../../utils/currencies";
import { formatMomento } from "../../utils/dates";
import {
  avisoDeExperiencia,
  claveDeLaExperiencia,
} from "./reglasDeLaExperiencia";
import { faltaEnMiEmpresa } from "./formulariosDelComprador";
import { desgloseDeOferta } from "./oportunidades.utils";
import { precioDeLosAnexos } from "./postuladasDeAntes";
import { claveDeGeneraciones, useGeneraciones } from "./useGeneraciones";
import {
  claveDeLaOferta,
  vueltaDeLaPostulacion,
} from "./vueltaDeLaPostulacion";

// «ARMAR POSTULACIÓN» (decisión 35 del doc 17, 19-10). Felipe: "¿no será
// suficiente con un solo botón que diga armar postulación y que haga todos
// los anexos, arme la propuesta técnica, arme la propuesta comercial, que
// solamente me pida el precio?". Reemplaza a «Armar la oferta», «Generar
// anexos» y «Crear propuesta técnica»: el motor encadena la oferta, los
// anexos con ese precio (la oferta económica la calcula Eventia) y la
// propuesta si las bases la piden o aceptan formato propio. Todo sale SIN
// firma a «Mi postulación»: la firma sigue aparte, después de revisar.
//
// Desde el 26-10 (decisión 79), ya armada queda en una barra arriba de los
// tres pasos: cuándo se armó, el precio, la experiencia y «Volver a armar»,
// que abre todo esto. Felipe: "no sé si tiene sentido mostrar la experiencia
// de lo primero". Abierto se ve antes de la primera vez, mientras la IA
// arma y si algo no resultó (para reintentarlo).
//
// Desde el 27-10 (decisión 86) es solo el precio y el botón. Felipe: "en
// armar postulación primero muestra la experiencia (yo no la mostraría...)
// luego hay una lista de los formularios, también fuera... el punto 1 qué
// ofreces ya no tiene sentido". Se fueron la lista de formularios (está en
// «Bases y criterios»), la experiencia (la elige la IA al armar; un aviso
// solo si no alcanza) y los tres pasos: mientras arma, una línea; si algo
// falla, una línea roja con «Reintentar». Lo armado sale en «Tus
// documentos» y lo pendiente, en «Validar todo».

const pesos = (n: number) => formatCurrency(n, "CLP");

export default function ArmarPostulacion({
  oportunidadId,
  congelada = false,
}: {
  readonly oportunidadId: number;
  /** Postulada o ganada: lo postulado queda fijo (decisión 33). */
  readonly congelada?: boolean;
}) {
  const qc = useQueryClient();
  const { data: oferta } = useQuery({
    queryKey: claveDeLaOferta(oportunidadId),
    queryFn: () => getOfertaDeLaPostulacion(oportunidadId),
    refetchInterval: (q) =>
      q.state.data?.estado === "procesando" ? 5000 : false,
  });
  const { data: generaciones } = useGeneraciones(oportunidadId);
  const { data: analisis } = useQuery({
    queryKey: ["oportunidades", "analisis", oportunidadId],
    queryFn: () => getAnalisis(oportunidadId),
  });
  // Si falta la razón social o el RUT, se dice antes de apretar.
  const { data: miEmpresa } = useQuery({
    queryKey: ["oportunidades", "oferente"],
    queryFn: getOferente,
  });
  const falta = faltaEnMiEmpresa(miEmpresa?.oferente);
  // La experiencia la elige la IA al armar (decisión 86): solo se avisa si
  // no alcanza o no se pudo elegir.
  const { data: experiencia } = useQuery({
    queryKey: claveDeLaExperiencia(oportunidadId),
    queryFn: () => getExperiencia(oportunidadId),
  });
  const avisoExperiencia = avisoDeExperiencia(experiencia);
  const hayAnalisis = analisis?.estado === "listo";

  const vuelta = vueltaDeLaPostulacion(oferta, generaciones);
  const [abierta, setAbierta] = useState(false);
  const [escrito, setPrecio] = useState<number | undefined>(undefined);
  const precio = escrito ?? vuelta?.total;
  const desglose = precio && precio > 0 ? desgloseDeOferta(precio) : null;

  // Con la oferta lista, el motor pide los documentos: se pregunta por
  // ellos (y por lo que no alcanzó a partir) hasta que aparecen.
  const esperando =
    vuelta?.oferta === "listo" &&
    (vuelta.anexos.estado === "espera" || vuelta.propuesta.estado === "espera");
  useEffect(() => {
    if (!esperando) return;
    const reloj = setInterval(() => {
      void qc.invalidateQueries({
        queryKey: claveDeGeneraciones(oportunidadId),
      });
      void qc.invalidateQueries({ queryKey: claveDeLaOferta(oportunidadId) });
    }, 5000);
    return () => clearInterval(reloj);
  }, [esperando, oportunidadId, qc]);

  const armar = useMutation({
    mutationFn: (total: number) => armarPostulacion(oportunidadId, total),
    onSuccess: (fila) => {
      qc.setQueryData(claveDeLaOferta(oportunidadId), fila);
      setPrecio(undefined);
      // Al terminar vuelve a la barra.
      setAbierta(false);
      toast.success("La IA está armando la postulación: tarda unos minutos.");
    },
    onError: (e) =>
      toast.error(humanizeApiError(e, "No se pudo armar la postulación.")),
  });

  const anotar = (tipo: TipoDeGeneracion, fila: Generacion) =>
    qc.setQueryData<GeneracionesDeOportunidad>(
      claveDeGeneraciones(oportunidadId),
      (antes) => ({
        anexos: antes?.anexos ?? null,
        firma: antes?.firma ?? null,
        propuesta: antes?.propuesta ?? null,
        [tipo]: fila,
      }),
    );
  const reintentarAnexos = useMutation({
    mutationFn: () =>
      generarAnexos(oportunidadId, {
        ...(vuelta ? { monto_total: vuelta.total } : {}),
      }),
    onSuccess: (fila) => anotar("anexos", fila),
    onError: (e) =>
      toast.error(humanizeApiError(e, "No se pudieron generar los anexos.")),
  });
  const reintentarPropuesta = useMutation({
    mutationFn: () => crearPropuestaTecnica(oportunidadId),
    onSuccess: (fila) => anotar("propuesta", fila),
    onError: (e) =>
      toast.error(humanizeApiError(e, "No se pudo crear la propuesta.")),
  });

  const ocupado = armar.isPending || Boolean(vuelta?.enCurso);
  const porQueNo = congelada
    ? "Ya postulaste: lo postulado queda fijo"
    : !hayAnalisis
      ? "Primero analiza las bases"
      : (falta ?? (!precio ? "Escribe el precio" : undefined));

  const conError =
    vuelta !== null &&
    (vuelta.oferta === "error" ||
      vuelta.anexos.estado === "error" ||
      vuelta.propuesta.estado === "error");
  // Postulada antes de «Armar postulación» (19-10): no hay nada que armar;
  // una línea con el precio con que se llenaron los anexos.
  if (congelada && !vuelta) {
    const precio = precioDeLosAnexos(generaciones);
    return (
      <section className="bg-white rounded-lg shadow px-5 py-3">
        <p className="flex items-center gap-1.5 text-sm text-gray-600">
          <CheckCircle2
            size={14}
            className="shrink-0 text-green-600"
            aria-hidden="true"
          />
          {precio ? `Postulada con ${pesos(precio)} con IVA.` : "Postulada."}
        </p>
      </section>
    );
  }

  if (vuelta && !ocupado && !conError && !abierta) {
    const armadaEl = Math.max(
      ...[
        oferta?.terminado_en,
        vuelta.anexos.generacion?.terminado_en,
        vuelta.propuesta.generacion?.terminado_en,
      ].map((t) => (t ? Date.parse(t) : 0)),
    );
    const elegida = experiencia?.trabajo?.resultado;
    const contratos =
      experiencia?.piden && elegida?.confirmada
        ? elegida.elegidas.filter((e) => e.con_respaldo).length
        : null;
    return (
      <section className="bg-white rounded-lg shadow px-5 py-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p className="flex items-center gap-1.5 text-sm text-gray-600">
            <CheckCircle2
              size={14}
              className="shrink-0 text-green-600"
              aria-hidden="true"
            />
            <span>
              Armada
              {armadaEl > 0
                ? ` el ${formatMomento(new Date(armadaEl), "diaHora")}`
                : ""}{" "}
              · {pesos(vuelta.total)} con IVA
              {contratos !== null &&
                ` · experiencia: ${contratos} ${contratos === 1 ? "contrato" : "contratos"}`}
            </span>
          </p>
          {!congelada && (
            <button
              type="button"
              onClick={() => setAbierta(true)}
              className="text-sm font-semibold text-blue-600 hover:text-blue-800"
            >
              Volver a armar
            </button>
          )}
        </div>
        {[
          ...vuelta.avisos,
          ...(avisoExperiencia ? [avisoExperiencia] : []),
        ].map((aviso) => (
          <p
            key={aviso}
            className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900"
          >
            {aviso}
          </p>
        ))}
      </section>
    );
  }

  return (
    <section className="bg-white rounded-lg shadow p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
            <Sparkles size={15} /> Armar postulación
          </h2>
          <p className="text-xs text-gray-500">
            Pones el precio y la IA arma todo con tu catálogo. Sale{" "}
            <b>sin firma</b> a «Tus documentos»: revísalo y recién ahí fírmalo.
            Al volver a armar, <b>lo firmado se queda</b>.
          </p>
        </div>
        {abierta && !ocupado && (
          <button
            type="button"
            onClick={() => setAbierta(false)}
            className="shrink-0 text-sm text-gray-500 hover:text-gray-800"
          >
            Cerrar
          </button>
        )}
      </div>

      {falta && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
          {falta}{" "}
          <Link
            to="/oportunidades"
            onClick={() => {
              try {
                sessionStorage.setItem(
                  "op.pestana",
                  JSON.stringify({ p: "empresa" }),
                );
              } catch {
                /* sin memoria de pestaña: abre en la bandeja */
              }
            }}
            className="font-semibold underline"
          >
            Ir a «Mi empresa»
          </Link>
        </p>
      )}
      {!hayAnalisis && (
        <p className="text-sm text-gray-600">
          Primero analiza las bases («Bases y criterios»): la postulación sale
          de lo que piden.
        </p>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-56">
          <label
            htmlFor="precio-de-la-postulacion"
            className="block text-xs font-semibold text-gray-700"
          >
            Precio total, con IVA
          </label>
          <NumberInput
            id="precio-de-la-postulacion"
            value={precio}
            onChange={setPrecio}
            min={1}
            currency
            placeholder="Ej: 11.900.000"
            disabled={ocupado || congelada}
          />
        </div>
        <button
          type="button"
          onClick={() => precio && armar.mutate(precio)}
          disabled={ocupado || Boolean(porQueNo)}
          title={porQueNo}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {ocupado ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Sparkles size={14} />
          )}
          {ocupado
            ? "Armando la postulación…"
            : vuelta
              ? "Volver a armar"
              : "Armar postulación"}
        </button>
      </div>
      {desglose && (
        <p className="text-xs text-gray-500">
          Neto {pesos(desglose.neto)} + IVA {pesos(desglose.iva)}. El neto y el
          IVA los calcula Eventia: la IA nunca pone un precio.
        </p>
      )}

      {ocupado && vuelta && (
        <p className="flex items-center gap-2 text-sm text-gray-600">
          <Loader2 size={14} className="animate-spin" /> Armando tu postulación…
          suele tardar entre 3 y 8 minutos. Lo que va saliendo aparece en «Tus
          documentos».
        </p>
      )}
      {!ocupado && vuelta?.oferta === "error" && (
        <p className="text-sm text-red-600">
          {oferta?.error ?? "No se pudo armar la oferta."} Vuelve a armar.
        </p>
      )}
      {!ocupado &&
        vuelta &&
        (
          [
            ["anexos", "Los anexos", reintentarAnexos],
            ["propuesta", "La propuesta técnica", reintentarPropuesta],
          ] as const
        ).map(([tipo, nombre, reintentar]) =>
          vuelta[tipo].estado === "error" ? (
            <div key={tipo} className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-red-600">
                {nombre}:{" "}
                {sinSuNombre(
                  vuelta[tipo].problema ??
                    vuelta[tipo].generacion?.error ??
                    "no resultó.",
                  nombre,
                )}
              </p>
              <button
                type="button"
                onClick={() => reintentar.mutate()}
                disabled={reintentar.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-50"
              >
                {reintentar.isPending && (
                  <Loader2 size={14} className="animate-spin" />
                )}
                Reintentar
              </button>
            </div>
          ) : null,
        )}
      {[
        ...(vuelta?.avisos ?? []),
        ...(avisoExperiencia ? [avisoExperiencia] : []),
      ].map((aviso) => (
        <p
          key={aviso}
          className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-sm text-amber-900"
        >
          {aviso}
        </p>
      ))}
    </section>
  );
}

/** El problema ya viene con el nombre del paso («Los anexos: …»): no se
 *  repite (27-10, salía «Los anexos: Los anexos: …»). */
const sinSuNombre = (texto: string, nombre: string): string =>
  texto.startsWith(`${nombre}: `) ? texto.slice(nombre.length + 2) : texto;
