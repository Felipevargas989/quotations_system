import { Fragment, useState } from "react";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Download, Eye, FileCode, FileMinus, Search } from "lucide-react";
import FileViewLink from "../../components/FileViewLink";
import SelectWithSearch from "../../components/selects/SelectWithSearch";
import { toast } from "../../components/toast/Toast";
import {
  comprobarDocumento,
  getListaDeFacturacion,
  pedirPdfDelDocumento,
  pedirXmlDelDocumento,
  type DocumentoDeLaLista,
} from "../../services/documentosTributarios.service";
import { descargarArchivo } from "../../services/storage.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { fechaCorta } from "../../utils/ordenesDeCompra";
import { matchesSearch } from "../../utils/searchMatch";
import NominaDelSii from "./NominaDelSii";
import ProbarLaConexion from "./ProbarLaConexion";
import RecibidosDelMes from "./RecibidosDelMes";
import {
  filtrosDeHoy,
  type EstadoDelFiltro,
  type Filtros,
  type TipoDelFiltro,
} from "./filtrosDeLaLista";

// «DOCUMENTOS», LA LISTA DE FACTURACIÓN (doc 19 §9.5 y §9.22, sprint 2),
// como la maqueta que aprobó Felipe el 06-11: *"pequeño dashboard,
// emitidos/recibidos, buscadores y filtros, acciones ver, descargar y
// descargar [XML], el estado para saber si está ok"*.
//
// - El resumen (neto, IVA, total, documentos y por confirmar) sigue a los
//   filtros: suma lo que se ve.
// - Buscar por N° o cliente (también por el RUT); el tipo, el estado y el
//   rango de fechas (este mes, si no se dice; hasta un año por vez).
// - Cada documento en dos líneas (Felipe, 07-11: *"hay que ordenar esa
//   matriz"*): arriba el N°, el cliente, los montos, el estado y los
//   íconos (también «Anular o rebajar…», en rojo y al final); abajo, en
//   letra chica, la fecha (con lo que hace la nota) y lo que cambió el
//   estado. Nada se parte, salvo el cliente, que llega a dos líneas.
// - El estado, en una palabra: Vigente, Rebajada, Anulada o Por confirmar;
//   abajo lo que lo cambió («−$1.000», «Por NC 88») o, en la factura, su
//   condición de pago. Todas sus notas van debajo con una sola sangría.
//   Lo anulado (Felipe, 08-11, la opción B de la maqueta: *"el achurado
//   [...] aún se entiende poco visualmente"*) va en gris parejo con sus
//   montos tachados, y su grupo (la factura y las notas de debajo) unido
//   por una barra roja a la izquierda. La nota cuya factura quedó fuera de
//   las fechas no se muestra (*"si el filtro de la fecha oculta la factura,
//   que también oculte la nota de crédito asociada"*); cuenta igual en el
//   resumen y en el reporte, que son del período.
//   Ver, descargar el PDF y, del administrador, «Comprobar» y «Anular o
//   rebajar…», que abre la nota en su pantalla con el documento ya elegido
//   (sprint 3).
// - El XML existe en facturacion.cl, pero es un servicio adicional con costo
//   (su manual, `getXMLDte`); los recibidos, desde el 08-11, del Libro de
//   Compras (`RecibidosDelMes`, doc 19 §9.28).
//   Los dos se dicen tal cual, sin prometerlos.

const clp = (n: number) =>
  `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString("es-CL")}`;

/** «1 factura», «4 boletas». */
const cuantas = (n: number, cosa: string) =>
  `${n} ${cosa}${n === 1 ? "" : "s"}`;

type Tipo = TipoDelFiltro;
type Estado = EstadoDelFiltro;

