import {
  ESQUEMA_DE_VALIDACION,
  instruccionesDeValidacion,
} from '../analisis/validacion.service';

// LO QUE LEE LA IA PARA VALIDAR: el esquema de la respuesta y las
// instrucciones (decisiones 83, 85 y 87 a 90 del doc 17). Salió de
// validacion.service.spec.ts el 27-10, cuando ese archivo pasó las 800
// líneas.

const REQUISITOS = [
  {
    que: 'Anexo N°1 firmado',
    tipo: 'administrativo',
    obligatorio: true,
    documento: 'Formularios_Anexos.docx',
    pagina: 0,
  },
  {
    que: 'Patente municipal vigente',
    tipo: 'administrativo',
    obligatorio: true,
    documento: 'Bases.pdf',
    pagina: 4,
  },
];

describe('lo que lee la IA para validar', () => {
  it('decisión 85: la respuesta trae la gravedad de cada requisito y los otros problemas graves aparte', () => {
    expect(ESQUEMA_DE_VALIDACION.required).toContain('otros_graves');
    expect(
      ESQUEMA_DE_VALIDACION.properties.requisitos.items.required,
    ).toContain('gravedad');
    expect(
      ESQUEMA_DE_VALIDACION.properties.requisitos.items.properties.gravedad
        .enum,
    ).toEqual(['grave', 'menor']);
  });

  it('el checklist numerado, los datos de la empresa y la carpeta con su vencimiento', () => {
    const t = instruccionesDeValidacion({
      codigo: '4364-13-LE26',
      nombre: 'Producción de Evento día del Profesor',
      organismo: 'I MUNICIPALIDAD DE QUILLON',
      fecha_cierre: '2026-10-19T18:01:00.000Z',
      hoy: '2026-10-17',
      oferente: {
        razon_social: 'VALLE DEL SOL QUILLON SPA',
        rut: '77.701.305-K',
      } as never,
      carpeta: [{ tipo: 'f30', nombre: 'F30 octubre.pdf', vence: null }],
      zip: [
        { donde: '2. Técnica', nombre: 'Formulario N°4.pdf', leido: true },
        { donde: '1. Administrativa', nombre: 'Patente.jpg', leido: false },
      ],
      requisitos: REQUISITOS,
      criterios: [
        { nombre: 'Precio', peso: '30%', como_se_evalua: 'menor precio' },
      ],
    });
    expect(t).toContain('1. [administrativo, obligatorio] Anexo N°1 firmado');
    // Decisión 83: todo lo que va en el ZIP, con su carpeta, y se lee por
    // dentro.
    expect(t).toContain('LO QUE VA EN EL ZIP PARA MERCADO PÚBLICO');
    expect(t).toContain('- 2. Técnica: Formulario N°4.pdf\n');
    expect(t).toContain(
      '- 1. Administrativa: Patente.jpg (no se pudo leer: revísalo solo por su nombre)',
    );
    expect(t).toContain('Lee cada documento por dentro');
    expect(t).toContain(
      '2. [administrativo, obligatorio] Patente municipal vigente (Bases.pdf, pág. 4)',
    );
    expect(t).toContain('RUT: 77.701.305-K');
    expect(t).toContain('Certificado F30: F30 octubre.pdf (no vence)');
    // Decisión 85: cada hallazgo, grave o menor.
    expect(t).toContain(
      '"grave" si puede dejar la oferta fuera de bases, anularla o costarle puntaje',
    );
    expect(t).toContain('va en "otros_graves" si es grave');
    expect(t).toContain('Precio (30%)');
    expect(t).toContain('"vencido"');
    // El Registro de Proveedores se da por hecho (Felipe, 19-10).
    expect(t).toContain(
      'Registro de Proveedores (ChileProveedores) es siempre "cumple"',
    );
  });

  it('decisiones 88 a 90: solo lo del ZIP, el fondo y no la forma, con la vigencia que fijan las bases', () => {
    const t = instruccionesDeValidacion({
      codigo: '5040-14-LE26',
      nombre: 'Servicio de producción Día de Campo del Dirigente Social',
      organismo: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
      fecha_cierre: null,
      hoy: '2026-10-27',
      oferente: null,
      carpeta: [],
      documentos: [
        {
          nombre: 'Certificado de vigencia de la sociedad',
          cuando: 'con_la_oferta',
          obligatorio: true,
          condicion: 'emitido hace no más de 30 días',
        },
        {
          nombre: 'Certificado F30-1',
          cuando: 'al_pagar',
          obligatorio: false,
          condicion: '',
        },
      ],
      requisitos: REQUISITOS,
      criterios: [],
    });
    // La sección 4 con la oferta y su plazo; lo del pago, no (decisión 90).
    expect(t).toContain('LO QUE PIDEN LAS BASES CON LA OFERTA');
    expect(t).toContain(
      '- Certificado de vigencia de la sociedad (obligatorio): emitido hace no más de 30 días',
    );
    expect(t).not.toContain('Certificado F30-1');
    // Felipe: "los documentos vencen en función de lo que dicen las bases y
    // no necesariamente lo que tenemos nosotros definido".
    expect(t).toContain('TODO LO QUE VA EN EL ZIP, el fondo y no la forma');
    expect(t).toContain(
      'la vigencia la fijan las bases y no la fecha de vencimiento que anotó la empresa',
    );
    expect(t).toContain(
      'es solo una referencia: la vigencia la fijan las bases',
    );
    expect(t).toContain('por la fecha de emisión que dice el documento');
    // Ya no lee «Mi empresa» por fuera ni revisa lo de contratar.
    expect(t).not.toContain('NO VA EN EL ZIP');
    expect(t).not.toContain('renovarlo');
    expect(t).toContain('deudas en el certificado de la TGR');
    expect(t).toContain('morosidades o protestos en el DICOM');
    expect(t).toContain('una quiebra o un procedimiento concursal');
    expect(t).toContain(
      '- Lo que está en orden: avisa solo lo que hay que hacer o revisar.',
    );
    expect(t).toContain('si van resoluciones sanitarias');
    expect(t).toContain('Reglamento Sanitario de los Alimentos');
    expect(t).toContain(
      'si la capacidad autorizada alcanza para lo que se ofrece',
    );
    // Va con lo demás, pero nunca hacia el comprador (Felipe: "no nos vamos
    // a autodelatar").
    expect(t).toContain('Es un aviso para la empresa, no para el comprador');
    expect(t).toContain(
      'sin sugerir explicarlo en la postulación ni subir documentos que muestren lo que falta',
    );
    expect(t).not.toContain('el F30, que se pide al contratar');
  });

  it('decisión 87: los precios siempre, uno por uno, y no se avisa lo que no vale la pena corregir', () => {
    const t = instruccionesDeValidacion({
      codigo: '1532886-5-LE26',
      nombre: 'Ceremonia y Cena Día del Funcionario',
      organismo: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
      fecha_cierre: null,
      hoy: '2026-10-27',
      oferente: null,
      carpeta: [],
      requisitos: REQUISITOS,
      criterios: [],
    });
    // El Anexo N°5 del Día del Funcionario iba con la columna de precio
    // neto por ítem vacía.
    expect(t).toContain('LOS PRECIOS, SIEMPRE');
    expect(t).toContain(
      'Una celda de precio en blanco, un precio que no está en neto',
    );
    expect(t).toContain('la oferta económica no se corrige después del cierre');
    expect(t).toContain(
      'Las líneas a las que la empresa no postula no llevan precio.',
    );
    // La ortografía, solo en lo que la empresa todavía edita.
    expect(t).toContain('lo que escribió la empresa en los Word (.docx)');
    expect(t).toContain('NO AVISES');
    expect(t).toContain('en los PDF y en los documentos de terceros');
    // En la del Día del Funcionario del laboratorio salían «Producción» en
    // el nombre de un cliente, una errata del formulario del comprador y
    // «queda mejor como...».
    expect(t).toContain('Cómo se escribe un nombre o una razón social');
    expect(t).toContain('Lo que viene escrito en el formulario del comprador');
    expect(t).toContain('no sugerencias de estilo');
    expect(t).toContain(
      'lo que cambia el sentido o un dato: una frase cortada',
    );
    expect(t).toContain('- Los nombres de los archivos.');

    expect(t).toContain(
      'Una pregunta al foro, solo si puede cambiar la admisión o el puntaje.',
    );
    expect(t).not.toContain('nombres de archivo, sugerencias');
  });
  it('decisión 91: en una compra ágil, el precio y el plazo de entrega van en el formulario de Mercado Público', () => {
    const base = {
      codigo: '1030177-85-COT26',
      nombre: 'Servicio de Alimentación Autoridades',
      organismo: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
      fecha_cierre: null,
      hoy: '2026-10-27',
      oferente: null,
      carpeta: [],
      requisitos: REQUISITOS,
      criterios: [],
    };
    const t = instruccionesDeValidacion({ ...base, compra_agil: true });
    // Felipe: "el plazo de entrega es de compra ágil".
    expect(t).toContain('ES UNA COMPRA ÁGIL');
    expect(t).toContain(
      'el precio y el plazo de entrega se declaran en el formulario de Mercado Público',
    );
    expect(t).toContain(
      'recuérdalo como "menor" («decláralo en el formulario de Mercado Público»)',
    );
    expect(instruccionesDeValidacion(base)).not.toContain('ES UNA COMPRA ÁGIL');
  });

  it('decisión 102: la certificación del programa de integridad vale con la firma del representante legal y del coordinador', () => {
    const t = instruccionesDeValidacion({
      codigo: '5040-14-LE26',
      nombre: 'Día de Campo del Dirigente Social 2026',
      organismo: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
      fecha_cierre: null,
      hoy: '2026-10-28',
      oferente: {
        representante_nombre: 'Hernán Felipe Vargas Droguett',
        coordinador_nombre: 'Camila Carvajal',
      } as never,
      carpeta: [],
      requisitos: REQUISITOS,
      criterios: [],
    });
    // Felipe: "mientras el representante legal y el coordinador del evento
    // estén, el papel es válido".
    expect(t).toContain(
      'vale si la firman el representante legal (Hernán Felipe Vargas Droguett) y el coordinador del servicio (Camila Carvajal)',
    );
    expect(t).toContain(
      'No pidas fecha ni las firmas del resto del personal. Si falta la firma de uno de los dos, es "grave".',
    );
  });
});
