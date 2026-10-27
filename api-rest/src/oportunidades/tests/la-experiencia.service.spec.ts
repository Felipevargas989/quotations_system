import type Anthropic from '@anthropic-ai/sdk';
import type { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger } from 'src/testing/mocks';
import type { User } from 'src/users/entities/user.entity';
import type { AdjuntosRepository } from '../adjuntos/adjuntos.repository';
import type { AnalisisRepository } from '../analisis/analisis.repository';
import type { EventiaRepository } from '../eventia/eventia.repository';
import type { GeneracionRepository } from '../generacion/generacion.repository';
import type { OferenteRepository } from '../oferente/oferente.repository';
import type { RespaldosDePostVentaService } from '../oferente/respaldos-de-post-venta.service';
import type { OportunidadesRepository } from '../oportunidades.repository';
import {
  LaExperienciaService,
  MODELO_DE_LA_EXPERIENCIA,
} from '../postulacion/la-experiencia.service';

// LA EXPERIENCIA QUE SE PRESENTA (decisión 76, 24-10): la IA propone según
// las bases, de «Mi empresa» primero y de Eventia después, y la empresa
// confirma. La IA va de mentira.

const USUARIO = { id: 'cuenta-1', company_id: 1 } as unknown as User;

const BASES = {
  resumen: 'Día de Campo del Dirigente Social 2026, para 550 personas.',
  criterios: [
    {
      nombre: 'Experiencia del oferente',
      peso: '20%',
      como_se_evalua:
        'Contratos similares de los últimos 4 años: 6 o más = 100.',
    },
  ],
  requisitos: [{ que: 'Formulario N°3 Experiencia del oferente' }],
};

class ExperienciaDePrueba extends LaExperienciaService {
  parse = jest.fn();
  protected cliente(): Anthropic {
    return { messages: { parse: this.parse } } as unknown as Anthropic;
  }
}

function armar() {
  const repo = {
    abandonarAntesDe: jest.fn().mockResolvedValue(undefined),
    ultimoDeTipo: jest.fn().mockResolvedValue(null),
    crearGeneracion: jest.fn((fila: Record<string, unknown>) =>
      Promise.resolve({ id: 30, estado: 'procesando', ...fila }),
    ),
    terminar: jest.fn().mockResolvedValue(undefined),
  };
  const analisis = {
    ultimo: jest
      .fn()
      .mockResolvedValue({ id: 33, estado: 'listo', resultado: BASES }),
  };
  const oferente = {
    respaldos: jest.fn().mockResolvedValue([
      {
        numero: '4366-146-SE23',
        mandante: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
        contrato: 'SERV. ARRIENDO ESPACIOS Y ALIMENTACIÓN',
        anio: 2023,
        monto: 16_500_000,
        fuente: 'mercado_publico',
        archivo: 'OC 4366-146-SE23.pdf',
      },
      // Una factura en «Mi empresa»: no cuenta ni tapa la de su evento.
      {
        numero: '260',
        mandante: 'Comercial CCU S.A.',
        contrato: 'Navidad',
        anio: 2025,
        monto: 11_292_880,
        fuente: 'manual',
        archivo: 'Factura 260.pdf',
      },
    ]),
    oferente: jest
      .fn()
      .mockResolvedValue({ clientes_que_se_muestran: ['cliente-ccu'] }),
  };
  const evento = (numero: number, extra: Record<string, unknown>) => ({
    numero,
    tipo: 'Paseo fin de año',
    fecha: '2025-12-07',
    personas: 300,
    monto: 10_000_000,
    cliente: 'CCU',
    fijos: [],
    ...extra,
  });
  const eventia = {
    eventosParaLaExperiencia: jest.fn().mockResolvedValue([
      evento(199, {
        cliente: 'Rudel S.A.',
        cliente_id: 'cliente-rudel',
        tipo_de_cliente: 'Empresas',
        monto: 34_547_366,
      }),
      evento(118, { cliente_id: 'cliente-ccu', tipo_de_cliente: 'Empresas' }),
      evento(52, {
        cliente: 'Ferrocarril del Pacífico S.A',
        cliente_id: 'cliente-fepasa',
        tipo_de_cliente: 'Empresas',
      }),
      evento(140, {
        cliente: 'Armada de Chile',
        cliente_id: 'cliente-armada',
        tipo_de_cliente: 'Empresas Publicas',
        monto: 8_552_684,
      }),
    ]),
    documentosDeExperiencia: jest
      .fn()
      .mockResolvedValue([{ numero: 118 }, { numero: 52 }]),
  };
  const postVenta = {
    paraLaPostulacion: jest.fn().mockResolvedValue([
      {
        numero: '260',
        mandante: 'Comercial CCU S.A.',
        contrato: 'Segundo pago Navidad 2025',
        anio: 2025,
        monto: 11_292_880,
        fuente: 'manual',
        evento: 118,
        archivo: 'Factura 260.pdf',
        ruta: 'c1/event-documents/q-118/facturas/x_F260.pdf',
        bytes: 900,
      },
    ]),
  };
  const oportunidades = {
    ficha: jest.fn().mockResolvedValue({ id: 4633, estado: 'en_estudio' }),
  };
  const adjuntos = { perfilDe: jest.fn().mockResolvedValue('perfil-1') };
  const servicio = new ExperienciaDePrueba(
    repo as unknown as GeneracionRepository,
    analisis as unknown as AnalisisRepository,
    oferente as unknown as OferenteRepository,
    eventia as unknown as EventiaRepository,
    postVenta as unknown as RespaldosDePostVentaService,
    oportunidades as unknown as OportunidadesRepository,
    adjuntos as unknown as AdjuntosRepository,
    mockPinoLogger() as unknown as PinoLogger,
  );
  return {
    repo,
    analisis,
    oferente,
    eventia,
    postVenta,
    oportunidades,
    servicio,
  };
}

