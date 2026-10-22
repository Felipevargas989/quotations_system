import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { NumberInput } from "../../components/inputs";
import { toast } from "../../components/toast/Toast";
import {
  crearPropuestaTecnica,
  generarAnexos,
  getAdjuntos,
  getAnalisis,
  getOferente,
  type Generacion,
  type GeneracionesDeOportunidad,
  type TipoDeGeneracion,
} from "../../services/oportunidades.service";
import {
  armarPostulacion,
  getOfertaDeLaPostulacion,
} from "../../services/postulacion.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { formatCurrency } from "../../utils/currencies";
import EstadoDeGeneracion from "./EstadoDeGeneracion";
import FormulariosDelAnalisis from "./FormulariosDelAnalisis";
import {
  caminoDelFormulario,
  faltaEnMiEmpresa,
  seLlena,
} from "./formulariosDelComprador";
import { desgloseDeOferta } from "./oportunidades.utils";
import { claveDeGeneraciones, useGeneraciones } from "./useGeneraciones";
import {
  claveDeLaOferta,
  type Paso,
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

const pesos = (n: number) => formatCurrency(n, "CLP");

function PasoDeLaPostulacion({
  numero,
  titulo,
  paso,
  tipo,
  reintentar,
  reintentando,
}: {
  readonly numero: number;
  readonly titulo: string;
  readonly paso: Paso;
  readonly tipo: TipoDeGeneracion;
  readonly reintentar: () => void;
  readonly reintentando: boolean;
}) {
  return (
    <li className="rounded-lg border border-gray-200 p-3 space-y-2">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
        {paso.estado === "listo" && (
          <CheckCircle2 size={14} className="text-green-600" />
        )}
        {numero}. {titulo}
      </p>
      {paso.estado === "no_va" && (
        <p className="text-sm text-gray-600">
          No va aparte: el detalle va en el anexo de calidad de la oferta.
        </p>
      )}
      {paso.estado === "espera" && (
        <p className="flex items-center gap-2 text-sm text-gray-600">
          <Loader2 size={14} className="animate-spin" /> Por partir…
        </p>
      )}
      <EstadoDeGeneracion tipo={tipo} generacion={paso.generacion} />
      {paso.problema && <p className="text-sm text-red-600">{paso.problema}</p>}
      {paso.estado === "error" && (
        <button
          type="button"
          onClick={reintentar}
          disabled={reintentando}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-50"
        >
          {reintentando && <Loader2 size={14} className="animate-spin" />}
          Reintentar
        </button>
      )}
    </li>
  );
}

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
  const { data: bases = [] } = useQuery({
    queryKey: ["oportunidades", "adjuntos", oportunidadId, "bases"],
    queryFn: () => getAdjuntos(oportunidadId, "bases"),
  });
  // Si falta la razón social o el RUT, se dice antes de apretar.
  const { data: miEmpresa } = useQuery({
    queryKey: ["oportunidades", "oferente"],
    queryFn: getOferente,
  });
  const falta = faltaEnMiEmpresa(miEmpresa?.oferente);
  const hayAnalisis = analisis?.estado === "listo";
  const delAnalisis = hayAnalisis ? analisis.resultado?.formularios : undefined;
  const seLlenan = bases.filter(
    (a) => caminoDelFormulario(a.nombre) && seLlena(a.nombre, delAnalisis),
  );

  const vuelta = vueltaDeLaPostulacion(oferta, generaciones);
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

  return (
    <section className="bg-white rounded-lg shadow p-5 space-y-4">
      <div className="space-y-0.5">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <Sparkles size={15} /> Armar postulación
        </h2>
        <p className="text-xs text-gray-500">
          Pones el precio y la IA arma todo con tu catálogo: qué ofreces, los
          anexos del comprador (la oferta económica con ese precio) y, si las
          bases no traen un formulario técnico (una compra ágil, por ejemplo),
          la propuesta técnica valorizada: el detalle y al final el neto, el IVA
          y el total. Todo sale <b>sin firma</b> a «Mi postulación»: revísalo y
          recién ahí fírmalo. Al volver a armar, <b>lo firmado se queda</b> y se
          rehace solo lo demás, que reemplaza a los borradores de antes.
        </p>
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
      {delAnalisis && delAnalisis.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs font-semibold text-gray-600">
            Los formularios que se llenan ({seLlenan.length}{" "}
            {seLlenan.length === 1 ? "archivo" : "archivos"})
          </summary>
          <div className="mt-2">
            <FormulariosDelAnalisis formularios={delAnalisis} />
          </div>
        </details>
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

      {vuelta && (
        <ol className="space-y-3">
          <li className="rounded-lg border border-gray-200 p-3 space-y-1">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
              {vuelta.oferta === "listo" && (
                <CheckCircle2 size={14} className="text-green-600" />
              )}
              1. Qué ofreces
            </p>
            {vuelta.oferta === "trabajando" && (
              <p className="flex items-center gap-2 text-sm text-gray-600">
                <Loader2 size={14} className="animate-spin" /> La IA está
                armando la oferta con tu catálogo… suele tardar entre 2 y 5
                minutos.
              </p>
            )}
            {vuelta.oferta === "listo" && (
              <p className="text-sm text-gray-600">
                Lista: el detalle está abajo, en «Qué ofreces».
              </p>
            )}
            {vuelta.oferta === "error" && (
              <p className="text-sm text-red-600">
                {oferta?.error ?? "No se pudo armar la oferta."} Vuelve a armar.
              </p>
            )}
          </li>
          <PasoDeLaPostulacion
            numero={2}
            titulo="Anexos del comprador"
            paso={vuelta.anexos}
            tipo="anexos"
            reintentar={() => reintentarAnexos.mutate()}
            reintentando={reintentarAnexos.isPending}
          />
          <PasoDeLaPostulacion
            numero={3}
            titulo="Propuesta técnica valorizada"
            paso={vuelta.propuesta}
            tipo="propuesta"
            reintentar={() => reintentarPropuesta.mutate()}
            reintentando={reintentarPropuesta.isPending}
          />
          {vuelta.avisos.map((aviso) => (
            <li
              key={aviso}
              className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
            >
              {aviso}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
