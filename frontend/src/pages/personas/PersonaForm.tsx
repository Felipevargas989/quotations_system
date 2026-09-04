import { useEffect, useMemo, useState } from "react";
import { Check, Info, Lock, Pencil } from "lucide-react";
import RutInput from "../../components/inputs/RutInput";
import {
  HoraInput,
  SelectorColacion,
  formatoHoras,
  horasTrabajadas,
} from "../../components/inputs";
import SelectWithSearch from "../../components/selects/SelectWithSearch";
import type { SelectOption } from "../../components/selects/types";
import type {
  Cargo,
  HorarioSemanal,
  Persona,
  PersonaFormData,
} from "../../types/people.types";
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
  /** El estado se maneja en la cabecera de la ficha; acá solo el motivo. */
  readonly sinSelectorDeEstado?: boolean;
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
  weekly_schedule: null,
  status: "activa",
  blocked_reason: "",
  notes: "",
};

/** Deja escrito el horario de cada día que la persona trabaja: el suyo
 *  si lo tiene, y si no el único de su ficha o el estándar de la casa. */
const rellenarSemana = (persona: Persona): HorarioSemanal | null => {
  if (persona.default_kind !== "planta") {
    return persona.weekly_schedule ?? null;
  }
  const salida: HorarioSemanal = { ...(persona.weekly_schedule ?? {}) };
  for (const dia of [0, 1, 2, 3, 4, 5, 6]) {
    if (persona.days_off?.includes(dia)) {
      delete salida[String(dia)];
      continue;
    }
    const suyo = salida[String(dia)] ?? {};
    salida[String(dia)] = {
      in: suyo.in ?? persona.default_starts_at?.slice(0, 5) ?? "09:00",
      out: suyo.out ?? persona.default_ends_at?.slice(0, 5) ?? "19:00",
      break: suyo.break ?? persona.default_break_minutes ?? 60,
    };
  }
  return Object.keys(salida).length > 0 ? salida : null;
};

/** La rejilla de la jornada semanal: columnas FIJAS para que nada se
 *  mueva al escribir una hora, y para que el total caiga alineado bajo
 *  la columna de las horas. */
// Día · entrada · "a" · salida · "colación" · selector · horas.
// Los relojes son de ancho FIJO y el aire va al final: dejarlos crecer
// los estiraba hasta lo absurdo en la ficha (Felipe, 18-08: "se ve
// tosco"). La última columna toma lo que sobra, así las horas quedan
// separadas del borde y no pegadas.
const FILA =
  "grid grid-cols-[6.5rem_5rem_0.75rem_5rem_auto_auto_minmax(3rem,1fr)] items-center gap-2";

