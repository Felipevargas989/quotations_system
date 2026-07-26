import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Eye, EyeOff, Pencil, Search, Trash2, X } from "lucide-react";
import { matchesSearch } from "../../../utils/searchMatch";
import {
  formatPhone,
  normalizePhone,
  PHONE_PLACEHOLDER,
} from "../../../utils/phone";
import {
  createSupplier,
  deleteSupplier,
  getSuppliers,
  getSuppliersUsage,
  updateSupplier,
} from "../../../services/logistics.service";
import { Supplier } from "../../../types/logistics.types";

export default function ProveedoresTab({
  companyId,
}: {
  readonly companyId: number;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  // Dar de baja con recursos/insumos asociados: confirmación inline (sin
  // popup del navegador), mismo patrón flotante del basurero.
  const [confirmBajaId, setConfirmBajaId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [listErr, setListErr] = useState<string | null>(null);

  // Vía React Query (Etapa 3): spinner solo la PRIMERA carga; los
  // refrescos tras guardar/editar/eliminar son silenciosos (histórico).
  const proveedoresQuery = useQuery({
    queryKey: ["logistica", "proveedores", companyId],
    queryFn: async () => {
      const [s, u] = await Promise.all([
        getSuppliers(companyId),
        getSuppliersUsage(companyId),
      ]);
      return { rows: s, usage: u };
    },
  });
  const rows = proveedoresQuery.data?.rows ?? [];
  const usage = proveedoresQuery.data?.usage ?? {};
  const loading = proveedoresQuery.isPending;
  const load = () =>
    queryClient.invalidateQueries({
      queryKey: ["logistica", "proveedores"],
    });

  const doDelete = async (s: Supplier) => {
    setDeleting(true);
    setListErr(null);
    const { error } = await deleteSupplier(s.id);
    setDeleting(false);
    setConfirmDeleteId(null);
    if (error) {
      setListErr(`No se pudo eliminar "${s.name}". Intenta de nuevo.`);
      return;
    }
    load();
  };

  const open = (s?: Supplier) => {
    setEditing(s || null);
    setName(s?.name || "");
    setContactName(s?.contact_name || "");
    setPhone(s?.phone || "");
    setNotes(s?.notes || "");
    setErr(null);
    setShowModal(true);
  };

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setErr(null);
    const fields = {
      name: name.trim(),
      contact_name: contactName.trim() || null,
      phone: phone.trim() || null,
      notes: notes.trim() || null,
    };
    const { error } = editing
      ? await updateSupplier(editing.id, fields)
      : await createSupplier({ company_id: companyId, ...fields });
    setSaving(false);
    if (error) {
      setErr(
        String((error as any).message || error).includes("unique")
          ? "Ya existe un proveedor con ese nombre."
          : "No se pudo guardar.",
      );
      return;
    }
    setShowModal(false);
    load();
  };

  // Dar de baja un proveedor con historia: deja de ofrecerse en los
  // selectores, pero sus insumos siguen apuntándole. El aviso lo dice.
  const toggleActive = async (s: Supplier) => {
    if (s.is_active) {
      const u = usage[s.id];
      const inUse = !!u && (u.supplies > 0 || u.resources > 0);
      if (inUse) {
        // La advertencia se confirma inline sobre la fila.
        setConfirmBajaId(s.id);
        return;
      }
    }
    await updateSupplier(s.id, { is_active: !s.is_active });
    load();
  };

  const doBaja = async (s: Supplier) => {
    await updateSupplier(s.id, { is_active: false });
    setConfirmBajaId(null);
    load();
  };

  const bajaLabel = (id: number) => {
    const u = usage[id];
    if (!u) return "¿Darlo de baja?";
    const parts = [];
    if (u.supplies > 0)
      parts.push(`${u.supplies} insumo${u.supplies === 1 ? "" : "s"}`);
    if (u.resources > 0)
      parts.push(`${u.resources} recurso${u.resources === 1 ? "" : "s"}`);
    return `${parts.join(" y ")} seguirán a su nombre · ¿darlo de baja?`;
  };

  const q = search.trim();
  // Los dados de baja al final de la lista, para que no molesten.
  const filtered = rows
    .filter((r) => !q || matchesSearch(q, r.name))
    .sort((a, b) => Number(b.is_active) - Number(a.is_active));

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            size={16}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar proveedor…"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <button
          onClick={() => open()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700"
        >
          + Nuevo proveedor
        </button>
      </div>

      {listErr && <p className="text-xs text-red-600 mb-2">{listErr}</p>}

      {loading ? (
        <div className="py-10 flex justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center">
          {rows.length === 0
            ? "Aún no hay proveedores. Crea el primero — sirven para agrupar las listas de compra."
            : "Sin resultados."}
        </p>
      ) : (
        <table className="min-w-full divide-y divide-gray-200">
          <thead>
            <tr>
              {["Proveedor", "Contacto", "Teléfono", "Notas", "Acciones"].map(
                (h) => (
                  <th
                    key={h}
                    // Ancho fijo en Acciones: la confirmación de borrado ocupa
                    // lo mismo que los iconos y la tabla no se reacomoda.
                    className={`px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${
                      h === "Acciones" ? "w-36" : ""
                    }`}
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((s) => (
              <tr key={s.id} className={s.is_active ? "" : "opacity-45"}>
                <td className="px-4 py-3 text-sm font-medium text-gray-900">
                  {s.name}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {s.contact_name || "—"}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {formatPhone(s.phone) || "—"}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {s.notes || "—"}
                </td>
                <td className="px-4 py-3">
                  {/* La confirmación flota ENCIMA de los iconos (que quedan
                      invisibles pero ocupando su espacio): el contenido que
                      dimensiona la tabla nunca cambia → cero movimiento. */}
                  <div className="relative">
                    {confirmBajaId === s.id && (
                      <div className="absolute inset-y-0 right-0 z-10 flex items-center gap-1.5 whitespace-nowrap bg-white">
                        <span className="text-xs text-gray-600">
                          {bajaLabel(s.id)}
                        </span>
                        <button
                          onClick={() => doBaja(s)}
                          className="p-1 text-red-600 hover:text-red-800"
                          title="Sí, dar de baja"
                        >
                          <Check size={15} />
                        </button>
                        <button
                          onClick={() => setConfirmBajaId(null)}
                          className="p-1 text-gray-500 hover:text-gray-700"
                          title="Cancelar"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    )}
                    {confirmDeleteId === s.id && (
                      <div className="absolute inset-y-0 left-0 z-10 flex items-center gap-1.5 whitespace-nowrap bg-white">
                        <span className="text-xs text-gray-600">
                          ¿Eliminar?
                        </span>
                        <button
                          disabled={deleting}
                          onClick={() => doDelete(s)}
                          className="p-1 text-red-600 hover:text-red-800 disabled:opacity-50"
                          title="Sí, eliminar"
                        >
                          <Check size={15} />
                        </button>
                        <button
                          disabled={deleting}
                          onClick={() => setConfirmDeleteId(null)}
                          className="p-1 text-gray-500 hover:text-gray-700"
                          title="Cancelar"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    )}
                    <div
                      className={`flex items-center gap-2 h-7 ${
                        confirmDeleteId === s.id || confirmBajaId === s.id
                          ? "invisible"
                          : ""
                      }`}
                    >
                      <button
                        onClick={() => open(s)}
                        className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                        title="Editar"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => toggleActive(s)}
                        className={`p-1.5 rounded-md hover:bg-gray-100 ${
                          s.is_active ? "text-green-600" : "text-gray-400"
                        }`}
                        title={
                          s.is_active
                            ? "Dar de baja (deja de ofrecerse al asignar proveedor)"
                            : "Reactivar"
                        }
                      >
                        {s.is_active ? <Eye size={15} /> : <EyeOff size={15} />}
                      </button>
                      {(() => {
                        const u = usage[s.id];
                        const inUse =
                          !!u && (u.supplies > 0 || u.resources > 0);
                        if (inUse) {
                          const parts = [];
                          if (u.supplies > 0)
                            parts.push(
                              `${u.supplies} insumo${u.supplies === 1 ? "" : "s"}`,
                            );
                          if (u.resources > 0)
                            parts.push(
                              `${u.resources} recurso${u.resources === 1 ? "" : "s"}`,
                            );
                          return (
                            <button
                              disabled
                              className="p-1.5 rounded-md text-gray-300 cursor-not-allowed"
                              title={`En uso (${parts.join(" y ")}): no se puede eliminar. Si cambió de datos, edítalo.`}
                            >
                              <Trash2 size={15} />
                            </button>
                          );
                        }
                        return (
                          <button
                            onClick={() => setConfirmDeleteId(s.id)}
                            className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50"
                            title="Eliminar"
                          >
                            <Trash2 size={15} />
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">
                {editing ? "Editar proveedor" : "Nuevo proveedor"}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-600">
                  Nombre *
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Ej: Verdulería Los Andes"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">
                  Persona de contacto
                </label>
                <input
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Ej: Juan Pérez"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">
                  Teléfono
                </label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onBlur={() => setPhone((p) => normalizePhone(p || ""))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder={PHONE_PLACEHOLDER}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">
                  Notas
                </label>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Ej: viene los martes"
                />
              </div>
              {err && <p className="text-xs text-red-600">{err}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-3 py-2 text-sm text-gray-600"
                >
                  Cancelar
                </button>
                <button
                  onClick={save}
                  disabled={saving || !name.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
