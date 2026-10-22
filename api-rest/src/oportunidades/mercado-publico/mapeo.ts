import type {
  CompraAgilDetalle,
  CompraAgilListada,
  LicitacionDetalle,
  ProcesoMp,
} from './tipos';

// LA TRADUCCIÓN de Mercado Público a nuestra tabla (doc 17 §5.1). Funciones
// puras: sin base ni red, para que las pruebas las cubran enteras.

/** Sin tildes, sin signos, en minúsculas: "Región del Bío-Bío" → "region del biobio". */
export const normalizar = (texto?: string | null): string =>
  (texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Para comparar nombres de región: también sin espacios, porque la misma
 *  región llega como "Biobío", "Bío-Bío" o "Bío Bío". */
const compacto = (texto?: string | null): string =>
  normalizar(texto).replace(/ /g, '');

/** ¿La región del proceso es una de las configuradas? Compara por contenido:
 *  la configuración dice "Ñuble" y la API "Región del Ñuble". */
export const regionCalza = (
  region: string | null | undefined,
  regiones: string[],
): boolean => {
  const r = compacto(region);
  if (!r) return false;
  return regiones.some((x) => {
    const n = compacto(x);
    return n.length > 0 && r.includes(n);
  });
};

// El número oficial de cada región, que es lo que pide la API de Compra
// Ágil (el bot de GitHub usaba "8,16" para Biobío y Ñuble).
const REGIONES: Array<[string, number]> = [
  ['arica', 15],
  ['tarapaca', 1],
  ['antofagasta', 2],
  ['atacama', 3],
  ['coquimbo', 4],
  ['valparaiso', 5],
  ['metropolitana', 13],
  ['higgins', 6],
  ['maule', 7],
  ['nuble', 16],
  ['biobio', 8],
  ['araucania', 9],
  ['losrios', 14],
  ['loslagos', 10],
  ['aysen', 11],
  ['magallanes', 12],
];

export const codigosDeRegiones = (regiones: string[]): number[] => {
  const codigos = new Set<number>();
  for (const region of regiones) {
    const n = compacto(region);
    for (const [clave, codigo] of REGIONES) {
      if (n.includes(clave)) codigos.add(codigo);
    }
  }
  return [...codigos].sort((a, b) => a - b);
};

/** Cuántos minutos le lleva Chile a UTC en ese instante (-180 en verano). */
const desfaseDeChile = (instante: Date): number => {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santiago',
    timeZoneName: 'longOffset',
  }).formatToParts(instante);
  const nombre = partes.find((p) => p.type === 'timeZoneName')?.value ?? '';
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(nombre);
  if (!m) return 0;
  const signo = m[1] === '-' ? -1 : 1;
  return signo * (Number(m[2]) * 60 + Number(m[3] ?? 0));
};

/**
 * Una fecha de Mercado Público a ISO en UTC. La API de licitaciones manda
 * la hora de Chile SIN zona ("2026-10-19T16:00:00"): guardada tal cual en
 * un timestamptz quedaría corrida 3 o 4 horas. Si la fecha ya trae zona
 * ("Z" o "-03:00"), se respeta.
 */
export const fechaChileAIso = (fecha?: string | null): string | null => {
  if (!fecha) return null;
  const texto = fecha.trim();
  if (!texto) return null;
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(texto)) {
    const d = new Date(texto);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const m =
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(texto);
  if (!m) return null;
  const comoUtc = Date.UTC(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4] ?? 0),
    Number(m[5] ?? 0),
    Number(m[6] ?? 0),
  );
  // Dos pasadas: el desfase se mide en el instante real, no en el supuesto
  // (importa los días del cambio de hora).
  let utc = comoUtc - desfaseDeChile(new Date(comoUtc)) * 60_000;
  utc = comoUtc - desfaseDeChile(new Date(utc)) * 60_000;
  return new Date(utc).toISOString();
};

const texto = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;

/** 0 o negativo es "no informado" en Mercado Público. */
const monto = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;