const TIPOS: { value: Tipo; label: string }[] = [
  { value: "todos", label: "Todos los tipos" },
  { value: "33", label: "Facturas" },
  { value: "39", label: "Boletas" },
  { value: "61", label: "Notas de crédito" },
  { value: "56", label: "Notas de débito" },
];
const ESTADOS: { value: Estado; label: string }[] = [
  { value: "todos", label: "Todos los estados" },
  { value: "vigente", label: "Vigentes" },
  { value: "rebajada", label: "Rebajadas" },
  { value: "anulada", label: "Anuladas" },
  { value: "por_confirmar", label: "Por confirmar" },
];

const esNota = (d: DocumentoDeLaLista) => d.tipo === 56 || d.tipo === 61;
const soloRut = (s: string) => s.replace(/[^0-9kK]/g, "").toUpperCase();

/** ¿Pasa los filtros de la pantalla? (las fechas ya las filtró el motor) */
const pasa = (d: DocumentoDeLaLista, f: Filtros) => {
  if (f.tipo !== "todos" && String(d.tipo) !== f.tipo) return false;
  if (f.estado !== "todos" && d.situacion !== f.estado) return false;
  const q = f.q.trim();
  if (!q) return true;
  const rut = soloRut(q);
  return (
    (d.folio != null && String(d.folio).includes(q)) ||
    matchesSearch(q, d.cliente, d.titulo) ||
    (rut.length >= 3 && !!d.rut && soloRut(d.rut).includes(rut))
  );
};

/** El color del estado, como la maqueta: lo vigente en verde (también la
 *  nota en pie y la factura corregida, que valen enteras). */
const colorDelEstado = (d: DocumentoDeLaLista) =>
  d.situacion === "por_confirmar" || d.situacion === "rebajada"
    ? "border-amber-200 bg-amber-50 text-amber-800"
    : d.situacion === "anulada"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-green-200 bg-green-50 text-green-700";

/** «Crédito 30 días · vence 06-12» o «Contado»: la factura (§9.22). */
const condicionDePago = (d: DocumentoDeLaLista) =>
  d.tipo !== 33 || d.forma_de_pago == null
    ? null
    : d.forma_de_pago === 1 || !d.vencimiento
      ? "Contado"
      : `Crédito ${d.plazo_dias ?? ""} días · vence ${fechaCorta(d.vencimiento).slice(0, 5)}`;

/** «F383_Municipalidad de Quillón_460_1213301-49-AG26.pdf» (§9.35; un
 *  motor de antes manda solo «NC 88», o ni eso, y se corta del título). */
const nombreDelArchivo = (d: DocumentoDeLaLista) =>
  d.nombre_del_pdf ?? d.nombre ?? d.titulo.split(" · ")[0];

/** Abajo del estado, en letra chica (§9.22, 07-11): lo que lo cambió («Se
 *  rebajaron $1.000», «Por NC 88») con el vencimiento de la factura que
 *  sigue por cobrar; sin cambios, su condición de pago. */
const lineaDelEstado = (d: DocumentoDeLaLista) => {
  if (d.estado !== "emitido") return null;
  if (d.situacion === "anulada") return d.cadena.detalle;
  // §9.42 (Felipe, 09-11: *"eliminar el −1000 del chip rebajada"*): lo
  // rebajado ya se ve en los montos; abajo, la condición de pago.
  if (!d.cadena.detalle || (d.situacion === "rebajada" && d.queda))
    return condicionDePago(d);
  const vence = d.vencimiento
    ? `vence ${fechaCorta(d.vencimiento).slice(0, 5)}`
    : null;
  return [d.cadena.detalle, vence].filter(Boolean).join(" · ");
};

/** La línea de abajo del documento: la fecha, lo que hace la nota («rebaja
 *  la 1235»), la OC (o la referencia que lleve), el N° del evento y la
 *  factura anulada que reemplaza. */
