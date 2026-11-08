import { pesos } from '../generacion/la-plata';
import type {
  EmpresaDeConfiguracion,
  Oferente,
} from '../oferente/oferente.repository';
import type { Candidata } from './la-experiencia';
import {
  papelesSinFormato,
  type PapelSinFormato,
  type TipoDeDeclaracion,
} from './los-papeles';
import {
  BLANCO,
  celda,
  corrida,
  deDatos,
  empaquetarElWord,
  fila,
  GRIS,
  laFirma,
  parrafo,
  SIN_MARCA,
  tabla,
  titulo,
  type LogoDelWord,
} from './word-de-la-casa';

// LAS DECLARACIONES Y CARTAS QUE LAS BASES PIDEN SIN FORMATO (decisión 119,
// parte 3b, 08-11). Felipe aprobó: "las declaraciones y cartas sin formato
// salen solas al armar... llevan tu logo, tus colores y los datos de Mi
// empresa, y quedan listas para «Firmar»". Las arma el motor, SIN IA, con
// el formato de la casa (`word-de-la-casa.ts`): la IA llena datos, no
// declara (regla 1 del módulo). Cada una es una plantilla fija con los
// datos de «Mi empresa»; la de inhabilidades dice lo mismo que la
// declaración jurada para ofertar de Mercado Público tras la Ley 21.634
// (ChileCompra, diciembre de 2023). Si falta un dato, no se inventa: queda
// dicho qué completar y la declaración no sale.

/** Lo de «Mi empresa» y de Configuración de empresa que llevan. */
export type DatosDeLaEmpresa = {
  razonSocial: string;
  rut: string;
  giro: string;
  /** Dirección, comuna y región. */
  direccion: string;
  comuna: string;
  telefono: string;
  correo: string;
  sitioWeb: string;
  representante: {
    nombre: string;
    rut: string;
    cargo: string;
    correo: string;
    telefono: string;
  };
  coordinador: {
    nombre: string;
    cargo: string;
    correo: string;
    telefono: string;
  };
  banco: Array<[string, string]>;
};

/** Los datos de la empresa, como los lee la cotización detallada: la
 *  razón social de «Mi empresa» o, sin ella, el nombre de Configuración. */
export const datosDeLaEmpresa = (
  o: Partial<Oferente> | null | undefined,
  empresa: EmpresaDeConfiguracion | null | undefined,
): DatosDeLaEmpresa => {
  const t = (v: string | null | undefined) => v?.trim() ?? '';
  const b = empresa?.bank_details;
  return {
    razonSocial: t(o?.razon_social) || t(empresa?.name),
    rut: t(o?.rut),
    giro: t(o?.giro),
    direccion: [o?.direccion, o?.comuna, o?.region]
      .map(t)
      .filter(Boolean)
      .join(', '),
    comuna: t(o?.comuna),
    telefono: t(o?.telefono),
    correo: t(o?.correo),
    sitioWeb: t(empresa?.sitio_web) || t(o?.sitio_web),
    representante: {
      nombre: t(o?.representante_nombre),
      rut: t(o?.representante_rut),
      cargo: t(o?.representante_cargo),
      correo: t(o?.representante_correo),
      telefono: t(o?.representante_telefono),
    },
    coordinador: {
      nombre: t(o?.coordinador_nombre),
      cargo: t(o?.coordinador_cargo),
      correo: t(o?.coordinador_correo),
      telefono: t(o?.coordinador_telefono),
    },
    banco: b
      ? conDato([
          ['Titular', t(b.titular)],
          ['RUT', t(b.rut)],
          ['Banco', t(b.banco)],
          ['Tipo de cuenta', t(b.tipo_cuenta)],
          ['Número de cuenta', t(b.numero)],
          ['Correo para avisar el pago', t(b.correo_pagos)],
        ])
      : [],
  };
};

/** De qué licitación es. */
export type LaLicitacion = {
  /** «Licitación 4362-30-LE26» o «Compra Ágil 2705-1740-COT26». */
  proceso: string;
  nombre: string;
  comprador: string | null;
};

export type ContenidoDeLaDeclaracion = {
  parrafos: string[];
  /** Pares rótulo y dato, como en la cotización. */
  datos: Array<[string, string]>;
  /** La experiencia, en tabla. */
  experiencia?: string[][];
};

