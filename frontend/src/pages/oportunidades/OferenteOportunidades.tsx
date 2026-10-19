import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Building2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "../../components/toast/Toast";
import {
  getOferente,
  guardarOferente,
  type CamposDelOferente,
} from "../../services/oportunidades.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { hoyEnChile } from "../../utils/dates";
import DescripcionDeLaEmpresa from "./DescripcionDeLaEmpresa";
import DocumentosDeEmpresa from "./DocumentosDeEmpresa";
import FirmaDelOferente from "./FirmaDelOferente";
import {
  estadoDeVencimiento,
  etiquetaDeDocumento,
} from "./oportunidades.utils";

// MI EMPRESA (doc 17, sprint 3, paso 2; §5.5; migración 126). Felipe,
// 17-10: "el rellenado de documentos debe tener primero una forma de meter
// la información de la empresa, la firma (una foto de la firma)". Los
// datos con que la empresa se presenta a una licitación, la firma y la
// carpeta de documentos. La IA los usa para llenar anexos y validar
// documentos (pasos 3 y 4). El nombre y los datos bancarios viven en
// Configuración de empresa: aquí solo se muestran.

type Campo = keyof CamposDelOferente;

const CAMPOS: ReadonlyArray<{
  campo: Campo;
  etiqueta: string;
  ayuda?: string;
  largo?: boolean;
}> = [
  { campo: "razon_social", etiqueta: "Razón social" },
  { campo: "rut", etiqueta: "RUT de la empresa", ayuda: "12.345.678-9" },
  { campo: "giro", etiqueta: "Giro" },
  { campo: "direccion", etiqueta: "Dirección" },
  { campo: "comuna", etiqueta: "Comuna" },
  { campo: "region", etiqueta: "Región" },
  { campo: "telefono", etiqueta: "Teléfono" },
  { campo: "correo", etiqueta: "Correo para licitaciones" },
  { campo: "representante_nombre", etiqueta: "Representante legal" },
  { campo: "representante_rut", etiqueta: "RUT del representante" },
  { campo: "representante_cargo", etiqueta: "Cargo del representante" },
  {
    campo: "experiencia",
    etiqueta: "Experiencia destacada",
    ayuda:
      "Eventos parecidos que han hecho: para quién, cuándo, cuántas personas. La IA la usa en la propuesta y en el anexo de experiencia.",
    largo: true,
  },
  {
    campo: "instalaciones",
    etiqueta: "Instalaciones",
    ayuda: "Salones, capacidades, alojamiento, estacionamiento, accesibilidad.",
    largo: true,
  },
];

const formularioDe = (
  o: CamposDelOferente | undefined,
): Record<Campo, string> =>
  Object.fromEntries(
    CAMPOS.map(({ campo }) => [campo, o?.[campo] ?? ""]),
  ) as Record<Campo, string>;

export default function OferenteOportunidades() {
  const qc = useQueryClient();
  const { data, isPending, isError } = useQuery({
    queryKey: ["oportunidades", "oferente"],
    queryFn: getOferente,
  });
  const [form, setForm] = useState<Record<Campo, string>>(() =>
    formularioDe(undefined),
  );
  useEffect(() => setForm(formularioDe(data?.oferente)), [data?.oferente]);

  const original = useMemo(
    () => formularioDe(data?.oferente),
    [data?.oferente],
  );
  const cambios = CAMPOS.filter(({ campo }) => form[campo] !== original[campo]);

  const guardar = useMutation({
    mutationFn: () =>
      guardarOferente(
        Object.fromEntries(cambios.map(({ campo }) => [campo, form[campo]])),
      ),
    onSuccess: (vista) => {
      qc.setQueryData(["oportunidades", "oferente"], vista);
      toast.success("Datos guardados.");
    },
    onError: (e) => toast.error(humanizeApiError(e, "No se pudo guardar.")),
  });

  if (isPending) {
    return <p className="py-6 text-center text-sm text-gray-500">Cargando…</p>;
  }
  if (isError || !data) {
    return (
      <p className="py-6 text-center text-sm text-red-600">
        No se pudieron cargar los datos de la empresa.
      </p>
    );
  }

  const hoy = hoyEnChile();
  const porAvisar = data.documentos
    .map((d) => ({ d, estado: estadoDeVencimiento(d.vence, hoy) }))
    .filter(
      ({ estado }) => estado.tono === "pronto" || estado.tono === "vencido",
    );
  const banco = data.empresa.banco;

  return (
    <div className="space-y-4">
      {porAvisar.length > 0 && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 space-y-1">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-800">
            <AlertTriangle size={14} /> Documentos por renovar
          </p>
          <ul className="list-disc pl-5 text-sm text-amber-900 space-y-0.5">
            {porAvisar.map(({ d, estado }) => (
              <li key={d.id}>
                {etiquetaDeDocumento(d.tipo)}: {estado.texto.toLowerCase()}
              </li>
            ))}
          </ul>
        </div>
      )}

      <section className="bg-white rounded-lg shadow p-5 space-y-4">
        <div className="space-y-0.5">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
            <Building2 size={15} /> Datos como oferente
          </h2>
          <p className="text-xs text-gray-500">
            Con estos datos la IA llena los anexos y arma la propuesta. Solo los
            ven los administradores.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {CAMPOS.filter((c) => !c.largo).map(({ campo, etiqueta, ayuda }) => (
            <label key={campo} className="block">
              <span className="block text-xs text-gray-500 mb-1">
                {etiqueta}
              </span>
              <input
                type="text"
                value={form[campo]}
                placeholder={ayuda}
                onChange={(e) =>
                  setForm((f) => ({ ...f, [campo]: e.target.value }))
                }
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
          ))}
        </div>
        {CAMPOS.filter((c) => c.largo).map(({ campo, etiqueta, ayuda }) => (
          <label key={campo} className="block">
            <span className="block text-xs text-gray-500 mb-1">{etiqueta}</span>
            <textarea
              value={form[campo]}
              rows={4}
              maxLength={5000}
              placeholder={ayuda}
              onChange={(e) =>
                setForm((f) => ({ ...f, [campo]: e.target.value }))
              }
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
        ))}

        <div className="p-3 rounded-lg bg-gray-50 text-xs text-gray-600 space-y-0.5">
          <p>
            <span className="font-semibold">Nombre de fantasía:</span>{" "}
            {data.empresa.nombre ?? "—"}
          </p>
          <p>
            <span className="font-semibold">Datos bancarios:</span>{" "}
            {banco
              ? [
                  banco.banco,
                  banco.tipo_cuenta && `cuenta ${banco.tipo_cuenta}`,
                  banco.numero && `N° ${banco.numero}`,
                  banco.titular,
                  banco.rut,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "sin datos"}
          </p>
          <p className="text-gray-400">
            Se cambian en Configuración de empresa.
          </p>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => guardar.mutate()}
            disabled={cambios.length === 0 || guardar.isPending}
            className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {guardar.isPending ? "Guardando…" : "Guardar datos"}
          </button>
        </div>
      </section>

      <FirmaDelOferente
        ruta={data.oferente.firma_ruta}
        subidaEn={data.oferente.firma_subida_en}
      />

      <DocumentosDeEmpresa documentos={data.documentos} />
      <DescripcionDeLaEmpresa />
    </div>
  );
}
