import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, FileText } from "lucide-react";
import Modal from "../../components/Modal";
import RutInput from "../../components/inputs/RutInput";
import {
  aceptarConvenio,
  getConvenioPublico,
  type ConvenioPublico,
  type FormularioDeConvenio,
} from "../../services/convenios.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { estiloDelCirculoDeMarca } from "../../utils/circuloDeMarca";

// LA PÁGINA PÚBLICA DEL CONVENIO (doc 24 §B, 19-11-2026).
//
// Sin sesión: el enlace personal que llega por correo. El nombre, el logo y
// el color salen de la empresa dueña (Eventia se vende a otras empresas:
// nada escrito a mano). Del cliente solo viene la razón social. El texto
// completo del contrato se lee en una ventana; abajo, el formulario con lo
// que llena los huecos del contrato, la casilla y «Aceptar convenio».

type Estado =
  | { tipo: "cargando" }
  | { tipo: "invalido"; mensaje: string }
  | { tipo: "listo"; datos: ConvenioPublico }
  | { tipo: "aceptado"; firmado_el: string; vence_el: string };

const casilla =
  "w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent";

const VACIO: FormularioDeConvenio = {
  razon_social: "",
  rut_empresa: "",
  representante_nombre: "",
  representante_rut: "",
  representante_cargo: "",
  correo: "",
  domicilio: "",
  comuna: "",
  region: "",
  personeria_documento: "",
  personeria_fecha: "",
  personeria_notario: "",
  acepto: false,
};

function Campo({
  etiqueta,
  valor,
  onChange,
  tipo = "text",
  largo,
  opcional = false,
}: {
  readonly etiqueta: string;
  readonly valor: string;
  readonly onChange: (v: string) => void;
  readonly tipo?: string;
  readonly largo: number;
  readonly opcional?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-600">
        {etiqueta}
        {opcional && (
          <span className="font-normal text-gray-400"> (opcional)</span>
        )}
      </span>
      <input
        type={tipo}
        value={valor}
        maxLength={largo}
        onChange={(e) => onChange(e.target.value)}
        className={casilla}
      />
    </label>
  );
}

/** El texto del contrato con la marca mínima de la plantilla. */
function TextoDelConvenio({ texto }: { readonly texto: string }) {
  const parrafos = texto
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <div className="space-y-3 text-sm leading-relaxed text-gray-800 font-serif">
      {parrafos.map((p, i) => {
        if (p.startsWith("## "))
          return (
            <h3 key={i} className="pt-2 font-bold uppercase text-gray-900">
              {p.slice(3)}
            </h3>
          );
        if (p.startsWith("# "))
          return (
            <h2
              key={i}
              className="text-center font-bold uppercase text-gray-900"
            >
              {p.slice(2)}
            </h2>
          );
        if (p.startsWith("___"))
          return (
            <div
              key={i}
              className="whitespace-pre-line pt-4 text-xs text-gray-600"
            >
              {p.split("\n").slice(1).join("\n")}
            </div>
          );
        return (
          <p key={i} className="whitespace-pre-line text-justify">
            {p.startsWith("- ") ? `• ${p.slice(2)}` : p}
          </p>
        );
      })}
    </div>
  );
}