/** La declaración que se arma: el papel de las bases y su tipo. */
export type DeclaracionPedida = PapelSinFormato & { tipo: TipoDeDeclaracion };

/** Las declaraciones que se arman: una por tipo, con el nombre del primer
 *  papel que la pide. */
export const lasDeclaracionesPedidas = (
  resultado: Record<string, unknown> | null | undefined,
): DeclaracionPedida[] => {
  const pedidas: DeclaracionPedida[] = [];
  for (const p of papelesSinFormato(resultado)) {
    if (p.quien?.quien !== 'declaracion') continue;
    const { tipo } = p.quien;
    if (pedidas.some((x) => x.tipo === tipo)) continue;
    pedidas.push({ ...p, tipo });
  }
  return pedidas;
};

const ESTA = (c: string | null) => c?.trim() || 'el organismo comprador';

/** «Felipe Vargas, cédula de identidad N° 12.345.678-9, en representación
 *  de VALLE DEL SOL SPA, RUT N° 77.701.305-K». */
const quienDeclara = (e: DatosDeLaEmpresa): string =>
  `${e.representante.nombre}, cédula de identidad N° ${e.representante.rut}, en representación de ${e.razonSocial}, RUT N° ${e.rut}`;

const para = (l: LaLicitacion) => `la ${l.proceso} «${l.nombre}»`;

const conDato = (pares: Array<[string, string]>): Array<[string, string]> =>
  pares.filter(([, v]) => v.trim() !== '');

/** Lo que tiene que estar en «Mi empresa» para que salga. */
const falta = (e: DatosDeLaEmpresa, que: Array<keyof Requisitos>) => {
  const sin = que.filter((k) => !REQUISITOS[k](e));
  return sin.length === 0
    ? null
    : `completa ${sin.map((k) => NOMBRE_DEL_REQUISITO[k]).join(', ')} en «Mi empresa» y vuelve a armar`;
};

type Requisitos = {
  razonSocial: true;
  rut: true;
  representante: true;
  rutDelRepresentante: true;
  direccion: true;
};

const REQUISITOS: Record<keyof Requisitos, (e: DatosDeLaEmpresa) => boolean> = {
  razonSocial: (e) => Boolean(e.razonSocial),
  rut: (e) => Boolean(e.rut),
  representante: (e) => Boolean(e.representante.nombre),
  rutDelRepresentante: (e) => Boolean(e.representante.rut),
  direccion: (e) => Boolean(e.direccion),
};

const NOMBRE_DEL_REQUISITO: Record<keyof Requisitos, string> = {
  razonSocial: 'la razón social',
  rut: 'el RUT',
  representante: 'el representante legal',
  rutDelRepresentante: 'el RUT del representante legal',
  direccion: 'la dirección',
};

const DEL_QUE_DECLARA: Array<keyof Requisitos> = [
  'razonSocial',
  'rut',
  'representante',
  'rutDelRepresentante',
];

