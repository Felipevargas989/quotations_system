import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Send, Upload, Users } from "lucide-react";
import SelectWithSearch from "../../components/selects/SelectWithSearch";
import { toast } from "../../components/toast/Toast";
import {
  CampanaMarketing,
  crearCampanaMarketing,
  destinatariosDeCampana,
  enviarCampana,
  enviarPruebaCampana,
  getAudienciasMarketing,
  getCampanasMarketing,
  importarContactosMarketing,
} from "../../services/marketing.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { formatISOUTCDateToString } from "../../utils/dates";

/**
 * MÓDULO DE MARKETING, Fase 1 (doc 11, Felipe 25-08). Las reglas de
 * fierro viven en el backend; esta pantalla las hace visibles: baja
 * obligatoria (la pone la plantilla), regla de una vez, y SIN PRUEBA
 * NO HAY ENVÍO — el botón de envío real se abre recién con la prueba.
 */

/** CSV/pegado simple: correo[,nombre[,empresa]] por línea. */
const parsearContactos = (texto: string) =>
  texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [email, name, empresa] = l.split(/[;,\t]/).map((x) => x?.trim());
      return { email: email ?? "", name: name || undefined, empresa: empresa || undefined };
    })
    .filter((c) => c.email && !c.email.toLowerCase().startsWith("email"));

