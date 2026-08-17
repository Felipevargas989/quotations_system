import { API_ROUTES } from "../constants/api.routes";
import { apiRequest } from "./api";
import type {
  LiquidacionPendiente,
  PreviaNomina,
  Asignacion,
  Persona,
  PersonaFormData,
  Cargo,
  Evaluacion,
  Ficha,
  Nomina,
  NominaDetalle,
  NotaDelDia,
  PagoPersona,
  Pozo,
} from "../types/people.types";

/* ------------------------------------------------------------------ *
 * PERSONAS
 * ------------------------------------------------------------------ */

export const getPeople = async () =>
  (await apiRequest(API_ROUTES.PEOPLE, "GET")) as Persona[];

export const getPerson = async (id: number) =>
  (await apiRequest(`${API_ROUTES.PEOPLE}/${id}`, "GET")) as Persona;

export const createPerson = async (persona: PersonaFormData) =>
  (await apiRequest(API_ROUTES.PEOPLE, "POST", persona)) as Persona;

export const updatePerson = async (id: number, persona: PersonaFormData) =>
  (await apiRequest(
    `${API_ROUTES.PEOPLE}/${id}`,
    "PATCH",
    persona,
  )) as Persona;

export const deletePerson = async (id: number) =>
  apiRequest(`${API_ROUTES.PEOPLE}/${id}`, "DELETE");

/** La misma queryKey en todas las pantallas = un solo caché que se
 *  invalida tras cada guardado. Igual que en clientes. */
export const peopleQueryOptions = {
  queryKey: ["people"] as const,
  queryFn: getPeople,
};

/* ------------------------------------------------------------------ *
 * CARGOS
 * ------------------------------------------------------------------ */

export const getRoles = async (incluirApagados = false) =>
  (await apiRequest(
    incluirApagados
      ? `${API_ROUTES.PEOPLE_ROLES}?todos=true`
      : API_ROUTES.PEOPLE_ROLES,
    "GET",
  )) as Cargo[];

export const createRole = async (name: string) =>
  (await apiRequest(API_ROUTES.PEOPLE_ROLES, "POST", { name })) as Cargo;

export const updateRole = async (
  id: number,
  cambios: { name?: string; is_active?: boolean; list_price_fixed?: number | null },
) =>
  (await apiRequest(
    `${API_ROUTES.PEOPLE_ROLES}/${id}`,
    "PATCH",
    cambios,
  )) as Cargo;

/** Un cargo se APAGA, no se borra: si alguien lo tiene como cargo por
 *  defecto, borrarlo dejaría esa ficha apuntando a la nada. */
export const deactivateRole = async (id: number) =>
  apiRequest(`${API_ROUTES.PEOPLE_ROLES}/${id}`, "DELETE");

export const rolesQueryOptions = {
  queryKey: ["people", "roles"] as const,
  queryFn: () => getRoles(),
};

/* ------------------------------------------------------------------ *
 * QUIÉN TRABAJA CADA DÍA
 * ------------------------------------------------------------------ */

export const getStaff = async (quotationId: string) =>
  (await apiRequest(
    `${API_ROUTES.PEOPLE_STAFF}?evento=${encodeURIComponent(quotationId)}`,
    "GET",
  )) as Asignacion[];

export const addStaff = async (fila: {
  /** Sin evento = restaurante, el evento permanente. */
  quotation_id?: string | null;
  /** Sin persona = SILLA VACÍA: cupo del plan sin nombre todavía. */
  person_id?: number | null;
  /** Sin día solo en eventos: silla "por ubicar". */
  day?: string | null;
  role_id?: number | null;
  kind?: string;
  status?: string;
  amount?: number | null;
}) => (await apiRequest(API_ROUTES.PEOPLE_STAFF, "POST", fila)) as Asignacion;

/** La sábana lo llama UNA vez al abrirse: deja el año de toda la planta
 *  proyectado. Desplazarse por los meses ya no carga nada. */
