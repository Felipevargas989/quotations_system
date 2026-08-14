import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import { format, startOfMonth, endOfMonth, isValid, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  Calendar as CalendarIcon,
  CalendarDays,
  ChevronDown,
  ExternalLink,
  Star,
} from "lucide-react";
import {
  QuotationRequestType,
  QuotationStatus,
  QuotationWithClient,
} from "../../types/quotations.types";
import {
  getQuotationById,
  getQuotations,
} from "../../services/quotations.service";
import { recursosQueryOpts } from "../postventa/EventResourcesSection";
import { useAuth } from "../../contexts/AuthContext";
import { SECTION_ROLES } from "../../constants/permissions";
import {
  ESTADOS_COTIZACION,
  etiquetaEstado,
  hexEstado,
  puntoEstado,
} from "../../utils/estadoCotizacion";
// import { findAllEvents } from "../../services/calendar.service";

// El filtro se recuerda por usuario (mismo patrón de Post-Venta).
const CAL_FILTER_KEY = (userId: string | number) =>
  `eventia_calendar_status_filter_${userId}`;

type ValuePiece = Date | null;
type Value = ValuePiece | [ValuePiece, ValuePiece];

export default function CalendarPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Parse date from query parameter
  const getInitialDate = (): Date => {
    const dateParam = searchParams.get("date");
    if (dateParam) {
      try {
        const parsedDate = parseISO(dateParam);
        if (isValid(parsedDate)) {
          return parsedDate;
        }
      } catch (error) {
        console.error("Invalid date parameter:", error);
      }
    }
    return new Date();
  };

  const initialDate = getInitialDate();

  // Estados iniciales: la URL manda (?filter=all), después la memoria
  // del usuario, y al final el defecto Aceptada + Realizada (decisión
  // de Felipe 29-07: el calendario no debe olvidar los eventos ya
  // hechos).
  const getInitialStatuses = (): QuotationStatus[] => {
    const filterParam = searchParams.get("filter");
    if (filterParam === "all") {
      // Todos menos rechazadas y anuladas.
      return [
        QuotationStatus.SOLICITADA,
        QuotationStatus.ENVIADA,
        QuotationStatus.EN_NEGOCIACION,
        QuotationStatus.ACEPTADA,
        QuotationStatus.REALIZADA,
      ];
    }
    return [QuotationStatus.ACEPTADA, QuotationStatus.REALIZADA];
  };

  // Sin día seleccionado por defecto: azul solo cuando el usuario pincha
  // (o cuando la URL trae ?date, ej: desde el aviso de choque del cotizador).
  const [value, setValue] = useState<Value>(
    searchParams.get("date") ? initialDate : null,
  );
  // Mes visible (independiente de la selección).
  const [activeMonth, setActiveMonth] = useState<Date>(initialDate);
  const [selectedDate, setSelectedDate] = useState<Date | null>(
    searchParams.get("date") ? initialDate : null,
  );
  const { user, userRole, company } = useAuth();
  const puedeEditar = SECTION_ROLES.quotations_edit.includes(userRole as never);
  // Estrella de alto valor: misma regla del tablero (umbral 0/null =
  // sin estrellas).
  const umbralAltoValor = Number(company?.high_value_threshold || 0);
  const [selectedStatuses, setSelectedStatuses] =
    useState<QuotationStatus[]>(getInitialStatuses());
  const [filterRestored, setFilterRestored] = useState(false);
  // Chip desplegable de estados (12-08): un solo chip de la casa con
  // casillas combinables — reemplaza a los 7 chips gigantes.
  const [filtroMenuAbierto, setFiltroMenuAbierto] = useState(false);

  // Restaurar la memoria del filtro (solo si la URL no manda ?filter).
  useEffect(() => {
    if (!user) return;
    if (!searchParams.get("filter")) {
      try {
        const raw = localStorage.getItem(CAL_FILTER_KEY(user.id));
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const valid = parsed.filter((v) =>
              Object.values(QuotationStatus).includes(v),
            );
            if (valid.length > 0) setSelectedStatuses(valid);
          }
        }
      } catch {
        /* storage deshabilitado o valor viejo: usar el defecto */
      }
    }
    setFilterRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Guardar la selección cuando cambia (después de restaurar).
  useEffect(() => {
    if (!user || !filterRestored) return;
    try {
      localStorage.setItem(
        CAL_FILTER_KEY(user.id),
        JSON.stringify(selectedStatuses),
      );
    } catch {
      /* ignorar */
    }
  }, [user, filterRestored, selectedStatuses]);

  // Nombre y punto de color salen del diccionario (utils/estadoCotizacion):
  // acá vivía una copia con sus propias etiquetas y colores.
  const statusOptions = ESTADOS_COTIZACION.map((v) => ({
    value: v as unknown as QuotationStatus,
    label: etiquetaEstado(v),
    color: puntoEstado(v),
  }));

  // Eventos del calendario vía React Query (Etapa 3): la clave parte
  // con "quotations", así los guardados que invalidan cotizaciones
  // refrescan también el calendario.
  // Desde el chip desplegable (12-08) se piden TODOS los estados en UNA
  // llamada: el menú necesita el conteo por estado del mes visible, y de
  // paso el filtro pasa a ser instantáneo (antes cada cambio de chip
  // refetcheaba). El filtro se aplica en el cliente.
  const calendarQuery = useQuery({
    queryKey: ["quotations", "calendar"],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<QuotationWithClient[]> => {
      const response = await getQuotations(
        QuotationRequestType.COTIZACION,
        statusOptions.map((o) => o.value),
      );
      return (response.data || []).filter((q) => q.event_date != null);
    },
  });
  const todasLasCotizaciones = useMemo(
    () => calendarQuery.data ?? [],
    [calendarQuery.data],
  );
  const quotations = useMemo(
    () =>
      todasLasCotizaciones.filter((q) =>
        selectedStatuses.includes(q.quotation_status as QuotationStatus),
      ),
    [todasLasCotizaciones, selectedStatuses],
  );
  const loading = calendarQuery.isPending;

  // Colores sólidos por estado para las bandas (hex, no clases tailwind).

  // Rango [inicio, fin] de un evento en texto yyyy-mm-dd (fin >= inicio).
  const eventRange = (q: QuotationWithClient) => {
    const start = String(q.event_date).split("T")[0];
    const rawEnd = q.event_end_date
      ? String(q.event_end_date).split("T")[0]
      : start;
    return { start, end: rawEnd >= start ? rawEnd : start };
  };

  // ¿El rango del evento toca el mes visible?
  const tocaMesVisible = (
    q: QuotationWithClient,
    inicioMes: string,
    finMes: string,
  ) => {
    const { start, end } = eventRange(q);
    return start <= finMes && end >= inicioMes;
  };

  // Título único (12-08): conteo Y venta del MES VISIBLE con el filtro
  // activo. La venta se mide SIN propina (regla de la casa 24-07):
  // total_amount − tip_amount de lo que ya viaja en la consulta — sin
  // consultas nuevas.
  const resumenMes = useMemo(() => {
    const inicioMes = format(startOfMonth(activeMonth), "yyyy-MM-dd");
    const finMes = format(endOfMonth(activeMonth), "yyyy-MM-dd");
    const delMes = quotations.filter((q) =>
      tocaMesVisible(q, inicioMes, finMes),
    );
    const venta = delMes.reduce(
      (s, q) => s + Math.max(0, (q.total_amount || 0) - (q.tip_amount || 0)),
      0,
    );
    return { eventos: delMes.length, venta };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotations, activeMonth]);

  // Conteo por estado del mes visible, para el menucito del chip:
  // "Aceptada (3)". Sale de la MISMA llamada (todos los estados).
  const conteoPorEstado = useMemo(() => {
    const inicioMes = format(startOfMonth(activeMonth), "yyyy-MM-dd");
    const finMes = format(endOfMonth(activeMonth), "yyyy-MM-dd");
    const mapa: Record<string, number> = {};
    todasLasCotizaciones.forEach((q) => {
      if (tocaMesVisible(q, inicioMes, finMes)) {
        mapa[q.quotation_status] = (mapa[q.quotation_status] || 0) + 1;
      }
    });
    return mapa;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todasLasCotizaciones, activeMonth]);

  // Asignación de PISTAS (filas) para que las bandas de eventos que se topan
  // no se pisen: cada evento toma la primera pista libre en todo su rango.
  const eventLanes = useMemo(() => {
    const evs = quotations
      .map((q) => ({ id: q.id, ...eventRange(q) }))
      .sort((a, b) =>
        a.start === b.start
          ? b.end.localeCompare(a.end) // el más largo primero
          : a.start.localeCompare(b.start),
      );
    const laneEnds: string[] = [];
    const map = new Map<string, number>();
    evs.forEach((e) => {
      let lane = laneEnds.findIndex((le) => le < e.start);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(e.end);
      } else {
        laneEnds[lane] = e.end;
      }
      map.set(e.id, lane);
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotations]);

  const getQuotationsForDate = (date: Date): QuotationWithClient[] => {
    // Comparación por texto yyyy-mm-dd (inmune a zonas horarias). Un evento
    // multi-día aparece TODOS los días de su rango [event_date, event_end_date].
    const tileStr = format(date, "yyyy-MM-dd");
    return quotations.filter((q) => {
      const startStr = String(q.event_date).split("T")[0];
      const rawEnd = q.event_end_date
        ? String(q.event_end_date).split("T")[0]
        : startStr;
      const endStr = rawEnd >= startStr ? rawEnd : startStr;
      return tileStr >= startStr && tileStr <= endStr;
    });
  };

  // (tileClassName jubilado 12-08: "tiene eventos" lo dicen las
  // pastillas solas — sistema "estilo Google" elegido por Felipe.)

  // Bandas continuas estilo agenda: cada evento es una barra que atraviesa
  // sus días. En cada casilla se dibuja el SEGMENTO que le toca: punta
  // redondeada solo en el primer y último día, y el nombre en el primer día
  // de cada tramo semanal. Máximo 3 pistas visibles + "+N más".
  const MAX_BAND_LANES = 3;
  const LANE_STEP = 18; // compacto (12-08): filas uniformes sin scroll
  const tileContent = ({ date, view }: { date: Date; view: string }) => {
    if (view !== "month") return null;
    const dayQuotations = getQuotationsForDate(date);
    if (dayQuotations.length === 0) return null;

    const tileStr = format(date, "yyyy-MM-dd");
    const isMonday = date.getDay() === 1; // la semana parte en lunes

    const bands = dayQuotations
      .map((q) => ({ q, lane: eventLanes.get(q.id) ?? 0 }))
      .filter((b) => b.lane < MAX_BAND_LANES)
      .map(({ q, lane }) => {
        const { start, end } = eventRange(q);
        const muestraTexto = tileStr === start || isMonday;
        return {
          id: q.id,
          lane,
          color: hexEstado(q.quotation_status),
          rl: tileStr === start,
          rr: tileStr === end,
          // Tooltip al posar (12-08): cliente completo, tipo, personas
          // y monto.
          tooltip: `${q.clients?.name || "Sin cliente"}\n${q.event_type} · ${
            q.people_count
          } personas\n$${(q.total_amount || 0).toLocaleString("es-CL")}`,
          // Estrella de alto valor (misma regla del tablero), donde va
          // el texto para no repetirla casilla por casilla.
          star:
            muestraTexto &&
            umbralAltoValor > 0 &&
            (q.total_amount || 0) >= umbralAltoValor,
          label: muestraTexto
            ? `#${q.quotation_number} ${q.clients?.name || ""}`.trim()
            : "",
        };
      });
    const extra = dayQuotations.filter(
      (q) => (eventLanes.get(q.id) ?? 0) >= MAX_BAND_LANES,
    ).length;

    return (
      <div className="ev-bands pointer-events-none">
        {bands.map((b) => (
          <div
            key={b.id}
            title={b.tooltip}
            className={`ev-band${b.rl ? " ev-rl" : ""}${b.rr ? " ev-rr" : ""}`}
            style={{ top: b.lane * LANE_STEP, background: b.color }}
          >
            {b.star && (
              <Star
                size={11}
                className="inline -mt-0.5 mr-0.5 text-amber-400 fill-amber-400"
                aria-label="Evento de alto valor"
              />
            )}
            {b.label && <span>{b.label}</span>}
          </div>
        ))}
        {extra > 0 && (
          <div className="ev-more" style={{ top: MAX_BAND_LANES * LANE_STEP }}>
            +{extra} más
          </div>
        )}
      </div>
    );
  };

  const getStatusColor = (status: QuotationStatus): string => {
    const statusOption = statusOptions.find((s) => s.value === status);
    return statusOption?.color || "bg-gray-500";
  };

  const getStatusLabel = (status: QuotationStatus): string => {
    const statusOption = statusOptions.find((s) => s.value === status);
    return statusOption?.label || status;
  };

  const handleDateClick = (clickedValue: Value) => {
    setValue(clickedValue);
    if (clickedValue instanceof Date) {
      setSelectedDate(clickedValue);
    }
  };

  const handleActiveStartDateChange = ({
    activeStartDate,
  }: {
    activeStartDate: Date | null;
  }) => {
    if (activeStartDate) {
      setActiveMonth(activeStartDate);
    }
  };

  const handleStatusToggle = (status: QuotationStatus) => {
    setSelectedStatuses((prev) =>
      prev.includes(status)
        ? prev.filter((s) => s !== status)
        : [...prev, status],
    );
  };

  const handleGoToToday = () => {
    const today = new Date();
    setValue(today);
    setSelectedDate(today);
    // Y el calendario VIAJA a hoy (antes solo seleccionaba la fecha
    // sin mover el mes visible — pillada de Felipe 29-07).
    setActiveMonth(today);
  };

  // Clic CON DESTINO (12-08): nunca más al cotizador. Aceptada,
  // realizada y anulada viven en Post-Venta (mismo destino del
  // tablero); lo en juego (solicitada/enviada/en_negociacion/
  // rechazada) va a la ficha del negocio. Recepción no edita: siempre
  // a la ficha, que sí le abre (pillada 12-08).
  const handleNavigateToQuotation = (q: QuotationWithClient) => {
    const enPostVenta = ["aceptada", "realizada", "cancelada"].includes(
      q.quotation_status,
    );
    // Post-Venta abre en PESTAÑA NUEVA (pedido de Felipe 12-08); la
    // ficha del negocio sigue en la misma, como el tablero.
    if (puedeEditar && enPostVenta) {
      window.open(`/post-venta/${q.id}`, "_blank");
      return;
    }
    navigate(`/negocio/${q.id}`);
  };

  const eventsForSelectedDate = selectedDate
    ? getQuotationsForDate(selectedDate)
    : [];

  // PRECALENTADO (12-08, "se demoran los chips"): apenas llega el mes,
  // los detalles de sus eventos se piden por detrás en ratos ociosos —
  // al pinchar un día, las categorías ya están (clave compartida con la
  // ficha y Post-Venta, así el caché le sirve a todos).
  const clientePre = useQueryClient();
  useEffect(() => {
    // Los del día seleccionado van AL FRENTE de la fila; parte al tiro
    // y con paso corto — al pinchar, las categorías ya llegaron.
    const seleccionados = new Set(eventsForSelectedDate.map((q) => q.id));
    const eventos = [...(quotations ?? [])]
      .sort((a, b) =>
        Number(seleccionados.has(b.id)) - Number(seleccionados.has(a.id)),
      )
      .slice(0, 25);
    let i = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const pedirSiguiente = () => {
      if (i >= eventos.length) return;
      const q = eventos[i++];
      void clientePre.prefetchQuery({
        queryKey: ["quotation", q.id],
        queryFn: async () => {
          const { data } = await getQuotationById(String(q.id));
          return data || null;
        },
        staleTime: 60_000,
      });
      timers.push(setTimeout(pedirSiguiente, 120));
    };
    pedirSiguiente();
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotations, selectedDate]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-3">
              <CalendarIcon className="h-8 w-8 text-blue-600" />
              <h1 className="text-3xl font-bold text-gray-900">
                Calendario de Eventos
              </h1>
            </div>
            {/* Título único con venta (12-08): mes VISIBLE + conteo +
                venta sin propina, siguiendo al filtro activo. */}
            <p className="ml-11 mt-2 text-sm text-gray-600">
              {format(activeMonth, "MMMM 'de' yyyy", { locale: es })} ·{" "}
              <span className="font-semibold text-gray-800">
                {resumenMes.eventos}{" "}
                {resumenMes.eventos === 1 ? "evento" : "eventos"}
              </span>{" "}
              ·{" "}
              <span className="font-semibold text-gray-800">
                ${resumenMes.venta.toLocaleString("es-CL")}
              </span>
            </p>
            {selectedStatuses.length === 0 && (
              <p className="ml-11 mt-1 text-sm text-amber-600">
                Selecciona al menos un estado para ver eventos
              </p>
            )}
          </div>
          {/* Chip desplegable de estados (12-08): patrón del chip de
              orden del tablero, con casillas combinables y conteo del
              mes visible. Reemplaza a los 7 chips gigantes. */}
          <div className="relative">
            <button
              onClick={() => setFiltroMenuAbierto((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-600 hover:bg-gray-50"
              title="Estados visibles en el calendario"
            >
              Estados:{" "}
              {selectedStatuses.length === statusOptions.length
                ? "Todos"
                : selectedStatuses.length}
              <ChevronDown size={12} />
            </button>
            {filtroMenuAbierto && (
              <>
                <span
                  className="fixed inset-0 z-10 block"
                  onClick={() => setFiltroMenuAbierto(false)}
                />
                <span className="absolute right-0 top-full mt-1 z-20 w-60 bg-white border border-gray-200 rounded-lg shadow-lg py-1 block">
                  {statusOptions.map((option) => (
                    <label
                      key={option.value}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedStatuses.includes(option.value)}
                        onChange={() => handleStatusToggle(option.value)}
                        className="w-4 h-4 accent-blue-600"
                      />
                      <span
                        className={`w-2 h-2 rounded-full ${option.color}`}
                      />
                      <span className="flex-1">{option.label}</span>
                      <span className="text-xs text-gray-400">
                        ({conteoPorEstado[option.value] || 0})
                      </span>
                    </label>
                  ))}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 relative">
            {/* Botón Hoy junto a las flechas (12-08): la barra de
                navegación le deja el rincón libre (margin-right en el
                CSS de abajo). Vuelve al mes actual y selecciona hoy. */}
            {!loading && (
              <button
                onClick={handleGoToToday}
                className="absolute right-6 top-6 z-20 flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                title="Volver al mes actual y seleccionar hoy"
              >
                <CalendarDays className="h-4 w-4" />
                Hoy
              </button>
            )}
            {loading ? (
              <div className="flex items-center justify-center h-96">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              </div>
            ) : (
              <Calendar
                onChange={handleDateClick}
                onActiveStartDateChange={handleActiveStartDateChange}
                value={value}
                activeStartDate={activeMonth}
                locale="es-ES"
                tileContent={tileContent}
                className="w-full border-none custom-calendar"
              />
            )}
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">
                {selectedDate
                  ? format(selectedDate, "d 'de' MMMM, yyyy", { locale: es })
                  : "Selecciona una fecha"}
              </h2>
              {selectedDate && eventsForSelectedDate.length > 0 && (
                <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-semibold">
                  {eventsForSelectedDate.length}{" "}
                  {eventsForSelectedDate.length === 1 ? "evento" : "eventos"}
                </span>
              )}
            </div>

            {!selectedDate && (
              <p className="text-gray-500 text-center py-8">
                Selecciona una fecha para ver los eventos
              </p>
            )}

            {selectedDate && eventsForSelectedDate.length === 0 && (
              <p className="text-gray-500 text-center py-8">
                No hay eventos para esta fecha
              </p>
            )}

            {selectedDate && eventsForSelectedDate.length > 0 && (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {eventsForSelectedDate.map((quotation) => (
                  <TarjetaEvento
                    key={quotation.id}
                    q={quotation}
                    pill={
                      <span
                        className={`px-2 py-1 text-xs rounded-full text-white ${getStatusColor(quotation.quotation_status)}`}
                      >
                        {getStatusLabel(quotation.quotation_status)}
                      </span>
                    }
                    companyId={company?.id ? Number(company.id) : 0}
                    onOpen={() => handleNavigateToQuotation(quotation)}
                  />
                ))}
              </div>
            )}
          </div>

        </div>
      </div>

      <style>{`
        .custom-calendar {
          width: 100%;
          border: none;
        }

        /* Filas de altura UNIFORME y compacta (12-08): el mes entero
           a la vista en un notebook normal. */
        .custom-calendar .react-calendar__tile {
          padding: 0;
          position: relative;
          height: 96px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          border-radius: 8px;
          transition: background 0.2s;
          overflow: visible;
        }

        .custom-calendar .react-calendar__tile abbr {
          position: relative;
          z-index: 10;
          margin-top: 0.2em;
          font-weight: 500;
        }

        /* SELECCIONADO (12-08, sistema "estilo Google" de Felipe):
           marco azul + fondo suave — adiós al azul macizo que tapaba
           las pastillas. Sin regla de color en el número: el rojo de
           los fines de semana sobrevive a la selección. */
        .custom-calendar .react-calendar__tile--active {
          background: #eff6ff !important;
          color: #111827;
          box-shadow: inset 0 0 0 2px #3b82f6;
        }

        .custom-calendar .react-calendar__tile--active:enabled:hover {
          background: #dbeafe !important;
        }

        /* El foco pegado dejaba una caja gris fantasma en la celda
           pinchada (pillado por Felipe en el 24): mismo remedio que la
           flecha. El hover de más abajo sigue mandando al posar. */
        .custom-calendar .react-calendar__tile:enabled:focus {
          background: transparent;
        }

        .custom-calendar .react-calendar__tile:enabled:hover {
          background: #f3f4f6;
        }

        .custom-calendar .react-calendar__navigation button {
          font-size: 1.1em;
          padding: 0.8em;
        }

        /* La barra de navegación deja libre el rincón derecho para el
           botón Hoy (12-08: "junto a las flechas"). */
        .custom-calendar .react-calendar__navigation {
          margin-right: 96px;
        }

        /* Flecha con caja gris pegada (12-08): la librería dejaba un
           fondo de foco que no se limpiaba al hacer clic. */
        .custom-calendar .react-calendar__navigation button:enabled:focus {
          background: transparent;
        }

        .custom-calendar .react-calendar__navigation button:enabled:hover {
          background: #f3f4f6;
          border-radius: 8px;
        }

        /* Encabezados LUN-DOM sobrios (12-08): sin el subrayado del
           abbr con title. */
        .custom-calendar .react-calendar__month-view__weekdays {
          font-size: 11px;
          font-weight: 600;
          color: #6b7280;
          text-transform: uppercase;
        }

        .custom-calendar .react-calendar__month-view__weekdays__weekday abbr {
          text-decoration: none;
          cursor: default;
        }

        .custom-calendar .react-calendar__month-view__days__day--weekend {
          color: #dc2626;
        }

        /* HOY (sistema "estilo Google"): el número en una moneda azul
           sólida chica — nada más en la celda (ni anillo ni fondo; el
           amarillo de la librería también se apaga). */
        .custom-calendar .react-calendar__tile--now {
          background: transparent;
        }

        .custom-calendar .react-calendar__tile--now abbr {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 9999px;
          background: #2563eb;
          color: #fff;
          font-weight: 600;
        }

        /* Hoy + seleccionado: la moneda (regla del abbr de arriba) y el
           marco (regla --active, que gana el fondo con su !important)
           conviven sin pelearse. */

        /* "Tiene eventos" lo dicen las pastillas solas (12-08): la
           mancha celeste degradada se eliminó — celdas blancas, grilla
           pareja tenga el día 0, 1 o 3 pastillas. */

        /* Bandas continuas de eventos (segmentos por casilla que se empalman
           con la casilla vecina; puntas redondeadas solo al inicio y al fin
           reales del evento) */
        .ev-bands {
          position: absolute;
          left: 0;
          right: 0;
          /* Bajo la moneda de "hoy" (28px + respiro). */
          top: 32px;
          bottom: 0;
          z-index: 5;
        }

        .ev-band {
          position: absolute;
          left: 0;
          right: 0;
          height: 16px;
          font-size: 10px;
          line-height: 14px;
          font-weight: 600;
          color: #fff;
          overflow: hidden;
          white-space: nowrap;
          text-align: left;
          padding: 1px 5px;
          /* El tooltip necesita hover; el clic igual burbujea al día. */
          pointer-events: auto;
        }

        .ev-band.ev-rl {
          left: 3px;
          border-top-left-radius: 9px;
          border-bottom-left-radius: 9px;
        }

        .ev-band.ev-rr {
          right: 3px;
          border-top-right-radius: 9px;
          border-bottom-right-radius: 9px;
        }

        .ev-more {
          position: absolute;
          left: 5px;
          font-size: 10px;
          font-weight: 600;
          color: #6b7280;
        }
      `}</style>
    </div>
  );
}


// ---- Tarjeta del panel lateral, v2 (12-08, jerarquía de Felipe) ----
// N° gris a la esquina · cliente grande · PERSONAS Y MONTO en negrita ·
// chips de categorías (detalle al seleccionar, clave compartida de la
// casa) · personal asignado solo en Post-Venta · comentarios plegados.
function TarjetaEvento({
  q,
  pill,
  companyId,
  onOpen,
}: {
  readonly q: QuotationWithClient;
  readonly pill: React.ReactNode;
  readonly companyId: number;
  readonly onOpen: () => void;
}) {
  const enPostVenta = ["aceptada", "realizada", "cancelada"].includes(
    q.quotation_status,
  );
  // Detalle SOLO al estar visible la tarjeta (día seleccionado); misma
  // clave que la ficha y Post-Venta: el caché trabaja para todos.
  const detalleQuery = useQuery({
    queryKey: ["quotation", q.id],
    queryFn: async () => {
      const { data } = await getQuotationById(String(q.id));
      return data || null;
    },
  });
  const categorias = [
    ...new Set(
      ((detalleQuery.data?.items?.variable_services as
        | { category?: string }[]
        | undefined) ?? [])
        .map((g) => g.category)
        .filter((c): c is string => !!c),
    ),
  ];
  const recursosQuery = useQuery({
    ...recursosQueryOpts(companyId, String(q.id)),
    enabled: enPostVenta && !!companyId,
  });
  const personal = (() => {
    if (!recursosQuery.data) return null;
    const { lines, resources } = recursosQuery.data;
    return lines
      .filter(
        (l) =>
          resources.find((r) => r.id === l.resource_id)?.type === "personal",
      )
      .reduce((s, l) => s + (l.quantity || 1), 0);
  })();

  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
      className="w-full text-left p-4 bg-gray-50 rounded-lg border border-gray-200 hover:shadow-md hover:border-blue-300 hover:bg-blue-50 transition-all cursor-pointer group focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
    >
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <h3 className="font-semibold text-gray-900 group-hover:text-blue-700 flex items-center gap-2 min-w-0">
          <span className="truncate">{q.clients.name}</span>
          <ExternalLink className="h-4 w-4 shrink-0 text-gray-400 group-hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity" />
        </h3>
        <span className="flex flex-col items-end gap-1 shrink-0">
          {pill}
          <span className="text-[11px] text-gray-400">
            N°{q.quotation_number}
          </span>
        </span>
      </div>
      <p className="text-sm font-bold text-gray-900">
        {q.people_count} personas · $
        {Math.round(q.total_amount || 0).toLocaleString("es-CL")}
      </p>
      <p className="text-sm text-gray-600 mt-0.5">{q.event_type}</p>
      {detalleQuery.isPending && (
        <div className="flex gap-1.5 mt-1.5">
          <span className="w-20 h-5 rounded-full bg-gray-200 animate-pulse" />
          <span className="w-16 h-5 rounded-full bg-gray-200 animate-pulse" />
        </div>
      )}
      {categorias.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {categorias.map((c) => (
            <span
              key={c}
              className="px-2 py-0.5 text-[11px] font-semibold rounded-full bg-blue-50 text-blue-700 border border-blue-200"
            >
              {c}
            </span>
          ))}
        </div>
      )}
      {enPostVenta && personal !== null && (
        <p
          className={`text-xs mt-2 ${
            personal > 0 ? "text-gray-600" : "text-amber-700"
          }`}
        >
          👥 {personal > 0 ? `Personal: ${personal} asignados` : "Sin personal asignado"}
        </p>
      )}
    </div>
  );
}
