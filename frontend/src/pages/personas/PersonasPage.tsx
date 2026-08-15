import { useMemo, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Pencil, Plus, Search, Tags, Trash2, X } from "lucide-react";
import ConfirmInline from "../../components/ConfirmInline";
import PageSkeleton from "../../components/PageSkeleton";
import { toast } from "../../components/toast/Toast";
import SemanaTab from "./SemanaTab";
import FichasTab from "./FichasTab";
import NominaTab from "./NominaTab";
import Estrellas from "../../components/Estrellas";
import CargosModal from "./CargosModal";
import PersonaForm from "./PersonaForm";
import {
  createPerson,
  deletePerson,
  getReviews,
  peopleQueryOptions,
  rolesQueryOptions,
  updatePerson,
} from "../../services/people.service";
import {
  datosParaPagarCompletos,
  type Persona,
  type PersonaFormData,
} from "../../types/people.types";
import { humanizeApiError } from "../../utils/apiErrors";
import { nombreBanco, etiquetaTipoCuenta } from "../../utils/bancos";
import {
  chipEstadoPersona,
  chipTipoPersona,
  etiquetaEstadoPersona,
  etiquetaTipoPersona,
} from "../../utils/estadoPersona";
import { formatearRut } from "../../utils/rut";
import { matchesSearch } from "../../utils/searchMatch";

// LA LIBRETA DE LA GENTE QUE TRABAJA
//
// Existe porque hoy el RUT y la cuenta de cada persona no están escritos
// en ninguna parte: se teclean a mano en el portal del banco cada semana,
// y cuando falta uno hay que pedírselo al garzón por WhatsApp.
//
// El aviso de "le falta el dato para pagarle" es la razón de ser de la
// pantalla: sirve para descubrirlo el martes y no el viernes.

