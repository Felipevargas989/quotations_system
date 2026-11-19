import { createHash } from 'crypto';

/**
 * EL CONVENIO DEL CLIENTE (doc 24): la plantilla de la empresa, llena.
 *
 * Todo aquí es puro (sin base ni red) para poder probarlo. La plantilla vive
 * en `convenio_plantillas.texto` (migración 211) con una marca mínima:
 *  - una línea en blanco separa párrafos;
 *  - «# » es el título del documento y «## » el de una cláusula;
 *  - las líneas que empiezan con «- » son viñetas;
 *  - un párrafo que empieza con «___» es un bloque de firma (los seguidos
 *    van lado a lado) y dentro de él cada salto de línea se respeta.
 *
 * El texto del contrato NO se corrige aquí: se llena tal cual.
 */

/** Las variables que entiende la plantilla. */
export const VARIABLES = [
  'razon_social',
  'rut_empresa',
  'representante_nombre',
  'representante_rut',
  'representante_cargo',
  'domicilio',
  'comuna',
  'region',
  'correo_empresa',
  'fecha_firma',
  'correo_de_contacto',
  'personeria_documento',
  'personeria_fecha',
  'personeria_notario',
] as const;
export type Variable = (typeof VARIABLES)[number];
export type DatosDelConvenio = Partial<Record<Variable, string | null>>;

/** Lo que queda en un hueco sin dato: una línea para completar a mano
 *  (Felipe, vía gerente 19-11: la personería es opcional). */
export const EN_BLANCO = '____________________';

const ZONA = 'America/Santiago';
const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** Día, mes y año de un instante, en hora de Chile. */
const partesEnChile = (
  instante: Date,
): { dia: number; mes: number; anio: number } => {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instante);
  const de = (t: string) => Number(p.find((x) => x.type === t)?.value);
  return { dia: de('day'), mes: de('month'), anio: de('year') };
};

/** «19 de noviembre del 2026», como escribe el formato base. Acepta un
 *  instante o una fecha `aaaa-mm-dd` (que se lee como ese día, sin zona). */
export const fechaLarga = (f: Date | string): string => {
  const { dia, mes, anio } =
    typeof f === 'string' ? partesDeFecha(f) : partesEnChile(f);
  return `${dia} de ${MESES[mes - 1]} del ${anio}`;
};

const partesDeFecha = (f: string) => {
  const [anio, mes, dia] = f.slice(0, 10).split('-').map(Number);
  return { dia, mes, anio };
};

const dos = (n: number) => String(n).padStart(2, '0');

/** «19-11-2026» (dd-mm-aaaa), en hora de Chile. */
export const fechaCorta = (f: Date | string): string => {
  const { dia, mes, anio } =
    typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f)
      ? partesDeFecha(f)
      : partesEnChile(typeof f === 'string' ? new Date(f) : f);
  return `${dos(dia)}-${dos(mes)}-${anio}`;
};

/** «19-11-2026 15:42:07» en hora de Chile, para la constancia. */
export const fechaYHora = (instante: Date): string => {
  const h = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONA,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(instante);
  return `${fechaCorta(instante)} ${h}`;
};

/** El día (aaaa-mm-dd) en que vence: la firma + los años de vigencia.
 *  Un 29 de febrero que no existe en el año del vencimiento cae el 28. */
export const vencimiento = (firma: string, anios: number): string => {
  const { dia, mes, anio } = partesDeFecha(firma);
  const fin = anio + anios;
  const ultimo = new Date(Date.UTC(fin, mes, 0)).getUTCDate();
  return `${fin}-${dos(mes)}-${dos(Math.min(dia, ultimo))}`;
};

/** El día de hoy en Chile, `aaaa-mm-dd`. */
export const hoyEnChile = (ahora: Date = new Date()): string => {
  const { dia, mes, anio } = partesEnChile(ahora);
  return `${anio}-${dos(mes)}-${dos(dia)}`;
};

/** Llena la plantilla. Lo que no tiene dato queda como línea en blanco y
 *  una variable desconocida se deja a la vista (para que se note). */
export const llenarPlantilla = (
  texto: string,
  datos: DatosDelConvenio,
): string =>
  texto.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (todo, nombre: string) => {
    if (!(VARIABLES as readonly string[]).includes(nombre)) return todo;
    const v = datos[nombre as Variable];
    return v && v.trim() ? v.trim() : EN_BLANCO;
  });

/** El texto con los huecos a la vista, para leerlo antes de firmar: cada
 *  variable sin dato se ve como «[razón social]». */
export const textoParaLeer = (texto: string, datos: DatosDelConvenio): string =>
  texto.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (todo, nombre: string) => {
    const v = datos[nombre as Variable];
    if (v && v.trim()) return v.trim();
    return `[${nombre.replace(/_/g, ' ')}]`;
  });

export const sha256 = (t: string | Buffer): string =>
  createHash('sha256').update(t).digest('hex');