/** Lo que dice cada declaración, o qué falta para armarla. */
export function contenidoDeLaDeclaracion(
  tipo: TipoDeDeclaracion,
  e: DatosDeLaEmpresa,
  l: LaLicitacion,
  experiencia: Candidata[] = [],
): ContenidoDeLaDeclaracion | { falta: string } {
  const comprador = ESTA(l.comprador);
  switch (tipo) {
    case 'inhabilidades': {
      const sin = falta(e, DEL_QUE_DECLARA);
      if (sin) return { falta: sin };
      return {
        parrafos: [
          `${quienDeclara(e)}, para ${para(l)}, declara bajo juramento que la empresa que representa:`,
          '1. No ha sido condenada, dentro de los dos años anteriores a la presentación de la oferta, por prácticas antisindicales, por infracción a los derechos fundamentales del trabajador ni por los delitos concursales del Código Penal.',
          '2. No ha sido condenada por el Tribunal de Defensa de la Libre Competencia a la prohibición de contratar con los órganos de la Administración del Estado dentro de los cinco años anteriores.',
          '3. No tiene la pena de prohibición de celebrar actos y contratos con los organismos del Estado por los delitos de la Ley N° 20.393, ni ha sido condenada a la inhabilitación del artículo 33 de la Ley N° 21.595, de Delitos Económicos, ni tiene socios o administradores condenados a esa medida.',
          `4. No tiene conflicto de interés con ${comprador}: ni la empresa ni sus socios, administradores o representantes son, ni han sido en el último año, funcionarios directivos de ${comprador} hasta el nivel de jefe de departamento o su equivalente, ni funcionarios que participen en sus procesos de compra; no están unidos a ellos por los vínculos de parentesco del artículo 54, letra b), de la Ley N° 18.575, ni por los del artículo 35 quáter de la Ley N° 19.886, y no integran su dotación ni le prestan servicios a honorarios.`,
          'Declara, además, conocer que faltar a la verdad en esta declaración puede constituir el delito de perjurio del artículo 210 del Código Penal.',
        ],
        datos: [],
      };
    }
    case 'ubicacion': {
      const sin = falta(e, [...DEL_QUE_DECLARA, 'direccion']);
      if (sin) return { falta: sin };
      return {
        parrafos: [
          `${quienDeclara(e)}, declara bajo juramento, para ${para(l)}, que el local de la empresa está ubicado en ${e.direccion}.`,
        ],
        datos: [],
      };
    }
    case 'pacto': {
      const sin = falta(e, DEL_QUE_DECLARA);
      if (sin) return { falta: sin };
      return {
        parrafos: [
          `${quienDeclara(e)}, declara conocer y aceptar el pacto de integridad de las bases de ${para(l)}, y se obliga a cumplir cada uno de sus compromisos durante el proceso de compra y la ejecución del contrato.`,
          'Deja constancia, además, de haber puesto el pacto de integridad en conocimiento de sus trabajadores y de quienes participen en la ejecución del contrato.',
        ],
        datos: [],
      };
    }
    case 'identificacion': {
      const sin = falta(e, [
        'razonSocial',
        'rut',
        'direccion',
        'representante',
      ]);
      if (sin) return { falta: sin };
      return {
        parrafos: [`Identificación del oferente para ${para(l)}.`],
        datos: conDato([
          ['Razón social', e.razonSocial],
          ['RUT', e.rut],
          ['Giro', e.giro],
          ['Dirección', e.direccion],
          ['Teléfono', e.telefono],
          ['Correo', e.correo],
          ['Página web', e.sitioWeb],
          ['Representante legal', e.representante.nombre],
          ['RUT del representante legal', e.representante.rut],
          ['Cargo', e.representante.cargo],
          ['Correo del representante', e.representante.correo],
          ['Teléfono del representante', e.representante.telefono],
        ]),
      };
    }
    case 'contacto': {
      const sin = falta(e, ['razonSocial', 'rut']);
      if (sin) return { falta: sin };
      // El coordinador de la licitación (decisión 43); sin él, el
      // representante legal; sin los dos, el correo y el teléfono de la
      // empresa.
      const c = e.coordinador.nombre
        ? e.coordinador
        : e.representante.nombre
          ? e.representante
          : null;
      const correo = c?.correo || e.correo;
      const telefono = c?.telefono || e.telefono;
      if (!correo && !telefono) {
        return {
          falta:
            'completa el correo o el teléfono del coordinador en «Mi empresa» y vuelve a armar',
        };
      }
      return {
        parrafos: [`Datos de contacto de ${e.razonSocial} para ${para(l)}.`],
        datos: conDato([
          ['Razón social', e.razonSocial],
          ['RUT', e.rut],
          ['Contacto', c?.nombre ?? ''],
          ['Cargo', c?.cargo ?? ''],
          ['Correo', correo],
          ['Teléfono', telefono],
          [
            'Representante legal',
            c === e.coordinador ? e.representante.nombre : '',
          ],
        ]),
      };
    }
    case 'banco': {
      const sin = falta(e, ['razonSocial', 'rut']);
      if (sin) return { falta: sin };
      const tiene = (k: string) => e.banco.some(([r]) => r === k);
      if (!tiene('Banco') || !tiene('Número de cuenta')) {
        return {
          falta:
            'completa los datos bancarios en Configuración de empresa y vuelve a armar',
        };
      }
      return {
        parrafos: [
          `Datos bancarios de ${e.razonSocial}, RUT N° ${e.rut}, para el pago de ${para(l)}.`,
        ],
        datos: e.banco,
      };
    }
    case 'experiencia': {
      const sin = falta(e, ['razonSocial', 'rut']);
      if (sin) return { falta: sin };
      // Solo las que tienen su orden de compra o factura, como en los
      // formularios (decisión 76).
      const filas = experiencia.filter((x) => x.con_respaldo && x.numero);
      if (filas.length === 0) {
        return {
          falta:
            'sube las órdenes de compra o facturas de tu experiencia en «Mi empresa» y vuelve a armar',
        };
      }
      return {
        parrafos: [
          `${e.razonSocial}, RUT N° ${e.rut}, acredita para ${para(l)} la siguiente experiencia en servicios similares, con su orden de compra o factura como respaldo.`,
        ],
        datos: [],
        experiencia: filas.map((x) => [
          x.mandante ?? '',
          x.contrato ?? '',
          x.anio ? String(x.anio) : '',
          x.monto ? pesos(x.monto) : '',
          x.numero ?? '',
        ]),
      };
    }
  }
}