export const procesoDesdeLicitacion = (
  d: LicitacionDetalle | null | undefined,
): ProcesoMp | null => {
  const codigo = texto(d?.CodigoExterno);
  const nombre = texto(d?.Nombre);
  if (!d || !codigo || !nombre) return null;

  const fechas = d.Fechas ?? {};
  const items = d.Items?.Listado ?? [];
  const ganadores = items
    .filter((i) => i.Adjudicacion && texto(i.Adjudicacion.RutProveedor))
    .map((i) => ({
      producto: texto(i.NombreProducto),
      rut: texto(i.Adjudicacion?.RutProveedor),
      nombre: texto(i.Adjudicacion?.NombreProveedor),
      cantidad: i.Adjudicacion?.Cantidad ?? null,
      monto_unitario: i.Adjudicacion?.MontoUnitario ?? null,
    }));
  const adj = d.Adjudicacion;
  const hayAdjudicacion =
    ganadores.length > 0 || Boolean(adj && (adj.Numero || adj.Fecha));

  return {
    codigo,
    tipo: 'licitacion',
    nombre,
    descripcion: texto(d.Descripcion),
    organismo: texto(d.Comprador?.NombreOrganismo),
    organismo_codigo: texto(d.Comprador?.CodigoOrganismo),
    unidad: texto(d.Comprador?.NombreUnidad),
    region: texto(d.Comprador?.RegionUnidad),
    comuna: texto(d.Comprador?.ComunaUnidad),
    monto: monto(d.MontoEstimado),
    moneda: texto(d.Moneda),
    estado: texto(d.Estado),
    fecha_publicacion: fechaChileAIso(fechas.FechaPublicacion),
    fecha_cierre: fechaChileAIso(fechas.FechaCierre),
    fechas,
    productos: items.map((i) => ({
      nombre: texto(i.NombreProducto) ?? texto(i.Categoria) ?? '',
      descripcion: texto(i.Descripcion),
      cantidad: i.Cantidad ?? null,
    })),
    adjudicacion: hayAdjudicacion
      ? {
          tipo: adj?.Tipo ?? null,
          fecha: adj?.Fecha ?? null,
          numero: adj?.Numero ?? null,
          oferentes: adj?.NumeroOferentes ?? null,
          url_acta: adj?.UrlActa ?? null,
          ganadores,
        }
      : null,
    detalle: d,
  };
};

export const procesoDesdeCompraAgil = (
  item: CompraAgilListada | null | undefined,
  detalle: CompraAgilDetalle | null | undefined,
): ProcesoMp | null => {
  const codigo = texto(item?.codigo);
  const nombre = texto(item?.nombre);
  if (!item || !codigo || !nombre) return null;

  const fechas = item.fechas ?? {};
  return {
    codigo,
    tipo: 'compra_agil',
    nombre,
    descripcion: texto(detalle?.descripcion),
    organismo: texto(item.institucion?.organismo_comprador),
    organismo_codigo: null,
    unidad: null,
    region: texto(item.institucion?.nombre_region),
    comuna: texto(item.institucion?.comuna),
    monto: monto(item.montos?.monto_disponible_clp),
    moneda: 'CLP',
    estado: texto(item.estado?.glosa),
    fecha_publicacion: fechaChileAIso(fechas.fecha_publicacion),
    fecha_cierre: fechaChileAIso(fechas.fecha_cierre),
    fechas,
    productos: (detalle?.productos_solicitados ?? []).map((p) => ({
      nombre: texto(p.nombre) ?? '',
      descripcion: texto(p.descripcion),
    })),
    adjudicacion: null,
    detalle: { item, detalle: detalle ?? null },
  };
};

/** ¿Cambió la fecha de cierre? Compara instantes, no textos. */
export const cierreCambio = (
  guardada: string | null | undefined,
  nueva: string | null | undefined,
): boolean => {
  const a = guardada ? new Date(guardada).getTime() : null;
  const b = nueva ? new Date(nueva).getTime() : null;
  if (a === null || b === null) return a !== b;
  return a !== b;
};
