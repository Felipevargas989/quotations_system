import { useEffect, useMemo, useState } from "react";
import { Info, Lock } from "lucide-react";
import RutInput from "../../components/inputs/RutInput";
import { HoraInput } from "../../components/inputs";
import SelectWithSearch from "../../components/selects/SelectWithSearch";
import type { SelectOption } from "../../components/selects/types";
import type { Cargo, Persona, PersonaFormData } from "../../types/people.types";
import {
  BANCOS,
  CODIGO_BANCOESTADO,
  TIPOS_DE_CUENTA,
  TITULO_GRUPO,
  type TipoCuenta,
} from "../../utils/bancos";
import {
  ESTADOS_PERSONA,
  TIPOS_PERSONA,
  chipEstadoPersona,
  etiquetaEstadoPersona,
  etiquetaTipoPersona,
  explicacionEstadoPersona,
  explicacionTipoPersona,
  puntoEstadoPersona,
  type EstadoPersona,
  type TipoPersona,
} from "../../utils/estadoPersona";
import { cuentaRutDesde, rutEsValido } from "../../utils/rut";
import {
  PHONE_PLACEHOLDER,
  formatPhone,
  normalizePhone,
  phoneProblem,
} from "../../utils/phone";

// LA FICHA DE LA PERSONA
//
// El orden de los campos NO es el que Felipe propuso al principio (banco,
// tipo, número, RUT): va el RUT ANTES, porque si elige CuentaRUT de
// BancoEstado el número de cuenta ES el RUT sin el dígito verificador y
// el sistema puede llenarlo solo. Poner el banco primero obligaría a
// volver atrás.

interface Props {
  readonly persona?: Persona | null;
  readonly cargos: readonly Cargo[];
  readonly guardando: boolean;
  /** Mensaje del servidor, ej: "Ese RUT ya está cargado en Camila". */
  readonly errorServidor?: string | null;
  readonly onGuardar: (datos: PersonaFormData) => void;
  readonly onCancelar: () => void;
}

const vacia: PersonaFormData = {
  name: "",
  rut: "",
  phone: "",
  email: "",
  bank_code: null,
  account_type: null,
  account_number: "",
  default_role_id: null,
  default_kind: "freelance",
  default_starts_at: null,
  default_ends_at: null,
  default_break_minutes: null,
  days_off: null,
  status: "activa",
  blocked_reason: "",
  notes: "",
};