/** Las columnas de la experiencia: suman el ancho de la hoja (`ANCHO`). */
const A_EXPERIENCIA = [2300, 3572, 900, 1500, 1700];

export type DatosDelWordDeLaDeclaracion = {
  /** Como lo llaman las bases. */
  titulo: string;
  licitacion: LaLicitacion;
  /** «Quillón, 8 de noviembre de 2026». */
  lugarYFecha: string;
  contenido: ContenidoDeLaDeclaracion;
  firma: { nombre: string; razonSocial: string };
  marca?: { primario: string; secundario: string } | null;
  logo?: LogoDelWord | null;
};

/** El tamaño del título: los nombres largos, más chicos. */
const tamDelTitulo = (t: string) =>
  t.length <= 40 ? 32 : t.length <= 80 ? 26 : 22;

/** El Word de la declaración, con la cara de la cotización. */
export function armarLaDeclaracion(d: DatosDelWordDeLaDeclaracion): Buffer {
  const { primario, secundario } = d.marca ?? SIN_MARCA;
  const l = d.licitacion;
  const partes = [
    parrafo(
      corrida(d.titulo.toLocaleUpperCase('es-CL'), {
        negrita: true,
        tam: tamDelTitulo(d.titulo),
        color: primario,
        espaciado: 20,
      }),
      { despues: 60 },
    ),
    parrafo(
      corrida(l.proceso, { negrita: true }) +
        corrida(`\n${l.nombre}${l.comprador ? `\n${l.comprador}` : ''}`),
      { despues: 160 },
    ),
    parrafo(corrida(d.lugarYFecha, { color: GRIS }), { despues: 200 }),
    ...d.contenido.parrafos.map((p) =>
      parrafo(corrida(p), { alineado: 'both', despues: 120 }),
    ),
  ];
  if (d.contenido.datos.length > 0) {
    partes.push(titulo('Datos', primario), deDatos(d.contenido.datos));
  }
  if (d.contenido.experiencia?.length) {
    partes.push(
      titulo('Experiencia', primario),
      tabla(A_EXPERIENCIA, [
        fila(
          ...['Mandante', 'Servicio', 'Año', 'Monto', 'N° OC o factura'].map(
            (t, i) =>
              celda(t, {
                ancho: A_EXPERIENCIA[i],
                negrita: true,
                fondo: primario,
                color: BLANCO,
                tam: 18,
                mayus: true,
                espaciado: 10,
              }),
          ),
        ),
        ...d.contenido.experiencia.map((x, j) =>
          fila(
            ...x.map((t, i) =>
              celda(t, {
                ancho: A_EXPERIENCIA[i],
                alineado: i === 3 ? 'right' : 'left',
                fondo: j % 2 === 1 ? secundario : undefined,
              }),
            ),
          ),
        ),
      ]),
    );
  }
  partes.push(
    ...laFirma(
      `${d.firma.nombre}\nRepresentante legal\n${d.firma.razonSocial}`,
    ),
  );
  return empaquetarElWord(partes, d.logo);
}
