import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import {
  format,
  isSameDay,
  startOfMonth,
  endOfMonth,
  isWithinInterval,
  isValid,
  parseISO,
} from "date-fns";
import { es } from "date-fns/locale";
import {
  Filter,
  X,
  Calendar as CalendarIcon,
  CalendarDays,
  ExternalLink,
} from "lucide-react";
import {
  QuotationRequestType,
  QuotationStatus,
  QuotationWithClient,
} from "../../types/quotations.types";
import { getQuotations } from "../../services/quotations.service";
// import { findAllEvents } from "../../services/calendar.service";

type ValuePiece = Date | null;
type Value = ValuePiece | [ValuePiece, ValuePiece];

export default function CalendarPage() {
  const [searchParams] = useSearchParams();

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

  // Get initial statuses based on filter query parameter
  const getInitialStatuses = (): QuotationStatus[] => {
    const filterParam = searchParams.get("filter");
    if (filterParam === "all") {
      // Return all statuses except RECHAZADA
      return [
        QuotationStatus.SOLICITADA,
        QuotationStatus.ENVIADA,
        QuotationStatus.EN_NEGOCIACION,
        QuotationStatus.ACEPTADA,
      ];
    }
    // Default to only ACEPTADA
    return [QuotationStatus.ACEPTADA];
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
  const [showFilters, setShowFilters] = useState(false);
  const [selectedStatuses, setSelectedStatuses] =
    useState<QuotationStatus[]>(getInitialStatuses());
  const [currentMonthEventsCount, setCurrentMonthEventsCount] = useState(0);

  const statusOptions = [
    {
      value: QuotationStatus.SOLICITADA,
      label: "Solicitada",
      color: "bg-yellow-500",
    },
    {
      value: QuotationStatus.ENVIADA,
      label: "Enviada",
      color: "bg-blue-500",
    },
    {
      value: QuotationStatus.EN_NEGOCIACION,
      label: "En Negociación",
      color: "bg-purple-500",
    },
    {
      value: QuotationStatus.ACEPTADA,
      label: "Aceptada",
      color: "bg-green-500",
    },
    {
      value: QuotationStatus.RECHAZADA,
      label: "Rechazada",
      color: "bg-red-500",
    },
  ];

  // Eventos del calendario vía React Query (Etapa 3): la clave parte
  // con "quotations", así los guardados que invalidan cotizaciones
  // refrescan también el calendario. Al cambiar los filtros se sigue
  // mostrando el mes anterior mientras llega la nueva selección.
  const calendarQuery = useQuery({
    queryKey: [
      "quotations",
      "calendar",
      [...selectedStatuses].sort().join(","),
    ],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<QuotationWithClient[]> => {
      const response = await getQuotations(
        QuotationRequestType.COTIZACION,
        selectedStatuses,
      );
      return (response.data || []).filter((q) => q.event_date != null);
    },
  });
  const quotations = calendarQuery.data ?? [];
  const loading = calendarQuery.isPending;

  useEffect(() => {
    const currentMonth = activeMonth;
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);

    const monthStartStr = format(monthStart, "yyyy-MM-dd");
    const monthEndStr = format(monthEnd, "yyyy-MM-dd");
    const count = quotations.filter((q) => {
      // Cuenta el evento si su RANGO toca el mes visible.
      const startStr = String(q.event_date).split("T")[0];
      const rawEnd = q.event_end_date
        ? String(q.event_end_date).split("T")[0]
        : startStr;
      const endStr = rawEnd >= startStr ? rawEnd : startStr;
      return startStr <= monthEndStr && endStr >= monthStartStr;
    }).length;

    setCurrentMonthEventsCount(count);
  }, [activeMonth, quotations]);

  // (fetchQuotations eliminado: React Query reacciona sola a los filtros.)

  // Colores sólidos por estado para las bandas (hex, no clases tailwind).
  const STATUS_HEX: Record<string, string> = {
    solicitada: "#eab308",
    enviada: "#3b82f6",
    en_negociacion: "#a855f7",
    aceptada: "#22c55e",
    rechazada: "#ef4444",
    cancelada: "#9ca3af",
    realizada: "#10b981",
  };

  // Rango [inicio, fin] de un evento en texto yyyy-mm-dd (fin >= inicio).
  const eventRange = (q: QuotationWithClient) => {
    const start = String(q.event_date).split("T")[0];
    const rawEnd = q.event_end_date
      ? String(q.event_end_date).split("T")[0]
      : start;
    return { start, end: rawEnd >= start ? rawEnd : start };
  };

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

  const tileClassName = ({ date, view }: { date: Date; view: string }) => {
    if (view === "month") {
      const dayQuotations = getQuotationsForDate(date);
      if (dayQuotations.length > 0) {
        return "has-events";
      }
    }
    return "";
  };

  // Bandas continuas estilo agenda: cada evento es una barra que atraviesa
  // sus días. En cada casilla se dibuja el SEGMENTO que le toca: punta
  // redondeada solo en el primer y último día, y el nombre en el primer día
  // de cada tramo semanal. Máximo 3 pistas visibles + "+N más".
  const MAX_BAND_LANES = 3;
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
        return {
          id: q.id,
          lane,
          color: STATUS_HEX[q.quotation_status] || "#6b7280",
          rl: tileStr === start,
          rr: tileStr === end,
          label:
            tileStr === start || isMonday
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
            className={`ev-band${b.rl ? " ev-rl" : ""}${b.rr ? " ev-rr" : ""}`}
            style={{ top: b.lane * 20, background: b.color }}
          >
            {b.label && <span>{b.label}</span>}
          </div>
        ))}
        {extra > 0 && (
          <div className="ev-more" style={{ top: MAX_BAND_LANES * 20 }}>
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
  };

  const handleNavigateToQuotation = (quotationId: string) => {
    window.open(`/quotation-form/${quotationId}`, "_blank");
  };

  const eventsForSelectedDate = selectedDate
    ? getQuotationsForDate(selectedDate)
    : [];

  const currentMonthName =
    value instanceof Date
      ? format(value, "MMMM yyyy", { locale: es })
      : format(new Date(), "MMMM yyyy", { locale: es });

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
            <div className="ml-11 mt-2 flex items-center gap-2">
              <span className="text-sm text-gray-600 capitalize">
                {currentMonthName}:
              </span>
              <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-semibold">
                {currentMonthEventsCount}{" "}
                {currentMonthEventsCount === 1 ? "evento" : "eventos"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleGoToToday}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <CalendarDays className="h-4 w-4" />
              Hoy
            </button>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Filter className="h-4 w-4" />
              Filtros
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6 border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Filtrar por Estado
              </h3>
              <button
                onClick={() => setShowFilters(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex flex-wrap gap-3">
              {statusOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleStatusToggle(option.value)}
                  className={`px-4 py-2 rounded-lg border-2 transition-all ${
                    selectedStatuses.includes(option.value)
                      ? `${option.color} text-white border-transparent`
                      : "bg-white text-gray-700 border-gray-300 hover:border-gray-400"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {selectedStatuses.length === 0 && (
              <p className="mt-3 text-sm text-amber-600">
                Selecciona al menos un estado para ver eventos
              </p>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
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
                tileClassName={tileClassName}
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
                  <button
                    key={quotation.id}
                    onClick={() => handleNavigateToQuotation(quotation.id)}
                    className="w-full text-left p-4 bg-gray-50 rounded-lg border border-gray-200 hover:shadow-md hover:border-blue-300 hover:bg-blue-50 transition-all cursor-pointer group focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900 group-hover:text-blue-700">
                          {quotation.clients.name}
                        </h3>
                        <ExternalLink className="h-4 w-4 text-gray-400 group-hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <span
                        className={`px-2 py-1 text-xs rounded-full text-white ${getStatusColor(quotation.quotation_status)}`}
                      >
                        {getStatusLabel(quotation.quotation_status)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mb-1">
                      <span className="font-medium">Tipo:</span>{" "}
                      {quotation.event_type}
                    </p>
                    <p className="text-sm text-gray-600 mb-1">
                      <span className="font-medium">Personas:</span>{" "}
                      {quotation.people_count}
                    </p>
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Cotización:</span> N°
                      {quotation.quotation_number}
                    </p>
                    {quotation.observations && (
                      <p className="text-sm text-gray-500 mt-2 italic">
                        {quotation.observations}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedStatuses.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="flex flex-wrap gap-2">
                {statusOptions
                  .filter((option) => selectedStatuses.includes(option.value))
                  .map((option) => (
                    <div
                      key={option.value}
                      className="flex items-center gap-1.5"
                    >
                      <div className={`w-2 h-2 rounded-full ${option.color}`} />
                      <span className="text-xs text-gray-600">
                        {option.label}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .custom-calendar {
          width: 100%;
          border: none;
        }

        .custom-calendar .react-calendar__tile {
          padding: 0;
          position: relative;
          height: 118px;
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
          margin-top: 0.3em;
          font-weight: 500;
        }

        .custom-calendar .react-calendar__tile--active {
          background: #2563eb !important;
          color: white;
          box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4);
        }

        .custom-calendar .react-calendar__tile--active abbr {
          color: white;
        }

        .custom-calendar .react-calendar__tile--active:enabled:hover {
          background: #1d4ed8 !important;
        }

        .custom-calendar .react-calendar__tile:enabled:hover {
          background: #f3f4f6;
        }

        .custom-calendar .react-calendar__navigation button {
          font-size: 1.1em;
          padding: 0.8em;
        }

        .custom-calendar .react-calendar__month-view__days__day--weekend {
          color: #dc2626;
        }

        .custom-calendar .react-calendar__tile--now {
          background: #dbeafe;
          border-radius: 8px;
          /* inset shadow en vez de borde: no corre las bandas ni un pixel */
          box-shadow: inset 0 0 0 2px #3b82f6;
        }

        .custom-calendar .react-calendar__tile--now abbr {
          color: #1d4ed8;
          font-weight: 600;
        }

        /* La selección es la capa de arriba: si el día seleccionado es
           también "hoy", mandan el bloque azul y el número en blanco */
        .custom-calendar .react-calendar__tile--now.react-calendar__tile--active {
          background: #2563eb !important;
          box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4);
        }

        .custom-calendar .react-calendar__tile--now.react-calendar__tile--active abbr {
          color: white;
        }

        /* Días con eventos: tinte suave SIN borde ni transform (los bordes
           corren las bandas y el scale rompe la continuidad entre casillas) */
        .custom-calendar .react-calendar__tile.has-events {
          background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
        }

        .custom-calendar .react-calendar__tile.has-events:enabled:hover {
          background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
        }

        .custom-calendar .react-calendar__tile--active.has-events {
          background: #2563eb !important;
        }

        /* Bandas continuas de eventos (segmentos por casilla que se empalman
           con la casilla vecina; puntas redondeadas solo al inicio y al fin
           reales del evento) */
        .ev-bands {
          position: absolute;
          left: 0;
          right: 0;
          top: 38px;
          bottom: 0;
          z-index: 5;
        }

        .ev-band {
          position: absolute;
          left: 0;
          right: 0;
          height: 17px;
          font-size: 10px;
          line-height: 15px;
          font-weight: 600;
          color: #fff;
          overflow: hidden;
          white-space: nowrap;
          text-align: left;
          padding: 1px 5px;
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