const antes = process.env.ANTHROPIC_API_KEY;
beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'llave-de-prueba';
});
afterAll(() => {
  if (antes === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = antes;
});

describe('La experiencia que se presenta', () => {
  it('las candidatas: «Mi empresa» solo con Mercado Público y de Eventia solo los clientes que se pueden mostrar', async () => {
    const { servicio, postVenta } = armar();
    const c = await servicio.candidatas(1, []);
    expect(c.map((x) => [x.clave, x.con_respaldo])).toEqual([
      ['mp:4366-146-SE23', true],
      ['ev:118', true],
      // Pública y sin documentos: se puede pedir su factura.
      ['ev:140', false],
    ]);
    // Rudel (privado, no está en la lista) y Fepasa no llegan ni a leerse.
    const [, opciones] = postVenta.paraLaPostulacion.mock.calls[0] as [
      number,
      { soloEventos: Set<number>; carpeta: Array<{ numero: string }> },
    ];
    expect([...opciones.soloEventos]).toEqual([118, 140]);
    // Como «Mi empresa» cuenta solo su orden de Mercado Público: la factura
    // 260 de la carpeta no tapa la del evento 118.
    expect(opciones.carpeta).toEqual([{ numero: '4366-146-SE23' }]);
    expect(await servicio.candidatas(1, ['ev:118'])).toHaveLength(2);
  });

  it('la pide con Sonnet y responde al tiro; sin bases analizadas, no', async () => {
    const { servicio, repo, analisis } = armar();
    const ejecutar = jest
      .spyOn(servicio, 'ejecutar')
      .mockResolvedValue(undefined);
    const fila = await servicio.proponer(USUARIO, 4633, ['ev:52']);
    expect(fila).toMatchObject({ id: 30, estado: 'procesando' });
    expect(repo.crearGeneracion).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 'experiencia',
        modelo: MODELO_DE_LA_EXPERIENCIA,
        parametros: { excluir: ['ev:52'] },
      }),
    );
    expect(ejecutar).toHaveBeenCalledWith(1, 30, BASES, ['ev:52']);

    analisis.ultimo.mockResolvedValue({ estado: 'procesando' });
    await expect(servicio.proponer(USUARIO, 4633, [])).rejects.toThrow(
      'Primero analiza las bases',
    );
  });

  it('una licitación ya postulada no cambia su experiencia', async () => {
    const { servicio, oportunidades } = armar();
    oportunidades.ficha.mockResolvedValue({ id: 4633, estado: 'postulada' });
    await expect(servicio.proponer(USUARIO, 4633, [])).rejects.toThrow(
      'Ya la postulaste',
    );
    await expect(servicio.confirmar(USUARIO, 4633, [])).rejects.toThrow(
      'Ya la postulaste',
    );
  });

  it('lo que elige la IA queda revisado en el trabajo, con su costo', async () => {
    const { servicio, repo } = armar();
    servicio.parse.mockResolvedValue({
      parsed_output: {
        pide: 6,
        periodo: 'los últimos 4 años',
        condiciones: 'Contratos similares, con orden de compra o factura.',
        elegidas: [
          { clave: 'mp:4366-146-SE23', por_que: 'Arriendo y alimentación' },
          { clave: 'ev:118', por_que: 'Paseo con almuerzo para 300' },
          { clave: 'ev:52', por_que: 'Fepasa: no está en la lista' },
        ],
        faltan: [{ clave: 'ev:140', por_que: 'Paseo de la Armada' }],
        nota: 'Faltan 4 para el puntaje máximo.',
      },
      usage: { input_tokens: 3000, output_tokens: 500 },
      stop_reason: 'end_turn',
    });
    await servicio.ejecutar(1, 30, BASES, []);
    const [[pedido]] = servicio.parse.mock.calls as [
      [
        {
          model: string;
          messages: Array<{ content: Array<{ text: string }> }>;
        },
      ],
    ];
    expect(pedido.model).toBe(MODELO_DE_LA_EXPERIENCIA);
    const texto = pedido.messages[0].content[0].text;
    expect(texto).toContain('LO QUE PIDEN LAS BASES DE LA EXPERIENCIA');
    expect(texto).toContain('[mp:4366-146-SE23]');
    expect(texto).not.toContain('Ferrocarril');
    expect(texto).not.toContain('Rudel');
    const [, id, fin] = repo.terminar.mock.calls[0] as [
      number,
      number,
      {
        estado: string;
        resultado: { elegidas: Array<{ clave: string }>; faltan: unknown[] };
      },
    ];
    expect(id).toBe(30);
    expect(fin.estado).toBe('listo');
    expect(fin.resultado.elegidas.map((c) => c.clave)).toEqual([
      'mp:4366-146-SE23',
      'ev:118',
    ]);
    expect(fin.resultado.faltan).toHaveLength(1);
  });

  it('sin nada que mostrar no gasta en la IA; si la IA falla, queda el error', async () => {
    const { servicio, repo, oferente, eventia } = armar();
    oferente.respaldos.mockResolvedValue([]);
    eventia.eventosParaLaExperiencia.mockResolvedValue([]);
    await servicio.ejecutar(1, 30, BASES, []);
    expect(servicio.parse).not.toHaveBeenCalled();
    expect(repo.terminar).toHaveBeenCalledWith(
      1,
      30,
      expect.objectContaining({
        estado: 'listo',
        resultado: expect.objectContaining({ elegidas: [] }),
      }),
    );

    const otro = armar();
    otro.servicio.parse.mockRejectedValue(new Error('se cortó'));
    await otro.servicio.ejecutar(1, 31, BASES, []);
    expect(otro.repo.terminar).toHaveBeenCalledWith(
      1,
      31,
      expect.objectContaining({ estado: 'error' }),
    );
  });

  it('confirmar: van las elegidas sin las que se sacan, y desde ahí se puede armar', async () => {
    const { servicio, repo } = armar();
    await expect(servicio.confirmar(USUARIO, 4633, [])).rejects.toThrow(
      'Primero pide la propuesta',
    );
    const elegida = (clave: string, numero: string) => ({
      clave,
      de: 'mi_empresa',
      con_respaldo: true,
      numero,
      mandante: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
      contrato: 'Evento',
      anio: 2023,
      monto: 1_000_000,
      fuente: 'mercado_publico',
      archivo: `OC ${numero}.pdf`,
    });
    const trabajo = {
      id: 30,
      estado: 'listo',
      resultado: {
        pide: 6,
        periodo: '',
        condiciones: '',
        elegidas: [elegida('mp:1', '1'), elegida('mp:2', '2')],
        faltan: [],
        nota: '',
      },
    };
    repo.ultimoDeTipo.mockResolvedValue(trabajo);
    await servicio.confirmar(USUARIO, 4633, ['mp:2']);
    const [, id, fin] = repo.terminar.mock.calls[0] as [
      number,
      number,
      {
        resultado: {
          elegidas: Array<{ clave: string }>;
          confirmada: boolean;
          quitadas: string[];
        };
      },
    ];
    expect(id).toBe(30);
    expect(fin.resultado.elegidas.map((c) => c.clave)).toEqual(['mp:1']);
    expect(fin.resultado.confirmada).toBe(true);
    expect(fin.resultado.quitadas).toEqual(['mp:2']);

    repo.ultimoDeTipo.mockResolvedValue({
      ...trabajo,
      resultado: { ...fin.resultado },
    });
    const confirmada = await servicio.confirmada(1, 4633);
    expect(confirmada?.filas.map((f) => f.clave)).toEqual(['mp:1']);
  });

  describe('al armar, sin confirmar a mano (decisión 86)', () => {
    const elegida = {
      clave: 'mp:1',
      de: 'mi_empresa',
      con_respaldo: true,
      numero: '1',
      mandante: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
      contrato: 'Evento',
      anio: 2023,
      monto: 1_000_000,
      fuente: 'mercado_publico',
      archivo: 'OC 1.pdf',
    };
    const propuesta = (extra: Record<string, unknown> = {}) => ({
      id: 30,
      estado: 'listo',
      resultado: {
        pide: 6,
        periodo: '',
        condiciones: '',
        elegidas: [elegida],
        faltan: [],
        nota: '',
        ...extra,
      },
    });
    /** El trabajo vive en el repo: confirmar lo reescribe. */
    const conTrabajo = (
      repo: ReturnType<typeof armar>['repo'],
      inicial: Record<string, unknown> | null,
    ) => {
      let trabajo = inicial;
      repo.ultimoDeTipo.mockImplementation(() => Promise.resolve(trabajo));
      repo.terminar.mockImplementation(
        (_empresa: number, _id: number, fin: Record<string, unknown>) => {
          trabajo = { ...trabajo, ...fin };
          return Promise.resolve(undefined);
        },
      );
      return (nuevo: Record<string, unknown>) => {
        trabajo = nuevo;
      };
    };

    it('la ya confirmada va tal cual, sin pedir ni confirmar nada', async () => {
      const { servicio, repo } = armar();
      conTrabajo(repo, propuesta({ confirmada: true }));
      const r = await servicio.paraArmar(USUARIO, 4633);
      expect(r?.filas.map((f) => f.clave)).toEqual(['mp:1']);
      expect(repo.crearGeneracion).not.toHaveBeenCalled();
      expect(repo.terminar).not.toHaveBeenCalled();
    });

    it('la propuesta lista sin confirmar se confirma sola, marcada automática', async () => {
      const { servicio, repo } = armar();
      conTrabajo(repo, propuesta());
      const r = await servicio.paraArmar(USUARIO, 4633);
      expect(r?.filas.map((f) => f.clave)).toEqual(['mp:1']);
      const [, , fin] = repo.terminar.mock.calls[0] as [
        number,
        number,
        { resultado: { confirmada: boolean; automatica: boolean } },
      ];
      expect(fin.resultado).toMatchObject({
        confirmada: true,
        automatica: true,
      });
      expect(repo.crearGeneracion).not.toHaveBeenCalled();
    });

    it('sin propuesta, la pide y la confirma; si la IA falla, se arma sin experiencia', async () => {
      const { servicio, repo } = armar();
      const poner = conTrabajo(repo, null);
      const pedir = jest.spyOn(servicio, 'proponer').mockImplementation(() => {
        poner(propuesta());
        return Promise.resolve(propuesta() as never);
      });
      const r = await servicio.paraArmar(USUARIO, 4633);
      expect(pedir).toHaveBeenCalledWith(USUARIO, 4633, []);
      expect(r?.filas.map((f) => f.clave)).toEqual(['mp:1']);

      const otro = armar();
      const ponerOtro = conTrabajo(otro.repo, null);
      jest.spyOn(otro.servicio, 'proponer').mockImplementation(() => {
        ponerOtro({ id: 31, estado: 'error', resultado: null });
        return Promise.resolve({ id: 31 } as never);
      });
      await expect(otro.servicio.paraArmar(USUARIO, 4633)).resolves.toBeNull();
    });
  });
});
