import type { AmbienteDeFacturacion } from '../facturacion-cl/facturacion-cl';
import { CODIGOS_DE_REFERENCIA } from '../referencias';
import {
  cantidadYPrecio,
  correosDelReceptor,
  observacionesDelArchivo,
  revisarLinea,
  rutDelReceptor,
  valorDeLaLinea,
} from './comun';
import { TASA_IVA, montosDesdeElNeto } from './montos';
import {
  Avisos,
  SALTO,
  esFechaDelArchivo,
  lineaDelArchivo,
  pesosDelArchivo,
  textoLimpio,
} from './texto';
import type {
  Armado,
  LineaDeDetalle,
  Receptor,
  ReferenciaDelDocumento,
} from './tipos';

/**
 * EL ARCHIVO DE LA FACTURA Y DE LAS NOTAS (doc 19 §9.3 y §9.5)
 *
 * Arma el archivo plano de facturacion.cl (archivoplano.php) para:
 * - la factura electrónica (33), con sus referencias: la OC (801), la nota
 *   de pedido (802), el contrato (803), HES…;
 * - la nota de crédito (61), que anula (código 1), corrige un texto (2) o
 *   rebaja montos (3) de un documento;
 * - la nota de débito (56), que anula una nota de crédito (1) o sube montos
 *   (3).
 *
 * Las líneas van en NETO: el IVA lo calcula el armador desde el neto, como
 * el SII (L8). La factura exenta (34) y las líneas exentas todavía no se
 * arman: se prueban en el paso 0.
 */

export type TipoDeFactura = 33 | 56 | 61;

export interface DatosDeFactura {
  tipo: TipoDeFactura;
  /** El folio siguiente, de `ConsultarCAF` (L2). */
  folio: number;
  /** La fecha de emisión, AAAA-MM-DD (la de Chile). */
  fecha: string;
  receptor: Receptor;
  lineas: LineaDeDetalle[];
  referencias?: ReferenciaDelDocumento[];
  observaciones?: string[];
  /** El vencimiento del pago, AAAA-MM-DD. */
  vencimiento?: string | null;
  /** 1 contado, 2 crédito, 3 sin costo; sin esto, facturacion.cl asume
   *  crédito. */
  formaDePago?: { codigo: 1 | 2 | 3; glosa?: string | null } | null;
  /** Lo que debería dar (el total de la OC o el % del evento): si no
   *  calza, se avisa antes de emitir. */
  totalEsperado?: number | null;
  /** Dónde sale: en el ambiente de prueba, sin correo (L11). */
  ambiente?: AmbienteDeFacturacion;
}

const NOMBRE: Record<TipoDeFactura, string> = {
  33: 'La factura',
  56: 'La nota de débito',
  61: 'La nota de crédito',
};

/** Los documentos que una nota puede modificar. */
const QUE_SE_MODIFICA = ['33', '34', '39', '41', '56', '61'];

const MAXIMO_DE_LINEAS = 60;
const MAXIMO_DE_REFERENCIAS = 40;

const formatoPesos = (n: number) =>
  `$${Math.abs(Math.round(n)).toLocaleString('es-CL')}`;

