import { useMemo, useRef, useState } from "react";
import { CheckCircle2, FileText, Loader2, Upload, X } from "lucide-react";
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
  l.estado === "propuesta" && !!l.supply_id && (l.costo_base ?? 0) > 0;

/** El insumo lo sugirió la IA dudando: falta que la persona lo confirme. */
const sugerido = (l: LineaDeCompra) =>
  !!l.supply_id && (l.posibles?.length ?? 0) > 0;

/** Lo que parte marcado: aplicable, confirmado y sin un salto grande. */
const marcadaDeFabrica = (l: LineaDeCompra) => {
  if (!aplicable(l) || sugerido(l)) return false;
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
  // LA LISTA, EN ORDEN (Felipe, 23-11: "primero debería sugerirme uno,
  // segundo… otro del proveedor… la punta paleta vacuno va a ser una carne,
  // no la voy a reemplazar por ketchup"): lo que sugirió la IA, después los
  // insumos de ese proveedor y al final todos.
  const activos = useMemo(
    () => supplies.filter((s) => s.is_active !== false),
    [supplies],
  );
  const opcionesPara = (l: LineaDeCompra) => {
    const sugeridos = new Set(l.posibles ?? []);
    if (l.supply_id) sugeridos.add(l.supply_id);
    const prov =
      compra.supplier_id ??
      porId.get(l.supply_id ?? l.posibles?.[0] ?? 0)?.supplier_id ??
      null;
    const fila = (s: Supply, group: string) => ({
      value: String(s.id),
      label: s.name,
      hint: UNIT_FAMILY_INFO[s.unit_family]?.base,
      group,
    });
    return [
      ...[...sugeridos]
        .map((id) => porId.get(id))
        .filter((s): s is Supply => !!s)
        .map((s) => fila(s, "Sugeridos")),
      ...activos
        .filter((s) => prov && s.supplier_id === prov && !sugeridos.has(s.id))
        .map((s) => fila(s, "De este proveedor")),
      ...activos
        .filter(
          (s) => !sugeridos.has(s.id) && !(prov && s.supplier_id === prov),
        )
        .map((s) => fila(s, "Todos los insumos")),
    ];
  };
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
        `${r.aplicadas} costo${r.aplicadas === 1 ? "" : "s"} al día en el catálogo`,
      );
      onCambio(true);
    } catch (e) {
      toast.error(humanizeApiError(e, "No se pudo aplicar"));
    } finally {
      setOcupado(false);
    }
  };

  // Lo aplicado se va de la tarjeta (Felipe, 24-11: "una vez que pongo
  // aplicar debería desaparecer, si no la lista será enorme").
  const pendientes = compra.lineas.filter((l) => l.estado !== "aplicada");
  const nAplicadas = compra.lineas.length - pendientes.length;

  const nMarcadas = compra.lineas.filter(
    (l) => marcadas.has(l.id) && aplicable(l),
  ).length;

  return (
    <div className="border border-gray-200 rounded-lg bg-white">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-t-lg bg-blue-50/60 border-b border-gray-200 px-3 py-2">
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

      {/* UNA FILA POR LÍNEA, TODAS DEL MISMO ALTO (Felipe, 23-11: "esto
          está muy desordenado"). Debajo del insumo, una sola línea chica:
          la pregunta que falta o lo que ya quedó definido. La × de «no es
          insumo» va siempre al final de la fila, y lo que falta lo dice el
          costo nuevo en una palabra. */}
      {/* Sin recorte: la lista de insumos se despliega completa (sin
          overflow, el buscador de la casa se medía contra la tarjeta). */}
      <div>
        <table className="min-w-full text-sm table-fixed">
          <colgroup>
            <col className="w-9" />
            <col className="w-[25%]" />
            <col className="w-[33%]" />
            <col className="w-24" />
            <col className="w-24" />
            <col />
            <col className="w-8" />
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
                Costo nuevo
              </th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {pendientes.map((l) => {
              const insumo = l.supply_id ? porId.get(l.supply_id) : undefined;
              const base = insumo
                ? UNIT_FAMILY_INFO[insumo.unit_family]?.base
                : "";
              const v = variacion(l.costo_antes, l.costo_base);
              // Un salto grande, hacia arriba o hacia abajo: ámbar y sin check.
              const salto = v !== null && Math.abs(v) > SALTO_GRANDE;
              const fuera = l.estado === "no_es_insumo";
              const hecha = l.estado === "aplicada";
              const eqGuardado =
                insumo && l.equivalente
                  ? equivalentes.find(
                      (e) =>
                        e.supply_id === insumo.id &&
                        normal(e.nombre) === normal(l.equivalente ?? ""),
                    )
                  : undefined;
              const falta = !insumo
                ? "elige insumo"
                : !l.cantidad_base
                  ? "falta cantidad"
                  : !l.total
                    ? "sin monto"
                    : "";
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
                  <td className="px-2 py-2 text-center align-middle">
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
                  <td className="px-2 py-2 align-middle">
                    <span
                      className="block truncate text-gray-800"
                      title={l.texto}
                    >
                      {l.texto}
                    </span>
                    <span className="block truncate text-[11px] text-gray-400">
                      {l.cantidad_texto ?? " "}
                    </span>
                  </td>
                  <td className="px-2 py-2 align-middle">
                    {fuera ? (
                      <span className="block truncate text-xs">
                        No es insumo ·{" "}
                        <button
                          type="button"
                          onClick={() =>
                            void cambiar(l, { no_es_insumo: false })
                          }
                          className="font-semibold text-blue-600 hover:text-blue-800"
                        >
                          deshacer
                        </button>
                      </span>
                    ) : hecha ? (
                      <span className="block truncate text-gray-800">
                        {insumo?.name ?? "—"}
                      </span>
                    ) : (
                      <SelectWithSearch
                        options={opcionesPara(l)}
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
                    )}
                    {/* La línea chica: siempre una, siempre del mismo alto. */}
                    <span className="mt-1 block min-h-4 text-[11px] leading-4">
                      {fuera ? (
                        " "
                      ) : insumo && sugerido(l) ? (
                        <span className="text-amber-700">
                          La IA no está segura: ¿es este?{" "}
                          <button
                            type="button"
                            onClick={() =>
                              void cambiar(l, { supply_id: insumo.id })
                            }
                            className="font-semibold text-blue-600 hover:text-blue-800"
                          >
                            Sí
                          </button>
                          {(l.posibles ?? [])
                            .filter((id) => id !== insumo.id)
                            .map((id, i) => {
                              const p = porId.get(id);
                              if (!p) return null;
                              return (
                                <span key={id}>
                                  {i === 0 ? " · o quizás " : " · "}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void cambiar(l, { supply_id: id })
                                    }
                                    className="font-semibold text-blue-600 hover:text-blue-800"
                                  >
                                    {p.name}
                                  </button>
                                </span>
                              );
                            })}
                        </span>
                      ) : !insumo && (l.posibles?.length ?? 0) > 0 ? (
                        <span className="text-amber-700">
                          La IA no sabe cuál es; puede ser{" "}
                          {(l.posibles ?? []).map((id, i) => {
                            const p = porId.get(id);
                            if (!p) return null;
                            return (
                              <span key={id}>
                                {i > 0 && " · "}
                                <button
                                  type="button"
                                  onClick={() =>
                                    void cambiar(l, { supply_id: id })
                                  }
                                  className="font-semibold text-blue-600 hover:text-blue-800"
                                >
                                  {p.name}
                                </button>
                              </span>
                            );
                          })}
                        </span>
                      ) : insumo && preguntarEquivalente(l, insumo) ? (
                        <span className="text-violet-800">
                          ¿«{l.equivalente}» es lo mismo que {insumo.name}?{" "}
                          <button
                            type="button"
                            onClick={() =>
                              void guardarEquivalente(l, insumo, "corte")
                            }
                            className="font-semibold text-blue-600 hover:text-blue-800"
                          >
                            Sí, otro corte
                          </button>
                          {" · "}
                          <button
                            type="button"
                            onClick={() =>
                              void guardarEquivalente(l, insumo, "marca")
                            }
                            className="font-semibold text-blue-600 hover:text-blue-800"
                          >
                            Sí, otra marca
                          </button>
                          {" · "}
                          <button
                            type="button"
                            onClick={() =>
                              setNoEs((prev) => new Set(prev).add(l.id))
                            }
                            className="font-semibold text-gray-500 hover:text-gray-800"
                          >
                            No
                          </button>
                        </span>
                      ) : eqGuardado ? (
                        <span className="text-violet-700">
                          «{eqGuardado.nombre}» es otr
                          {eqGuardado.tipo === "corte" ? "o corte" : "a marca"}{" "}
                          de {insumo?.name}
                        </span>
                      ) : (
                        " "
                      )}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right align-middle">
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
                          className="w-full !pl-2 !pr-7 text-sm text-right tabular-nums"
                        />
                        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">
                          {base}
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums align-middle">
                    {l.total ? fmtMoney(l.total) : "—"}
                  </td>
                  <td className="px-2 py-2 text-right whitespace-nowrap align-middle">
                    {fuera ? (
                      <span className="text-[11px]">—</span>
                    ) : l.costo_base ? (
                      <>
                        <span className="block tabular-nums">
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
                        </span>
                        <span className="block text-[11px] text-gray-400 tabular-nums">
                          {l.costo_antes
                            ? `antes ${fmtCosto(l.costo_antes)}/${base}`
                            : " "}
                        </span>
                      </>
                    ) : (
                      <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-800">
                        {falta || "—"}
                      </span>
                    )}
                  </td>
                  <td className="px-1 py-2 text-center align-middle">
                    {!hecha && !fuera && (
                      <button
                        type="button"
                        onClick={() => void cambiar(l, { no_es_insumo: true })}
                        className="text-gray-300 hover:text-gray-600"
                        title="No es insumo (flete, despacho, descuento…)"
                        aria-label={`${l.texto}: no es insumo`}
                      >
                        <X size={14} />
                      </button>
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
          Lo marcado actualiza el costo del catálogo y se va de esta lista.
          {nAplicadas > 0 &&
            ` Ya aplicada${nAplicadas === 1 ? "" : "s"}: ${nAplicadas}.`}
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