export const esc = (t: string): string =>
  t
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** El cuerpo del contrato en HTML, desde la marca mínima. */
export const cuerpoHtml = (texto: string): string => {
  const parrafos = texto
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const salida: string[] = [];
  let firmas: string[] = [];
  const cerrarFirmas = () => {
    if (firmas.length) {
      salida.push(`<div class="firmas">${firmas.join('')}</div>`);
      firmas = [];
    }
  };
  for (const p of parrafos) {
    if (p.startsWith('___')) {
      const lineas = p.split('\n').map((l) => l.trim());
      firmas.push(
        `<div class="firma"><div class="linea"></div>${lineas
          .slice(1)
          .map((l) => `<div>${esc(l)}</div>`)
          .join('')}</div>`,
      );
      continue;
    }
    cerrarFirmas();
    if (p.startsWith('## ')) {
      salida.push(`<h2>${esc(p.slice(3))}</h2>`);
    } else if (p.startsWith('# ')) {
      salida.push(`<h1>${esc(p.slice(2))}</h1>`);
    } else if (p.startsWith('- ')) {
      salida.push(
        `<ul>${p
          .split('\n')
          .map((l) => `<li>${esc(l.replace(/^-\s*/, ''))}</li>`)
          .join('')}</ul>`,
      );
    } else {
      salida.push(`<p>${esc(p).replace(/\n/g, '<br>')}</p>`);
    }
  }
  cerrarFirmas();
  return salida.join('\n');
};

export interface Constancia {
  firmante_nombre: string;
  firmante_rut: string;
  firmante_cargo: string;
  firmante_correo: string;
  razon_social: string;
  rut_empresa: string;
  firmado_at: Date;
  ip: string | null;
  user_agent: string | null;
  texto_sha256: string;
  empresa: string;
  vence: string;
  /** doc 24 §8: la línea solo sale si se declaró (los firmados antes de la
   *  212 no la tienen y su PDF no cambia). */
  declara_representacion?: boolean;
}

/** La hoja completa que se imprime: el contrato y, al final, la constancia
 *  de la aceptación en línea (cuando la hay). */
export const hojaDelConvenio = (p: {
  textoLleno: string;
  colorPrimario: string;
  constancia: Constancia | null;
}): string => {
  const c = p.constancia;
  const fila = (k: string, v: string) =>
    `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`;
  const constancia = c
    ? `<section class="constancia">
  <h2>Constancia de aceptación en línea</h2>
  <p>Este convenio fue aceptado en línea, en nombre de la empresa, por la persona que se indica, a través del enlace personal enviado por ${esc(c.empresa)}.</p>
  <table>
    ${fila('Empresa', `${c.razon_social} · RUT ${c.rut_empresa}`)}
    ${fila('Aceptó', c.firmante_nombre)}
    ${fila('RUT', c.firmante_rut)}
    ${fila('Cargo', c.firmante_cargo)}
    ${fila('Correo', c.firmante_correo)}
    ${fila('Fecha y hora (Chile)', fechaYHora(c.firmado_at))}
    ${fila('Vigente hasta', fechaCorta(c.vence))}
    ${fila('Dirección IP', c.ip || '—')}
    ${fila('Navegador', c.user_agent || '—')}
    ${fila('Huella del texto (SHA-256)', c.texto_sha256)}
  </table>${
    c.declara_representacion
      ? `
  <p class="declaracion">${esc(c.firmante_nombre)}, RUT ${esc(c.firmante_rut)}, ${esc(c.firmante_cargo)}, declaró tener facultades para representar a ${esc(c.razon_social)} y aceptó el convenio en su nombre.</p>`
      : ''
  }
  <p class="chica">La persona marcó «${esc(
    c.declara_representacion
      ? 'Declaro que tengo facultades para representar a la empresa y acepto el convenio en su nombre'
      : 'Leí el convenio y lo acepto en nombre de la empresa',
  )}» y apretó «Aceptar convenio». La huella permite comprobar que el texto de este documento es el mismo que se aceptó.</p>
</section>`
    : '';
  const color = /^#[0-9a-fA-F]{3,8}$/.test(p.colorPrimario)
    ? p.colorPrimario
    : '#134686';
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Convenio</title>
<style>
  @page { size: A4; margin: 22mm 20mm 20mm 20mm; }
  body { font-family: Georgia, 'Times New Roman', serif; font-size: 11pt; line-height: 1.5; color: #111; }
  h1 { font-size: 13pt; text-align: center; text-transform: uppercase; margin: 0 0 18pt; line-height: 1.35; }
  h2 { font-size: 11pt; margin: 16pt 0 6pt; text-transform: uppercase; }
  p { margin: 0 0 9pt; text-align: justify; }
  ul { margin: 0 0 9pt 18pt; padding: 0; }
  .firmas { display: flex; gap: 28pt; margin-top: 44pt; page-break-inside: avoid; }
  .firma { flex: 1; text-align: center; font-size: 10pt; }
  .firma .linea { border-top: 1px solid #111; margin-bottom: 6pt; }
  .constancia { page-break-before: always; font-family: Arial, Helvetica, sans-serif; font-size: 10pt; }
  .constancia h2 { color: ${color}; font-size: 13pt; text-transform: none; }
  .constancia table { border-collapse: collapse; width: 100%; margin: 10pt 0; }
  .constancia th, .constancia td { border: 1px solid #d1d5db; padding: 6pt 8pt; text-align: left; vertical-align: top; }
  .constancia th { width: 34%; background: #f3f4f6; font-weight: 600; }
  .constancia td { word-break: break-all; }
  .constancia .declaracion { font-weight: 600; margin: 8pt 0; }
  .chica { font-size: 9pt; color: #374151; }
</style></head>
<body>
${cuerpoHtml(p.textoLleno)}
${constancia}
</body></html>`;
};
