import {
  EnvioSinRespuesta,
  type FacturacionCl,
  type RespuestaDeProcesar,
} from './facturacion-cl';

/**
 * FACTURACION.CL SIMULADO (doc 19 §9.9, pasos 1 a 4)
 *
 * Felipe, 04-11: *"que fuéramos desarrollando, avanzando esto, y luego lo
 * montamos"*. Este simulado responde con la misma forma que el servicio de
 * verdad y NO emite nada: revisa el archivo como lo describe el manual,
 * pone el folio y devuelve la respuesta. Reproduce los errores que
 * conocemos:
 * - un folio que ya se usó: "ERROR: Ya existe el Documento del TipoDTE = 33
 *   con Folio = N" (L3), tal cual lo documenta facturacion.cl;
 * - un archivo mal armado (campos que faltan o sobran, un «;» dentro de un
 *   texto, totales que no cuadran): rechazado, con lo que falló;
 * - una conexión que se corta (`cortarEnElEnvio`), para probar el «por
 *   confirmar» (L5).
 */

/** Cuántos campos lleva cada línea de datos de cada nodo. */
const CAMPOS: Record<string, number[]> = {
  '->Encabezado<-': [12],
  '->FechaVencimiento<-': [1],
  '->FormaPago<-': [2],
  '->Totales<-': [9, 10],
  '->Detalle<-': [14],
  '->Referencia<-': [6, 7],
  '->Observacion<-': [1],
  '->Boleta<-': [16],
  '->BoletaTotales<-': [8],
  '->BoletaDetalle<-': [11, 13],
  '->BoletaReferencia<-': [3],
};

/** El orden de los nodos, como lo pide el manual. */
const ORDEN_FACTURA = [
  '->Encabezado<-',
  '->FechaVencimiento<-',
  '->FormaPago<-',
  '->Totales<-',
  '->Detalle<-',
  '->Referencia<-',
  '->Observacion<-',
];
const ORDEN_BOLETA = [
  '->Boleta<-',
  '->BoletaTotales<-',
  '->BoletaDetalle<-',
  '->BoletaReferencia<-',
  '->Observacion<-',
];

type Nodo = { marca: string; filas: string[][] };

/** Lee el archivo en sus nodos. Devuelve el error si no tiene la forma. */
export const leerArchivo = (
  archivo: string,
): { nodos: Nodo[] } | { error: string } => {
  const lineas = archivo.split('\r\n');
  const nodos: Nodo[] = [];
  for (const [i, linea] of lineas.entries()) {
    const n = i + 1;
    if (linea.includes('\n') || linea.includes('\r'))
      return { error: `Línea ${n}: los saltos de línea van con \\r\\n` };
    if (!linea.trim()) return { error: `Línea ${n}: no puede ir en blanco` };
    if (linea.startsWith('->')) {
      if (!CAMPOS[linea])
        return { error: `Línea ${n}: nodo desconocido ${linea}` };
      nodos.push({ marca: linea, filas: [] });
      continue;
    }
    const nodo = nodos[nodos.length - 1];
    if (!nodo) return { error: `Línea ${n}: datos antes del primer nodo` };
    if (!linea.endsWith(';'))
      return { error: `Línea ${n}: cada dato termina en «;»` };
    const campos = linea.slice(0, -1).split(';');
    if (!CAMPOS[nodo.marca].includes(campos.length))
      return {
        error: `Línea ${n}: ${nodo.marca} lleva ${CAMPOS[nodo.marca].join(' o ')} campos y trae ${campos.length}`,
      };
    nodo.filas.push(campos);
  }
  return { nodos };
};

const entero = (s: string | undefined) =>
  s && /^-?\d+$/.test(s) ? Number(s) : NaN;

