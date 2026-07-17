import { useState } from "react";
import { Check } from "lucide-react";
import { FixedService } from "../../../types/services.types";
import { updateFixedServiceCosts } from "../../../services/logistics.service";
import { NumberInput } from "../../../components/inputs";

const clp = (n: number) => "$" + Math.round(n || 0).toLocaleString("es-CL");

// Costo de un servicio fijo: fijo (tercerización) y/o variable por persona,
// NO excluyentes. Ej: audiovisual = solo fijo; arriendo de salón con sillas
// arrendadas = fijo + por persona.
export default function FixedCostSection({
  service,
}: {
  readonly service: FixedService;
}) {
  const [costFixed, setCostFixed] = useState<number>(service.cost_fixed || 0);
  const [costPerPerson, setCostPerPerson] = useState<number>(
    service.cost_per_person || 0,
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setErr(null);
    const { error } = await updateFixedServiceCosts(service.id, {
      cost_fixed: costFixed || 0,
      cost_per_person: costPerPerson || 0,
    });
    setSaving(false);
    if (error) {
      setErr("No se pudo guardar el costo.");
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  const price = service.price || 0;
  const onlyFixedCost = (costPerPerson || 0) === 0;
  const margin = price - (costFixed || 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Costo fijo (tercerización)
          </label>
          <NumberInput
            value={costFixed || undefined}
            onChange={(v) => setCostFixed(v || 0)}
            min={0}
            formatThousands
            placeholder="0"
          />
          <p className="mt-1 text-xs text-gray-400">
            Lo que te cuesta el servicio por evento (ej: proveedor audiovisual).
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Costo variable por persona
          </label>
          <NumberInput
            value={costPerPerson || undefined}
            onChange={(v) => setCostPerPerson(v || 0)}
            min={0}
            formatThousands
            placeholder="0"
          />
          <p className="mt-1 text-xs text-gray-400">
            Se multiplica por las personas del evento (ej: arriendo de sillas).
          </p>
        </div>
      </div>

      {/* Resumen */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm">
        {onlyFixedCost ? (
          <div className="flex items-center justify-between">
            <span className="text-gray-600">
              Venta {clp(price)} − costo {clp(costFixed)}
            </span>
            <span
              className={`font-bold ${margin >= 0 ? "text-green-600" : "text-red-600"}`}
            >
              Margen {clp(margin)}
              {price > 0 && (
                <span className="text-xs font-semibold">
                  {" "}
                  · {Math.round((margin / price) * 100)}%
                </span>
              )}
            </span>
          </div>
        ) : (
          <span className="text-gray-600">
            Costo por evento = {clp(costFixed)} + {clp(costPerPerson)} ×
            personas <span className="text-gray-400">(el margen exacto se calcula en cada evento)</span>
          </span>
        )}
      </div>

      <div className="flex items-center justify-end gap-3">
        {saved && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-600">
            <Check size={13} /> Guardado
          </span>
        )}
        {err && <span className="text-xs text-red-600">{err}</span>}
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Guardar costo"}
        </button>
      </div>
    </div>
  );
}