const subtitulo = (d: DocumentoDeLaLista) => {
  const ref = d.referencia
    ? `${d.referencia.tipo === "801" ? "OC" : d.referencia.tipo} ${d.referencia.folio}`
    : d.oc
      ? `OC ${d.oc}`
      : null;
  // La nota va debajo de su factura, que ya dice la OC y el evento: ella
  // dice solo lo que hace, para caber en su línea (07-11).
  const nota = esNota(d) && !!d.que_hace;
  return [
    d.fecha_emision ? fechaCorta(d.fecha_emision) : "sin fecha",
    d.que_hace,
    nota ? null : ref,
    !nota && d.numero ? `N° ${d.numero}` : null,
    d.reemplaza ? `reemplaza a la ${d.reemplaza}` : null,
    // §9.36: emitida fuera de Eventia y traída de facturacion.cl.
    d.traida ? "traída de facturacion.cl" : null,
  ]
    .filter(Boolean)
    .join(" · ");
};

/** El reporte (§9.5): lo que se ve, con el que lo anuló o rebajó. */
const descargarReporte = (f: Filtros, docs: DocumentoDeLaLista[]) => {
  const campo = (v: unknown) => {
    const t = String(v ?? "");
    return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const filas = [
    [
      "Fecha",
      "Documento",
      "Cliente",
      "RUT",
      "Evento",
      "Referencia",
      "Condición de pago",
      "Vencimiento",
      "Neto",
      "IVA",
      "Total",
      "Estado",
    ],
    ...docs.map((d) => [
      d.fecha_emision ? fechaCorta(d.fecha_emision) : "",
      d.titulo,
      d.cliente ?? "",
      d.rut ?? "",
      d.numero ?? "",
      d.referencia
        ? `${d.referencia.tipo} ${d.referencia.folio}`
        : d.oc
          ? `801 ${d.oc}`
          : "",
      condicionDePago(d)?.split(" · ")[0] ?? "",
      d.vencimiento ? fechaCorta(d.vencimiento) : "",
      d.neto,
      d.iva,
      d.total,
      [d.cadena.texto, d.cadena.detalle].filter(Boolean).join(" · "),
    ]),
  ];
  const texto = filas.map((x) => x.map(campo).join(";")).join("\r\n");
  // Con BOM: así Excel abre los acentos bien.
  const url = URL.createObjectURL(
    new Blob([`\ufeff${texto}`], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `facturacion-${f.desde}-a-${f.hasta}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

const icono =
  "inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 hover:border-blue-300 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-gray-200 disabled:hover:text-gray-600";
/** La barra roja que une un documento con sus notas (08-11, la opción B;
 *  §9.42, 09-11: *"la línea del lado debería ser continua"*): una franja
 *  por dentro de la primera celda, que no corre el texto. En las notas sube
 *  un píxel y tapa la raya entre filas, para que no se corte. */
const BARRA_DEL_GRUPO =
  "relative before:absolute before:bottom-0 before:left-0 before:w-1 before:bg-red-300";
const BARRA_ARRIBA = "before:top-0";
const BARRA_SEGUIDA = "before:-top-px";

/** «Anular o rebajar…»: el mismo botón, en rojo. */
const iconoRojo =
  "inline-flex h-7 w-7 items-center justify-center rounded-md border border-red-200 bg-white text-red-600 hover:border-red-400 hover:text-red-700";
const boton =
  "flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50";

/** ¿Se le puede hacer una nota? (lo decide el motor, con el permiso). */
const modificable = (d: DocumentoDeLaLista) =>
  d.acciones.anular || d.acciones.rebajar || d.acciones.corregir;
const queModifica = (d: DocumentoDeLaLista) =>
  d.tipo === 33 ? "Anular o rebajar…" : "Anular…";
const casilla =
  "rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500";

export default function ListaDeDocumentos({
  conAjustes,
  recien = null,
  filtros,
  onFiltros,
  onModificar,
}: {
  /** El permiso «Tarifario y conexión» (doc 22 §7): «Probar la conexión». */
  readonly conAjustes: boolean;
  /** El que se acaba de emitir: se marca en la lista. */
  readonly recien?: number | null;
  /** Los filtros, si los guarda la página: quedan al ir a anular y volver
   *  (`filtrosDeLaLista.ts`). Sin ellos, la lista guarda los suyos. */
  readonly filtros?: Filtros;
  readonly onFiltros?: (f: Filtros) => void;
  /** «Anular o rebajar…»: la nota en su pantalla, con este documento ya
   *  elegido (§9.22, sprint 3). */
  readonly onModificar: (doc: DocumentoDeLaLista) => void;
}) {
  const queryClient = useQueryClient();
  const [lado, setLado] = useState<"emitidos" | "recibidos">("emitidos");
  const [propios, setPropios] = useState<Filtros>(filtrosDeHoy);
  const f = filtros ?? propios;
  const setF = onFiltros ?? setPropios;
  const [ocupado, setOcupado] = useState<number | null>(null);
  // §9.33: el PDF que se acaba de traer al pincharlo «Ver»: su visor se
  // abre apenas llega.
  const [verAlLlegar, setVerAlLlegar] = useState<number | null>(null);
  const poner = (cambios: Partial<Filtros>) => setF({ ...f, ...cambios });

  const rangoOk = !!f.desde && !!f.hasta && f.desde <= f.hasta;
  const llave = ["facturacion", "lista", f.desde, f.hasta];
  const lista = useQuery({
    queryKey: llave,
    queryFn: () => getListaDeFacturacion({ desde: f.desde, hasta: f.hasta }),
    enabled: rangoOk,
    placeholderData: keepPreviousData,
    // §9.33: mientras un PDF viene en camino (el motor lo vuelve a pedir
    // solo), la lista se pone al día cada 5 segundos, unas veces.
    refetchInterval: (q) =>
      (q.state.data?.documentos ?? []).some((d) => d.acciones.pedirPdf) &&
      q.state.dataUpdateCount < 30
        ? 5_000
        : false,
  });

  const docs = lista.data?.documentos ?? [];
  const visibles = docs.filter((d) => pasa(d, f));
  // Si alguno se puede anular, todos guardan el lugar del botón rojo.
  // §9.41: la nota cuya factura (o la nota que modifica) quedó fuera de las
  // fechas no va en la lista; los otros filtros sí la dejan encontrar.
  const delRango = new Map(docs.map((d) => [d.id, d]));
  const colgada = (d: DocumentoDeLaLista): boolean => {
    const vistos = new Set<number>();
    for (let x = d; x.modifica_id != null; ) {
      const padre = delRango.get(x.modifica_id);
      if (!padre || vistos.has(padre.id)) return true;
      vistos.add(padre.id);
      x = padre;
    }
    return false;
  };
  const enLaLista = visibles.filter((d) => !colgada(d));
  const conModificar = enLaLista.some(modificable);
  const ids = new Set(enLaLista.map((d) => d.id));
  const hijos = new Map<number, DocumentoDeLaLista[]>();
  for (const d of enLaLista)
    if (d.modifica_id != null && ids.has(d.modifica_id))
      hijos.set(d.modifica_id, [...(hijos.get(d.modifica_id) ?? []), d]);
  /** Todas las notas de un documento y las de sus notas, de la más vieja a
   *  la más nueva: van debajo de él con UNA sola sangría, sin cascada
   *  (Felipe, 07-11; así estaba en la maqueta). Lo que modifica cada una lo
   *  dice su línea de abajo («anula la NC 88»). */
  const notasDebajo = (id: number) => {
    const vistas = new Set<number>([id]);
    const salida: DocumentoDeLaLista[] = [];
    const pendientes = [...(hijos.get(id) ?? [])];
    for (let i = 0; i < pendientes.length; i++) {
      const n = pendientes[i];
      if (vistas.has(n.id)) continue;
      vistas.add(n.id);
      salida.push(n);
      pendientes.push(...(hijos.get(n.id) ?? []));
    }
    return salida.sort((a, b) => a.id - b.id);
  };
  // Lo más nuevo arriba; lo que espera «Comprobar» (sin fecha), primero.
  const raices = enLaLista
    .filter((d) => d.modifica_id == null || !ids.has(d.modifica_id))
    .sort(
      (a, b) =>
        (b.fecha_emision ?? "9999").localeCompare(a.fecha_emision ?? "9999") ||
        b.id - a.id,
    );

  // El resumen de lo que se ve (la maqueta): lo por confirmar no suma.
  const r = { neto: 0, iva: 0, total: 0, fac: 0, bol: 0, notas: 0, pc: 0 };
  for (const d of visibles) {
    if (d.estado !== "emitido") {
      r.pc++;
      continue;
    }
    r.neto += d.neto;
    r.iva += d.iva;
    r.total += d.total;
    if (d.tipo === 33) r.fac++;
    else if (d.tipo === 39) r.bol++;
    else if (esNota(d)) r.notas++;
  }

  const refrescar = () => queryClient.invalidateQueries({ queryKey: llave });

  const comprobar = async (d: DocumentoDeLaLista) => {
    setOcupado(d.id);
    try {
      const x = await comprobarDocumento(d.id);
      if (x.estado === "emitido")
        toast.success(`Salió: quedó con el folio N° ${x.folio}.`);
      else
        toast.warn(
          "No salió: no quedó en facturacion.cl. Se puede emitir de nuevo.",
        );
      await refrescar();
    } catch (e) {
      toast.error(humanizeApiError(e, "No se pudo comprobar."));
    } finally {
      setOcupado(null);
    }
  };

  /** §9.33 (Felipe, 08-11: *"el PDF lo dejaría automático"*): el PDF que
   *  todavía no está se trae de facturacion.cl al pinchar «Ver» o
   *  «Descargar», sin un botón aparte. Devuelve dónde quedó. */
  const traerPdf = async (d: DocumentoDeLaLista) => {
    if (d.pdf_path) return d.pdf_path;
    setOcupado(d.id);
    try {
      const { pdf_path } = await pedirPdfDelDocumento(d.id);
      await refrescar();
      return pdf_path;
    } catch (e) {
      toast.error(
        humanizeApiError(
          e,
          "facturacion.cl todavía no tiene el PDF: prueba en unos segundos.",
        ),
      );
      return null;
    } finally {
      setOcupado(null);
    }
  };

  const descargar = async (d: DocumentoDeLaLista) => {
    const ruta = await traerPdf(d);
    if (!ruta) return;
    try {
      await descargarArchivo(ruta, `${nombreDelArchivo(d)}.pdf`);
    } catch (e) {
      toast.error(humanizeApiError(e, "No se pudo descargar el PDF."));
    }
  };

  const ver = async (d: DocumentoDeLaLista) => {
    if (await traerPdf(d)) setVerAlLlegar(d.id);
  };

  /** §9.33 (Felipe, 08-11: *"el XML debería ser solo en los pocos casos
   *  donde lo pide el cliente, con un botón"*): se le pide a facturacion.cl
   *  al pincharlo y se baja tal cual (ISO-8859-1). */
  const bajarXml = async (d: DocumentoDeLaLista) => {
    setOcupado(d.id);
    try {
      const { nombre, base64 } = await pedirXmlDelDocumento(d.id);
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(
        new Blob([bytes], { type: "application/xml" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = nombre;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      toast.error(humanizeApiError(e, "facturacion.cl no entregó el XML."));
    } finally {
      setOcupado(null);
    }
  };

  /** `delGrupo`: la fila es de un documento con notas (él o una de ellas):
   *  gris parejo y la barra roja seguida de arriba abajo (08-11, la opción
   *  B; §9.42, 09-11: *"toda la operación debería estar marcada"*). */
  const fila = (
    d: DocumentoDeLaLista,
    nivel: number,
    delGrupo = false,
  ): JSX.Element => {
    const linea = lineaDelEstado(d);
    const sub = subtitulo(d);
    const anulada = d.situacion === "anulada";
    const enGrupo = delGrupo || anulada;
    // §9.42: la rebajada, lo original tachado y abajo lo que le queda.
    const queda = !anulada && d.queda ? d.queda : null;
    return (
      <Fragment key={d.id}>
        <tr
          className={`border-t border-gray-100 align-top ${d.id === recien ? "bg-green-50" : enGrupo ? "bg-gray-50" : ""}`}
          data-anulada={anulada || undefined}
          data-grupo={enGrupo || undefined}
        >
          <td
            className={`py-2 pr-2 ${enGrupo ? `${BARRA_DEL_GRUPO} ${nivel > 0 ? BARRA_SEGUIDA : BARRA_ARRIBA}` : ""}`}
            style={{ paddingLeft: `${0.5 + nivel * 1.25}rem` }}
          >
            <p
              className={`whitespace-nowrap font-semibold ${anulada ? "text-gray-500" : esNota(d) ? "text-gray-700" : "text-gray-900"}`}
            >
              {nivel > 0 && <span className="text-gray-300">└ </span>}
              {d.nombre ?? d.titulo}
            </p>
            {/* En una línea: si no cabe (los folios de prueba tienen 10
                dígitos), termina en «…» y se lee entera al pasar el mouse. */}
            <p
              className="truncate text-xs text-gray-400"
              style={{ maxWidth: `${14 - nivel * 1.25}rem` }}
              title={sub}
            >
              {sub}
            </p>
          </td>
          <td
            className={`py-2 pr-2 ${anulada ? "text-gray-500" : "text-gray-700"}`}
          >
            {/* Lo único que puede bajar de línea: hasta dos, y entero al
                pasar el mouse. */}
            <p
              className="line-clamp-2 break-words"
              title={d.cliente ?? undefined}
            >
              {d.cliente ?? "—"}
            </p>
          </td>
          {[d.neto, d.iva, d.total].map((n, i) => (
            <td
              key={i}
              className={`whitespace-nowrap py-2 pr-2 text-right ${anulada ? "text-gray-400 line-through" : n < 0 ? "text-red-700" : "text-gray-900"} ${i === 2 ? "font-semibold" : ""}`}
            >
              {queda ? (
                <>
                  <span className="text-gray-400 line-through">{clp(n)}</span>
                  <span className="block">
                    {clp([queda.neto, queda.iva, queda.total][i])}
                  </span>
                </>
              ) : (
                clp(n)
              )}
            </td>
          ))}
          <td className="py-2 pr-2 text-xs">
            <span
              title={
                d.estado !== "emitido" ? (d.error ?? undefined) : undefined
              }
              className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 font-semibold ${colorDelEstado(d)}`}
            >
              {d.cadena.texto}
            </span>
            {linea && (
              <p className="mt-1 whitespace-nowrap text-gray-500">{linea}</p>
            )}
          </td>
          <td className="py-2 text-right text-xs">
            <div className="flex justify-end gap-1">
              {d.pdf_path ? (
                <FileViewLink
                  url={d.pdf_path}
                  title={`${nombreDelArchivo(d)}.pdf`}
                  boton={<Eye size={14} />}
                  claseDelBoton={icono}
                  tituloDelBoton={`Ver ${d.titulo}`}
                  abrirAlMontar={verAlLlegar === d.id}
                  alCerrar={() => setVerAlLlegar(null)}
                />
              ) : (
                <button
                  type="button"
                  disabled={!d.acciones.pedirPdf || ocupado === d.id}
                  onClick={() => void ver(d)}
                  title={
                    d.acciones.pedirPdf
                      ? "Ver el PDF (lo trae de facturacion.cl)"
                      : "Sin PDF"
                  }
                  aria-label={`Ver ${d.titulo}`}
                  className={icono}
                >
                  <Eye size={14} />
                </button>
              )}
              <button
                type="button"
                disabled={
                  (!d.pdf_path && !d.acciones.pedirPdf) || ocupado === d.id
                }
                onClick={() => void descargar(d)}
                title={
                  d.pdf_path
                    ? "Descargar el PDF"
                    : d.acciones.pedirPdf
                      ? "Descargar el PDF (lo trae de facturacion.cl)"
                      : "Sin PDF"
                }
                aria-label={`Descargar el PDF de ${d.titulo}`}
                className={icono}
              >
                <Download size={14} />
              </button>
              <button
                type="button"
                disabled={!d.acciones.xml || ocupado === d.id}
                onClick={() => void bajarXml(d)}
                title={
                  d.acciones.xml
                    ? "Bajar el XML (lo pide a facturacion.cl, que lo cobra aparte)"
                    : "Sin XML"
                }
                aria-label={`Bajar el XML de ${d.titulo}`}
                className={icono}
              >
                <FileCode size={14} />
              </button>
              {/* «Anular o rebajar…» es un botón más de Acciones (Felipe,
                  07-11), en rojo y al final de la fila. */}
              {modificable(d) ? (
                <button
                  type="button"
                  onClick={() => onModificar(d)}
                  title={queModifica(d)}
                  aria-label={queModifica(d)}
                  className={iconoRojo}
                >
                  <FileMinus size={14} />
                </button>
              ) : conModificar ? (
                // Su lugar queda vacío: los otros íconos no se mueven.
                <span aria-hidden="true" className="inline-block h-7 w-7" />
              ) : null}
            </div>
            {d.acciones.comprobar && (
              <div className="mt-1 flex flex-col items-end gap-1 whitespace-nowrap">
                {d.acciones.comprobar && (
                  <button
                    type="button"
                    disabled={ocupado === d.id}
                    onClick={() => void comprobar(d)}
                    className="font-semibold text-amber-700 hover:underline disabled:opacity-50"
                  >
                    {ocupado === d.id ? "Comprobando…" : "Comprobar"}
                  </button>
                )}
              </div>
            )}
          </td>
        </tr>
      </Fragment>
    );
  };

  const tarjeta = (
    titulo: string,
    valor: string,
    nota: string,
    alerta = false,
  ) => (
    <div
      className={`rounded-lg border px-4 py-3 ${alerta ? "border-amber-200 bg-amber-50" : "border-gray-200 bg-white"}`}
    >
      <p className="text-xs text-gray-500">{titulo}</p>
      <p
        className={`text-xl font-semibold ${alerta ? "text-amber-800" : "text-gray-900"}`}
      >
        {valor}
      </p>
      <p className="text-xs text-gray-500">{nota}</p>
    </div>
  );

  const ladoBoton = (k: "emitidos" | "recibidos", t: string) => (
    <button
      type="button"
      aria-pressed={lado === k}
      onClick={() => setLado(k)}
      className={`rounded-md px-3 py-1.5 text-xs font-semibold ${lado === k ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
    >
      {t}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border border-gray-300 bg-white p-0.5">
        {ladoBoton("emitidos", "Emitidos")}
        {ladoBoton("recibidos", "Recibidos")}
      </div>

      {lado === "recibidos" ? (
        // §9.28: el Libro de Compras de facturacion.cl (el 06-11 se creyó
        // que su integración no lo traía; está en un manual aparte).
        <RecibidosDelMes />
      ) : (
        <>
          <section
            aria-label="Resumen"
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
          >
            {tarjeta("Neto", clp(r.neto), "antes del IVA")}
            {tarjeta("IVA", clp(r.iva), "19 %")}
            {tarjeta(
              "Total",
              clp(r.total),
              "con IVA, menos las notas de crédito",
            )}
            {tarjeta(
              "Documentos",
              String(r.fac + r.bol + r.notas),
              `${cuantas(r.fac, "factura")} · ${cuantas(r.bol, "boleta")} · ${cuantas(r.notas, "nota")}`,
            )}
            {tarjeta(
              "Por confirmar",
              String(r.pc),
              "enviados sin respuesta",
              r.pc > 0,
            )}
          </section>

          <div className="flex flex-wrap items-end gap-2 rounded-lg border border-gray-200 bg-white p-3">
            <label className="relative block w-full sm:w-64">
              <span className="sr-only">Buscar</span>
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="search"
                value={f.q}
                placeholder="Buscar por N° o cliente"
                autoComplete="off"
                onChange={(e) => poner({ q: e.target.value })}
                className={`${casilla} w-full pl-8`}
              />
            </label>
            <div className="w-48">
              <span className="sr-only">Tipo</span>
              <SelectWithSearch
                options={TIPOS}
                value={f.tipo}
                onChange={(v) => poner({ tipo: (v || "todos") as Tipo })}
                tamano="sm"
                sinLimpiar
                mostrarConteo={false}
              />
            </div>
            <div className="w-48">
              <span className="sr-only">Estado</span>
              <SelectWithSearch
                options={ESTADOS}
                value={f.estado}
                onChange={(v) => poner({ estado: (v || "todos") as Estado })}
                tamano="sm"
                sinLimpiar
                mostrarConteo={false}
              />
            </div>
            <div className="flex items-center gap-1.5 text-sm text-gray-500">
              <label>
                <span className="sr-only">Desde</span>
                <input
                  type="date"
                  value={f.desde}
                  onChange={(e) => poner({ desde: e.target.value })}
                  className={casilla}
                />
              </label>
              a
              <label>
                <span className="sr-only">Hasta</span>
                <input
                  type="date"
                  value={f.hasta}
                  onChange={(e) => poner({ hasta: e.target.value })}
                  className={casilla}
                />
              </label>
            </div>
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => setF(filtrosDeHoy())}
                className={boton}
              >
                Limpiar
              </button>
              <button
                type="button"
                disabled={!visibles.length}
                onClick={() => descargarReporte(f, visibles)}
                className={boton}
              >
                <Download size={13} /> Reporte (CSV)
              </button>
            </div>
            {!rangoOk && (
              <p className="w-full text-xs text-red-600">
                La fecha «desde» va antes que «hasta».
              </p>
            )}
          </div>

          {lista.isPending ? (
            <p className="text-sm text-gray-400">Cargando…</p>
          ) : lista.isError ? (
            <p className="text-sm text-red-600">
              {humanizeApiError(lista.error, "No se pudo cargar la lista.")}
            </p>
          ) : raices.length === 0 ? (
            <p className="rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
              No hay documentos con estos filtros.{" "}
              <button
                type="button"
                onClick={() => setF(filtrosDeHoy())}
                className="font-semibold text-blue-600 hover:underline"
              >
                Limpiar los filtros
              </button>
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white p-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500">
                    <th className="pb-2 pl-2 font-medium">Documento</th>
                    <th className="pb-2 font-medium">Cliente</th>
                    <th className="pb-2 pr-2 text-right font-medium">Neto</th>
                    <th className="pb-2 pr-2 text-right font-medium">IVA</th>
                    <th className="pb-2 pr-2 text-right font-medium">Total</th>
                    <th className="pb-2 font-medium">Estado</th>
                    <th className="pb-2 text-right font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {raices.map((d) => {
                    // §9.42: el documento con notas y todas ellas, un solo
                    // bloque gris con la barra roja seguida.
                    const notas = notasDebajo(d.id);
                    return [
                      fila(d, 0, notas.length > 0),
                      ...notas.map((n) => fila(n, 1, true)),
                    ];
                  })}
                </tbody>
              </table>
            </div>
          )}
          {conAjustes && <ProbarLaConexion />}
          {conAjustes && <NominaDelSii />}
        </>
      )}
    </div>
  );
}