const revisarReferencias = (
  datos: DatosDeFactura,
  problemas: string[],
): void => {
  const referencias = datos.referencias ?? [];
  if (referencias.length > MAXIMO_DE_REFERENCIAS)
    problemas.push(`Caben ${MAXIMO_DE_REFERENCIAS} referencias`);

  referencias.forEach((r, i) => {
    const n = i + 1;
    const tipo = String(r.tipo ?? '').trim();
    if (
      !CODIGOS_DE_REFERENCIA.includes(tipo) &&
      !QUE_SE_MODIFICA.includes(tipo)
    )
      problemas.push(
        `La referencia ${n} tiene un tipo que no existe («${tipo}»)`,
      );
    const folio = textoLimpio(r.folio);
    if (!folio) problemas.push(`La referencia ${n} no tiene N°`);
    // El N° no se corta: un número cortado es otro número.
    if (Array.from(folio).length > 18)
      problemas.push(
        `El N° de la referencia ${n} pasa de 18 caracteres y el SII no lo acepta`,
      );
    if (!esFechaDelArchivo(r.fecha))
      problemas.push(`La referencia ${n} necesita su fecha (AAAA-MM-DD)`);
    const codigo = r.codigo ?? 0;
    if (![0, 1, 2, 3].includes(codigo))
      problemas.push(`La referencia ${n} tiene un código que no existe`);
  });

  const esNota = datos.tipo === 56 || datos.tipo === 61;
  const modifican = referencias.filter((r) => (r.codigo ?? 0) !== 0);

  if (!esNota) {
    if (modifican.length > 0)
      problemas.push(
        'Una factura no anula ni corrige otro documento: eso lo hace una nota',
      );
    return;
  }

  // Toda nota modifica UN documento, y dice cómo.
  if (modifican.length !== 1) {
    problemas.push(
      `${NOMBRE[datos.tipo]} referencia un solo documento que modifica (tiene ${modifican.length})`,
    );
    return;
  }
  const modificado = modifican[0];
  if (!QUE_SE_MODIFICA.includes(String(modificado.tipo)))
    problemas.push(
      `${NOMBRE[datos.tipo]} tiene que referenciar una factura, una boleta o una nota`,
    );
  // Anular o corregir un texto: el SII pide una sola línea de referencia.
  if (
    (modificado.codigo === 1 || modificado.codigo === 2) &&
    referencias.length > 1
  )
    problemas.push(
      `${NOMBRE[datos.tipo]} que anula o corrige un texto lleva una sola referencia`,
    );
  if (datos.tipo === 56 && modificado.codigo === 2)
    problemas.push(
      'La nota de débito no corrige textos: eso es una nota de crédito',
    );
  if (
    datos.tipo === 56 &&
    modificado.codigo === 1 &&
    String(modificado.tipo) !== '61'
  )
    problemas.push('La nota de débito solo anula una nota de crédito');
  if (modificado.codigo === 2 && datos.lineas.some((l) => l.precio !== 0))
    problemas.push(
      'La nota que corrige un texto va en $0: sus líneas no llevan precio',
    );
};