/** Revisa lo que el manual pide de los montos y del orden. */
export const revisarArchivo = (
  archivo: string,
): { tipo: number; folio: number; fecha: string } | { error: string } => {
  const leido = leerArchivo(archivo);
  if ('error' in leido) return leido;
  const { nodos } = leido;
  const primero = nodos[0]?.marca;
  const esBoleta = primero === '->Boleta<-';
  if (primero !== '->Encabezado<-' && !esBoleta)
    return { error: 'El archivo empieza con ->Encabezado<- o con ->Boleta<-' };

  const orden = esBoleta ? ORDEN_BOLETA : ORDEN_FACTURA;
  let ultimo = -1;
  for (const nodo of nodos) {
    const lugar = orden.indexOf(nodo.marca);
    if (lugar < 0) return { error: `${nodo.marca} no va en este documento` };
    if (lugar <= ultimo)
      return { error: `${nodo.marca} va fuera de orden o repetido` };
    ultimo = lugar;
    if (nodo.filas.length === 0)
      return { error: `${nodo.marca} viene sin datos` };
  }
  const de = (marca: string) =>
    nodos.find((n) => n.marca === marca)?.filas ?? [];

  const cabecera = nodos[0].filas[0];
  const tipo = entero(cabecera[0]);
  const folio = entero(cabecera[1]);
  const fecha = cabecera[2];

  if (esBoleta) {
    if (tipo !== 39 && tipo !== 41)
      return { error: `TipoDTE ${tipo} no es una boleta` };
    const totales = de('->BoletaTotales<-')[0];
    const detalle = de('->BoletaDetalle<-');
    if (!totales || detalle.length === 0)
      return { error: 'La boleta lleva ->BoletaTotales<- y ->BoletaDetalle<-' };
    const suma = detalle.reduce((s, f) => s + entero(f[7]), 0);
    if (entero(totales[3]) !== suma)
      return {
        error: `El total ${totales[3]} no es la suma del detalle (${suma})`,
      };
    return { tipo, folio, fecha };
  }

  if (![33, 34, 56, 61].includes(tipo))
    return { error: `TipoDTE ${tipo} no es una factura ni una nota` };
  const totales = de('->Totales<-')[0];
  const detalle = de('->Detalle<-');
  if (!totales || detalle.length === 0)
    return { error: 'El documento lleva ->Totales<- y ->Detalle<-' };
  const [neto, exento, tasa, iva, total] = [4, 5, 6, 7, 8].map((i) =>
    Number(totales[i]),
  );
  const suma = detalle.reduce((s, f) => s + entero(f[10]), 0);
  if (neto !== suma)
    return { error: `El neto ${neto} no es la suma del detalle (${suma})` };
  if (iva !== Math.round((neto * tasa) / 100))
    return { error: `El IVA ${iva} no es el ${tasa}% del neto ${neto}` };
  if (total !== neto + exento + iva)
    return { error: `El total ${total} no es neto + exento + IVA` };
  if ((tipo === 56 || tipo === 61) && de('->Referencia<-').length === 0)
    return { error: 'Una nota lleva la referencia al documento que modifica' };
  return { tipo, folio, fecha };
};

