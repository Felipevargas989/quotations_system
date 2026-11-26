import { BadRequestException } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { CODIGO_NO_DISPONIBLE } from 'src/instalacion/no-disponible';
import type { SupabaseService } from 'src/supabase/supabase.service';
import { mockPinoLogger } from 'src/testing/mocks';
import { EventiaRepository } from '../eventia/eventia.repository';
import { OportunidadesRepository } from '../oportunidades.repository';
import { AceptarLaGanadaService } from '../postulacion/aceptar-la-ganada.service';
import { CotizacionDeLaPostulacionService } from '../postulacion/cotizacion-de-la-postulacion.service';
import type { PostulacionRepository } from '../postulacion/postulacion.repository';

// OPORTUNIDADES EN UNA INSTALACIÓN SIN COTIZADOR (paso 2 de Licita, 25-11).
// Lo que depende del cotizador no se cae: a la persona se le dice «no
// disponible en esta instalación»; lo que llama el motor por detrás se
// salta; y el radar, «¿Puedo cumplir?» y la experiencia leen sin catálogo,
// sin eventos y sin Post-venta. En Eventia, todo como siempre.

const antes = process.env.INSTALACION;
afterEach(() => {
  if (antes === undefined) delete process.env.INSTALACION;
  else process.env.INSTALACION = antes;
});

/** Una base que no se puede tocar: si alguien la usa, la prueba falla. */
const baseIntocable = () => {
  const tocada = jest.fn(() => {
    throw new Error('no debía ir a la base');
  });
  const supabase = {
    get client() {
      return tocada();
    },
  } as unknown as SupabaseService;
  return { supabase, tocada };
};

const logger = () => mockPinoLogger() as unknown as PinoLogger;

const elError = async (promesa: Promise<unknown>): Promise<unknown> => {
  try {
    await promesa;
  } catch (e: unknown) {
    return e;
  }
  throw new Error('debía lanzar');
};

describe('la cotización de la postulación, en Licita', () => {
  // Sin dependencias: si pasara la puerta, se caería por otro lado.
  const servicio = Object.create(
    CotizacionDeLaPostulacionService.prototype,
  ) as CotizacionDeLaPostulacionService;
  const user = { company_id: 7, id: 'u' } as never;

  it.each([
    ['estado', () => servicio.estado(7, 1)],
    ['llevar (crear o reescribir)', () => servicio.llevar(user, 1, 1000)],
    ['vincular', () => servicio.vincular(user, 1, 123)],
    ['la de lo postulado', () => servicio.deLoPostulado(7, 1)],
  ])('%s dice «no disponible en esta instalación»', async (_, llamar) => {
    process.env.INSTALACION = 'licita';
    const error = await elError(llamar());
    expect(error).toBeInstanceOf(BadRequestException);
    const r = (error as BadRequestException).getResponse() as {
      codigo: string;
      message: string;
    };
    expect(r.codigo).toBe(CODIGO_NO_DISPONIBLE);
    expect(r.message).toMatch(/no está disponible en esta instalación/);
  });

  it('en Eventia pasa la puerta (y sigue a lo de siempre)', async () => {
    delete process.env.INSTALACION;
    // Sin dependencias se cae más adelante, pero no por la instalación.
    const error = await elError(servicio.estado(7, 1));
    expect(error).not.toBeInstanceOf(BadRequestException);
  });
});

describe('cotizar la ganada, en Licita', () => {
  it('se salta sin tocar la cotización (lo llama el resultado que llega solo)', async () => {
    process.env.INSTALACION = 'licita';
    const repo = { cotizacion: jest.fn() };
    const servicio = new AceptarLaGanadaService(
      repo as unknown as PostulacionRepository,
      {} as never,
      {} as never,
      logger(),
    );
    await expect(servicio.aceptar(7, 'q-1', '1234-5-LE26')).resolves.toBeNull();
    expect(repo.cotizacion).not.toHaveBeenCalled();
  });

  it('en Eventia la busca, como siempre', async () => {
    delete process.env.INSTALACION;
    const repo = { cotizacion: jest.fn().mockResolvedValue(null) };
    const servicio = new AceptarLaGanadaService(
      repo as unknown as PostulacionRepository,
      {} as never,
      {} as never,
      logger(),
    );
    await servicio.aceptar(7, 'q-1', '1234-5-LE26');
    expect(repo.cotizacion).toHaveBeenCalled();
  });
});

describe('lo que Oportunidades lee de Eventia, en Licita', () => {
  it('la carta, los eventos, la agenda y los respaldos vuelven vacíos sin ir a la base', async () => {
    process.env.INSTALACION = 'licita';
    const { supabase, tocada } = baseIntocable();
    const repo = new EventiaRepository(supabase, logger());
    await expect(repo.carta(7)).resolves.toEqual({
      fijos: [],
      menus: [],
      paquetes: [],
    });
    await expect(repo.eventosRealizados(7, '2020-01-01')).resolves.toEqual([]);
    await expect(
      repo.eventosParaLaExperiencia(7, '2020-01-01'),
    ).resolves.toEqual([]);
    await expect(
      repo.documentosDeExperiencia(7, '2026-12-01'),
    ).resolves.toEqual([]);
    await expect(repo.agendaDelDia(7, '2026-12-01')).resolves.toEqual([]);
    await expect(
      repo.descargarDocumento(7, 'c7/event-documents/x.pdf'),
    ).rejects.toThrow('Post-venta');
    expect(tocada).not.toHaveBeenCalled();
  });

  it('el radar lee sin catálogo', async () => {
    process.env.INSTALACION = 'licita';
    const { supabase, tocada } = baseIntocable();
    const repo = new OportunidadesRepository(supabase, logger());
    await expect(repo.catalogoResumido(7)).resolves.toEqual({
      paquetes: [],
      fijos: [],
    });
    expect(tocada).not.toHaveBeenCalled();
  });

  it('en Eventia sí va a la base', async () => {
    delete process.env.INSTALACION;
    const { supabase, tocada } = baseIntocable();
    const repo = new OportunidadesRepository(supabase, logger());
    await expect(repo.catalogoResumido(7)).rejects.toThrow(
      'no debía ir a la base',
    );
    expect(tocada).toHaveBeenCalled();
  });
});
