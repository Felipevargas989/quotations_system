import {
  nombreDelPapel,
  papelesSinFormato,
  type QuienLoHace,
  quienLoHace,
} from '../postulacion/los-papeles';

// QUIÉN HACE CADA PAPEL (decisión 119, parte 3b, 08-11). Los 156 papeles que
// pedían sin formato las 92 licitaciones analizadas de Valle del Sol
// (producción, 08-11): 137 nombres distintos. La pantalla tiene la misma
// lista en `quienHaceElPapel.test.ts`: las dos copias dicen lo mismo.

const C: QuienLoHace = { quien: 'cotizacion' };
const P: QuienLoHace = { quien: 'propuesta' };
const PORTAL: QuienLoHace = { quien: 'portal' };
const D = (tipo: Extract<QuienLoHace, { quien: 'declaracion' }>['tipo']) =>
  ({ quien: 'declaracion', tipo }) as const;
const E = (porque: string) => ({ quien: 'empresa', porque }) as const;
const FOTOS = E('son tus fotos');
const VEHICULO = E('es del vehículo');
const CONDUCTOR = E('es del conductor');
const PROFESIONALES = E('es de los profesionales');
const UTP = {
  quien: 'no_aplica',
  porque: 'Solo si postulas como Unión Temporal de Proveedores (UTP)',
} as const;