export default function MarketingPage() {
  const [pestana, setPestana] = useState<"campanas" | "audiencias">("campanas");
  const qc = useQueryClient();
  const { data: audiencias } = useQuery({
    queryKey: ["marketing", "audiencias"],
    queryFn: getAudienciasMarketing,
  });
  const { data: campanas = [] } = useQuery({
    queryKey: ["marketing", "campanas"],
    queryFn: getCampanasMarketing,
  });
  const refrescar = () =>
    void qc.invalidateQueries({ queryKey: ["marketing"] });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <Megaphone className="w-6 h-6 text-gray-700" />
        <h1 className="text-2xl font-bold text-gray-900">Marketing</h1>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Campañas por correo con tus propios datos. Todo correo lleva su
        link de baja; quien se baja no vuelve a recibir nada.
      </p>

      <div className="flex items-center gap-1 mb-4 border-b border-gray-200">
        {(
          [
            ["campanas", "Campañas"],
            ["audiencias", "Audiencias"],
          ] as const
        ).map(([id, texto]) => (
          <button
            key={id}
            onClick={() => setPestana(id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              pestana === id
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {texto}
          </button>
        ))}
      </div>

      {pestana === "audiencias" ? (
        <Audiencias audiencias={audiencias} onCambio={refrescar} />
      ) : (
        <Campanas
          campanas={campanas}
          audiencias={audiencias}
          onCambio={refrescar}
        />
      )}
    </div>
  );
}

function Audiencias({
  audiencias,
  onCambio,
}: {
  readonly audiencias?: {
    importadas: { audiencia: string; contactos: number }[];
    tipos: { tipo: string; total: number; conCorreo: number }[];
  };
  readonly onCambio: () => void;
}) {
  const [etiqueta, setEtiqueta] = useState("");
  const [texto, setTexto] = useState("");
  const contactos = useMemo(() => parsearContactos(texto), [texto]);

  const importar = useMutation({
    mutationFn: () =>
      importarContactosMarketing({ audiencia: etiqueta.trim(), contactos }),
    onSuccess: (r) => {
      toast.success(
        `${r.importados} contactos importados a "${etiqueta.trim()}"` +
          (r.invalidos.length
            ? ` · ${r.invalidos.length} correos inválidos quedaron fuera`
            : ""),
      );
      setTexto("");
      setEtiqueta("");
      onCambio();
    },
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <Users className="w-4 h-4 text-gray-500" /> Desde tu base (en vivo)
        </h2>
        <p className="text-xs text-gray-500 mt-0.5 mb-3">
          Tus clientes por tipo, siempre frescos — las campañas a
          "Clientes por tipo" se calculan al momento de enviar.
        </p>
        <ul className="divide-y divide-gray-100">
          {(audiencias?.tipos ?? []).map((t) => (
            <li
              key={t.tipo}
              className="flex items-center justify-between py-1.5 text-sm"
            >
              <span className="text-gray-900">{t.tipo}</span>
              <span className="tabular-nums text-gray-600">
                {t.conCorreo} con correo{" "}
                <span className="text-gray-400">de {t.total}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <Upload className="w-4 h-4 text-gray-500" /> Importar audiencia
        </h2>
        <p className="text-xs text-gray-500 mt-0.5 mb-3">
          Pega desde Excel: una línea por contacto —{" "}
          <span className="font-mono">correo, nombre, empresa</span> (nombre y
          empresa optativos). Re-importar la misma etiqueta no duplica.
        </p>
        <div className="space-y-2">
          <input
            value={etiqueta}
            onChange={(e) => setEtiqueta(e.target.value)}
            placeholder='Etiqueta de la audiencia (ej: "cabañas-2026")'
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={6}
            placeholder={"paola@empresa.cl, Paola Lagos, Colegio Alemán\njuan@otra.cl"}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 tabular-nums">
              {contactos.length} contactos detectados
            </span>
            <button
              type="button"
              onClick={() => importar.mutate()}
              disabled={
                !etiqueta.trim() || contactos.length === 0 || importar.isPending
              }
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40"
            >
              {importar.isPending ? "Importando…" : "Importar"}
            </button>
          </div>
        </div>
        {(audiencias?.importadas ?? []).length > 0 && (
          <ul className="divide-y divide-gray-100 mt-3 border-t border-gray-100 pt-1">
            {(audiencias?.importadas ?? []).map((a) => (
              <li
                key={a.audiencia}
                className="flex items-center justify-between py-1.5 text-sm"
              >
                <span className="text-gray-900">{a.audiencia}</span>
                <span className="tabular-nums text-gray-600">
                  {a.contactos} contactos
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Campanas({
  campanas,
  audiencias,
  onCambio,
}: {
  readonly campanas: CampanaMarketing[];
  readonly audiencias?: {
    importadas: { audiencia: string; contactos: number }[];
    tipos: { tipo: string; total: number; conCorreo: number }[];
  };
  readonly onCambio: () => void;
}) {
  const [creando, setCreando] = useState(false);
  return (
    <div className="space-y-4">
      {creando ? (
        <NuevaCampana
          audiencias={audiencias}
          onListo={() => {
            setCreando(false);
            onCambio();
          }}
          onCancelar={() => setCreando(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setCreando(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          + Nueva campaña
        </button>
      )}

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Historial</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Sin prueba a tu casilla no se abre el envío real. Una campaña
            jamás le llega dos veces al mismo correo.
          </p>
        </div>
        {campanas.length === 0 ? (
          <p className="text-sm text-gray-500 p-6 text-center">
            Todavía no hay campañas.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {campanas.map((c) => (
              <FilaCampana key={c.id} c={c} onCambio={onCambio} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function FilaCampana({
  c,
  onCambio,
}: {
  readonly c: CampanaMarketing;
  readonly onCambio: () => void;
}) {
  const [confirmando, setConfirmando] = useState<number | null>(null);
  const prueba = useMutation({
    mutationFn: () => enviarPruebaCampana(c.id),
    onSuccess: (r) => {
      toast.success(`Prueba enviada a ${r.enviada_a}. Revisa tu casilla.`);
      onCambio();
    },
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });
  const enviar = useMutation({
    mutationFn: () => enviarCampana(c.id),
    onSuccess: (r) => {
      toast.success(
        `Campaña enviada a ${r.enviados} destinatarios` +
          (r.fallidos ? ` · ${r.fallidos} fallidos` : ""),
      );
      setConfirmando(null);
      onCambio();
    },
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });
  const preguntar = async () => {
    try {
      const { destinatarios } = await destinatariosDeCampana(c.id);
      setConfirmando(destinatarios);
    } catch (e) {
      toast.error(humanizeApiError(e));
    }
  };

  return (
    <li className="px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="flex-1 min-w-0">
          <span className="block font-medium text-gray-900 truncate">
            {c.nombre}
          </span>
          <span className="block text-xs text-gray-500 truncate">
            {c.asunto} ·{" "}
            {c.audiencia_tipo === "importada"
              ? `audiencia "${c.audiencia_ref ?? ""}"`
              : `clientes: ${(c.tipos_cliente ?? []).join(", ")}`}
          </span>
        </span>
        {c.estado === "enviada" ? (
          <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 tabular-nums">
            enviada · {c.total_destinatarios ?? 0} correos ·{" "}
            {c.enviada_at ? formatISOUTCDateToString(c.enviada_at.slice(0, 10)) : ""}
          </span>
        ) : (
          <>
            <button
              type="button"
              onClick={() => prueba.mutate()}
              disabled={prueba.isPending}
              className="shrink-0 px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              {prueba.isPending
                ? "Enviando…"
                : c.prueba_enviada_at
                  ? "Prueba de nuevo"
                  : "Prueba a mi casilla"}
            </button>
            {confirmando !== null ? (
              <span className="shrink-0 flex items-center gap-1.5 text-xs">
                <span className="text-gray-700 font-medium tabular-nums">
                  ¿Enviar a {confirmando} destinatarios?
                </span>
                <button
                  type="button"
                  onClick={() => enviar.mutate()}
                  disabled={enviar.isPending || confirmando === 0}
                  className="px-2.5 py-1 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {enviar.isPending ? "Enviando…" : "Sí, enviar"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmando(null)}
                  className="px-2 py-1 text-gray-500 hover:bg-gray-100 rounded-lg"
                >
                  No
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => void preguntar()}
                disabled={!c.prueba_enviada_at}
                title={
                  c.prueba_enviada_at
                    ? undefined
                    : "Primero mándate la prueba: sin prueba no hay envío"
                }
                className="shrink-0 flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-gray-900 text-white hover:bg-black disabled:opacity-40"
              >
                <Send className="w-3 h-3" /> Enviar
              </button>
            )}
          </>
        )}
      </div>
    </li>
  );
}

function NuevaCampana({
  audiencias,
  onListo,
  onCancelar,
}: {
  readonly audiencias?: {
    importadas: { audiencia: string; contactos: number }[];
    tipos: { tipo: string; total: number; conCorreo: number }[];
  };
  readonly onListo: () => void;
  readonly onCancelar: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const [asunto, setAsunto] = useState("");
  const [titulo, setTitulo] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const [botonTexto, setBotonTexto] = useState("");
  const [botonUrl, setBotonUrl] = useState("");
  const [tipoAud, setTipoAud] = useState<"clientes" | "importada">("clientes");
  const [tipos, setTipos] = useState<Set<string>>(new Set());
  const [ref, setRef] = useState("");

  const crear = useMutation({
    mutationFn: () =>
      crearCampanaMarketing({
        nombre,
        asunto,
        titulo,
        cuerpo,
        boton_texto: botonTexto.trim() || undefined,
        boton_url: botonUrl.trim() || undefined,
        audiencia_tipo: tipoAud,
        audiencia_ref: tipoAud === "importada" ? ref : undefined,
        tipos_cliente: tipoAud === "clientes" ? [...tipos] : undefined,
      }),
    onSuccess: () => {
      toast.success(
        "Campaña guardada como borrador. Mándate la prueba antes de enviar.",
      );
      onListo();
    },
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });

  const lista =
    nombre.trim() &&
    asunto.trim() &&
    titulo.trim() &&
    cuerpo.trim() &&
    (tipoAud === "clientes" ? tipos.size > 0 : !!ref);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <h2 className="font-semibold text-gray-900">Nueva campaña</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre interno (ej: Paseos empresas 2026)"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <input
          value={asunto}
          onChange={(e) => setAsunto(e.target.value)}
          placeholder="Asunto del correo — sirve {nombre} y {empresa}"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>
      <input
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        placeholder="Título grande dentro del correo"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
      />
      <textarea
        value={cuerpo}
        onChange={(e) => setCuerpo(e.target.value)}
        rows={6}
        placeholder={"El cuerpo del correo. Párrafos separados por línea en blanco.\nSirve {nombre} y {empresa}."}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input
          value={botonTexto}
          onChange={(e) => setBotonTexto(e.target.value)}
          placeholder="Texto del botón (optativo)"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <input
          value={botonUrl}
          onChange={(e) => setBotonUrl(e.target.value)}
          placeholder="Enlace del botón (optativo)"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>

      <div className="pt-1">
        <p className="text-xs font-semibold uppercase text-gray-500 mb-1.5">
          Audiencia
        </p>
        <div className="flex items-center gap-3 mb-2 text-sm">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              checked={tipoAud === "clientes"}
              onChange={() => setTipoAud("clientes")}
            />
            Clientes por tipo (en vivo)
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              checked={tipoAud === "importada"}
              onChange={() => setTipoAud("importada")}
            />
            Audiencia importada
          </label>
        </div>
        {tipoAud === "clientes" ? (
          <div className="flex flex-wrap gap-1.5">
            {(audiencias?.tipos ?? []).map((t) => {
              const activo = tipos.has(t.tipo);
              return (
                <button
                  key={t.tipo}
                  type="button"
                  onClick={() => {
                    const s2 = new Set(tipos);
                    if (activo) s2.delete(t.tipo);
                    else s2.add(t.tipo);
                    setTipos(s2);
                  }}
                  className={`px-2.5 py-1 text-xs rounded-full border tabular-nums ${
                    activo
                      ? "bg-blue-50 text-blue-700 border-blue-300 font-medium"
                      : "text-gray-600 border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  {t.tipo} ({t.conCorreo})
                </button>
              );
            })}
          </div>
        ) : (
          <div className="max-w-sm">
            <SelectWithSearch
              options={(audiencias?.importadas ?? []).map((a) => ({
                value: a.audiencia,
                label: `${a.audiencia} (${String(a.contactos)})`,
              }))}
              value={ref}
              onChange={setRef}
              placeholder="Elegir audiencia importada…"
            />
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
        <button
          type="button"
          onClick={onCancelar}
          className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => crear.mutate()}
          disabled={!lista || crear.isPending}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40"
        >
          {crear.isPending ? "Guardando…" : "Guardar borrador"}
        </button>
      </div>
    </div>
  );
}
