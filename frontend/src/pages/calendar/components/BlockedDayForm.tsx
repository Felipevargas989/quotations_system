import { useState } from "react";
import { X, Calendar, Ban } from "lucide-react";
import { createBlockedDays } from "../../../services/calendar.service";
import { CreateBlockedDaysDto } from "../../../types/calendar.types";

interface BlockedDayFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialDate?: Date;
}

export default function BlockedDayForm({
  isOpen,
  onClose,
  onSuccess,
  initialDate,
}: Readonly<BlockedDayFormProps>) {
  const [selectedDate, setSelectedDate] = useState<string>(
    initialDate ? initialDate.toISOString().split("T")[0] : "",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedDate) {
      setError("Por favor selecciona una fecha");
      return;
    }

    try {
      setLoading(true);
      const dto: CreateBlockedDaysDto = {
        date: selectedDate, // YYYY-MM-DD format
      };

      await createBlockedDays(dto);
      onSuccess();
      onClose();
    } catch (err) {
      setError("Error al crear el día bloqueado. Por favor intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setSelectedDate("");
      setError(null);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <Ban className="h-6 w-6 text-red-600" />
            <h2 className="text-xl font-bold text-gray-900">Bloquear Día</h2>
          </div>
          <button
            onClick={handleClose}
            disabled={loading}
            className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6">
          <div className="mb-6">
            <label
              htmlFor="blocked-date"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Fecha a bloquear
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Calendar className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="date"
                id="blocked-date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                disabled={loading}
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                required
              />
            </div>
            <p className="mt-2 text-sm text-gray-500">
              Este día se marcará como no disponible para eventos
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Bloqueando...
                </>
              ) : (
                <>
                  <Ban className="h-4 w-4" />
                  Bloquear Día
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
