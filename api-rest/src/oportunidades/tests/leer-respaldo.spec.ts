import type Anthropic from '@anthropic-ai/sdk';
import { BadRequestException } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger } from 'src/testing/mocks';
import { datosDelRespaldoLeido } from '../oferente/leer-respaldo';
import { LeerRespaldoService } from '../oferente/leer-respaldo.service';
import type { OferenteRepository } from '../oferente/oferente.repository';
import type { OferenteService } from '../oferente/oferente.service';

// LEER SOLO UN RESPALDO (decisión 34, 19-10): Haiku lee la orden de compra o
// la factura; si es de Mercado Público, manda su ficha pública. Nada se
// guarda: la empresa revisa y guarda.

class LectorDePrueba extends LeerRespaldoService {
  parse = jest.fn();
  protected cliente(): Anthropic {
    return { messages: { parse: this.parse } } as unknown as Anthropic;
  }
}

const archivo = (nombre: string, contenido = '%PDF-1.7 orden') =>
  ({
    originalname: nombre,
    size: contenido.length,
    buffer: Buffer.from(contenido),
  }) as Express.Multer.File;

const respuesta = (parsed: Record<string, unknown>) => ({
  parsed_output: parsed,
  usage: { input_tokens: 1800, output_tokens: 120 },
});

function armar() {
  const oferente = {
    ordenDeCompra: jest.fn().mockResolvedValue({
      orden: {
        numero: '4352-103-SE23',
        contrato: 'CENA DÍA DEL FUNCIONARIO MUNICIPAL',
        mandante: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
        unidad: null,
        fecha: '2023-11-20',
        anio: 2023,
        monto: 11_782_499,
        estado: 'Recepción Conforme',
        licitacion: '4352-6-LE23',
        rut_proveedor: '77.701.305-K',
      },
      aviso: null,
    }),
  };
  const repo = {
    oferente: jest.fn().mockResolvedValue({
      razon_social: 'VALLE DEL SOL QUILLON SPA',
      rut: '77.701.305-K',
    }),
  };
  const servicio = new LectorDePrueba(
    oferente as unknown as OferenteService,
    repo as unknown as OferenteRepository,
    mockPinoLogger() as unknown as PinoLogger,
  );
  return { oferente, repo, servicio };
}

const antes = process.env.ANTHROPIC_API_KEY;
beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'llave-de-prueba';
});
afterAll(() => {
  if (antes === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = antes;
});

describe('Leer solo un respaldo de experiencia', () => {
  it('lo que devuelve la IA se lee con cuidado; sin número no sirve', () => {
    expect(
      datosDelRespaldoLeido({
        tipo: 'factura',
        numero: ' 1532 ',
        mandante: 'Hospital de Chillán',
        contrato: 'Cena de fin de año',
        fecha: '2024-12-12',
        monto: 4_200_000,
      }),
    ).toEqual({
      tipo: 'factura',
      numero: '1532',
      mandante: 'Hospital de Chillán',
      contrato: 'Cena de fin de año',
      anio: 2024,
      monto: 4_200_000,
      fuente: 'manual',
    });
    expect(datosDelRespaldoLeido({ numero: '', monto: 0 })).toBeNull();
    expect(
      datosDelRespaldoLeido({ numero: '77', fecha: 'sin fecha', monto: 0 }),
    ).toMatchObject({ anio: null, monto: null, tipo: 'otro' });
  });

  it('una orden de Mercado Público: la lee Haiku y manda su ficha pública', async () => {
    const { servicio, oferente } = armar();
    servicio.parse.mockResolvedValue(
      respuesta({
        tipo: 'orden_de_compra',
        numero: '4352-103-se23',
        mandante: 'Municipalidad de Quillón',
        contrato: 'Cena funcionarios',
        fecha: '2023-11-20',
        monto: 11_000_000,
      }),
    );
    const r = await servicio.leer(1, archivo('OC 4352-103-SE23.pdf'));
    expect(oferente.ordenDeCompra).toHaveBeenCalledWith(1, '4352-103-SE23');
    expect(r).toEqual({
      datos: {
        numero: '4352-103-SE23',
        mandante: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
        contrato: 'CENA DÍA DEL FUNCIONARIO MUNICIPAL',
        anio: 2023,
        monto: 11_782_499,
        fuente: 'mercado_publico',
      },
      aviso: null,
    });
    const pedido = (servicio.parse.mock.calls[0] as unknown[])[0] as {
      model: string;
      system: string;
      messages: Array<{ content: Array<{ type: string }> }>;
    };
    expect(pedido.model).toBe('claude-haiku-5-5');
    expect(pedido.system).toContain('VALLE DEL SOL QUILLON SPA');
    expect(pedido.messages[0].content[0].type).toBe('document');
  });

  it('una factura (o una foto) se queda con lo que leyó la IA', async () => {
    const { servicio, oferente } = armar();
    servicio.parse.mockResolvedValue(
      respuesta({
        tipo: 'factura',
        numero: '1532',
        mandante: 'Hospital de Chillán',
        contrato: 'Cena de fin de año',
        fecha: '2024-12-12',
        monto: 4_200_000,
      }),
    );
    const r = await servicio.leer(1, archivo('factura.jpg', 'jpg'));
    expect(oferente.ordenDeCompra).not.toHaveBeenCalled();
    expect(r.datos).toMatchObject({ numero: '1532', fuente: 'manual' });
    const pedido = (servicio.parse.mock.calls[0] as unknown[])[0] as {
      messages: Array<{ content: Array<{ type: string }> }>;
    };
    expect(pedido.messages[0].content[0].type).toBe('image');
  });

  it('si Mercado Público no responde, quedan los datos leídos con un aviso', async () => {
    const { servicio, oferente } = armar();
    oferente.ordenDeCompra.mockRejectedValue(new Error('caído'));
    servicio.parse.mockResolvedValue(
      respuesta({
        tipo: 'orden_de_compra',
        numero: '4352-103-SE23',
        mandante: 'Municipalidad de Quillón',
        contrato: 'Cena',
        fecha: '2023-11-20',
        monto: 11_000_000,
      }),
    );
    const r = await servicio.leer(1, archivo('oc.pdf'));
    expect(r.datos.fuente).toBe('manual');
    expect(r.aviso).toContain('No se pudo confirmar en Mercado Público');
  });

  it('un Word, un archivo vacío o uno sin número: lo dice y no inventa', async () => {
    const { servicio } = armar();
    await expect(
      servicio.leer(1, archivo('orden.docx')),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(servicio.leer(1, undefined)).rejects.toThrow(
      'No llegó ningún archivo.',
    );
    servicio.parse.mockResolvedValue(
      respuesta({
        tipo: 'otro',
        numero: '',
        mandante: '',
        contrato: '',
        fecha: '',
        monto: 0,
      }),
    );
    await expect(servicio.leer(1, archivo('foto.png', 'png'))).rejects.toThrow(
      'complétalo a mano',
    );
  });
});
