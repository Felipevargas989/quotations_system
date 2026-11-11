import { NotFoundException } from '@nestjs/common';
import { conPuntajes } from '../comparacion/comparacion';
import {
  adjudicadosFrenteALaEmpresa,
  diaDeLaAdjudicacion,
  diasHabilesDespues,
  largoEnElFormulario,
  MAX_DEL_RECLAMO,
  paraElFormulario,
  reclamosDe,
  textoDelReclamo,
} from '../comparacion/reclamo';
import { ReclamosService } from '../comparacion/reclamos.service';
import type { ResultadosRepository } from '../competencia/resultados.repository';
import type { GeneracionRepository } from '../generacion/generacion.repository';
import type { ActaDeAdjudicacion } from '../historia/acta';
import type {
  Oferente,
  OferenteRepository,
} from '../oferente/oferente.repository';
import type { OportunidadesRepository } from '../oportunidades.repository';
import { CRITERIOS, IA, NOMBRES, SIN_CAFE } from './comparacion-de-prueba';

// EL RECLAMO, DESPUÉS DE LA RESOLUCIÓN (decisión 128, 11-11). Felipe: "el
// reclamo creo que debe ser post resolución, si gano no reclamo, si pierdo
// sí, y debería ser una sección abajo para generar reclamos". El texto lo
// arma el motor, sin IA (decisión 59), ahora contra la oferta adjudicada: pide
// dejar sin efecto la adjudicación, entra en los 3.500 caracteres del
// formulario de reclamos de Mercado Público y va sin los signos que ese
// formulario borra. El caso es la 5040-14-LE26.

