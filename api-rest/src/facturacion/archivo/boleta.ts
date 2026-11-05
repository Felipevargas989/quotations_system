import type { AmbienteDeFacturacion } from '../facturacion-cl/facturacion-cl';
import {
  RUT_AUXILIAR,
  cantidadYPrecio,
  correosDelReceptor,
  observacionesDelArchivo,
  revisarLinea,
  rutDelReceptor,
  valorDeLaLinea,
} from './comun';
import { desgloseDelTotal } from './montos';
import {
  Avisos,
  SALTO,
  esFechaDelArchivo,
  lineaDelArchivo,
  pesosDelArchivo,
} from './texto';
import type { Armado, LineaDeDetalle, Receptor } from './tipos';

/**
 * EL ARCHIVO DE LA BOLETA (doc 19 §9.4)
 *
 * Arma el archivo plano de la boleta electrónica (39) de facturacion.cl
 * (archivoboletaelectronica.php), la de las cabañas que emite recepción:
 * - folio 0: lo asigna facturacion.cl (L2);
 * - «ventas y servicios» (IndServicio 3);
 * - las líneas CON IVA incluido (IndMntNeto 0), como los precios de la
 *   casa; el neto y el IVA no se informan, porque el manual los pide solo
 *   con líneas en neto (se confirma en el paso 0);
 * - sin el RUT del huésped, el auxiliar 66666666-6 (L13);
 * - con su correo, facturacion.cl le manda la boleta sola (L11).
 *
 * La boleta no lleva referencias tributarias: las suyas solo salen
 * impresas (L13). La boleta exenta (41) se prueba en el paso 0.
 */

export interface DatosDeBoleta {
  /** 0 (por defecto): lo asigna facturacion.cl. */
  folio?: number;
  /** La fecha de emisión, AAAA-MM-DD (la de Chile). */
  fecha: string;
  /** Sin receptor, va el RUT auxiliar 66666666-6. */
  receptor?: Partial<Receptor> | null;
  /** Precio CON IVA incluido. */
  lineas: LineaDeDetalle[];
  /** Solo impresas: el código (18) y la razón (90). */
  referencias?: { codigo: string; razon?: string | null }[];
  observaciones?: string[];
  /** Lo que debería sumar (lo repartido de un cobro): si no calza, se
   *  avisa. */
  totalEsperado?: number | null;
  /** Dónde sale: en el ambiente de prueba, sin correo (L11). */
  ambiente?: AmbienteDeFacturacion;
}

const MAXIMO_DE_LINEAS = 1000;
const MAXIMO_DE_REFERENCIAS = 40;

const formatoPesos = (n: number) =>
  `$${Math.abs(Math.round(n)).toLocaleString('es-CL')}`;

/** Arma el archivo de una boleta electrónica (39). */
export const armarBoleta = (datos: DatosDeBoleta): Armado => {
  const problemas: string[] = [];
  const avisos = new Avisos();

  const folio = datos.folio ?? 0;
  if (!Number.isInteger(folio) || folio < 0)
    problemas.push(
      'El folio de la boleta no sirve (0 = lo asigna facturacion.cl)',
    );
  if (!esFechaDelArchivo(datos.fecha))
    problemas.push('La fecha de emisión no es válida (AAAA-MM-DD)');

  const r = datos.receptor ?? {};
  const rut = r.rut ? rutDelReceptor(r.rut, problemas, true) : RUT_AUXILIAR;

  const lineas = datos.lineas ?? [];
  if (lineas.length === 0) problemas.push('La boleta no tiene líneas');
  if (lineas.length > MAXIMO_DE_LINEAS)
    problemas.push(`Caben ${MAXIMO_DE_LINEAS} líneas por boleta`);
  lineas.forEach((l, i) => revisarLinea(l, i + 1, problemas));

  const referencias = datos.referencias ?? [];
  if (referencias.length > MAXIMO_DE_REFERENCIAS)
    problemas.push(`Caben ${MAXIMO_DE_REFERENCIAS} referencias`);

  const correo = correosDelReceptor(
    r.correo,
    avisos,
    problemas,
    datos.ambiente,
  );
  if (problemas.length) return { ok: false, problemas };

  // Con las líneas con IVA, el total es la suma. El neto y el IVA solo se
  // calculan para mostrarlos en la vista previa.
  const valores = lineas.map(valorDeLaLinea);
  const total = valores.reduce((s, v) => s + v, 0);
  const montos = desgloseDelTotal(total);
  if (datos.totalEsperado != null && total !== datos.totalEsperado) {
    const diferencia = total - datos.totalEsperado;
    avisos.agregar(
      `La boleta suma ${formatoPesos(total)} y se esperaba ${formatoPesos(datos.totalEsperado)}: ${formatoPesos(diferencia)} ${diferencia > 0 ? 'más' : 'menos'}`,
    );
  }

  const archivo: string[] = [];
  archivo.push('->Boleta<-');
  archivo.push(
    lineaDelArchivo([
      39,
      folio,
      datos.fecha,
      3, // IndServicio: ventas y servicios
      0, // IndMntNeto: líneas con IVA incluido
      '', // PeriodoDesde: solo servicios periódicos
      '', // PeriodoHasta
      '', // FechaVenc
      rut,
      '', // CodInterno
      avisos.campo('El nombre del cliente', r.razon_social, 40),
      avisos.campo('El giro', r.giro, 40),
      avisos.campo('La dirección', r.direccion, 70),
      avisos.campo('La comuna', r.comuna, 20),
      avisos.campo('La ciudad', r.ciudad, 20),
      correo,
    ]),
  );
  archivo.push('->BoletaTotales<-');
  archivo.push(
    lineaDelArchivo([
      '', // Neto: solo con líneas en neto
      0, // Exento
      '', // IVA: solo con líneas en neto
      pesosDelArchivo(total),
      0, // MontoNF: no facturable
      pesosDelArchivo(total), // TotalPeriodo = Total + MontoNF
      0, // SaldoAnterior
      pesosDelArchivo(total), // ValorAPagar = Total + SaldoAnterior
    ]),
  );
  archivo.push('->BoletaDetalle<-');
  lineas.forEach((l, i) => {
    const [cantidad, precio] = cantidadYPrecio(l);
    archivo.push(
      lineaDelArchivo([
        i + 1,
        avisos.campo(`El código de la línea ${i + 1}`, l.codigo || 'SERV', 35),
        avisos.campo(`La descripción de la línea ${i + 1}`, l.descripcion, 80),
        0, // IndExencion: afecta
        cantidad,
        precio,
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
  if (referencias.length) {
    archivo.push('->BoletaReferencia<-');
    referencias.forEach((ref, i) =>
      archivo.push(
        lineaDelArchivo([
          i + 1,
          avisos.campo(`El código de la referencia ${i + 1}`, ref.codigo, 18),
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