/** Arma el archivo de una factura (33) o de una nota (56 y 61). */
export const armarFactura = (datos: DatosDeFactura): Armado => {
  const problemas: string[] = [];
  const avisos = new Avisos();
  const tipo = datos.tipo;

  if (![33, 56, 61].includes(tipo)) {
    return {
      ok: false,
      problemas: [
        `El tipo ${String(tipo)} no se arma acá (la factura exenta se prueba en el paso 0)`,
      ],
    };
  }
  const esNota = tipo === 56 || tipo === 61;

  if (!Number.isInteger(datos.folio) || datos.folio < 0)
    problemas.push('Falta el folio del documento');
  if (!esFechaDelArchivo(datos.fecha))
    problemas.push('La fecha de emisión no es válida (AAAA-MM-DD)');

  // El receptor: en la factura el SII pide la razón social, el giro, la
  // dirección y la comuna; en las notas, solo la razón social.
  const r = datos.receptor ?? ({} as Receptor);
  const rut = rutDelReceptor(r.rut, problemas);
  if (!textoLimpio(r.razon_social))
    problemas.push('Falta la razón social del cliente');
  if (!esNota) {
    if (!textoLimpio(r.giro)) problemas.push('Falta el giro del cliente');
    if (!textoLimpio(r.direccion))
      problemas.push('Falta la dirección del cliente');
    if (!textoLimpio(r.comuna)) problemas.push('Falta la comuna del cliente');
  }

  const lineas = datos.lineas ?? [];
  if (lineas.length === 0) problemas.push('El documento no tiene líneas');
  if (lineas.length > MAXIMO_DE_LINEAS)
    problemas.push(`Caben ${MAXIMO_DE_LINEAS} líneas por documento`);
  lineas.forEach((l, i) => revisarLinea(l, i + 1, problemas));

  revisarReferencias(datos, problemas);

  if (datos.vencimiento != null && datos.vencimiento !== '') {
    if (!esFechaDelArchivo(datos.vencimiento))
      problemas.push('El vencimiento no es una fecha válida (AAAA-MM-DD)');
    else if (esFechaDelArchivo(datos.fecha) && datos.vencimiento < datos.fecha)
      problemas.push('El vencimiento no puede ser antes de la emisión');
  }
  if (datos.formaDePago && ![1, 2, 3].includes(datos.formaDePago.codigo))
    problemas.push(
      'La forma de pago no existe (1 contado, 2 crédito, 3 sin costo)',
    );

  const correo = correosDelReceptor(
    r.correo,
    avisos,
    problemas,
    datos.ambiente,
  );
  if (problemas.length) return { ok: false, problemas };

  // Los montos, desde el neto de cada línea.
  const valores = lineas.map(valorDeLaLinea);
  const montos = montosDesdeElNeto(
    valores.reduce((s, v) => s + v, 0),
    0,
    TASA_IVA,
  );
  if (datos.totalEsperado != null && montos.total !== datos.totalEsperado) {
    const diferencia = montos.total - datos.totalEsperado;
    avisos.agregar(
      `${NOMBRE[tipo]} queda en ${formatoPesos(montos.total)} y se esperaba ${formatoPesos(datos.totalEsperado)}: ${formatoPesos(diferencia)} ${diferencia > 0 ? 'más' : 'menos'}`,
    );
  }

  const archivo: string[] = [];
  archivo.push('->Encabezado<-');
  archivo.push(
    lineaDelArchivo([
      tipo,
      datos.folio,
      datos.fecha,
      0, // TipoDespacho: solo guías
      0, // IndTraslado: solo guías
      rut,
      avisos.campo('La razón social', r.razon_social, 100),
      avisos.campo('El giro', r.giro, 40),
      avisos.campo('La dirección', r.direccion, 60),
      avisos.campo('La comuna', r.comuna, 20),
      avisos.campo('La ciudad', r.ciudad, 20),
      correo,
    ]),
  );
  if (datos.vencimiento) {
    archivo.push('->FechaVencimiento<-');
    archivo.push(lineaDelArchivo([datos.vencimiento]));
  }
  if (datos.formaDePago) {
    archivo.push('->FormaPago<-');
    archivo.push(
      lineaDelArchivo([
        datos.formaDePago.codigo,
        avisos.campo(
          'La glosa de la forma de pago',
          datos.formaDePago.glosa,
          100,
        ),
      ]),
    );
  }
  archivo.push('->Totales<-');
  archivo.push(
    lineaDelArchivo([
      0, // PorcDesctoTot: se informa en cero
      0, // ValorDesctoTot: sin descuentos por línea
      0, // PorcRecgoTot: se informa en cero
      0, // ValorRecgoTot
      pesosDelArchivo(montos.neto),
      pesosDelArchivo(montos.exento),
      TASA_IVA,
      pesosDelArchivo(montos.iva),
      pesosDelArchivo(montos.total),
    ]),
  );
  archivo.push('->Detalle<-');
  lineas.forEach((l, i) => {
    const [cantidad, precio] = cantidadYPrecio(l);
    archivo.push(
      lineaDelArchivo([
        i + 1,
        avisos.campo(`El código de la línea ${i + 1}`, l.codigo || 'SERV', 35),
        avisos.campo(`La descripción de la línea ${i + 1}`, l.descripcion, 80),
        cantidad,
        precio,
        0, // PorcDescto
        0, // ValorDescto
        0, // PorcRecgo
        0, // ValorRecgo
        0, // ValorExento
        pesosDelArchivo(valores[i]),
        'INT1',
        avisos.campo(`La unidad de la línea ${i + 1}`, l.unidad || 'UN', 4),
        avisos.campo(
          `La descripción larga de la línea ${i + 1}`,
          l.descripcionLarga,
          1000,
        ),
      ]),
    );
  });
  const referencias = datos.referencias ?? [];
  if (referencias.length) {
    archivo.push('->Referencia<-');
    referencias.forEach((ref, i) =>
      archivo.push(
        lineaDelArchivo([
          i + 1,
          String(ref.tipo).trim(),
          textoLimpio(ref.folio),
          ref.fecha,
          ref.codigo ?? 0,
          avisos.campo(`La razón de la referencia ${i + 1}`, ref.razon, 90),
        ]),
      ),
    );
  }
  const observaciones = observacionesDelArchivo(datos.observaciones, avisos);
  if (observaciones.length) {
    archivo.push('->Observacion<-');
    observaciones.forEach((o) => archivo.push(lineaDelArchivo([o])));
  }

  return {
    ok: true,
    archivo: archivo.join(SALTO),
    montos,
    avisos: avisos.lista,
  };
};