export default function ConvenioPublicoPage() {
  const { token = "" } = useParams();
  const [estado, setEstado] = useState<Estado>({ tipo: "cargando" });
  const [form, setForm] = useState<FormularioDeConvenio>(VACIO);
  const [rutEmpresaOk, setRutEmpresaOk] = useState(false);
  const [rutRepOk, setRutRepOk] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    getConvenioPublico(token)
      .then((datos) => {
        if (!vivo) return;
        setEstado({ tipo: "listo", datos });
        if (datos.estado === "pendiente") {
          setForm((f) => ({ ...f, razon_social: datos.razon_social }));
        }
      })
      .catch((e) => {
        if (vivo)
          setEstado({
            tipo: "invalido",
            mensaje: humanizeApiError(e, "Este enlace no es válido."),
          });
      });
    return () => {
      vivo = false;
    };
  }, [token]);

  const poner = (k: keyof FormularioDeConvenio) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const falta =
    !form.razon_social.trim() ||
    !rutEmpresaOk ||
    !form.representante_nombre.trim() ||
    !rutRepOk ||
    !form.representante_cargo.trim() ||
    !/^\S+@\S+\.\S+$/.test(form.correo.trim()) ||
    !form.domicilio.trim() ||
    !form.comuna.trim() ||
    !form.region.trim() ||
    !form.acepto;

  const aceptar = async () => {
    setError(null);
    setEnviando(true);
    try {
      const r = await aceptarConvenio(token, {
        ...form,
        personeria_documento: form.personeria_documento?.trim() || undefined,
        personeria_fecha: form.personeria_fecha?.trim() || undefined,
        personeria_notario: form.personeria_notario?.trim() || undefined,
      });
      setEstado({
        tipo: "aceptado",
        firmado_el: r.firmado_el,
        vence_el: r.vence_el,
      });
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError(humanizeApiError(e, "No se pudo registrar la aceptación."));
    } finally {
      setEnviando(false);
    }
  };

  if (estado.tipo === "cargando") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-gray-500">
        Cargando…
      </div>
    );
  }
  if (estado.tipo === "invalido") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow p-8 text-center">
          <p className="text-lg font-semibold text-gray-900">
            {estado.mensaje}
          </p>
          <p className="mt-2 text-sm text-gray-600">
            Revisa que hayas abierto el enlace completo del último correo.
          </p>
        </div>
      </div>
    );
  }

  const empresa = estado.tipo === "listo" ? estado.datos.empresa : null;
  const color = empresa?.color || "#134686";

  const cabecera = empresa && (
    <header className="flex items-center gap-3">
      <div
        className="w-12 h-12 shrink-0 flex items-center justify-center rounded-full font-bold overflow-hidden"
        style={estiloDelCirculoDeMarca(color, "#ffffff", !!empresa.logo)}
      >
        {empresa.logo ? (
          <img
            src={empresa.logo}
            alt=""
            className="w-full h-full object-contain"
          />
        ) : (
          empresa.nombre.slice(0, 2).toUpperCase()
        )}
      </div>
      <p className="text-sm font-semibold text-gray-700">{empresa.nombre}</p>
    </header>
  );

  if (estado.tipo === "aceptado") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow p-8 text-center space-y-3">
          <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-600" />
          <p className="text-lg font-semibold text-gray-900">
            ¡Convenio firmado!
          </p>
          <p className="text-sm text-gray-600">
            Quedó firmado el {estado.firmado_el} y rige hasta el{" "}
            {estado.vence_el}. Te enviamos una copia en PDF a tu correo.
          </p>
        </div>
      </div>
    );
  }

  const datos = estado.datos;
  if (datos.estado === "firmado") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow p-8 space-y-4">
          {cabecera}
          <div className="text-center space-y-2">
            <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-600" />
            <p className="text-lg font-semibold text-gray-900">
              Este convenio ya fue firmado
            </p>
            {datos.firmado_el && (
              <p className="text-sm text-gray-600">El {datos.firmado_el}.</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-5">
        {cabecera}
        <div className="bg-white rounded-xl shadow p-6 space-y-4">
          <h1 className="text-xl font-bold text-gray-900">
            {datos.titulo} con {datos.empresa.nombre}
          </h1>
          <p className="text-sm text-gray-600">
            Para las personas que trabajan en{" "}
            <strong className="text-gray-900">{datos.razon_social}</strong>. Sin
            costo; rige {datos.vigencia_anios} años desde la firma.
          </p>
          <ul className="space-y-2">
            {datos.beneficios.map((b) => (
              <li
                key={b.titulo}
                className="rounded-lg border-l-4 bg-emerald-50 px-3 py-2"
                style={{ borderColor: color }}
              >
                <p className="text-sm font-semibold text-gray-900">
                  {b.titulo}
                </p>
                {b.detalle && (
                  <p className="text-xs text-gray-600">{b.detalle}</p>
                )}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setLeyendo(true)}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:text-blue-900"
          >
            <FileText className="w-4 h-4" />
            Leer el convenio completo
          </button>
        </div>

        <div className="bg-white rounded-xl shadow p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">
            Datos para el convenio
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Campo
                etiqueta="Razón social"
                valor={form.razon_social}
                onChange={poner("razon_social")}
                largo={150}
              />
            </div>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">
                RUT de la empresa
              </span>
              <RutInput
                value={form.rut_empresa}
                onChange={(rut, ok) => {
                  setForm((f) => ({ ...f, rut_empresa: rut }));
                  setRutEmpresaOk(ok);
                }}
                obligatorio
                className={casilla}
              />
            </label>
            <Campo
              etiqueta="Correo"
              tipo="email"
              valor={form.correo}
              onChange={poner("correo")}
              largo={200}
            />
            <Campo
              etiqueta="Nombre del representante"
              valor={form.representante_nombre}
              onChange={poner("representante_nombre")}
              largo={120}
            />
            <label className="block">
              <span className="text-xs font-medium text-gray-600">
                RUT del representante
              </span>
              <RutInput
                value={form.representante_rut}
                onChange={(rut, ok) => {
                  setForm((f) => ({ ...f, representante_rut: rut }));
                  setRutRepOk(ok);
                }}
                obligatorio
                className={casilla}
              />
            </label>
            <Campo
              etiqueta="Cargo"
              valor={form.representante_cargo}
              onChange={poner("representante_cargo")}
              largo={80}
            />
            <Campo
              etiqueta="Domicilio"
              valor={form.domicilio}
              onChange={poner("domicilio")}
              largo={200}
            />
            <Campo
              etiqueta="Comuna"
              valor={form.comuna}
              onChange={poner("comuna")}
              largo={80}
            />
            <Campo
              etiqueta="Región"
              valor={form.region}
              onChange={poner("region")}
              largo={80}
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-600">
              Personería del representante{" "}
              <span className="font-normal text-gray-400">
                (opcional; si la dejas en blanco, queda una línea para
                completar)
              </span>
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Campo
                etiqueta="Consta en"
                valor={form.personeria_documento ?? ""}
                onChange={poner("personeria_documento")}
                largo={150}
                opcional
              />
              <Campo
                etiqueta="De fecha"
                valor={form.personeria_fecha ?? ""}
                onChange={poner("personeria_fecha")}
                largo={40}
                opcional
              />
              <Campo
                etiqueta="Ante el notario"
                valor={form.personeria_notario ?? ""}
                onChange={poner("personeria_notario")}
                largo={150}
                opcional
              />
            </div>
          </div>

          <label className="flex items-start gap-2 text-sm text-gray-800">
            <input
              type="checkbox"
              checked={form.acepto}
              onChange={(e) =>
                setForm((f) => ({ ...f, acepto: e.target.checked }))
              }
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
            />
            Leí el convenio y lo acepto en nombre de la empresa
          </label>

          {error && <p className="text-sm font-medium text-red-600">{error}</p>}

          <button
            type="button"
            disabled={falta || enviando}
            onClick={aceptar}
            className="w-full py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
            style={{ backgroundColor: color }}
          >
            {enviando ? "Registrando…" : "Aceptar convenio"}
          </button>
        </div>
      </div>

      {leyendo && (
        <Modal
          titulo={datos.titulo}
          ancho="max-w-3xl"
          onCerrar={() => setLeyendo(false)}
        >
          <TextoDelConvenio texto={datos.texto} />
        </Modal>
      )}
    </div>
  );
}
