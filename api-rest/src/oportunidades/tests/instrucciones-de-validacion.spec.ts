import {
  ESQUEMA_DE_VALIDACION,
  instruccionesDeValidacion,
} from '../analisis/validacion.service';

// LO QUE LEE LA IA PARA VALIDAR: el esquema de la respuesta y las
// instrucciones (decisiones 83, 85, 87, 88 y 89 del doc 17). Salió de
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

  it('decisiones 88 y 89: toda la documentación de la empresa, con lo de «Mi empresa» que no va en el ZIP y lo que piden las bases', () => {
    const t = instruccionesDeValidacion({
      codigo: '5040-14-LE26',
      nombre: 'Servicio de producción Día de Campo del Dirigente Social',
      organismo: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
      fecha_cierre: null,
      hoy: '2026-10-27',
      oferente: null,
      carpeta: [],
      de_mi_empresa: [
        { nombre: 'Resoluciones Valle del sol.pdf', leido: true },
        { nombre: 'Resolución cocina.jpg', leido: false },
      ],
      documentos: [
        {
          nombre: 'Certificado de vigencia de la sociedad',
          cuando: 'con_la_oferta',
          obligatorio: true,
          condicion: 'emitido hace no más de 60 días',
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
    expect(t).toContain('LO DE «MI EMPRESA» QUE NO VA EN EL ZIP');
    expect(t).toContain(
      '- [con la oferta, obligatorio] Certificado de vigencia de la sociedad: emitido hace no más de 60 días',
    );
    expect(t).toContain('- [para el pago] Certificado F30-1\n');
    expect(t).toContain('- Resoluciones Valle del sol.pdf\n');
    expect(t).toContain(
      '- Resolución cocina.jpg (no se pudo leer: revísalo solo por su nombre)',
    );
    expect(t).toContain(
      'TODA LA DOCUMENTACIÓN DE LA EMPRESA, SIEMPRE, vaya o no en el ZIP',
    );
    // Felipe: "F30 vigentes, vigencia de la empresa (a veces piden no mayor
    // a 60 días, otras 30), TGR, DICOM, certificado de quiebra".
    expect(t).toContain('emitido hace no más de 30 o 60 días');
    expect(t).toContain('deudas en el certificado de la TGR');
    expect(t).toContain('morosidades o protestos en el DICOM');
    expect(t).toContain('una quiebra o un procedimiento concursal');
    expect(t).toContain('dilo con la fecha en que hay que renovarlo');
    expect(t).toContain('Reglamento Sanitario de los Alimentos');
    // Va con lo demás, pero nunca hacia el comprador (Felipe: "no nos vamos
    // a autodelatar").
    expect(t).toContain('Es un aviso para la empresa, no para el comprador');
    expect(t).toContain(
      'sin sugerir explicarlo en la postulación ni subir documentos que muestren lo que falta',
    );
    expect(t).toContain(
      'si la capacidad autorizada alcanza para lo que se ofrece',
    );
    // El F30 que no va con la oferta ya no se deja de lado (decisión 89).
    expect(t).not.toContain('el F30, que se pide al contratar');
    // Sin nada aparte, lo dice.
    expect(
      instruccionesDeValidacion({
        codigo: 'x',
        nombre: 'x',
        organismo: null,
        fecha_cierre: null,
        hoy: '2026-10-27',
        oferente: null,
        carpeta: [],
        requisitos: REQUISITOS,
        criterios: [],
      }),
    ).toContain('(nada aparte de lo que va en el ZIP)');
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
});
