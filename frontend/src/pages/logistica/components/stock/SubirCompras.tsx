import { useMemo, useRef, useState } from "react";
import { CheckCircle2, FileText, Loader2, Upload } from "lucide-react";
import ConfirmInline from "../../../../components/ConfirmInline";
import FileViewLink from "../../../../components/FileViewLink";
import NumberInput from "../../../../components/inputs/NumberInput";
import SelectWithSearch from "../../../../components/selects/SelectWithSearch";
import { toast } from "../../../../components/toast/Toast";
import { useArrastreDeArchivos } from "../../../../hooks/useArrastreDeArchivos";
import {
  UNIT_FAMILY_INFO,
  type Supply,
} from "../../../../types/logistics.types";
import { humanizeApiError } from "../../../../utils/apiErrors";
import {
  agregarEquivalente,
  aplicarCompra,
  cambiarLinea,
  descartarCompra,
  subirCompra,
  type CompraSubida,
  type Equivalente,
  type LineaDeCompra,
} from "../../../../services/stock.service";

// SUBIR COMPRAS (doc 25, 23-11-2026). Felipe: *"poder ir subiendo las
// facturas, las guías o screenshot de la guía de despacho… y que se vayan
// utilizando los costos para tener los márgenes bien"*. La IA lee cada
// línea y la asocia a un insumo; nada cambia en el catálogo hasta que una
// persona marca el check y aplica. Lo que sube o baja más de 20 % parte
// sin check y en ámbar.

const SALTO_GRANDE = 20;

const fmtMoney = (v: number) => `$${Math.round(v).toLocaleString("es-CL")}`;
const fmtCosto = (v: number) =>
  `$${v.toLocaleString("es-CL", { maximumFractionDigits: v < 100 ? 2 : 0 })}`;
const fmtQty = (v: number) =>
  v.toLocaleString("es-CL", { maximumFractionDigits: 3 });