/** Lo que el formulario de reclamos borra sin avisar (medido el 05-11). */
const BORRADOS = /[$()/:;«»°"'“”]/;

const EMPRESA = {
  razon_social: 'VALLE DEL SOL QUILLON SPA',
  rut: '76.123.456-7',
  representante_nombre: 'Felipe Vargas',
  representante_cargo: 'Representante legal',
  representante_correo: 'felipe@valledelsol.cl',
  representante_telefono: null,
  correo: 'contacto@valledelsol.cl',
  telefono: '+56 9 1111 2222',
} as unknown as Oferente;

const DATOS = {
  codigo: '5040-14-LE26',
  nombre: 'Día de Campo del Dirigente Social 2026',
  organismo: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
  empresa: EMPRESA,
};

const TEXTUM = {
  rut: '77.111.222-3',
  nombre: 'TEXTUM BURGOS Y ORTIZ LIMITADA',
};

describe('El texto del reclamo, para el formulario de Mercado Público', () => {
  it('sale sin los signos que el formulario borra, y dice lo mismo', () => {
    expect(
      paraElFormulario(
        'Bases: «Formulario N°4» (pág. 18); tope $17.200.000 y/o 04/11/2026 a las 15:44',
      ),
    ).toBe(
      'Bases, Formulario número 4, pág. 18, tope 17.200.000 pesos y o 04-11-2026 a las 15.44',
    );
    expect(paraElFormulario('Línea 1 · Alimentación')).toBe(
      'Línea 1, Alimentación',
    );
    expect(paraElFormulario(SIN_CAFE.regla)).not.toMatch(BORRADOS);
    // Los saltos de línea se conservan.
    expect(paraElFormulario('Uno: a\nDos (b)')).toBe('Uno, a\nDos, b');
  });

  it('dice a quién, qué licitación y qué línea; pide dejar sin efecto la adjudicación, y lo firma la empresa', () => {
    const { texto, incluidos } = textoDelReclamo(
      'TEXTUM BURGOS Y ORTIZ LIMITADA',
      [SIN_CAFE],
      DATOS,
      { linea: 'Línea 1 · Alimentación', adjudicada: true },
    );
    expect(incluidos).toBe(1);
    expect(
      texto.startsWith('Señores\nILUSTRE MUNICIPALIDAD DE QUILLON\n'),
    ).toBe(true);
    expect(texto).toContain(
      'Reclamo por la adjudicación de la licitación 5040-14-LE26, Día de Campo del Dirigente Social 2026.',
    );
    expect(texto).toContain(
      'VALLE DEL SOL QUILLON SPA, RUT 76.123.456-7, oferente en esta licitación, reclama de la adjudicación de Línea 1, Alimentación, conforme al artículo 30 bis de la Ley 19.886.',
    );
    expect(texto).toContain(
      'la oferta adjudicada, de TEXTUM BURGOS Y ORTIZ LIMITADA, incumple las bases en lo siguiente.',
    );
    expect(texto).toContain(
      '1. La colación no ofrece café.\nDónde se ve. FORMULARIO número 4 CALIDAD DE LA OFERTA.docx.pdf, pág. 2.\nRegla. Bebida en lata o jugo',
    );
    expect(texto).toContain(
      'Por lo anterior, solicitamos dejar sin efecto la adjudicación, retrotraer el proceso a la etapa de evaluación y evaluar de nuevo las ofertas conforme a las bases.',
    );
    // Ya no pide revisar «antes de adjudicar» (decisión 59).
    expect(texto).not.toContain('antes de adjudicar');
    // El correo del representante manda; sin su teléfono, el de la empresa.
    expect(
      texto.endsWith(
        'Felipe Vargas\nRepresentante legal, VALLE DEL SOL QUILLON SPA\nfelipe@valledelsol.cl, +56 9 1111 2222',
      ),
    ).toBe(true);
    expect(texto).not.toMatch(BORRADOS);
  });

  it('sin datos de «Mi empresa» ni organismo, y sin saber si se le adjudicó, sale igual y sin huecos', () => {
    const { texto } = textoDelReclamo('BPM', [SIN_CAFE], {
      ...DATOS,
      organismo: null,
      empresa: null,
    });
    expect(texto.startsWith('Señores\nOrganismo comprador\n')).toBe(true);
    expect(texto).toContain(
      'Nuestra empresa, oferente en esta licitación, reclama de la adjudicación, conforme',
    );
    expect(texto).toContain('la oferta de BPM incumple las bases');
    expect(texto).not.toContain('RUT');
    expect(texto.endsWith('conforme a las bases.\n\nNuestra empresa')).toBe(
      true,
    );
  });

  it('en una compra ágil no hay adjudicación: reclama de la selección', () => {
    const { texto } = textoDelReclamo('CATAMARANES SPA', [SIN_CAFE], {
      ...DATOS,
      codigo: '1346350-37-COT26',
      esCompraAgil: true,
    });
    expect(texto).toContain(
      'Reclamo por la selección de la compra ágil 1346350-37-COT26',
    );
    expect(texto).toContain('reclama de la selección del proveedor');
    expect(texto).toContain('solicitamos dejar sin efecto la selección');
  });

  it('entra en los 3.500 caracteres: los incumplimientos van mientras quepan, y uno solo muy largo va con la regla cortada', () => {
    const largo = (n: number) => ({
      que: `Incumplimiento ${n} de la oferta técnica`,
      prueba: `Oferta técnica, página ${n}`,
      regla: `Las bases dicen ${'que el servicio debe incluir lo pedido '.repeat(18)}`,
      por_ausencia: false,
    });
    const muchos = [1, 2, 3, 4, 5, 6, 7, 8].map(largo);
    const r = textoDelReclamo('TEXTUM', muchos, DATOS, { adjudicada: true });
    expect(r.incluidos).toBeGreaterThan(1);
    expect(r.incluidos).toBeLessThan(muchos.length);
    expect(largoEnElFormulario(r.texto)).toBeLessThanOrEqual(MAX_DEL_RECLAMO);
    expect(r.texto).toContain(`${r.incluidos}. Incumplimiento ${r.incluidos}`);
    expect(r.texto).not.toContain(`${r.incluidos + 1}. Incumplimiento`);
    // Siempre termina con lo que se pide y la firma.
    expect(r.texto).toContain('solicitamos dejar sin efecto la adjudicación');

    const enorme = [{ ...largo(1), regla: 'Cita '.repeat(2_000) }];
    const uno = textoDelReclamo('TEXTUM', enorme, DATOS);
    expect(uno.incluidos).toBe(1);
    expect(largoEnElFormulario(uno.texto)).toBeLessThanOrEqual(MAX_DEL_RECLAMO);
    expect(uno.texto).toContain('Cita Cita');
    expect(uno.texto).toContain('...');
    // Un salto de línea cuenta por dos.
    expect(largoEnElFormulario('a\nb\nc')).toBe(7);
  });
});

describe('Contra quién se reclama', () => {
  const comparada = conPuntajes(IA, CRITERIOS, NOMBRES);

  it('solo en la línea en que compite la empresa, y nunca contra la suya', () => {
    const r = reclamosDe(comparada.lineas, undefined, DATOS, []);
    // Línea 1: Textum, por el café. La Línea 2 (BPM y Bliss incumplen) no es
    // de la empresa: nadie.
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      contra: 'TEXTUM BURGOS Y ORTIZ LIMITADA',
      corto: 'TEXTUM',
      linea: 'Línea 1 · Alimentación',
      adjudicada: false,
      incumplimientos: 1,
      sin_lugar: 0,
      por_ausencia: false,
    });
    expect(r[0].texto).toContain('la oferta de TEXTUM BURGOS Y ORTIZ LIMITADA');
    expect(r[0].caracteres).toBe(largoEnElFormulario(r[0].texto ?? ''));
  });

  it('si se sabe a quién se adjudicó, contra esa oferta, aunque el nombre venga escrito distinto', () => {
    const r = reclamosDe(comparada.lineas, undefined, DATOS, [
      { rut: '77.111.222-3', nombre: 'Textum Burgos y Ortiz Ltda.' },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].adjudicada).toBe(true);
    expect(r[0].texto).toContain(
      'la oferta adjudicada, de TEXTUM BURGOS Y ORTIZ LIMITADA,',
    );
  });

  it('a la adjudicada que la comparación no le encontró nada: sin texto', () => {
    const limpia = {
      ...comparada.lineas[0],
      oferentes: [
        comparada.lineas[0].oferentes[0],
        { ...comparada.lineas[0].oferentes[1], graves: [] },
      ],
    };
    expect(reclamosDe([limpia], undefined, DATOS, [TEXTUM])).toEqual([
      {
        contra: 'TEXTUM BURGOS Y ORTIZ LIMITADA',
        corto: 'TEXTUM',
        linea: 'Línea 1 · Alimentación',
        adjudicada: true,
        incumplimientos: 0,
        sin_lugar: 0,
        por_ausencia: false,
        texto: null,
        caracteres: 0,
      },
    ]);
    // Y si no se sabe a quién se adjudicó, nadie: no hay qué reclamar.
    expect(reclamosDe([limpia], undefined, DATOS, [])).toEqual([]);
  });

  it('decisión 125: lo que «falta» entra solo si se leyó todo lo de ese oferente', () => {
    const falta = {
      que: 'No adjuntó las órdenes de compra de su experiencia',
      prueba: 'no está entre lo que presentó',
      regla:
        '«Si la oferta no presenta Formulario Anexo N°3 y sus respaldos, quedará Fuera de Bases»',
      por_ausencia: true,
    };
    const conFalta = [
      {
        ...comparada.lineas[0],
        oferentes: [
          comparada.lineas[0].oferentes[0],
          { ...comparada.lineas[0].oferentes[1], graves: [falta] },
        ],
      },
    ];
    const lectura = (sinTraer: number) => [
      {
        oferta: 4,
        nombre: 'TEXTUM',
        es_tuya: false,
        leidos: 15,
        total: 15 + sinTraer,
        sin_leer: [],
        sin_traer: Array.from({ length: sinTraer }, (_, i) => ({
          nombre: `OC ${i}.rar`,
          motivo: 'viene comprimido',
        })),
      },
    ];
    // A Textum (la oferta 4) le quedó algo sin traer: no se reclama por eso.
    expect(reclamosDe(conFalta, lectura(1), DATOS, [])).toEqual([]);
    // Se leyó todo lo suyo: sí, y queda dicho que es «por ausencia».
    const r = reclamosDe(conFalta, lectura(0), DATOS, []);
    expect(r[0].por_ausencia).toBe(true);
    expect(r[0].texto).toContain(
      '1. No adjuntó las órdenes de compra de su experiencia.',
    );
    // Una comparación de antes no dice qué leyó: entra todo.
    expect(reclamosDe(conFalta, undefined, DATOS, [])).toHaveLength(1);
  });

  it('a quién se adjudicó lo que la empresa postuló: por el acta, solo los ítems en que ella ofertó', () => {
    const oferta = (rut: string, proveedor: string, adjudicada: boolean) => ({
      rut,
      proveedor,
      detalle: '',
      precio_unitario: null,
      cantidad_adjudicada: adjudicada ? 1 : 0,
      total_adjudicado: 0,
      adjudicada,
    });
    const acta = {
      informada: '20/11/2026 12:10',
      monto_adjudicado: null,
      items: [
        {
          numero: 1,
          producto: 'Alimentación',
          especificacion: '',
          cantidad: 1,
          ofertas: [
            oferta('76.123.456-7', 'VALLE DEL SOL QUILLON SPA', false),
            oferta('77.111.222-3', 'TEXTUM BURGOS Y ORTIZ LIMITADA', true),
          ],
        },
        {
          numero: 2,
          producto: 'Técnica',
          especificacion: '',
          cantidad: 1,
          ofertas: [
            oferta('77.111.222-3', 'TEXTUM BURGOS Y ORTIZ LIMITADA', false),
            oferta('77.999.888-7', 'BPM EVENTOS SPA', true),
          ],
        },
      ],
    } as ActaDeAdjudicacion;
    const publico = {
      tipo: 'licitacion' as const,
      elegidos: [
        { rut: '77.111.222-3', proveedor: 'TEXTUM', monto: 16_855_993 },
        { rut: '77.999.888-7', proveedor: 'BPM EVENTOS SPA', monto: 2_737_000 },
      ],
      ofertas: [],
    };
    // BPM ganó la línea a la que la empresa no postuló: no le ganó a ella.
    expect(adjudicadosFrenteALaEmpresa(acta, publico, '76123456-7')).toEqual([
      { rut: '77.111.222-3', nombre: 'TEXTUM BURGOS Y ORTIZ LIMITADA' },
    ]);
    // Sin acta leída, todos los adjudicados que no son la empresa.
    expect(adjudicadosFrenteALaEmpresa(null, publico, '76.123.456-7')).toEqual([
      { rut: '77.111.222-3', nombre: 'TEXTUM' },
      { rut: '77.999.888-7', nombre: 'BPM EVENTOS SPA' },
    ]);
    expect(adjudicadosFrenteALaEmpresa(null, null, '76.123.456-7')).toEqual([]);
  });
});