export default function PersonaForm({
  persona,
  cargos,
  guardando,
  errorServidor = null,
  onGuardar,
  onCancelar,
}: Props) {
  const [datos, setDatos] = useState<PersonaFormData>(vacia);
  const [rutOk, setRutOk] = useState(true);

  useEffect(() => {
    if (!persona) {
      setDatos(vacia);
      setRutOk(true);
      return;
    }
    setDatos({
      name: persona.name,
      rut: persona.rut ?? "",
      phone: persona.phone ?? "",
      email: persona.email ?? "",
      bank_code: persona.bank_code,
      account_type: persona.account_type,
      account_number: persona.account_number ?? "",
      default_role_id: persona.default_role_id,
      default_kind: persona.default_kind,
      default_starts_at: persona.default_starts_at?.slice(0, 5) ?? null,
      default_ends_at: persona.default_ends_at?.slice(0, 5) ?? null,
      default_break_minutes: persona.default_break_minutes ?? null,
      days_off: persona.days_off ?? null,
      status: persona.status,
      blocked_reason: persona.blocked_reason ?? "",
      notes: persona.notes ?? "",
    });
    setRutOk(!persona.rut || rutEsValido(persona.rut));
  }, [persona]);

  const cambiar = (parche: Partial<PersonaFormData>) =>
    setDatos((antes) => ({ ...antes, ...parche }));

  // ---- La CuentaRUT se llena sola ----
  // Es de BancoEstado y de nadie más, y su número es el RUT sin el
  // dígito verificador. Si se puede calcular, no se puede escribir mal.
  const esCuentaRut = datos.account_type === "cuenta_rut";
  const numeroCuentaRut = esCuentaRut ? cuentaRutDesde(datos.rut || "") : null;

  useEffect(() => {
    if (!esCuentaRut) return;
    cambiar({
      bank_code: CODIGO_BANCOESTADO,
      account_number: numeroCuentaRut ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esCuentaRut, numeroCuentaRut]);

  const opcionesBanco: SelectOption[] = useMemo(
    () =>
      BANCOS.map((b) => ({
        value: b.codigo,
        label: b.nombre,
        group: TITULO_GRUPO[b.grupo],
        hint: b.nota,
      })),
    [],
  );

  const opcionesTipoCuenta: SelectOption[] = useMemo(
    () =>
      TIPOS_DE_CUENTA.map((t) => ({
        value: t.valor,
        label: t.etiqueta,
        hint: t.nota,
      })),
    [],
  );

  const opcionesCargo: SelectOption[] = useMemo(
    () => cargos.map((c) => ({ value: String(c.id), label: c.name })),
    [cargos],
  );

  const opcionesTipo: SelectOption[] = TIPOS_PERSONA.map((t) => ({
    value: t,
    label: etiquetaTipoPersona(t),
    hint: explicacionTipoPersona(t),
  }));

  const opcionesEstado: SelectOption[] = ESTADOS_PERSONA.map((e) => ({
    value: e,
    label: etiquetaEstadoPersona(e),
    hint: explicacionEstadoPersona(e),
    dotClass: puntoEstadoPersona(e),
  }));

  // El portero del teléfono es de la casa: pilla correos metidos en el
  // campo, letras y largos imposibles.
  const problemaTelefono = phoneProblem(datos.phone || "");

  const bloqueada = datos.status === "bloqueada";
  const faltaMotivo = bloqueada && !(datos.blocked_reason || "").trim();
  // La CuentaRUT ES el RUT sin el dígito: sin RUT no hay qué guardar. El
  // 15-08 este caso llegaba hasta el servidor y volvía como error; el
  // formulario debe frenarlo antes y explicarlo al lado del campo.
  const cuentaRutSinRut = esCuentaRut && !numeroCuentaRut;
  const puedeGuardar =
    !!datos.name.trim() &&
    rutOk &&
    !faltaMotivo &&
    !problemaTelefono &&
    !cuentaRutSinRut &&
    !guardando;

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!puedeGuardar) return;
    onGuardar({
      ...datos,
      name: datos.name.trim(),
      rut: datos.rut || null,
      phone: normalizePhone(datos.phone || "") || null,
      email: datos.email || null,
      account_number: datos.account_number || null,
      blocked_reason: bloqueada ? datos.blocked_reason : null,
      notes: datos.notes || null,
    });
  };

  const etiqueta = "block text-sm font-medium text-gray-700 mb-1";
  const caja =
    "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent";

  return (
    <form onSubmit={enviar} className="space-y-5">
      {/* ---------- Quién es ---------- */}
      <div>
        <label htmlFor="p-nombre" className={etiqueta}>
          Nombre completo <span className="text-red-500">*</span>
        </label>
        <input
          id="p-nombre"
          type="text"
          value={datos.name}
          onChange={(e) => cambiar({ name: e.target.value })}
          className={caja}
          placeholder="Como aparece en su cédula"
          autoFocus
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="p-rut" className={etiqueta}>
            RUT
          </label>
          <RutInput
            id="p-rut"
            value={datos.rut || ""}
            onChange={(rut, valido) => {
              cambiar({ rut });
              setRutOk(!rut || valido);
            }}
            errorExterno={errorServidor}
          />
        </div>
        <div>
          <label htmlFor="p-tel" className={etiqueta}>
            Teléfono
          </label>
          <input
            id="p-tel"
            type="tel"
            value={datos.phone || ""}
            onChange={(e) => cambiar({ phone: e.target.value })}
            // Se separa al salir del campo, igual que en Clientes. Mientras
            // se escribe no se toca: un formateo en vivo pelea con quien
            // teclea y el teléfono no lo necesita.
            onBlur={() => cambiar({ phone: formatPhone(datos.phone || "") })}
            className={`${caja} ${problemaTelefono ? "border-red-500" : ""}`}
            placeholder={PHONE_PLACEHOLDER}
          />
          {problemaTelefono && (
            <p className="text-red-500 text-sm mt-1">{problemaTelefono}</p>
          )}
        </div>
      </div>

      {/* ---------- Cómo se le paga ---------- */}
      <fieldset className="border-t border-gray-200 pt-4">
        <legend className="text-sm font-semibold text-gray-900 mb-3">
          Datos para transferirle
        </legend>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={etiqueta}>Tipo de cuenta</label>
            <SelectWithSearch
              options={opcionesTipoCuenta}
              value={datos.account_type ?? ""}
              onChange={(v) =>
                cambiar({ account_type: (v || null) as TipoCuenta | null })
              }
              placeholder="Elegir"
              mostrarConteo={false}
            />
          </div>

          <div>
            <label className={etiqueta}>
              Banco
              {esCuentaRut && (
                <span className="ml-2 text-xs text-gray-500 font-normal">
                  <Lock className="inline w-3 h-3 -mt-0.5" /> la CuentaRUT es de
                  BancoEstado
                </span>
              )}
            </label>
            <SelectWithSearch
              options={opcionesBanco}
              value={datos.bank_code ?? ""}
              onChange={(v) => cambiar({ bank_code: v || null })}
              placeholder="Elegir banco"
              searchPlaceholder="Buscar banco…"
              disabled={esCuentaRut}
            />
          </div>
        </div>

        <div className="mt-4">
          <label htmlFor="p-cuenta" className={etiqueta}>
            Número de cuenta
          </label>
          <input
            id="p-cuenta"
            type="text"
            inputMode="numeric"
            value={datos.account_number || ""}
            // Solo dígitos, y guardado como TEXTO: hay cuentas chilenas
            // reales que parten en 0051 y como número se perderían los
            // ceros. Si pegan puntos o guiones, se sacan solos.
            onChange={(e) =>
              cambiar({ account_number: e.target.value.replace(/[^0-9]/g, "") })
            }
            className={`${caja} ${esCuentaRut ? "bg-gray-100 text-gray-600" : ""}`}
            placeholder="Solo números, sin puntos"
            readOnly={esCuentaRut}
          />
          {esCuentaRut ? (
            <p
              className={`text-xs mt-1 flex items-start gap-1 ${
                numeroCuentaRut ? "text-gray-500" : "text-amber-700 font-medium"
              }`}
            >
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              {numeroCuentaRut
                ? "Se llenó solo: la CuentaRUT es el RUT sin el último dígito."
                : "La CuentaRUT necesita el RUT primero: escríbelo arriba, o deja el tipo de cuenta vacío y complétalo después."}
            </p>
          ) : (
            <p className="text-xs text-gray-500 mt-1">
              Si empieza con ceros, escríbelos: se guardan tal cual.
            </p>
          )}
        </div>
      </fieldset>

      {/* ---------- Cómo trabaja ---------- */}
      <fieldset className="border-t border-gray-200 pt-4">
        <legend className="text-sm font-semibold text-gray-900 mb-3">
          Cómo trabaja
        </legend>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={etiqueta}>Cargo habitual</label>
            <SelectWithSearch
              options={opcionesCargo}
              value={
                datos.default_role_id ? String(datos.default_role_id) : ""
              }
              onChange={(v) =>
                cambiar({ default_role_id: v ? Number(v) : null })
              }
              placeholder="Elegir cargo"
              searchPlaceholder="Buscar cargo…"
              mostrarConteo={false}
            />
          </div>
          <div>
            <label className={etiqueta}>Tipo</label>
            <SelectWithSearch
              options={opcionesTipo}
              value={datos.default_kind ?? "freelance"}
              onChange={(v) => cambiar({ default_kind: v as TipoPersona })}
              mostrarConteo={false}
            />
          </div>
        </div>
        <div className="mt-4">
          <label className={etiqueta}>Horario habitual (opcional)</label>
          <div className="flex items-center gap-2 flex-wrap text-sm text-gray-600">
            <HoraInput
              value={datos.default_starts_at ?? null}
              onChange={(v) => cambiar({ default_starts_at: v })}
              aria-label="Entrada habitual"
            />
            <span className="text-gray-400">a</span>
            <HoraInput
              value={datos.default_ends_at ?? null}
              onChange={(v) => cambiar({ default_ends_at: v })}
              aria-label="Salida habitual"
            />
            <span className="text-gray-400">· colación</span>
            <div className="inline-flex rounded-md border border-gray-200 overflow-hidden text-xs">
              {[
                [0, "—"],
                [30, "30 m"],
                [60, "1 h"],
              ].map(([min, texto]) => (
                <button
                  key={min}
                  type="button"
                  onClick={() =>
                    cambiar({ default_break_minutes: Number(min) || null })
                  }
                  className={`px-2 py-1 ${
                    (datos.default_break_minutes || 0) === min
                      ? "bg-blue-600 text-white"
                      : "bg-white text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {texto}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Se usa al asignarla a un día. Vacío = el estándar de la casa:
            09:00 a 19:00 con 1 h de colación. El día siempre manda.
          </p>
        </div>
        {datos.default_kind === "planta" && (
          <div className="mt-4">
            <label className={etiqueta}>Días libres</label>
            <div className="flex gap-1">
              {["D", "L", "M", "M", "J", "V", "S"].map((letra, dia) => {
                const libre = (datos.days_off ?? []).includes(dia);
                return (
                  <button
                    key={dia}
                    type="button"
                    onClick={() => {
                      const actuales = datos.days_off ?? [];
                      cambiar({
                        days_off: libre
                          ? actuales.filter((x) => x !== dia)
                          : [...actuales, dia].sort(),
                      });
                    }}
                    aria-label={`${["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"][dia]} ${libre ? "libre" : "trabaja"}`}
                    className={`w-9 h-9 rounded-lg text-sm font-semibold transition-colors ${
                      libre
                        ? "bg-amber-100 text-amber-800 border border-amber-300"
                        : "bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100"
                    }`}
                  >
                    {letra}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Los marcados en ámbar son sus libres: la carga automática de
              planta se los salta.
            </p>
          </div>
        )}
        <p className="text-xs text-gray-500 mt-2">
          Son valores <strong>por defecto</strong>: el día que trabaje de otra
          cosa, se cambia en ese día y no acá.
        </p>
      </fieldset>

      {/* ---------- Si se puede llamar ---------- */}
      <fieldset className="border-t border-gray-200 pt-4">
        <legend className="text-sm font-semibold text-gray-900 mb-3">
          Situación
        </legend>
        <div className="sm:w-1/2">
          <SelectWithSearch
            options={opcionesEstado}
            value={datos.status ?? "activa"}
            onChange={(v) => cambiar({ status: v as EstadoPersona })}
            mostrarConteo={false}
          />
        </div>

        {bloqueada && (
          <div className="mt-3">
            <label htmlFor="p-motivo" className={etiqueta}>
              ¿Por qué se bloquea? <span className="text-red-500">*</span>
            </label>
            <input
              id="p-motivo"
              type="text"
              value={datos.blocked_reason || ""}
              onChange={(e) => cambiar({ blocked_reason: e.target.value })}
              className={`${caja} ${faltaMotivo ? "border-red-500" : ""}`}
              placeholder="No llegó a dos eventos seguidos"
            />
            <p className="text-xs text-gray-500 mt-1">
              En ocho meses nadie se acuerda del motivo. Bloquear no impide
              pagarle lo que ya trabajó.
            </p>
          </div>
        )}
      </fieldset>

      <div>
        <label htmlFor="p-notas" className={etiqueta}>
          Notas
        </label>
        <textarea
          id="p-notas"
          rows={2}
          value={datos.notes || ""}
          onChange={(e) => cambiar({ notes: e.target.value })}
          className={caja}
          placeholder="Solo fines de semana · no maneja · vive en Chillán…"
        />
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
        <button
          type="button"
          onClick={onCancelar}
          className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={!puedeGuardar}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {guardando ? "Guardando…" : persona ? "Guardar cambios" : "Crear"}
        </button>
      </div>

      {bloqueada && (
        <p className={`text-xs px-2 py-1 rounded ${chipEstadoPersona("bloqueada")}`}>
          Va a quedar bloqueada: no aparecerá cuando busques gente, pero sigue
          en la nómina si le debes algo.
        </p>
      )}
    </form>
  );
}
