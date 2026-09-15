import { useAuth } from "../../contexts/AuthContext";
import { tieneDerecho } from "../../constants/permissions";

// EL ÚLTIMO DÍA DEL EVENTO (extraído del cotizador el 14-09-2026).
//
// Los eventos de varios días entran con el plan Gestiona y Cobra (paso 3.2
// del roadmap de venta). Sin ese derecho el campo no se muestra y el evento
// es de un día; el motor rechaza igual si llega una fecha de término.
//
// La excepción importante: una cotización de varios días que YA EXISTÍA se
// sigue viendo y se sigue editando aunque la empresa haya bajado de plan.
// Bajar de plan no borra ni esconde lo que ya se vendió — solo impide
// crear uno nuevo. Por eso el campo aparece igual cuando ya trae fecha.
//
// Vive en su propio archivo y no dentro de QuotationForm porque esa hoja
// es la central del sistema y está congelada en su tamaño: las piezas
// nuevas se sacan aparte, nunca se engorda el gigante.

type Props = {
  readonly valor?: string | null;
  readonly fechaDeInicio?: string | null;
  readonly soloLectura: boolean;
  readonly onChange: (valor: string | undefined) => void;
};

export default function CampoUltimoDia({
  valor,
  fechaDeInicio,
  soloLectura,
  onChange,
}: Props) {
  const { company } = useAuth();
  const puedeVariosDias = tieneDerecho(company, "varios_dias");

  if (!puedeVariosDias && !valor) return null;

  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        Último día (opcional)
      </label>
      <input
        type="date"
        value={valor || ""}
        min={String(fechaDeInicio || "")}
        onChange={(e) => onChange(e.target.value || undefined)}
        disabled={soloLectura || !fechaDeInicio || !puedeVariosDias}
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
      />
    </div>
  );
}