describe('Hasta cuándo se reclama', () => {
  it('el día de la adjudicación: el «Informada en portal» del acta; si no, la fecha de la adjudicación', () => {
    expect(
      diaDeLaAdjudicacion({
        adjudicacion: { fecha: '2025-12-18T00:00:00' },
        acta: { informada: '19/12/2025 17:39' },
      }),
    ).toBe('2025-12-19');
    expect(
      diaDeLaAdjudicacion({
        adjudicacion: { fecha: '2026-11-04T00:00:00' },
        acta: { informada: null },
      }),
    ).toBe('2026-11-04');
    expect(diaDeLaAdjudicacion({ adjudicacion: null, acta: null })).toBeNull();
  });

  it('días hábiles desde la adjudicación, sin feriados: la fecha más temprana', () => {
    // El Día del Profesor se adjudicó el miércoles 04-11-2026.
    // Reclamo, 5 días hábiles de lunes a viernes: 5, 6, 9, 10 y 11.
    expect(diasHabilesDespues('2026-11-04', 5)).toBe('2026-11-11');
    // Tribunal, 10: contando los sábados, el lunes 16; sin ellos, el 18.
    expect(diasHabilesDespues('2026-11-04', 10, true)).toBe('2026-11-16');
    expect(diasHabilesDespues('2026-11-04', 10)).toBe('2026-11-18');
    // Adjudicada un viernes: el plazo parte el lunes.
    expect(diasHabilesDespues('2026-11-20', 1)).toBe('2026-11-23');
    // Cambia de año sin enredarse.
    expect(diasHabilesDespues('2026-12-30', 5)).toBe('2027-01-06');
    expect(diasHabilesDespues('ayer', 5)).toBeNull();
  });
});