export const proyectarPlanta = async () =>
  (await apiRequest(
    `${API_ROUTES.PEOPLE_STAFF}/proyectar-planta`,
    "POST",
    {},
  )) as { personas: number; creadas: number };

export const updateStaff = async (
  id: number,
  cambios: Partial<
    Pick<
      Asignacion,
      // "day" permite MOVER la asignación a otro día (Felipe, 15-08).
      | "day"
      | "role_id"
      | "kind"
      | "status"
      | "amount"
      | "starts_at"
      | "ends_at"
      | "break_minutes"
      | "no_tip"
    >
  >,
) =>
  (await apiRequest(
    `${API_ROUTES.PEOPLE_STAFF}/${id}`,
    "PATCH",
    cambios,
  )) as Asignacion;

/** `liberar`: en un evento deja la silla vacía (cargo, día y valor
 *  quedan); sin él, borra la fila — bajar el plan o "no se presentó". */
export const removeStaff = async (id: number, liberar = false) =>
  apiRequest(
    `${API_ROUTES.PEOPLE_STAFF}/${id}${liberar ? "?liberar=1" : ""}`,
    "DELETE",
  );

/** El costo de personal por evento y cargo, desde las sillas. */
export const getCostoPersonal = async () =>
  (await apiRequest(`${API_ROUTES.PEOPLE}/costo-personal`, "GET")) as {
    quotation_id: string;
    role_id: number | null;
    total: number;
    sillas: number;
  }[];

/** Todo lo asignado en un rango de días, de TODOS los eventos. */
export const getStaffSemana = async (desde: string, hasta: string) =>
  (await apiRequest(
    `${API_ROUTES.PEOPLE_STAFF}?desde=${desde}&hasta=${hasta}`,
    "GET",
  )) as Asignacion[];

export const staffQueryOptions = (quotationId: string) => ({
  queryKey: ["people", "staff", quotationId] as const,
  queryFn: () => getStaff(quotationId),
  enabled: !!quotationId,
});

// ---- El ciclo de la ficha ----

export const getSheets = async () =>
  (await apiRequest(`${API_ROUTES.PEOPLE}/sheets`, "GET")) as Ficha[];

export const upsertSheet = async (quotation_id: string, status: string) =>
  (await apiRequest(`${API_ROUTES.PEOPLE}/sheets`, "POST", {
    quotation_id,
    status,
  })) as Ficha;

/** El candado vive en el backend: si la plata repartida no suma el
 *  pozo, esto rebota con el motivo. */
export const cerrarFicha = async (quotation_id: string) =>
  (await apiRequest(`${API_ROUTES.PEOPLE}/sheets/cerrar`, "POST", {
    quotation_id,
  })) as Ficha;

// ---- Los pozos y el reparto ----

export const getPools = async () =>
  (await apiRequest(`${API_ROUTES.PEOPLE}/pools`, "GET")) as Pozo[];

export const createPool = async (pozo: {
  quotation_id?: string | null;
  day?: string | null;
  area?: string | null;
  first_amount?: number;
  second_amount?: number;
}) => (await apiRequest(`${API_ROUTES.PEOPLE}/pools`, "POST", pozo)) as Pozo;

export const updatePool = async (
  id: number,
  cambios: { first_amount?: number; second_amount?: number; area?: string | null },
) => (await apiRequest(`${API_ROUTES.PEOPLE}/pools/${id}`, "PATCH", cambios)) as Pozo;

export const removePool = async (id: number) =>
  apiRequest(`${API_ROUTES.PEOPLE}/pools/${id}`, "DELETE");

/** Un día flojo también se liquida: pozo en cero, marcado y listo. */
export const sinPropina = async (id: number) =>
  (await apiRequest(
    `${API_ROUTES.PEOPLE}/pools/${String(id)}/sin-propina`,
    "POST",
    {},
  )) as Pozo;

export const repartirPool = async (
  id: number,
  porcentajes: { role_id: number | null; pct: number }[],
) =>
  (await apiRequest(`${API_ROUTES.PEOPLE}/pools/${id}/repartir`, "POST", {
    porcentajes,
  })) as { repartido: number; filas: number };

