import { BadRequestException } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger } from 'src/testing/mocks';
import type { User } from 'src/users/entities/user.entity';
import type { AdjuntosRepository } from '../adjuntos/adjuntos.repository';
import type { AnalisisRepository } from '../analisis/analisis.repository';
import type { GeneracionRepository } from '../generacion/generacion.repository';
import type { GeneracionService } from '../generacion/generacion.service';
import type { OferenteRepository } from '../oferente/oferente.repository';
import type { ArmarLaOfertaService } from '../postulacion/armar-la-oferta.service';
import {
  ArmarPostulacionService,
  pidenExperiencia,
  vaLaPropuesta,
} from '../postulacion/armar-postulacion.service';
import type { CotizacionDeLaPostulacionService } from '../postulacion/cotizacion-de-la-postulacion.service';
import type {
  Candidata,
  ExperienciaConfirmada,
} from '../postulacion/la-experiencia';
import type { LaExperienciaService } from '../postulacion/la-experiencia.service';
import type { PostulacionRepository } from '../postulacion/postulacion.repository';

// «ARMAR POSTULACIÓN» (decisión 35, 19-10): un solo botón con el precio.
// La oferta primero; cuando queda lista, los anexos con ese precio, la
// propuesta técnica si va y la cotización vinculada igual a lo postulado.
// Desde la decisión 76, si las bases piden experiencia, solo con la
// experiencia que confirmó la empresa.

const USUARIO = {
  id: 'cuenta-1',
  company_id: 1,
  role: 'administrador',
} as unknown as User;

const FUNCIONARIO = {
  requisitos: [
    { que: 'Formulario Anexo N°1 Identificación del Oferente, firmado' },
    {
      que: 'Formulario Anexo N°4 Calidad de la oferta (o formato propio) con el detalle de todos los requerimientos técnicos',
    },
  ],
  formularios: [],
};

function armar() {
  const oferta = {
    pedir: jest.fn().mockResolvedValue({ id: 21, estado: 'procesando' }),
  };
  const documentos = {
    generarAnexos: jest.fn().mockResolvedValue({ id: 22 }),
    crearPropuesta: jest.fn().mockResolvedValue({ id: 23 }),
  };
  const cotizacion = { llevar: jest.fn().mockResolvedValue({}) };
  const generaciones = {
    anotarParametros: jest.fn().mockResolvedValue(undefined),
  };
  const analisis = {
    ultimo: jest
      .fn()
      .mockResolvedValue({ estado: 'listo', resultado: FUNCIONARIO }),
  };
  const oferente = {
    respaldos: jest.fn().mockResolvedValue([]),
    oferente: jest.fn().mockResolvedValue({
      razon_social: 'VALLE DEL SOL QUILLON SPA',
      rut: '77.701.305-K',
    }),
  };
  const repo = {
    oportunidad: jest.fn().mockResolvedValue({ id: 40, quotation_id: null }),
    archivosDelSet: jest.fn().mockResolvedValue([]),
    trabajosDeLaIA: jest.fn().mockResolvedValue([]),
  };
  const adjuntos = { borrarBorradores: jest.fn().mockResolvedValue(0) };
  const experiencia = {
    confirmada: jest.fn().mockResolvedValue(null),
    paraArmar: jest.fn().mockResolvedValue(null),
  };
  const servicio = new ArmarPostulacionService(
    oferta as unknown as ArmarLaOfertaService,
    documentos as unknown as GeneracionService,
    cotizacion as unknown as CotizacionDeLaPostulacionService,
    generaciones as unknown as GeneracionRepository,
    analisis as unknown as AnalisisRepository,
    oferente as unknown as OferenteRepository,
    repo as unknown as PostulacionRepository,
    experiencia as unknown as LaExperienciaService,
    adjuntos as unknown as AdjuntosRepository,
    mockPinoLogger() as unknown as PinoLogger,
  );
  return {
    adjuntos,
    experiencia,
    oferta,
    documentos,
    cotizacion,
    generaciones,
    analisis,
    oferente,
    repo,
    servicio,
  };
}

