import { useState, useEffect } from "react";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import {
  format,
  isSameDay,
  startOfMonth,
  endOfMonth,
  isWithinInterval,
} from "date-fns";
import { es } from "date-fns/locale";
import {
  Filter,
  X,
  Calendar as CalendarIcon,
  CalendarDays,
} from "lucide-react";
import { getQuotations } from "../../services/quotations.service";
import {
  QuotationRequestType,
  QuotationStatus,
  QuotationWithClient,
} from "../../types/quotations.types";

type ValuePiece = Date | null;
type Value = ValuePiece | [ValuePiece, ValuePiece];

export default function CalendarPage() {
  const [value, setValue] = useState<Value>(new Date());
  const [quotations, setQuotations] = useState<QuotationWithClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedStatuses, setSelectedStatuses] = useState<QuotationStatus[]>([
    QuotationStatus.ACEPTADA,
  ]);
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

  useEffect(() => {
    fetchQuotations();
  }, [selectedStatuses]);

  useEffect(() => {
    const currentMonth = value instanceof Date ? value : new Date();
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);

    const count = quotations.filter((q) => {
      const eventDate = new Date(q.event_date);
      return isWithinInterval(eventDate, { start: monthStart, end: monthEnd });
    }).length;

    setCurrentMonthEventsCount(count);
  }, [value, quotations]);

  const fetchQuotations = async () => {
    try {
      setLoading(true);
      const response = await getQuotations(
        QuotationRequestType.COTIZACION,
        selectedStatuses,
      );
      if (response.data) {
        const quotationsWithDates = response.data.filter(
          (q) => q.event_date != null,
        );
        setQuotations(quotationsWithDates);
      }
    } catch (error) {
      console.error("Error fetching quotations:", error);
    } finally {
      setLoading(false);
    }
  };

  const getQuotationsForDate = (date: Date): QuotationWithClient[] => {
    return quotations.filter((q) => {
      const eventDate = new Date(q.event_date);
      return isSameDay(eventDate, date);
    });
  };

  const tileContent = ({ date, view }: { date: Date; view: string }) => {
    if (view === "month") {
      const dayQuotations = getQuotationsForDate(date);
      if (dayQuotations.length > 0) {
        return (
          <div className="flex justify-center gap-1 mt-1">
            {dayQuotations.slice(0, 3).map((q) => (
              <div
                key={q.id}
                className={`w-2 h-2 rounded-full ${getStatusColor(q.quotation_status)}`}
                title={q.clients.name}
              />
            ))}
            {dayQuotations.length > 3 && (
              <div className="text-xs text-gray-600">
                +{dayQuotations.length - 3}
              </div>
            )}
          </div>
        );
      }
    }
    return null;
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
      setValue(activeStartDate);
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
                activeStartDate={value instanceof Date ? value : new Date()}
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
                  <div
                    key={quotation.id}
                    className="p-4 bg-gray-50 rounded-lg border border-gray-200 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-gray-900">
                        {quotation.clients.name}
                      </h3>
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
                  </div>
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
          padding: 1.5em 0.5em;
          position: relative;
          height: 100px;
        }

        .custom-calendar .react-calendar__tile--active {
          background: #2563eb !important;
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
        }
      `}</style>
    </div>
  );
}
