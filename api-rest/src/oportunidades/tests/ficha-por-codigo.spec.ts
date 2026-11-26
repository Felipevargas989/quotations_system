import { NotFoundException, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import type { PinoLogger } from 'nestjs-pino';
import type { SupabaseService } from 'src/supabase/supabase.service';
import { mockPinoLogger } from 'src/testing/mocks';
import type { FichaRepository } from '../ficha/ficha.repository';
import type { MercadoPublicoClient } from '../mercado-publico/mercado-publico.client';
import { OportunidadesController } from '../oportunidades.controller';
import { OportunidadesRepository } from '../oportunidades.repository';
import { OportunidadesService } from '../oportunidades.service';

/**
 * LA FICHA POR CÓDIGO (Licita, 25-11-2026): `GET oportunidades/codigo/:codigo`
 * entrega lo mismo que `GET oportunidades/:id`, siempre de la empresa de la
 * sesión, o 404. Vale en las dos instalaciones.
 */

type Consulta = { tabla: string; pasos: unknown[][] };

/** Una base falsa con dos empresas que tienen la misma licitación. */
function baseFalsa() {
  const filas = [
    { id: 9, company_id: 1, codigo: '2656-97-LE26' },
    { id: 40, company_id: 2, codigo: '2656-97-LE26' },
  ];
  const consultas: Consulta[] = [];
  const from = jest.fn((tabla: string) => {
    const consulta: Consulta = { tabla, pasos: [] };
    consultas.push(consulta);
    const filtros: Record<string, unknown> = {};
    const cadena: Record<string, unknown> = {
      select: (...a: unknown[]) => {
        consulta.pasos.push(['select', ...a]);
        return cadena;
      },
      eq: (col: string, valor: unknown) => {
        consulta.pasos.push(['eq', col, valor]);
        filtros[col] = valor;
        return cadena;
      },
      maybeSingle: () => {
        const fila = filas.find((f) =>
          Object.entries(filtros).every(
            ([c, v]) => (f as Record<string, unknown>)[c] === v,
          ),
        );
        const data = fila
          ? {
              id: fila.id,
              codigo: fila.codigo,
              proceso: {
                tipo: 'licitacion',
                nombre: 'Día del profesor',
                descripcion: 'Ya tiene descripción',
                organismo_codigo: null,
                fecha_publicacion: null,
              },
            }
          : null;
        return Promise.resolve({ data, error: null });
      },
    };
    return cadena;
  });
  const repo = new OportunidadesRepository(
    { client: { from } } as unknown as SupabaseService,
    mockPinoLogger() as unknown as PinoLogger,
  );
  return { repo, consultas };
}

function armar() {
  const { repo, consultas } = baseFalsa();
  jest.spyOn(repo, 'cambiosDe').mockResolvedValue([]);
  const fichas = {
    diasDeHistoriaPendientes: jest.fn().mockResolvedValue(0),
  };
  const servicio = new OportunidadesService(
    repo,
    {} as unknown as MercadoPublicoClient,
    mockPinoLogger() as unknown as PinoLogger,
    fichas as unknown as FichaRepository,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
  );
  return { repo, servicio, consultas };
}

describe('La ficha por código (Licita, 25-11-2026)', () => {
  it('la encuentra: lo mismo que la ficha por id, de la empresa de la sesión', async () => {
    const { servicio, consultas } = armar();

    const porCodigo = await servicio.fichaPorCodigo(1, ' 2656-97-LE26 ');
    const porId = await servicio.ficha(1, 9);

    expect(porCodigo).toEqual(porId);
    expect(porCodigo).toMatchObject({ id: 9, codigo: '2656-97-LE26' });
    expect(consultas[0].tabla).toBe('oportunidades');
    expect(consultas[0].pasos).toEqual(
      expect.arrayContaining([
        ['eq', 'company_id', 1],
        ['eq', 'codigo', '2656-97-LE26'],
      ]),
    );
  });

  it('no la encuentra: 404, como la ficha por id; vacío ni pregunta', async () => {
    const { servicio, consultas } = armar();

    await expect(servicio.fichaPorCodigo(1, '1-1-LE99')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    const antes = consultas.length;
    await expect(servicio.fichaPorCodigo(1, '   ')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(consultas).toHaveLength(antes);
  });

  it('no entrega la de otra empresa: cada una ve la suya, y la empresa 3 nada', async () => {
    const { servicio } = armar();

    await expect(
      servicio.fichaPorCodigo(2, '2656-97-LE26'),
    ).resolves.toMatchObject({ id: 40 });
    await expect(
      servicio.fichaPorCodigo(3, '2656-97-LE26'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('el controlador pasa la empresa de la sesión, nunca otra', async () => {
    const servicio = { fichaPorCodigo: jest.fn().mockResolvedValue({}) };
    const controlador = Object.create(
      OportunidadesController.prototype,
    ) as OportunidadesController;
    Object.assign(controlador, { servicio });

    await controlador.fichaPorCodigo('2656-97-LE26', {
      company_id: 7,
    } as never);

    expect(servicio.fichaPorCodigo).toHaveBeenCalledWith(7, '2656-97-LE26');
  });

  it('la ruta es GET codigo/:codigo y queda antes de las de :id (no la captura :id)', () => {
    const proto = OportunidadesController.prototype as unknown as Record<
      string,
      object
    >;
    const h = proto.fichaPorCodigo;
    expect(Reflect.getMetadata(PATH_METADATA, h)).toBe('codigo/:codigo');
    expect(Reflect.getMetadata(METHOD_METADATA, h)).toBe(RequestMethod.GET);

    const nombres = Object.getOwnPropertyNames(proto);
    const primeraConId = nombres.findIndex((n) => {
      const ruta = Reflect.getMetadata(PATH_METADATA, proto[n] ?? {}) as
        | string
        | undefined;
      return typeof ruta === 'string' && ruta.startsWith(':id');
    });
    expect(primeraConId).toBeGreaterThan(-1);
    expect(nombres.indexOf('fichaPorCodigo')).toBeLessThan(primeraConId);
  });
});