export default function PersonasPage() {
  const qc = useQueryClient();
  const [busqueda, setBusqueda] = useState("");
  const [editando, setEditando] = useState<Persona | null | undefined>(
    undefined,
  );
  const [borrando, setBorrando] = useState<number | null>(null);
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  const [viendoCargos, setViendoCargos] = useState(false);
  // La sábana primero (Felipe, 15-08): al entrar se ve la planificación.
  const [pestana, setPestana] = useState<
    "directorio" | "armar" | "fichas" | "nomina"
  >("armar");
  const { company } = useAuth();

  const { data: personas = [], isLoading } = useQuery(peopleQueryOptions);
  const { data: cargos = [] } = useQuery(rolesQueryOptions);
  // El PROMEDIO SIMPLE de las evaluaciones — sin fórmulas escondidas.
  // Sin evaluar no es lo mismo que malo: la pieza lo pinta aparte.
  const { data: evaluaciones = [] } = useQuery({
    queryKey: ["people", "reviews"],
    queryFn: () => getReviews(),
  });
  const promedioDe = (personId: number): number | null => {
    const conEstrella = evaluaciones.filter(
      (e) => e.person_id === personId && e.stars !== null,
    );
    if (conEstrella.length === 0) return null;
    return (
      conEstrella.reduce((t, e) => t + (e.stars ?? 0), 0) / conEstrella.length
    );
  };

  const cerrarFicha = () => {
    setEditando(undefined);
    setErrorServidor(null);
  };

  const invalidar = () =>
    qc.invalidateQueries({ queryKey: peopleQueryOptions.queryKey });

  const guardar = useMutation({
    mutationFn: (datos: PersonaFormData) =>
      editando ? updatePerson(editando.id, datos) : createPerson(datos),
    onSuccess: async () => {
      await invalidar();
      toast.success(editando ? "Ficha actualizada." : "Persona creada.");
      cerrarFicha();
    },
    onError: (error: unknown) => {
      // El servidor sabe de QUIÉN es el RUT repetido; ese mensaje es más
      // útil que cualquier cosa que pudiéramos escribir acá.
      const mensaje = humanizeApiError(error);
      setErrorServidor(mensaje);
      toast.error(mensaje);
    },
  });

  const borrar = useMutation({
    mutationFn: (id: number) => deletePerson(id),
    onSuccess: async () => {
      await invalidar();
      toast.success("Persona eliminada.");
      setBorrando(null);
    },
    onError: (error: unknown) => toast.error(humanizeApiError(error)),
  });

  const visibles = useMemo(() => {
    if (!busqueda.trim()) return personas;
    return personas.filter((p) =>
      matchesSearch(
        busqueda,
        p.name,
        p.rut ?? "",
        p.phone ?? "",
        p.management_resources?.name ?? "",
        nombreBanco(p.bank_code),
      ),
    );
  }, [personas, busqueda]);

  const sinDatosDePago = personas.filter((p) => !datosParaPagarCompletos(p));

  if (isLoading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Personal</h1>
          <p className="text-sm text-gray-500">
            {personas.length === 0
              ? "Todavía no hay nadie cargado"
              : `${personas.length} ${personas.length === 1 ? "persona" : "personas"}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViendoCargos(true)}
            className="flex items-center gap-2 px-3 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <Tags className="w-4 h-4" />
            Cargos
          </button>
          <button
            onClick={() => {
              setEditando(null);
              setErrorServidor(null);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            Nueva persona
          </button>
        </div>
      </div>

      {/* Dos mesas de trabajo: la libreta y el armado de eventos. */}
      <div className="flex items-center gap-1 mb-4 border-b border-gray-200">
        {([
          ["armar", "Planificación"],
          ["fichas", "Fichas"],
          ["nomina", "Nómina"],
          ["directorio", "Staff"],
        ] as const).map(([id, texto]) => (
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

      {pestana === "armar" ? (
        <SemanaTab companyId={Number(company?.id ?? 0)} />
      ) : pestana === "fichas" ? (
        <FichasTab />
      ) : pestana === "nomina" ? (
        <NominaTab />
      ) : (
      <>

      {/* El aviso que evita el problema del viernes */}
      {sinDatosDePago.length > 0 && (
        <div className="flex items-start gap-2 mb-4 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            A <strong>{sinDatosDePago.length}</strong>{" "}
            {sinDatosDePago.length === 1 ? "persona le falta" : "personas les faltan"}{" "}
            datos para poder transferirle. Mejor completarlos antes del día de
            pago.
          </span>
        </div>
      )}

      {personas.length > 0 && (
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, RUT, teléfono, cargo o banco…"
            className="w-full pl-9 pr-9 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {busqueda && (
            <button
              onClick={() => setBusqueda("")}
              aria-label="Limpiar búsqueda"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {personas.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="mb-1">Acá va a vivir la gente que trabaja contigo.</p>
          <p className="text-sm">
            Se carga una vez y no hay que volver a pedirle los datos a nadie.
          </p>
        </div>
      ) : visibles.length === 0 ? (
        <p className="text-center py-12 text-gray-500">
          Nadie calza con «{busqueda}»
        </p>
      ) : (
        <div className="space-y-5">
          {/* Agrupada por tipo (Felipe, 15-08): la planta es el equipo
              fijo y los freelance la lista de a quién llamar — son dos
              listas distintas aunque vivan en la misma pantalla. */}
          {([
            ["planta", "Personal de planta"],
            ["freelance", "Freelance"],
          ] as const).map(([tipo, titulo]) => {
            const grupo = visibles.filter(
              (p) => (p.default_kind ?? "freelance") === tipo,
            );
            if (grupo.length === 0) return null;
            return (
              <section key={tipo}>
                <h3 className="text-xs font-semibold uppercase text-gray-500 mb-1.5">
                  {titulo}
                  <span className="ml-1.5 font-normal normal-case text-gray-400">
                    {grupo.length}
                  </span>
                </h3>
                <ul className="space-y-2">
          {grupo.map((p) => {
            const completa = datosParaPagarCompletos(p);
            return (
              <li
                key={p.id}
                className="border border-gray-200 rounded-lg p-3 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900">{p.name}</span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${chipTipoPersona(p.default_kind)}`}
                      >
                        {etiquetaTipoPersona(p.default_kind)}
                      </span>
                      {p.status !== "activa" && (
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${chipEstadoPersona(p.status)}`}
                          title={p.blocked_reason ?? undefined}
                        >
                          {etiquetaEstadoPersona(p.status)}
                        </span>
                      )}
                      {p.management_resources?.name && (
                        <span className="text-xs text-gray-500">
                          {p.management_resources.name}
                        </span>
                      )}
                      <Estrellas
                        value={promedioDe(p.id)}
                        tamano="sm"
                        conNumero
                      />
                    </div>

                    <div className="text-sm text-gray-600 mt-1">
                      {p.rut ? formatearRut(p.rut) : (
                        <span className="text-amber-700">sin RUT</span>
                      )}
                      {p.phone && <span className="mx-2 text-gray-300">·</span>}
                      {p.phone}
                    </div>

                    <div className="text-sm text-gray-500 mt-0.5">
                      {completa ? (
                        <>
                          {nombreBanco(p.bank_code)}
                          <span className="mx-1 text-gray-300">·</span>
                          {etiquetaTipoCuenta(p.account_type)}
                          <span className="mx-1 text-gray-300">·</span>
                          <span className="font-mono">{p.account_number}</span>
                        </>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-700">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          faltan datos para transferirle
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {borrando === p.id ? (
                      <ConfirmInline
                        question={`¿Eliminar a ${p.name}?`}
                        yesLabel="Eliminar"
                        tono="peligro"
                        busy={borrar.isPending}
                        onYes={() => borrar.mutate(p.id)}
                        onNo={() => setBorrando(null)}
                      />
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setEditando(p);
                            setErrorServidor(null);
                          }}
                          aria-label={`Editar ${p.name}`}
                          className="p-2 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setBorrando(p.id)}
                          aria-label={`Eliminar ${p.name}`}
                          className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      </>
      )}

      {viendoCargos && <CargosModal onCerrar={() => setViendoCargos(false)} />}

      {editando !== undefined && (
        <div className="fixed inset-0 bg-black/40 flex items-start sm:items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                {editando ? editando.name : "Nueva persona"}
              </h2>
              <button
                onClick={cerrarFicha}
                aria-label="Cerrar"
                className="p-1 text-gray-400 hover:text-gray-700 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-5 py-4">
              <PersonaForm
                persona={editando}
                cargos={cargos}
                guardando={guardar.isPending}
                errorServidor={errorServidor}
                onGuardar={(datos) => guardar.mutate(datos)}
                onCancelar={cerrarFicha}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