/** Un PDF de una página que dice que es simulado (sin validez). */
export const pdfSimulado = (tipo: number, folio: number): Buffer => {
  const texto = [
    'DOCUMENTO SIMULADO - SIN VALIDEZ TRIBUTARIA',
    `Tipo ${tipo} - Folio ${folio}`,
    'Eventia, facturacion.cl simulado (doc 19)',
  ];
  const contenido = texto
    .map(
      (t, i) =>
        `BT /F1 ${i === 0 ? 16 : 12} Tf 60 ${780 - i * 26} Td (${t}) Tj ET`,
    )
    .join('\n');
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(contenido, 'latin1')} >>\nstream\n${contenido}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const lugares: number[] = [];
  objetos.forEach((o, i) => {
    lugares.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  pdf += lugares
    .map((l) => `${String(l).padStart(10, '0')} 00000 n \n`)
    .join('');
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
};

export interface OpcionesDelSimulado {
  /** El último folio ya usado de cada tipo (sale de la base), para seguir
   *  la numeración después de un reinicio. */
  ultimoFolio?: (tipo: number) => Promise<number>;
  /** Solo para las pruebas: la conexión se corta al mandar. */
  cortarEnElEnvio?: boolean;
}

export class FacturacionClSimulado implements FacturacionCl {
  readonly ambiente = 'simulado' as const;
  private readonly usados = new Map<number, number>();

  constructor(private readonly opciones: OpcionesDelSimulado = {}) {}

  enLinea(): Promise<boolean> {
    return Promise.resolve(true);
  }

  async folioSiguiente(tipo: number): Promise<number> {
    return (await this.ultimo(tipo)) + 1;
  }

  /** El simulado no tiene rangos de folios (CAF): numera sin fin. */
  folios(): Promise<null> {
    return Promise.resolve(null);
  }

  async procesar(archivo: string, tipo: number): Promise<RespuestaDeProcesar> {
    if (this.opciones.cortarEnElEnvio)
      throw new EnvioSinRespuesta(
        'Se cortó la conexión con facturacion.cl antes de la respuesta (simulado)',
      );

    const revision = revisarArchivo(archivo);
    if ('error' in revision)
      return this.rechazado(tipo, null, `ERROR: ${revision.error}`);
    if (revision.tipo !== tipo)
      return this.rechazado(
        tipo,
        null,
        `ERROR: el archivo es del TipoDTE ${revision.tipo}, no del ${tipo}`,
      );

    const ultimo = await this.ultimo(tipo);
    const esBoleta = tipo === 39 || tipo === 41;
    const folio =
      esBoleta && revision.folio === 0 ? ultimo + 1 : revision.folio;
    if (folio <= ultimo)
      return this.rechazado(
        tipo,
        folio,
        `ERROR: Ya existe el Documento del TipoDTE = ${tipo} con Folio = ${folio}`,
      );
    if (folio !== ultimo + 1)
      return this.rechazado(
        tipo,
        folio,
        `ERROR: el folio ${folio} no es el siguiente disponible (${ultimo + 1})`,
      );

    this.usados.set(tipo, folio);
    const mensaje = 'Documento procesado (simulado: no se emitió nada)';
    return {
      resultado: 'emitido',
      tipo,
      folio,
      fecha: revision.fecha,
      mensaje,
      urlOriginal: null,
      urlCedible: null,
      crudo: {
        WSPLANO: {
          Resultado: 'True',
          Mensaje: mensaje,
          Detalle: {
            Documento: {
              Folio: folio,
              TipoDte: tipo,
              Operacion: 'VENTA',
              Fecha: revision.fecha,
              Resultado: 'True',
              urlOriginal: '',
              urlCedible: '',
              Error: '',
            },
          },
        },
      },
    };
  }

  obtenerPdf(tipo: number, folio: number): Promise<Buffer | null> {
    return Promise.resolve(pdfSimulado(tipo, folio));
  }

  /** §9.33: en el simulado no hay XML tributario. */
  obtenerXml(): Promise<{ base64: string | null; mensaje: string | null }> {
    return Promise.resolve({
      base64: null,
      mensaje: 'En el modo simulado no hay XML tributario',
    });
  }

  private async ultimo(tipo: number): Promise<number> {
    if (!this.usados.has(tipo)) {
      const desdeLaBase = (await this.opciones.ultimoFolio?.(tipo)) ?? 0;
      this.usados.set(tipo, desdeLaBase);
    }
    return this.usados.get(tipo) ?? 0;
  }

  private rechazado(
    tipo: number,
    folio: number | null,
    error: string,
  ): RespuestaDeProcesar {
    return {
      resultado: 'rechazado',
      tipo,
      folio,
      fecha: null,
      mensaje: error,
      urlOriginal: null,
      urlCedible: null,
      crudo: {
        WSPLANO: {
          Resultado: 'False',
          Mensaje: error,
          Detalle: {
            Documento: {
              Folio: folio ?? 0,
              TipoDte: tipo,
              Resultado: 'False',
              Error: error,
            },
          },
        },
      },
    };
  }
}