export default function PersonaForm({
  persona,
  cargos,
  guardando,
  errorServidor = null,
  onGuardar,
  onCancelar,
  sinSelectorDeEstado = false,
}: Props) {
  const [datos, setDatos] = useState<PersonaFormData>(vacia);
  const [rutOk, setRutOk] = useState(true);
  // Una ficha que ya existe se abre CERRADA; una persona nueva se abre
  // lista para escribir.
  const [datosBajoLlave, setDatosBajoLlave] = useState(!!persona);

  useEffect(() => {
    if (!persona) {
      setDatos(vacia);
      setRutOk(true);
      return;
    }
    setDatos({
      name: persona.name,
      rut: persona.rut ?? "",
      phone: formatPhone(persona.phone ?? ""),
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
      // EL HORARIO SIEMPRE A LA VISTA (15-08): los días que trabaja y
      // no tenían horario propio se rellenan con el que les toca —
      // antes quedaban en blanco y la fila mostraba "—" en las horas,
      // aunque el total sí los contaba.
      weekly_schedule: rellenarSemana(persona),
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

  // El total de la semana y cuántos días trabaja: se recalculan solos
  // con cada cambio de horario.
  const diasQueTrabaja = [0, 1, 2, 3, 4, 5, 6].filter(
    (d) => !(datos.days_off ?? []).includes(d),
  ).length;
  const horasDeLaSemana = [0, 1, 2, 3, 4, 5, 6].reduce((t, d) => {
    if ((datos.days_off ?? []).includes(d)) return t;
    const suyo = (datos.weekly_schedule ?? {})[String(d)] ?? {};
    return (
      t +
      (horasTrabajadas(
        suyo.in ?? datos.default_starts_at?.slice(0, 5) ?? "09:00",
        suyo.out ?? datos.default_ends_at?.slice(0, 5) ?? "19:00",
        suyo.break ?? datos.default_break_minutes ?? 60,
      ) ?? 0)
    );
  }, 0);

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
  // El motivo de bloqueo se escribe en la CABECERA de la ficha, junto
  // al estado (15-08): acá ya no hay campo, así que tampoco frena el
  // guardado.
  // La CuentaRUT ES el RUT sin el dígito: sin RUT no hay qué guardar. El
  // 15-08 este caso llegaba hasta el servidor y volvía como error; el
  // formulario debe frenarlo antes y explicarlo al lado del campo.
  const cuentaRutSinRut = esCuentaRut && !numeroCuentaRut;
  const puedeGuardar =
    !!datos.name.trim() &&
    rutOk &&
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
      {/* LOS DATOS DE LA PERSONA, BAJO LLAVE (Felipe, 15-08: "es un poco
          vulnerable que esto esté así siempre"). Una vez guardados se
          ven en gris y no se pueden tocar; el lápiz los abre. Cambiar un
          RUT o una cuenta por un clic al pasar manda la plata a otra
          persona. Lo de abajo —cómo trabaja, situación, notas— sigue
          siempre editable: eso cambia seguido. */}
      <fieldset
        disabled={datosBajoLlave}
        className={`space-y-5 rounded-lg transition-colors ${
          datosBajoLlave ? "opacity-70" : ""
        }`}
      >
        <legend className="w-full flex items-center justify-between mb-1">
          <span className="text-sm font-semibold text-gray-900">
            Quién es y cómo se le paga
          </span>
          {persona && (
            <button
              type="button"
              onClick={() => setDatosBajoLlave(!datosBajoLlave)}
              className={`p-1.5 rounded-lg ${
                datosBajoLlave
                  ? "text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                  : "text-blue-700 bg-blue-50"
              }`}
              aria-label={
                datosBajoLlave ? "Editar los datos" : "Dejar de editar"
              }
              title={datosBajoLlave ? "Editar los datos" : "Listo"}
            >
              {datosBajoLlave ? (
                <Pencil className="w-4 h-4" />
              ) : (
                <Check className="w-4 h-4" />
              )}
            </button>
          )}
        </legend>

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

      </fieldset>

      {/* ---------- La jornada: LA ÚNICA SECCIÓN SIEMPRE ABIERTA
           (Felipe, 15-08). Es lo que se ajusta seguido; el resto son
           datos que se llenan una vez. ---------- */}
      <fieldset className="border-t border-gray-200 pt-4">
        <legend className="text-sm font-semibold text-gray-900 mb-3">
          Jornada
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
        {datos.default_kind === "planta" && (
          <div className="mt-4">
            <label className={etiqueta}>Días que trabaja y a qué hora</label>
            {/* Se marcan los días LABORALES, no los libres (corrección
                de Felipe, 15-08: "es más intuitivo"). En la base igual
                se guardan los libres (days_off): acá solo se invierte
                la vista.

                Y cada día lleva SU horario (15-08): "distintos días
                llegan a distintas horas" — el sábado se entra a las 10
                y de lunes a viernes a las 8. Vacío = usa el horario
                habitual de más arriba. */}
            <div className="space-y-1">
              {[
                "Domingo",
                "Lunes",
                "Martes",
                "Miércoles",
                "Jueves",
                "Viernes",
                "Sábado",
              ].map((nombre, dia) => {
                const trabaja = !(datos.days_off ?? []).includes(dia);
                const suyo = (datos.weekly_schedule ?? {})[String(dia)] ?? {};
                const horas = horasTrabajadas(
                  suyo.in ?? null,
                  suyo.out ?? null,
                  suyo.break ?? 60,
                );
                const ponerHorario = (cambio: {
                  in?: string | null;
                  out?: string | null;
                  break?: number | null;
                }) => {
                  const actual = { ...(datos.weekly_schedule ?? {}) };
                  const dd = { ...(actual[String(dia)] ?? {}) };
                  if (cambio.in !== undefined) {
                    if (cambio.in) dd.in = cambio.in;
                    else delete dd.in;
                  }
                  if (cambio.out !== undefined) {
                    if (cambio.out) dd.out = cambio.out;
                    else delete dd.out;
                  }
                  if (cambio.break !== undefined) {
                    if (cambio.break === null) delete dd.break;
                    else dd.break = cambio.break;
                  }
                  if (Object.keys(dd).length === 0) delete actual[String(dia)];
                  else actual[String(dia)] = dd;
                  cambiar({
                    weekly_schedule:
                      Object.keys(actual).length > 0 ? actual : null,
                  });
                };
                return (
                  <div key={dia} className={FILA}>
                    <button
                      type="button"
                      onClick={() => {
                        const libres = datos.days_off ?? [];
                        if (trabaja) {
                          // Pasa a libre: se le quita el horario también,
                          // para que no quede un dato colgando.
                          const actual = { ...(datos.weekly_schedule ?? {}) };
                          delete actual[String(dia)];
                          cambiar({
                            days_off: [...libres, dia].sort((a, b) => a - b),
                            weekly_schedule:
                              Object.keys(actual).length > 0 ? actual : null,
                          });
                        } else {
                          // AL MARCARLO SE LLENA SOLO (Felipe, 15-08): así
                          // nunca queda en blanco ni hay que adivinar qué
                          // pasa si se deja vacío.
                          cambiar({
                            days_off: libres.filter((x) => x !== dia),
                            weekly_schedule: {
                              ...(datos.weekly_schedule ?? {}),
                              [String(dia)]: {
                                in: datos.default_starts_at?.slice(0, 5) ?? "09:00",
                                out: datos.default_ends_at?.slice(0, 5) ?? "19:00",
                                break: datos.default_break_minutes ?? 60,
                              },
                            },
                          });
                        }
                      }}
                      aria-label={`${nombre} ${trabaja ? "trabaja" : "libre"}`}
                      className={`px-2 py-1.5 rounded-lg text-sm font-medium text-left transition-colors ${
                        trabaja
                          ? "bg-blue-600 text-white border border-blue-600"
                          : "bg-gray-50 text-gray-400 border border-gray-200 hover:bg-gray-100"
                      }`}
                    >
                      {nombre}
                    </button>
                    {trabaja ? (
                      <>
                        <HoraInput
                          value={suyo.in ?? null}
                          onChange={(v) => ponerHorario({ in: v })}
                          compacta
                          className="w-full"
                          aria-label={`Entrada del ${nombre.toLowerCase()}`}
                        />
                        <span className="text-xs text-gray-400 text-center">
                          a
                        </span>
                        <HoraInput
                          value={suyo.out ?? null}
                          onChange={(v) => ponerHorario({ out: v })}
                          compacta
                          className="w-full"
                          aria-label={`Salida del ${nombre.toLowerCase()}`}
                        />
                        <span className="text-xs text-gray-500">colación</span>
                        <SelectorColacion
                          value={suyo.break ?? 60}
                          onChange={(min) => ponerHorario({ break: min })}
                        />
                        <span className="text-sm tabular-nums text-gray-600 pl-2">
                          {formatoHoras(horas)}
                        </span>
                      </>
                    ) : (
                      <span className="col-span-6 text-xs text-gray-400">
                        libre
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* El total, en la MISMA rejilla: cae justo debajo de la
                columna de las horas (Felipe, 15-08). */}
            <div className={`${FILA} mt-2 border-t border-gray-200 pt-2`}>
              <span className="col-span-5" />
              <span className="text-sm text-gray-500 text-right whitespace-nowrap">
                {diasQueTrabaja} {diasQueTrabaja === 1 ? "día" : "días"} a la
                semana
              </span>
              <span className="text-sm font-bold tabular-nums text-gray-900 pl-2">
                {formatoHoras(horasDeLaSemana)}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Los apagados son sus días libres: la planta no se proyecta
              esos días.
            </p>
          </div>
        )}
        <p className="text-xs text-gray-500 mt-2">
          Son valores <strong>por defecto</strong>: el día que trabaje de otra
          cosa, se cambia en ese día y no acá.
        </p>
      </fieldset>

      {/* Las notas quedan siempre abiertas (Felipe, 15-08): son un
          apunte de trabajo, no un dato que mande plata a nadie. */}
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