/** [nombre, condición, quién] */
const LOS_156: Array<[string, string, QuienLoHace | null]> = [
  ['Acreditación de Registro Sernatur del recinto', '', E('lo da Sernatur')],
  ['Anexo técnico del servicio ofertado', '', P],
  [
    'Antecedentes de habilitación para el transporte de pasajeros',
    '',
    VEHICULO,
  ],
  [
    'Antecedentes que verifiquen la experiencia de los profesionales',
    'Mínimo 2 años de experiencia',
    PROFESIONALES,
  ],
  [
    'Antecedentes que verifiquen la experiencia de los profesionales (mínimo 2 años)',
    '',
    PROFESIONALES,
  ],
  [
    'Autorizaciones o certificados de desinsectación, sanitización, desratización y fumigación',
    'Al día',
    E('lo da la empresa de control de plagas'),
  ],
  ['Catálogo fotográfico de presentación (mínimo 4 fotos reales)', '', FOTOS],
  [
    'Cédula de identidad del representante legal',
    '',
    E('es la cédula del representante legal'),
  ],
  ['Certificación oficial de sello verde', '', VEHICULO],
  [
    'Certificado de antecedentes de los conductores',
    'emitido máximo 30 días antes de la postulación',
    CONDUCTOR,
  ],
  ['Certificado de antecedentes del conductor', '', CONDUCTOR],
  ['Certificado de autorización Seremi de Transportes de la van', '', VEHICULO],
  [
    'Certificado de autorización Seremi de Transportes de los buses',
    '',
    VEHICULO,
  ],
  [
    'Certificado de evaluación favorable por trabajos anteriores (firmado y timbrado)',
    'Firmado y timbrado por un servicio público y/o una empresa',
    E('lo da un cliente anterior'),
  ],
  [
    'Certificado de habilidad para trabajar con menores (chofer y asistente)',
    'al día; el del asistente solo si se oferta con asistente',
    CONDUCTOR,
  ],
  [
    'Certificado de inhabilidad para trabajar con menores de los conductores',
    '',
    CONDUCTOR,
  ],
  [
    'Certificado de inhabilidad para trabajar con menores del conductor',
    '',
    CONDUCTOR,
  ],
  [
    'Certificado de inhabilidades para trabajar con menores de edad',
    '',
    E('lo da el Registro Civil'),
  ],
  [
    'Certificado de inhabilidades para trabajar con menores del conductor',
    'Las bases no dicen en qué momento se entrega',
    CONDUCTOR,
  ],
  [
    'Certificado de inscripción en el Registro Nacional de Servicios de Transporte',
    '',
    VEHICULO,
  ],
  // Lo de «Mi empresa»: lo reconoce su carpeta.
  [
    'Certificado de vigencia de personería y escritura de facultades del representante',
    'antigüedad no superior a 60 días a la apertura',
    null,
  ],
  [
    'Copia simple de certificados de título o acreditación profesional',
    '',
    PROFESIONALES,
  ],
  [
    'Copia simple del certificado de título de los expositores',
    '',
    PROFESIONALES,
  ],
  [
    'Cotización / oferta económica con detalle de precios y datos del oferente',
    'Vigencia mínima de 60 días desde su emisión',
    C,
  ],
  [
    'Cotización con características, plazo de entrega en días hábiles y validez de la oferta',
    '',
    C,
  ],
  [
    'Cotización con desglose de precios, ubicación, descripción del recinto y detalle del menú',
    '',
    C,
  ],
  [
    'Cotización con especificaciones de la oferta en PDF (menú, lugar y disponibilidad)',
    '',
    C,
  ],
  [
    'Cotización con especificaciones técnicas y datos de contacto',
    'En español, con la totalidad del servicio',
    C,
  ],
  [
    'Cotización detallada (con plazo de entrega, detalle de lo ofertado y datos bancarios)',
    '',
    C,
  ],
  ['Cotización detallada (plazo de entrega y detalle de lo ofertado)', '', C],
  ['Cotización detallada de los servicios ofertados', '', C],
  ['Cotización detallada del servicio ofertado', '', C],
  ['Cotización detallada por línea', '', C],
  ['Cotización formal', '', C],
  [
    'Cotización formal (Word, Excel o PDF) con datos de contacto, bancarios y correo',
    'En pesos chilenos, sin decimales, con impuesto incluido y sin superar $600.000',
    C,
  ],
  [
    'Cotización formal con detalle del producto y servicio (precio por unidad)',
    '',
    C,
  ],
  ['Cotización formal detallada', 'Con datos de contacto actualizados', C],
  ['Cotización formal detallada con datos de contacto actualizados', '', C],
  ['Cotización formal detallada de los servicios', '', C],
  ['Cotización general del servicio', '', C],
  ['Cotización general del servicio y fotos del recinto', '', C],
  [
    'Cotización u oferta económica (con precios neto y bruto, descripción, datos del oferente y especificaciones técnicas)',
    'Vigencia mínima de 60 días corridos desde su emisión',
    C,
  ],
  [
    'Cotización u oferta económica con el detalle de salón, mobiliario, audiovisual, coffee break y colaciones',
    '',
    C,
  ],
  [
    'Cotización u oferta económica con precios neto y bruto, descripción y datos del oferente',
    '',
    C,
  ],
  ['Cotización u oferta económica en la Compra Ágil', '', C],
  ['Currículum vitae de los expositores (mínimo 2)', '', PROFESIONALES],
  [
    'Currículum vitae de los profesionales que ejecutarán la jornada',
    '',
    PROFESIONALES,
  ],
  ['Datos bancarios para el pago', '', D('banco')],
  ['Declaración de participación como UTP', 'Solo si se postula como UTP', UTP],
  ['Declaración jurada con la ubicación del local', '', D('ubicacion')],
  [
    'Declaración jurada de inhabilidades (prácticas antisindicales, delitos concursales)',
    '',
    D('inhabilidades'),
  ],
  ['Declaración jurada de requisitos para ofertar (en línea)', '', PORTAL],
  ['Detalle de prestaciones, cantidades y plazos', '', P],
  [
    'Documentación del bus y del chofer (revisión técnica, seguros obligatorios, sin inhabilidades)',
    'Vigente y al día; los documentos no dicen en qué momento se presenta',
    VEHICULO,
  ],
  [
    'Documentación del vehículo y de su propietario (si ofrece traslado)',
    'Vigente',
    VEHICULO,
  ],
  ['Documento de conformación de UTP', 'Solo si se oferta como UTP', UTP],
  ['Documento del acuerdo de la UTP', 'solo si se postula como UTP', UTP],
  [
    'Documentos del vehículo (permiso de circulación, padrón, revisión técnica, seguro)',
    'vigentes',
    VEHICULO,
  ],
  [
    'Especificaciones y detalle del servicio (espacios, menú de desayuno, almuerzo y once, entradas, horario)',
    '',
    P,
  ],
  ['Ficha del servicio con características y/o fotografías', '', P],
  [
    'Ficha descriptiva y técnica de la carpa (y de la pista, si se ofrece)',
    '',
    E('es del proveedor del equipo'),
  ],
  ['Ficha electrónica de oferta en Mercado Público', '', PORTAL],
  [
    'Ficha técnica complementaria',
    'Solo si hace falta para demostrar el cumplimiento',
    P,
  ],
  ['Ficha técnica complementaria (si es necesaria)', '', P],
  ['Ficha técnica complementaria del servicio (si es necesario)', '', P],
  ['Ficha técnica de iluminación', '', E('es del proveedor del equipo')],
  ['Ficha técnica de los productos (si hace falta complementar)', '', P],
  [
    'Ficha técnica de pantalla y equipamiento audiovisual',
    '',
    E('es del proveedor del equipo'),
  ],
  ['Ficha técnica del servicio con imágenes', '', P],
  ['Fotografías del salón, áreas verdes, estacionamiento y baños', '', FOTOS],
  [
    'Fotografías reales (no referenciales) del recinto y de actividades relacionadas',
    '',
    FOTOS,
  ],
  ['Fotos de los tres espacios del centro de eventos', '', FOTOS],
  ['Fotos de respaldo de la declaración jurada', '', FOTOS],
  [
    'Hoja de vida de los conductores',
    'emitida máximo 30 días antes de la postulación',
    CONDUCTOR,
  ],
  ['Hoja de vida del conductor', 'al día', CONDUCTOR],
  // «patente» aquí es la del vehículo, no la municipal.
  [
    'Identificación del vehículo (marca, modelo, año, patente y capacidad)',
    '',
    VEHICULO,
  ],
  [
    'Identificación y antecedentes del guía turístico (CV, certificados, acreditaciones)',
    '',
    PROFESIONALES,
  ],
  [
    'Imágenes de montaje y entrega de servicios anteriores (Línea 3)',
    '',
    FOTOS,
  ],
  ['Licencia de conducir', 'acorde al vehículo, al día', CONDUCTOR],
  ['Licencia de conducir profesional de los conductores', 'Vigente', CONDUCTOR],
  ['Licencia de conducir profesional del conductor', 'vigente', CONDUCTOR],
  [
    'Listado del personal subcontratado',
    'Persona jurídica, según corresponda',
    E('Eventia no sabe a quién subcontratas'),
  ],
  [
    'Medios de verificación de las buenas prácticas ambientales (convenio de reciclaje, difusión de la política, Huella Chile, sellos)',
    'Convenios vigentes',
    E('Eventia no tiene esos respaldos'),
  ],
  ['Menú (formato libre)', '', P],
  [
    'Oferta económica con valor del salón por jornada y de coffee break y almuerzo por persona',
    '',
    C,
  ],
  [
    'Oferta económica: arriendo por jornada y coffee break y almuerzo por persona',
    '',
    C,
  ],
  // La técnica y la económica juntas: la propuesta valorizada.
  ['Oferta Técnico Económica (precio total)', '', P],
  ['Padrón del vehículo', 'vigente', VEHICULO],
  ['Padrón del vehículo o certificado de anotaciones', 'vigente', VEHICULO],
  ['Permiso de circulación', 'vigente', VEHICULO],
  ['Permiso de circulación de la van', 'Vigente', VEHICULO],
  ['Permiso de circulación de los buses', 'vigente', VEHICULO],
  ['Permiso de circulación del bus', 'al día', VEHICULO],
  ['Permiso de circulación del vehículo', 'vigente', VEHICULO],
  [
    'Plan de evacuación y seguridad',
    'Solo si se tiene',
    E('Eventia no tiene tu plan de evacuación'),
  ],
  [
    'Poder del firmante, si no firma el representante legal',
    'Solo si firma alguien distinto del representante legal',
    {
      quien: 'no_aplica',
      porque: 'Solo si firma alguien que no es el representante legal',
    },
  ],
  ['Programa de capacitación', '', P],
  ['Propuesta con detalle de insumos ofertados', '', P],
  [
    'Propuesta con fotografías de todas las estaciones y descripción de las actividades de colaboración',
    '',
    P,
  ],
  [
    'Propuesta que cubra todas las actividades (cóctel, cena, fiesta bailable y local)',
    '',
    P,
  ],
  [
    'Propuesta técnica (metodología, cronograma, módulos, contenidos, lugar, alimentación y certificación)',
    '',
    P,
  ],
  ['Propuesta técnica (salón y menú)', '', P],
  [
    'Propuesta técnica con el detalle del servicio (menú, salón y equipos)',
    '',
    P,
  ],
  [
    'Propuesta técnica con el detalle del servicio (menús, lugar, salón y estadía)',
    '',
    P,
  ],
  [
    'Propuesta técnica con fotografías del local, información del espacio y disponibilidad en noviembre',
    '',
    P,
  ],
  [
    'Propuesta técnica: menús de coffee break y almuerzos',
    'Dos opciones de almuerzo (normal y especial)',
    P,
  ],
  [
    'Respaldo de cursos, capacitaciones y experiencia de la monitora de biodanza',
    'Los términos de referencia piden estas cualidades, pero no dicen cómo acreditarlas',
    PROFESIONALES,
  ],
  ['Revisión técnica', 'vigente', VEHICULO],
  ['Revisión técnica de la van', 'Vigente', VEHICULO],
  ['Revisión técnica de los buses', 'vigente', VEHICULO],
  ['Revisión técnica del bus', 'al día', VEHICULO],
  ['Revisión técnica del vehículo', 'vigente', VEHICULO],
  ['Seguro del bus', 'al día', VEHICULO],
  ['Seguro del vehículo', 'vigente', VEHICULO],
  ['Seguro obligatorio de la van', 'Vigente', VEHICULO],
  ['Seguro obligatorio de los buses', 'vigente', VEHICULO],
  ['Seguros obligatorios', 'al día', VEHICULO],
  ['Set de fotos de la van', '', FOTOS],
  ['Set de fotos de los buses', '', FOTOS],
  ['SOAP', 'vigente', VEHICULO],
  // Los formularios que aplican y no trajeron su formato.
  ['ANEXO N° 2 FORMULARIO PROGRAMA DE INTEGRIDAD', '', null],
  [
    'ANEXO N° 4 FORMULARIO ACREDITACION EXPERIENCIA DEL OFERENTE EN EL RUBRO',
    '',
    D('experiencia'),
  ],
  ['Anexo N°1 - Declaración jurada de requisitos para ofertar', '', PORTAL],
  [
    'Anexo técnico con las características del servicio ofertado (formato libre)',
    '',
    P,
  ],
  ['Anexos exigidos (no especificados)', '', null],
  ['Cotización (oferta económica y técnica)', '', C],
  [
    'Declaración jurada de ausencia de conflictos de interés e inhabilidades por condenas',
    '',
    D('inhabilidades'),
  ],
  [
    'Declaración jurada de inhabilidades (disponible en www.mercadopublico.cl)',
    '',
    PORTAL,
  ],
  ['Declaración jurada de requisitos para ofertar', '', PORTAL],
  ['Formato N°1 - Identificación del oferente', '', D('identificacion')],
  ['Formato N°2 (datos de contacto del proveedor)', '', D('contacto')],
  ['Formato N°3 - Oferta económica', '', C],
  ['Formulario electrónico de oferta en www.mercadopublico.cl', '', PORTAL],
  ['Formulario N°6 - Propuesta técnica (formato libre)', '', P],
  ['Oferta económica por línea', '', C],
  ['Oferta Técnico Económica', '', P],
  [
    'Pacto de Integridad y constancia de notificación a los trabajadores',
    '',
    D('pacto'),
  ],
];