// ---- Las estrellas ----

export const getReviews = async (personId?: number) =>
  (await apiRequest(
    personId
      ? `${API_ROUTES.PEOPLE}/reviews?persona=${String(personId)}`
      : `${API_ROUTES.PEOPLE}/reviews`,
    "GET",
  )) as Evaluacion[];

export const createReview = async (evaluacion: {
  person_id: number;
  quotation_id?: string | null;
  stars?: number | null;
  note?: string | null;
}) =>
  (await apiRequest(`${API_ROUTES.PEOPLE}/reviews`, "POST", evaluacion)) as Evaluacion;

// ---- La nómina y el pago ----

export const getPayrolls = async () =>
  (await apiRequest(`${API_ROUTES.PEOPLE}/payrolls`, "GET")) as Nomina[];

/** El día de restaurante más viejo con gente: el piso de la ventana. */
export const getDiaMasViejo = async () =>
  (await apiRequest(`${API_ROUTES.PEOPLE}/dias/mas-viejo`, "GET")) as {
    day: string | null;
  };

/** Lo liquidado que todavía no entró a ninguna nómina. */
export const getLiquidacionesPendientes = async () =>
  (await apiRequest(
    `${API_ROUTES.PEOPLE}/payrolls/pendientes`,
    "GET",
  )) as LiquidacionPendiente[];

/** Lo que se va a pagar, consolidado, antes de generar la nómina. */
export const previaPayroll = async (dto: {
  label?: string;
  hasta?: string;
  desde?: string;
  quotation_ids?: string[];
  dias?: string[];
}) =>
  (await apiRequest(
    `${API_ROUTES.PEOPLE}/payrolls/previa`,
    "POST",
    dto,
  )) as PreviaNomina;

export const createPayroll = async (dto: {
  label: string;
  hasta?: string;
  desde?: string;
  quotation_ids?: string[];
  /** Días sueltos de restaurante: manda por sobre las fechas y deja
   *  fuera todo lo que sea de un evento. */
  dias?: string[];
}) => (await apiRequest(`${API_ROUTES.PEOPLE}/payrolls`, "POST", dto)) as Nomina;

export const getPayroll = async (id: number) =>
  (await apiRequest(`${API_ROUTES.PEOPLE}/payrolls/${id}`, "GET")) as NominaDetalle;

export const marcarPago = async (
  id: number,
  pago: { person_id: number; jornada_paid?: boolean; propina_paid?: boolean },
) =>
  (await apiRequest(
    `${API_ROUTES.PEOPLE}/payrolls/${id}/pago`,
    "PATCH",
    pago,
  )) as PagoPersona;

/** Todo lo que esa persona ha trabajado: jornadas y propinas, con su
 *  evento y si ya se liquidaron. */
export const getHistorial = async (personId: number) =>
  (await apiRequest(
    `${API_ROUTES.PEOPLE}/${String(personId)}/historial`,
    "GET",
  )) as Asignacion[];

// ---- Las notas del día ----

export const getDayNotes = async (desde: string, hasta: string) =>
  (await apiRequest(
    `${API_ROUTES.PEOPLE}/day-notes?desde=${desde}&hasta=${hasta}`,
    "GET",
  )) as NotaDelDia[];

export const createDayNote = async (nota: {
  day: string;
  quotation_id?: string | null;
  text: string;
}) =>
  (await apiRequest(`${API_ROUTES.PEOPLE}/day-notes`, "POST", nota)) as NotaDelDia;

export const updateDayNote = async (
  id: number,
  cambios: { text?: string; done?: boolean },
) =>
  (await apiRequest(
    `${API_ROUTES.PEOPLE}/day-notes/${String(id)}`,
    "PATCH",
    cambios,
  )) as NotaDelDia;

export const removeDayNote = async (id: number) =>
  apiRequest(`${API_ROUTES.PEOPLE}/day-notes/${String(id)}`, "DELETE");