const fmtDia = (iso: string | null) =>
  iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}` : "";

const TIPO: Record<string, string> = {
  factura: "Factura",
  boleta: "Boleta",
  guia: "Guía",
  pedido: "Pedido",
  otro: "Compra",
};

const variacion = (antes: number | null, nuevo: number | null) =>
  antes && nuevo ? Math.round(((nuevo - antes) / antes) * 100) : null;

/** Una línea se puede aplicar si tiene insumo y algo que aplicar. */
const aplicable = (l: LineaDeCompra) =>
  l.estado === "propuesta" &&
  !!l.supply_id &&
  ((l.costo_base ?? 0) > 0 || (l.cantidad_base ?? 0) > 0);

/** Lo que parte marcado: aplicable y sin un salto grande de costo. */
const marcadaDeFabrica = (l: LineaDeCompra) => {
  if (!aplicable(l)) return false;
  const v = variacion(l.costo_antes, l.costo_base);
  return v === null || Math.abs(v) <= SALTO_GRANDE;
};

/** Para comparar nombres: sin tildes ni mayúsculas. */
const normal = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

export default function SubirCompras({
  compras,
  supplies,
  equivalentes,
  onCambio,
}: {
  readonly compras: CompraSubida[];
  readonly supplies: Supply[];
  readonly equivalentes: Equivalente[];
  readonly onCambio: (costosCambiados?: boolean) => void;
}) {
  const [leyendo, setLeyendo] = useState<string[]>([]);
  const entrada = useRef<HTMLInputElement>(null);

  const leer = async (archivos: File[]) => {
    for (const a of archivos) {
      setLeyendo((l) => [...l, a.name]);
      try {
        const r = await subirCompra(a);
        const n = r.compra?.lineas?.length ?? 0;
        toast.success(
          `${a.name}: ${n} línea${n === 1 ? "" : "s"} leída${n === 1 ? "" : "s"}`,
        );
        r.avisos.forEach((t) => toast.warn(t, { sticky: true }));
        onCambio();
      } catch (e) {
        toast.error(`${a.name}: ${humanizeApiError(e, "no se pudo leer")}`, {
          sticky: true,
        });
      } finally {
        setLeyendo((l) => l.filter((x) => x !== a.name));
      }
    }
  };

  const { arrastrando, zona } = useArrastreDeArchivos((f) => void leer(f));
  const porRevisar = compras.filter((c) => c.estado === "por_revisar");
  const aplicadas = compras.filter((c) => c.estado === "aplicada");

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 border-b border-gray-200 pb-2">
        <Upload size={17} className="text-blue-600" />
        <h3 className="text-base font-bold text-gray-900">Subir compras</h3>
        {porRevisar.length > 0 && (
          <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-amber-100 text-amber-800">
            {porRevisar.length} por revisar
          </span>
        )}
      </div>

      <div
        {...zona}
        onClick={() => entrada.current?.click()}
        className={`cursor-pointer rounded-lg border-2 border-dashed px-4 py-5 text-center text-sm transition-colors ${
          arrastrando
            ? "border-blue-500 bg-blue-50 text-blue-700"
            : "border-gray-300 text-gray-500 hover:border-blue-400 hover:bg-blue-50/40"
        }`}
      >
        <input
          ref={entrada}
          type="file"
          multiple
          accept="application/pdf,image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = [...(e.target.files ?? [])];
            e.target.value = "";
            if (f.length) void leer(f);
          }}
        />
        Arrastra la factura, la guía de despacho o el pantallazo del pedido
        <span className="block text-xs text-gray-400 mt-0.5">
          PDF o foto · la IA lee cada línea y propone el costo nuevo
        </span>
        {leyendo.length > 0 && (
          <span className="mt-2 flex items-center justify-center gap-2 text-blue-700 font-medium">
            <Loader2 size={15} className="animate-spin" />
            Leyendo {leyendo.join(", ")}…
          </span>
        )}
      </div>

      {porRevisar.map((c) => (
        <TarjetaDeCompra
          key={c.id}
          compra={c}
          supplies={supplies}
          equivalentes={equivalentes}
          onCambio={onCambio}
        />
      ))}

      {aplicadas.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs font-semibold text-gray-500 hover:text-gray-700">
            Últimas compras aplicadas ({aplicadas.length})
          </summary>
          <ul className="mt-2 divide-y divide-gray-100 border border-gray-200 rounded-lg">
            {aplicadas.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-3 px-3 py-1.5 text-xs"
              >
                <CheckCircle2 size={14} className="text-green-600 shrink-0" />
                <span className="font-medium text-gray-800 truncate">
                  {c.proveedor_texto || "Proveedor"}
                </span>
                <span className="text-gray-500">
                  {TIPO[c.tipo_documento ?? "otro"]}
                  {c.numero ? ` N° ${c.numero}` : ""} · {fmtDia(c.fecha)}
                </span>
                <span className="text-gray-400">
                  {c.lineas.filter((l) => l.estado === "aplicada").length}{" "}
                  aplicadas
                </span>
                <span className="ml-auto">
                  <FileViewLink
                    url={c.archivo}
                    title={c.nombre_archivo ?? "Compra"}
                  />
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function TarjetaDeCompra({
  compra,
  supplies,
  equivalentes,
  onCambio,
}: {
  readonly compra: CompraSubida;
  readonly supplies: Supply[];
  readonly equivalentes: Equivalente[];
  readonly onCambio: (costosCambiados?: boolean) => void;
}) {
  const porId = useMemo(
    () => new Map(supplies.map((s) => [s.id, s])),
    [supplies],
  );
  const opciones = useMemo(
    () =>
      supplies
        .filter((s) => s.is_active !== false)
        .map((s) => ({
          value: String(s.id),
          label: s.name,
          hint: UNIT_FAMILY_INFO[s.unit_family]?.base,
        })),
    [supplies],
  );
  const [marcadas, setMarcadas] = useState<Set<number>>(
    () => new Set(compra.lineas.filter(marcadaDeFabrica).map((l) => l.id)),
  );
  const [ocupado, setOcupado] = useState(false);
  const [descartando, setDescartando] = useState(false);
  // Las preguntas «¿Es un corte o una marca?» que se contestaron «No».
  const [noEs, setNoEs] = useState<Set<number>>(new Set());
  const guardados = useMemo(
    () =>
      new Set(equivalentes.map((e) => `${e.supply_id}|${normal(e.nombre)}`)),
    [equivalentes],
  );

  // LOS EQUIVALENTES SE DEFINEN AQUÍ (doc 25 D14, 23-11-2026). Felipe:
  // *"que ahí pregunte bien de qué insumo estamos hablando"*. Si la línea
  // trae un corte o una marca que no es el nombre del insumo y todavía no
  // está guardado, se pregunta; la respuesta queda para la próxima compra.
  const preguntarEquivalente = (l: LineaDeCompra, insumo?: Supply) =>
    !!insumo &&
    !!l.equivalente &&
    l.estado === "propuesta" &&
    !noEs.has(l.id) &&
    normal(l.equivalente) !== normal(insumo.name) &&
    !guardados.has(`${insumo.id}|${normal(l.equivalente)}`);

  const guardarEquivalente = async (
    l: LineaDeCompra,
    insumo: Supply,
    tipo: "corte" | "marca",
  ) => {
    try {
      await agregarEquivalente(insumo.id, l.equivalente ?? l.texto, tipo);
      toast.success(`«${l.equivalente}» quedó como ${tipo} de ${insumo.name}`);
      onCambio();
    } catch (e) {
      toast.error(humanizeApiError(e, "No se pudo guardar"));
    }
  };

  const cambiar = async (
    l: LineaDeCompra,
    cambios: Parameters<typeof cambiarLinea>[1],
  ) => {
    try {
      const nueva = await cambiarLinea(l.id, cambios);
      const ln = nueva.lineas.find((x) => x.id === l.id);
      setMarcadas((prev) => {
        const s = new Set(prev);
        if (ln && marcadaDeFabrica(ln)) s.add(l.id);
        else s.delete(l.id);
        return s;
      });
      onCambio();
    } catch (e) {
      toast.error(humanizeApiError(e, "No se pudo cambiar la línea"));
    }
  };

  const aplicar = async () => {
    const ids = compra.lineas
      .filter((l) => marcadas.has(l.id) && aplicable(l))
      .map((l) => l.id);
    if (!ids.length) return;
    setOcupado(true);
    try {
      const r = await aplicarCompra(compra.id, ids);
      toast.success(
        `${r.aplicadas} costo${r.aplicadas === 1 ? "" : "s"} al día · la bodega sumó lo comprado`,
      );
      onCambio(true);
    } catch (e) {
      toast.error(humanizeApiError(e, "No se pudo aplicar"));
    } finally {
      setOcupado(false);
    }
  };

  const nMarcadas = compra.lineas.filter(
    (l) => marcadas.has(l.id) && aplicable(l),
  ).length;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-blue-50/60 border-b border-gray-200 px-3 py-2">
        <FileText size={15} className="text-blue-700" />
        <span className="text-sm font-bold text-blue-900">
          {compra.proveedor_texto || "Proveedor sin nombre"}
        </span>
        <span className="text-xs text-gray-600">
          {TIPO[compra.tipo_documento ?? "otro"]}
          {compra.numero ? ` N° ${compra.numero}` : ""}
          {compra.fecha ? ` · ${fmtDia(compra.fecha)}` : ""}
        </span>
        <span
          className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full ${
            compra.con_iva
              ? "bg-violet-100 text-violet-700"
              : "bg-gray-100 text-gray-600"
          }`}
          title={
            compra.con_iva
              ? "Montos con IVA (boleta o pedido): el costo queda con IVA"
              : "Montos netos (factura): el costo queda neto"
          }
        >
          {compra.con_iva ? "con IVA" : "neto"}
        </span>
        <FileViewLink
          url={compra.archivo}
          title={compra.nombre_archivo ?? "Compra"}
        />
        <span className="ml-auto">
          {descartando ? (
            <ConfirmInline
              question="¿Descartar esta compra? No cambia ningún costo."
              yesLabel="Sí, descartar"
              onYes={async () => {
                try {
                  await descartarCompra(compra.id);
                  onCambio();
                } catch (e) {
                  toast.error(humanizeApiError(e, "No se pudo descartar"));
                }
              }}
              onNo={() => setDescartando(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setDescartando(true)}
              className="text-xs font-semibold text-gray-500 hover:text-red-600"
            >
              Descartar
            </button>
          )}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm table-fixed">
          <colgroup>
            <col className="w-9" />
            <col className="w-[26%]" />
            <col className="w-[24%]" />
            <col className="w-32" />
            <col className="w-28" />
            <col className="w-28" />
            <col className="w-36" />
          </colgroup>
          <thead className="border-b border-gray-200 text-[11px] uppercase tracking-wide text-gray-500">
            <tr>
              <th />
              <th className="px-2 py-1.5 text-left font-semibold">
                Lo que dice la compra
              </th>
              <th className="px-2 py-1.5 text-left font-semibold">
                Va a insumo
              </th>
              <th className="px-2 py-1.5 text-right font-semibold">Cantidad</th>
              <th className="px-2 py-1.5 text-right font-semibold">Total</th>
              <th className="px-2 py-1.5 text-right font-semibold">
                Costo antes
              </th>
              <th className="px-2 py-1.5 text-right font-semibold">
                Costo nuevo
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {compra.lineas.map((l) => {
              const insumo = l.supply_id ? porId.get(l.supply_id) : undefined;
              const base = insumo
                ? UNIT_FAMILY_INFO[insumo.unit_family]?.base
                : "";
              const v = variacion(l.costo_antes, l.costo_base);
              // Un salto grande, hacia arriba o hacia abajo: ámbar y sin check.
              const salto = v !== null && Math.abs(v) > SALTO_GRANDE;
              const fuera = l.estado === "no_es_insumo";
              const hecha = l.estado === "aplicada";
              return (
                <tr
                  key={l.id}
                  className={
                    hecha
                      ? "bg-green-50/50"
                      : fuera
                        ? "bg-gray-50 text-gray-400"
                        : salto
                          ? "bg-amber-50"
                          : ""
                  }
                >
                  <td className="px-2 py-1.5 text-center">
                    {hecha ? (
                      <CheckCircle2
                        size={15}
                        className="text-green-600 inline"
                      />
                    ) : (
                      <input
                        type="checkbox"
                        className="rounded"
                        disabled={!aplicable(l)}
                        checked={marcadas.has(l.id) && aplicable(l)}
                        onChange={() =>
                          setMarcadas((prev) => {
                            const s = new Set(prev);
                            if (s.has(l.id)) s.delete(l.id);
                            else s.add(l.id);
                            return s;
                          })
                        }
                        aria-label={`Aplicar ${l.texto}`}
                      />
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <span
                      className="block truncate text-gray-800"
                      title={l.texto}
                    >
                      {l.texto}
                    </span>
                    {l.cantidad_texto && (
                      <span className="block text-[11px] text-gray-400 truncate">
                        {l.cantidad_texto}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {fuera ? (
                      <button
                        type="button"
                        onClick={() => void cambiar(l, { no_es_insumo: false })}
                        className="text-xs text-gray-500 hover:text-blue-700"
                      >
                        No es insumo · deshacer
                      </button>
                    ) : hecha ? (
                      <span className="text-gray-800">
                        {insumo?.name ?? "—"}
                      </span>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <div className="min-w-0 flex-1">
                          <SelectWithSearch
                            options={opciones}
                            value={l.supply_id ? String(l.supply_id) : ""}
                            onChange={(val) =>
                              void cambiar(l, {
                                supply_id: val ? Number(val) : null,
                              })
                            }
                            placeholder="Asociar a insumo…"
                            searchPlaceholder="Buscar insumo…"
                            tamano="sm"
                            mostrarConteo={false}
                          />
                        </div>
                        {!l.supply_id && (
                          <button
                            type="button"
                            onClick={() =>
                              void cambiar(l, { no_es_insumo: true })
                            }
                            className="shrink-0 text-[11px] font-semibold text-gray-500 hover:text-gray-800"
                            title="Flete, despacho, descuento… no es un insumo"
                          >
                            No es insumo
                          </button>
                        )}
                      </div>
                    )}
                    {/* «¿Cuál es?»: la IA dudó y dejó los posibles. */}
                    {!l.supply_id &&
                      !fuera &&
                      !hecha &&
                      (l.posibles?.length ?? 0) > 0 && (
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          <span className="text-[11px] font-semibold text-amber-700">
                            ¿Cuál es?
                          </span>
                          {(l.posibles ?? []).map((id) => {
                            const p = porId.get(id);
                            if (!p) return null;
                            return (
                              <button
                                key={id}
                                type="button"
                                onClick={() =>
                                  void cambiar(l, { supply_id: id })
                                }
                                className="px-2 py-0.5 text-[11px] font-semibold rounded-full border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                              >
                                {p.name}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    {insumo && preguntarEquivalente(l, insumo) ? (
                      <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px]">
                        <span className="text-violet-800">
                          ¿«{l.equivalente}» es un corte o una marca de{" "}
                          {insumo.name}?
                        </span>
                        {(["corte", "marca"] as const).map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() =>
                              void guardarEquivalente(l, insumo, t)
                            }
                            className="px-2 py-0.5 font-semibold rounded-full border border-violet-300 bg-violet-50 text-violet-800 hover:bg-violet-100"
                          >
                            {t === "corte" ? "Corte" : "Marca"}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() =>
                            setNoEs((prev) => new Set(prev).add(l.id))
                          }
                          className="px-1.5 py-0.5 font-semibold text-gray-500 hover:text-gray-800"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      l.equivalente &&
                      !fuera &&
                      insumo &&
                      guardados.has(
                        `${insumo.id}|${normal(l.equivalente)}`,
                      ) && (
                        <span className="mt-0.5 inline-block px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-violet-100 text-violet-700">
                          {l.equivalente}
                        </span>
                      )
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {hecha || fuera || !insumo ? (
                      <span className="tabular-nums">
                        {l.cantidad_base
                          ? `${fmtQty(l.cantidad_base)} ${base}`
                          : "—"}
                      </span>
                    ) : (
                      <span className="relative inline-block w-full">
                        <NumberInput
                          value={l.cantidad_base ?? undefined}
                          onChange={() => {}}
                          onCommit={(val) => {
                            if ((val ?? null) !== l.cantidad_base) {
                              void cambiar(l, { cantidad_base: val ?? null });
                            }
                          }}
                          min={0}
                          placeholder="?"
                          aria-label={`Cantidad de ${l.texto}`}
                          className="w-full !rounded-md !py-0.5 !pl-1 !pr-6 text-sm text-right tabular-nums"
                        />
                        <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">
                          {base}
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {l.total ? fmtMoney(l.total) : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-gray-500">
                    {l.costo_antes ? `${fmtCosto(l.costo_antes)}/${base}` : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                    {l.costo_base ? (
                      <>
                        <span className="font-semibold text-gray-900">
                          {fmtCosto(l.costo_base)}/{base}
                        </span>
                        {v !== null && v !== 0 && (
                          <span
                            className={`ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full ${
                              salto
                                ? "bg-amber-200 text-amber-900"
                                : v > 0
                                  ? "bg-green-100 text-green-700"
                                  : "bg-blue-100 text-blue-700"
                            }`}
                          >
                            {v > 0 ? "+" : ""}
                            {v}%
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-[11px] text-gray-400">
                        {insumo ? "sin monto" : ""}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3 border-t border-gray-100 px-3 py-2">
        <span className="text-[11px] text-gray-500">
          Al aplicar: el costo va al catálogo, lo comprado suma a la bodega y la
          próxima compra de este proveedor se asocia sola.
        </span>
        <button
          type="button"
          disabled={ocupado || nMarcadas === 0}
          onClick={() => void aplicar()}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
        >
          {ocupado ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <CheckCircle2 size={14} />
          )}
          Aplicar {nMarcadas} marcada{nMarcadas === 1 ? "" : "s"}
        </button>
      </div>
    </div>
  );
}