describe('Los reclamos de una oportunidad (`GET :id/reclamos`)', () => {
  function armar(estado = 'perdida') {
    const oportunidades = {
      ficha: jest.fn().mockResolvedValue({
        id: 4633,
        codigo: '5040-14-LE26',
        estado,
        proceso: {
          tipo: 'licitacion',
          nombre: 'Día de Campo del Dirigente Social 2026',
          organismo: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
          adjudicacion: { fecha: '2026-11-20T00:00:00' },
          acta: null,
        },
      }),
    };
    const generacion = {
      ultimoDeTipo: jest.fn().mockResolvedValue({
        id: 134,
        estado: 'listo',
        resultado: conPuntajes(IA, CRITERIOS, NOMBRES),
      }),
    };
    const oferente = { oferente: jest.fn().mockResolvedValue(EMPRESA) };
    const resultados = {
      resultadosDe: jest.fn().mockResolvedValue(
        new Map([
          [
            '5040-14-LE26',
            {
              tipo: 'licitacion',
              elegidos: [
                {
                  rut: '77.111.222-3',
                  proveedor: 'TEXTUM BURGOS Y ORTIZ LIMITADA',
                  monto: 16_855_993,
                },
              ],
              ofertas: [],
            },
          ],
        ]),
      ),
    };
    const servicio = new ReclamosService(
      oportunidades as unknown as OportunidadesRepository,
      generacion as unknown as GeneracionRepository,
      oferente as unknown as OferenteRepository,
      resultados as unknown as ResultadosRepository,
    );
    return { oportunidades, generacion, oferente, resultados, servicio };
  }

  it('si gano no reclamo, y antes de la resolución tampoco: no corresponde y no se busca nada más', async () => {
    for (const estado of ['ganada', 'postulada', 'en_preparacion']) {
      const c = armar(estado);
      await expect(c.servicio.de(1, 4633)).resolves.toMatchObject({
        corresponde: false,
        reclamos: [],
        reclamo_hasta: null,
      });
      expect(c.generacion.ultimoDeTipo).not.toHaveBeenCalled();
      expect(c.resultados.resultadosDe).not.toHaveBeenCalled();
    }
  });

  it('si pierdo sí: contra la oferta adjudicada, con la última comparación lista y los plazos', async () => {
    const c = armar();
    const r = await c.servicio.de(1, 4633);
    expect(c.generacion.ultimoDeTipo).toHaveBeenCalledWith(
      1,
      4633,
      'comparacion',
      'listo',
    );
    expect(r).toMatchObject({
      corresponde: true,
      sin_adjudicar: null,
      comparada: true,
      adjudicada_el: '2026-11-20',
      // Viernes 20-11: 5 días hábiles, el 27; 10 con sábados, el 02-12.
      reclamo_hasta: '2026-11-27',
      tribunal_hasta: '2026-12-02',
      maximo: 3500,
    });
    expect(r.reclamos).toHaveLength(1);
    expect(r.reclamos[0]).toMatchObject({
      corto: 'TEXTUM',
      linea: 'Línea 1 · Alimentación',
      adjudicada: true,
      incumplimientos: 1,
    });
    expect(r.reclamos[0].texto).toContain(
      'Reclamo por la adjudicación de la licitación 5040-14-LE26',
    );
    expect(r.reclamos[0].texto).toContain('VALLE DEL SOL QUILLON SPA, RUT');
  });

  it('perdida sin comparación: lo dice, sin reclamos; y una comparación de antes se lee como una sola línea', async () => {
    const c = armar();
    c.generacion.ultimoDeTipo.mockResolvedValue(null);
    await expect(c.servicio.de(1, 4633)).resolves.toMatchObject({
      corresponde: true,
      comparada: false,
      reclamos: [],
    });

    const vieja = armar();
    vieja.generacion.ultimoDeTipo.mockResolvedValue({
      estado: 'listo',
      resultado: {
        resumen: '',
        ganador_probable: 'TEXTUM',
        criterios: [],
        oferentes: [
          { nombre: 'VDS', es_tuya: true, graves: [], cumple_bases: 'si' },
          {
            nombre: 'TEXTUM BURGOS Y ORTIZ LIMITADA',
            es_tuya: false,
            graves: [SIN_CAFE],
            cumple_bases: 'dudoso',
            reclamo: 'El texto de antes, que pedía revisar antes de adjudicar.',
          },
        ],
      },
    });
    const r = await vieja.servicio.de(1, 4633);
    expect(r.reclamos).toHaveLength(1);
    expect(r.reclamos[0].linea).toBe('');
    expect(r.reclamos[0].texto).toContain('dejar sin efecto la adjudicación');
    expect(r.reclamos[0].texto).not.toContain('antes de adjudicar');
  });

  it('terminó sin adjudicar (decisión 124): no hay oferta adjudicada a la que reclamarle', async () => {
    const c = armar();
    c.resultados.resultadosDe.mockResolvedValue(
      new Map([
        [
          '5040-14-LE26',
          {
            tipo: 'licitacion',
            elegidos: [],
            ofertas: [],
            sin_adjudicar: 'desierta',
          },
        ],
      ]),
    );
    await expect(c.servicio.de(1, 4633)).resolves.toMatchObject({
      corresponde: true,
      sin_adjudicar: 'desierta',
      reclamos: [],
    });
  });

  it('una oportunidad de otra empresa: 404', async () => {
    const c = armar();
    c.oportunidades.ficha.mockResolvedValue(null);
    await expect(c.servicio.de(2, 4633)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