describe('Quién hace cada papel (decisión 119, parte 3b)', () => {
  it('los 137 nombres distintos de los 156 papeles medidos el 08-11', () => {
    expect(LOS_156).toHaveLength(137);
    const mal = LOS_156.filter(
      ([nombre, condicion, quien]) =>
        JSON.stringify(quienLoHace(nombre, condicion)) !==
        JSON.stringify(quien),
    ).map(([nombre, condicion]) => [nombre, quienLoHace(nombre, condicion)]);
    expect(mal).toEqual([]);
  });

  it('cuántos de cada uno: de los 137, Eventia arma 59, la empresa sube 65 y 6 van en el portal', () => {
    const cuantos: Record<string, number> = {};
    for (const [nombre, condicion] of LOS_156) {
      const q = quienLoHace(nombre, condicion);
      const k = q ? q.quien : 'carpeta o nada';
      cuantos[k] = (cuantos[k] ?? 0) + 1;
    }
    expect(cuantos).toEqual({
      cotizacion: 27,
      propuesta: 24,
      declaracion: 8,
      empresa: 65,
      portal: 6,
      no_aplica: 4,
      'carpeta o nada': 3,
    });
  });
});

describe('Los papeles sin formato del análisis', () => {
  it('la sección 4 en «otro» o en formulario sin su archivo, y los formularios sin formato; sin repetir', () => {
    const papeles = papelesSinFormato({
      documentos: [
        {
          nombre: 'Formato N°1 - Identificación del oferente',
          parte: 'administrativa',
          cuando: 'con_la_oferta',
          carpeta: 'formulario',
          obligatorio: true,
        },
        // Su formulario trae archivo: lo llena la IA.
        {
          nombre: 'Anexo N°3 Oferta económica',
          parte: 'economica',
          cuando: 'con_la_oferta',
          carpeta: 'formulario',
        },
        // De «Mi empresa» con su carpeta: no es de aquí.
        {
          nombre: 'Patente municipal',
          cuando: 'con_la_oferta',
          carpeta: 'patente',
        },
        // Al adjudicar: no es para postular.
        { nombre: 'Datos bancarios', cuando: 'al_adjudicar', carpeta: 'otro' },
        {
          nombre: 'Fotografías del salón',
          parte: 'tecnica',
          cuando: 'con_la_oferta',
          carpeta: 'otro',
          obligatorio: false,
          condicion: 'Mínimo 4',
        },
      ],
      formularios: [
        {
          nombre: 'Formato N°1 - Identificación del oferente',
          archivo: '',
          aplica: true,
          se_entrega_en: 'administrativa',
        },
        {
          nombre: 'Anexo N°3 - Oferta Económica',
          archivo: 'Anexos.docx',
          aplica: true,
          se_entrega_en: 'economica',
        },
        {
          nombre: 'Formato N°2 (datos de contacto del proveedor)',
          archivo: '',
          aplica: true,
          se_entrega_en: 'administrativa',
        },
        // No aplica: no va.
        {
          nombre: 'Anexo N°6 UTP',
          archivo: '',
          aplica: false,
          se_entrega_en: 'administrativa',
        },
        // Un análisis muy antiguo no dice el archivo: se le cree que lo trae.
        { nombre: 'Anexo N°7 Calidad', aplica: true, se_entrega_en: 'tecnica' },
      ],
    });
    expect(papeles).toEqual([
      {
        nombre: 'Formato N°1 - Identificación del oferente',
        parte: 'administrativa',
        obligatorio: true,
        condicion: '',
        formulario: true,
        quien: { quien: 'declaracion', tipo: 'identificacion' },
      },
      {
        nombre: 'Fotografías del salón',
        parte: 'tecnica',
        obligatorio: false,
        condicion: 'Mínimo 4',
        formulario: false,
        quien: { quien: 'empresa', porque: 'son tus fotos' },
      },
      {
        nombre: 'Formato N°2 (datos de contacto del proveedor)',
        parte: 'administrativa',
        obligatorio: true,
        condicion: '',
        formulario: true,
        quien: { quien: 'declaracion', tipo: 'contacto' },
      },
    ]);
  });

  it('el nombre del papel: el de las bases con el código; sin barras, y si es muy largo, sin lo que va entre paréntesis', () => {
    expect(nombreDelPapel('Oferta económica por línea', '4362-30-LE26')).toBe(
      'Oferta económica por línea 4362-30-LE26.docx',
    );
    expect(
      nombreDelPapel(
        'Cotización / oferta económica con detalle de precios y datos del oferente',
        '2705-1740-COT26',
      ),
    ).toBe(
      'Cotización - oferta económica con detalle de precios y datos del oferente 2705-1740-COT26.docx',
    );
    expect(
      nombreDelPapel(
        'Cotización u oferta económica (con precios neto y bruto, descripción, datos del oferente y especificaciones técnicas)',
        '1-2-LE26',
      ),
    ).toBe('Cotización u oferta económica 1-2-LE26.docx');
    expect(
      nombreDelPapel('Oferta económica: arriendo por jornada', '1-2-LE26'),
    ).toBe('Oferta económica - arriendo por jornada 1-2-LE26.docx');
    // Un punto en el nombre no es una extensión.
    expect(nombreDelPapel('Formulario de www.mercadopublico.cl', 'X')).toBe(
      'Formulario de www.mercadopublico.cl X.docx',
    );
  });
});