describe('Armar postulación', () => {
  it('la propuesta técnica valorizada va siempre que no haya formulario técnico (decisiones 40 y 42)', () => {
    // El anexo de calidad (aunque acepte formato propio) lleva el detalle.
    expect(vaLaPropuesta(FUNCIONARIO)).toBe(false);
    expect(
      vaLaPropuesta({
        requisitos: [{ que: 'Oferta técnica en formato propio' }],
        formularios: [
          { nombre: 'Formulario N°4 - Calidad de la propuesta', aplica: true },
        ],
      }),
    ).toBe(false);
    // Sin formulario técnico, va: la pidan o no (una compra ágil no trae
    // formularios).
    expect(
      vaLaPropuesta({ requisitos: [{ que: 'Propuesta técnica firmada' }] }),
    ).toBe(true);
    expect(
      vaLaPropuesta({
        requisitos: [{ que: 'Almuerzo para 50 personas' }],
        formularios: [],
      }),
    ).toBe(true);
    // Un formulario técnico que no aplica no cuenta.
    expect(
      vaLaPropuesta({
        requisitos: [{ que: 'Patente municipal vigente' }],
        formularios: [
          { nombre: 'Anexo N°6 Oferta técnica de la UTP', aplica: false },
        ],
      }),
    ).toBe(true);
  });

  it('pide la oferta con el precio y lo que sigue', async () => {
    const { servicio, oferta } = armar();
    const fila = await servicio.armar(USUARIO, 40, 11_900_000);
    expect(fila).toEqual({ id: 21, estado: 'procesando' });
    // El Funcionario trae el anexo de calidad: el detalle va en él y no
    // hay propuesta aparte (decisión 40).
    expect(oferta.pedir).toHaveBeenCalledWith(1, 'cuenta-1', 40, {
      parametros: { postulacion: { total: 11_900_000, propuesta: false } },
      despues: expect.any(Function),
    });
  });

  it('decisión 94: una compra ágil sin formularios no tiene anexos; va la propuesta técnica valorizada y no queda ningún problema', async () => {
    const { servicio, oferta, documentos, repo, analisis, generaciones } =
      armar();
    // Así viene la 3497-466-COT26: la sección 4 pide una propuesta y no
    // hay formularios.
    repo.oportunidad.mockResolvedValue({
      id: 5261,
      quotation_id: null,
      proceso: { tipo: 'compra_agil' },
    });
    analisis.ultimo.mockResolvedValue({
      estado: 'listo',
      resultado: {
        requisitos: [{ que: 'Propuesta que cubra todas las actividades' }],
        formularios: [],
      },
    });
    await servicio.armar(USUARIO, 5261, 5_900_000);
    const [, , , encadenar] = oferta.pedir.mock.calls[0] as [
      number,
      string,
      number,
      {
        parametros: unknown;
        despues: (id: number) => Promise<void>;
      },
    ];
    expect(encadenar.parametros).toEqual({
      postulacion: { total: 5_900_000, propuesta: true, anexos: false },
    });
    await encadenar.despues(21);
    expect(documentos.generarAnexos).not.toHaveBeenCalled();
    expect(documentos.crearPropuesta).toHaveBeenCalledWith(
      1,
      'cuenta-1',
      5261,
      { monto_total: 5_900_000, reemplaza: [] },
    );
    expect(generaciones.anotarParametros).not.toHaveBeenCalled();
  });

  it('decisión 94: una compra ágil con formularios, o una licitación sin ellos, siguen con los anexos', async () => {
    const { servicio, oferta, repo, analisis } = armar();
    repo.oportunidad.mockResolvedValue({
      id: 5171,
      quotation_id: null,
      proceso: { tipo: 'compra_agil' },
    });
    analisis.ultimo.mockResolvedValue({
      estado: 'listo',
      resultado: {
        requisitos: [],
        formularios: [{ nombre: 'Formulario Identificación', aplica: true }],
      },
    });
    await servicio.armar(USUARIO, 5171, 1_136_500);
    const [, , , pedido] = oferta.pedir.mock.calls[0] as [
      number,
      string,
      number,
      { parametros: { postulacion: Record<string, unknown> } },
    ];
    expect(pedido.parametros.postulacion).toMatchObject({ total: 1_136_500 });
    expect(pedido.parametros.postulacion).not.toHaveProperty('anexos');
  });

  it('sin la razón social y el RUT de «Mi empresa» no parte: los anexos los necesitan', async () => {
    const { servicio, oferente, oferta } = armar();
    oferente.oferente.mockResolvedValue({ razon_social: 'VALLE DEL SOL' });
    await expect(servicio.armar(USUARIO, 40, 11_900_000)).rejects.toThrow(
      BadRequestException,
    );
    expect(oferta.pedir).not.toHaveBeenCalled();
  });

  it('con la oferta lista: los anexos con el precio y la propuesta técnica', async () => {
    const { servicio, oferta, documentos, cotizacion, generaciones, analisis } =
      armar();
    // Unas bases que piden propuesta técnica sin formulario para ella.
    analisis.ultimo.mockResolvedValue({
      estado: 'listo',
      resultado: {
        requisitos: [{ que: 'Propuesta técnica firmada' }],
        formularios: [],
      },
    });
    await servicio.armar(USUARIO, 40, 11_900_000);
    const [, , , encadenar] = oferta.pedir.mock.calls[0] as [
      number,
      string,
      number,
      { despues: (id: number) => Promise<void> },
    ];
    const { despues } = encadenar;
    await despues(21);

    expect(documentos.generarAnexos).toHaveBeenCalledWith(1, 'cuenta-1', 40, {
      monto_total: 11_900_000,
      post_venta: [],
      ya_firmados: [],
      reemplaza: [],
    });
    // Con el precio: el valor va al final de la propuesta (decisión 42).
    expect(documentos.crearPropuesta).toHaveBeenCalledWith(1, 'cuenta-1', 40, {
      monto_total: 11_900_000,
      reemplaza: [],
    });
    // Sin cotización vinculada, no se toca ninguna.
    expect(cotizacion.llevar).not.toHaveBeenCalled();
    expect(generaciones.anotarParametros).not.toHaveBeenCalled();
  });

  it('con la experiencia confirmada, los anexos llevan esas filas y el ZIP los PDF de las de Post-venta (decisión 76)', async () => {
    const { servicio, documentos } = armar();
    const deMercadoPublico: Candidata = {
      clave: 'mp:4366-146-SE23',
      de: 'mi_empresa',
      con_respaldo: true,
      numero: '4366-146-SE23',
      mandante: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
      contrato: 'SERV. ARRIENDO ESPACIOS Y ALIMENTACIÓN',
      anio: 2023,
      monto: 16_500_000,
      fuente: 'mercado_publico',
      archivo: 'Orden de compra - 4366-146-SE23.pdf',
    };
    const deEventia: Candidata = {
      clave: 'ev:118',
      de: 'eventia',
      con_respaldo: true,
      numero: '260',
      mandante: 'Comercial CCU S.A.',
      contrato: 'Segundo pago Navidad 2025',
      anio: 2025,
      monto: 11_292_880,
      fuente: 'manual',
      evento: 118,
      archivo: 'Factura 260.pdf',
      ruta: 'c1/event-documents/q-118/facturas/x_F260_CCU.pdf',
      bytes: 900,
    };
    const experiencia: ExperienciaConfirmada = {
      confirmada: true,
      filas: [deMercadoPublico, deEventia],
    };
    await servicio.seguir(
      USUARIO,
      40,
      21,
      { total: 11_900_000, propuesta: false },
      experiencia,
    );
    expect(documentos.generarAnexos).toHaveBeenCalledWith(1, 'cuenta-1', 40, {
      monto_total: 11_900_000,
      post_venta: [
        {
          numero: '260',
          mandante: 'Comercial CCU S.A.',
          contrato: 'Segundo pago Navidad 2025',
          anio: 2025,
          monto: 11_292_880,
          fuente: 'manual',
          evento: 118,
          archivo: 'Factura 260.pdf',
          ruta: 'c1/event-documents/q-118/facturas/x_F260_CCU.pdf',
          bytes: 900,
        },
      ],
      experiencia,
      ya_firmados: [],
      reemplaza: [],
    });
  });

  it('sin experiencia confirmada, los anexos no llevan respaldos de Post-venta ni leen nada', async () => {
    const { servicio, documentos, generaciones } = armar();
    await servicio.seguir(USUARIO, 40, 21, {
      total: 11_900_000,
      propuesta: false,
    });
    expect(documentos.generarAnexos).toHaveBeenCalledWith(1, 'cuenta-1', 40, {
      monto_total: 11_900_000,
      post_venta: [],
      ya_firmados: [],
      reemplaza: [],
    });
    expect(generaciones.anotarParametros).not.toHaveBeenCalled();
  });

  it('«Volver a armar» (decisión 49): lo firmado no se rehace y los borradores sin firma se reemplazan; con todo firmado, solo se limpian', async () => {
    const { servicio, documentos, analisis, repo, adjuntos } = armar();
    const formulario = (n: number) => ({
      nombre: `Formulario N°${n}`,
      archivo: 'Formularios_Anexos.docx',
      aplica: true,
      se_entrega_en: 'administrativa',
    });
    analisis.ultimo.mockResolvedValue({
      estado: 'listo',
      resultado: { formularios: [formulario(1), formulario(2)] },
    });
    const archivo = (id: number, nombre: string, extra = {}) => ({
      id,
      nombre,
      ruta: `c1/x/${id}`,
      bytes: 10,
      seccion: 'postulacion',
      origen: 'generado',
      viene_de: 54,
      generacion_id: 9,
      creado_en: '2026-10-19T22:47:00.000Z',
      ...extra,
    });
    repo.archivosDelSet.mockResolvedValue([
      archivo(60, 'Formulario N°1 - lleno.docx'),
      archivo(61, 'Formulario N°2 - lleno.docx'),
      archivo(62, 'Formulario N°1 - firmado.pdf', {
        origen: 'firmado',
        viene_de: 60,
      }),
    ]);
    await servicio.seguir(USUARIO, 40, 21, {
      total: 11_900_000,
      propuesta: false,
    });
    expect(documentos.generarAnexos).toHaveBeenCalledWith(1, 'cuenta-1', 40, {
      monto_total: 11_900_000,
      post_venta: [],
      ya_firmados: ['Formulario N°1'],
      reemplaza: [61],
    });

    // Con el N°2 también firmado: nada que rehacer.
    repo.archivosDelSet.mockResolvedValue([
      archivo(60, 'Formulario N°1 - lleno.docx'),
      archivo(61, 'Formulario N°2 - lleno.docx'),
      archivo(62, 'Formulario N°1 - firmado.pdf', {
        origen: 'firmado',
        viene_de: 60,
      }),
      archivo(63, 'Formulario N°2 - firmado.pdf', {
        origen: 'firmado',
        viene_de: 61,
      }),
      archivo(64, 'Formulario N°2 - lleno.docx', { generacion_id: 7 }),
    ]);
    documentos.generarAnexos.mockClear();
    await servicio.seguir(USUARIO, 40, 21, {
      total: 11_900_000,
      propuesta: false,
    });
    expect(documentos.generarAnexos).not.toHaveBeenCalled();
    expect(adjuntos.borrarBorradores).toHaveBeenCalledWith(1, 40, [64]);
  });

  it('decisión 99: con todo firmado, la oferta queda anotada «firmados», también si después falla la propuesta', async () => {
    const { servicio, documentos, analisis, repo, generaciones } = armar();
    analisis.ultimo.mockResolvedValue({
      estado: 'listo',
      resultado: {
        formularios: [
          {
            nombre: 'Formulario N°1',
            archivo: 'Formularios_Anexos.docx',
            aplica: true,
            se_entrega_en: 'administrativa',
          },
        ],
      },
    });
    const archivo = (id: number, extra = {}) => ({
      id,
      nombre: 'Formulario N°1 - lleno.docx',
      ruta: `c1/x/${id}`,
      bytes: 10,
      seccion: 'postulacion',
      origen: 'generado',
      viene_de: 54,
      generacion_id: 9,
      creado_en: '2026-10-27T18:00:00.000Z',
      ...extra,
    });
    repo.archivosDelSet.mockResolvedValue([
      archivo(60),
      archivo(62, {
        nombre: 'Formulario N°1 - firmado.pdf',
        origen: 'firmado',
        viene_de: 60,
      }),
    ]);
    documentos.crearPropuesta.mockRejectedValue(
      new BadRequestException('La IA tardó demasiado.'),
    );
    await servicio.seguir(USUARIO, 40, 21, {
      total: 1_136_500,
      propuesta: true,
    });
    expect(documentos.generarAnexos).not.toHaveBeenCalled();
    expect(generaciones.anotarParametros.mock.calls).toEqual([
      [
        1,
        21,
        { postulacion: { total: 1_136_500, propuesta: true, firmados: true } },
      ],
      [
        1,
        21,
        {
          postulacion: {
            total: 1_136_500,
            propuesta: true,
            firmados: true,
            problemas: ['La propuesta técnica: La IA tardó demasiado.'],
          },
        },
      ],
    ]);
  });

  it('con la propuesta técnica firmada, no se rehace', async () => {
    const { servicio, documentos, repo } = armar();
    repo.archivosDelSet.mockResolvedValue([
      {
        id: 70,
        nombre: 'Propuesta técnica.docx',
        ruta: 'c1/x/70',
        bytes: 10,
        seccion: 'postulacion',
        origen: 'generado',
        viene_de: null,
        generacion_id: 8,
        creado_en: '2026-10-19T20:00:00.000Z',
      },
      {
        id: 71,
        nombre: 'Propuesta técnica - firmado.pdf',
        ruta: 'c1/x/71',
        bytes: 10,
        seccion: 'postulacion',
        origen: 'firmado',
        viene_de: 70,
        generacion_id: 11,
        creado_en: '2026-10-19T20:10:00.000Z',
      },
    ]);
    await servicio.seguir(USUARIO, 40, 21, {
      total: 11_900_000,
      propuesta: true,
    });
    expect(documentos.crearPropuesta).not.toHaveBeenCalled();
  });

  it('si las bases piden experiencia, se arma sin confirmarla a mano: la elige la IA al armar y va a los anexos (decisión 86)', async () => {
    const { servicio, oferta, documentos, analisis, experiencia } = armar();
    analisis.ultimo.mockResolvedValue({
      estado: 'listo',
      resultado: {
        requisitos: [{ que: 'Formulario N°3 Experiencia del oferente' }],
      },
    });
    const confirmada: ExperienciaConfirmada = { confirmada: true, filas: [] };
    experiencia.paraArmar.mockResolvedValue(confirmada);
    await servicio.armar(USUARIO, 40, 11_900_000);
    // Antes de la oferta no se pregunta nada: se elige por detrás.
    expect(experiencia.paraArmar).not.toHaveBeenCalled();
    const [, , , pedido] = oferta.pedir.mock.calls[0] as [
      number,
      string,
      number,
      { despues: (ofertaId: number) => Promise<void> },
    ];
    await pedido.despues(21);
    expect(experiencia.paraArmar).toHaveBeenCalledWith(USUARIO, 40);
    expect(documentos.generarAnexos).toHaveBeenCalledWith(
      1,
      'cuenta-1',
      40,
      expect.objectContaining({ experiencia: confirmada, post_venta: [] }),
    );
  });

  it('si las bases no piden experiencia, no se elige ninguna (decisión 86)', async () => {
    const { servicio, oferta, experiencia } = armar();
    await servicio.armar(USUARIO, 40, 11_900_000);
    const [, , , pedido] = oferta.pedir.mock.calls[0] as [
      number,
      string,
      number,
      { despues: (ofertaId: number) => Promise<void> },
    ];
    await pedido.despues(21);
    expect(experiencia.paraArmar).not.toHaveBeenCalled();
  });

  it('¿piden experiencia? Por los requisitos o los formularios que aplican', () => {
    expect(pidenExperiencia(FUNCIONARIO)).toBe(false);
    expect(
      pidenExperiencia({ requisitos: [{ que: 'Acreditar experiencia' }] }),
    ).toBe(true);
    expect(
      pidenExperiencia({
        formularios: [{ nombre: 'Formulario N°3 Experiencia', aplica: false }],
      }),
    ).toBe(false);
    expect(pidenExperiencia(null)).toBe(false);
  });

  it('sin propuesta si las bases no la piden; la cotización vinculada no se toca: se edita a mano y se reescribe con un botón (decisión 69)', async () => {
    const { servicio, documentos, cotizacion, repo } = armar();
    repo.oportunidad.mockResolvedValue({ id: 40, quotation_id: 'q-1' });
    await servicio.seguir(USUARIO, 40, 21, {
      total: 11_900_000,
      propuesta: false,
    });
    expect(documentos.crearPropuesta).not.toHaveBeenCalled();
    expect(cotizacion.llevar).not.toHaveBeenCalled();
  });

  it('lo que no alcanzó a partir queda anotado en la oferta, en palabras', async () => {
    const { servicio, documentos, generaciones } = armar();
    documentos.generarAnexos.mockRejectedValue(
      new BadRequestException('No hay formularios para llenar.'),
    );
    await servicio.seguir(USUARIO, 40, 21, {
      total: 11_900_000,
      propuesta: true,
    });
    expect(documentos.crearPropuesta).toHaveBeenCalled();
    expect(generaciones.anotarParametros).toHaveBeenCalledWith(1, 21, {
      postulacion: {
        total: 11_900_000,
        propuesta: true,
        problemas: ['Los anexos: No hay formularios para llenar.'],
      },
    });
  });
});
