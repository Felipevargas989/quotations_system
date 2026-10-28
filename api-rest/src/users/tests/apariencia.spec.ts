import { BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { mockPinoLogger } from '../../testing/mocks';
import { UpdateAparienciaDto } from '../dto/update-apariencia.dto';
import { UsersService } from '../users.service';

/**
 * EL PERSONAJE Y EL COLOR DE CADA UNO (migración 167, 27-10-2026).
 * Cualquier cargo ve los de su empresa y cambia SOLO los suyos: la
 * persona y la empresa salen de la sesión, nunca del body.
 */
const armar = (
  editado: Record<string, unknown> | null = { user_id: 'a-1' },
) => {
  const repo = {
    aparienciasDeEmpresa: jest.fn().mockResolvedValue([
      {
        user_id: 'a-1',
        full_name: 'Felipe',
        personaje: 'zorro',
        color: '#059669',
      },
    ]),
    updateApariencia: jest
      .fn()
      .mockResolvedValue({ data: editado, error: null }),
  };
  // Orden real del constructor: repositorio, logger, super-admin.
  const service = new UsersService(
    repo as never,
    mockPinoLogger() as never,
    {} as never,
  );
  return { service, repo };
};

const errores = async (body: Record<string, unknown>) =>
  (await validate(plainToInstance(UpdateAparienciaDto, body))).map(
    (e) => e.property,
  );

describe('El personaje y el color de cada uno', () => {
  it('la lista sale de la empresa de la sesión', async () => {
    const { service, repo } = armar();
    const r = await service.apariencias(1);
    expect(repo.aparienciasDeEmpresa).toHaveBeenCalledWith(1);
    expect(r).toEqual([
      {
        user_id: 'a-1',
        full_name: 'Felipe',
        personaje: 'zorro',
        color: '#059669',
      },
    ]);
  });

  it('el cambio va con la persona y la empresa de la sesión', async () => {
    const { service, repo } = armar();
    await service.updateApariencia('a-1', 1, {
      personaje: 'zorro',
      color: '#059669',
    });
    expect(repo.updateApariencia).toHaveBeenCalledWith('a-1', 1, {
      personaje: 'zorro',
      color: '#059669',
    });
  });

  it('lo que no viene no se toca, y null lo quita', async () => {
    const { service, repo } = armar();
    await service.updateApariencia('a-1', 1, { personaje: null });
    expect(repo.updateApariencia).toHaveBeenCalledWith('a-1', 1, {
      personaje: null,
    });
  });

  it('sin nada que cambiar es 400 y no toca la base', async () => {
    const { service, repo } = armar();
    await expect(service.updateApariencia('a-1', 1, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repo.updateApariencia).not.toHaveBeenCalled();
  });

  it('si no hay perfil de esa persona en esa empresa es 404', async () => {
    const { service } = armar(null);
    await expect(
      service.updateApariencia('a-9', 1, { color: '#059669' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('acepta una clave y un #rrggbb, y null para quitarlos', async () => {
    expect(await errores({ personaje: 'zorro', color: '#059669' })).toEqual([]);
    expect(await errores({ personaje: null, color: null })).toEqual([]);
  });

  it('rechaza lo que la base tampoco guardaría', async () => {
    expect(await errores({ personaje: 'Zorro feliz' })).toEqual(['personaje']);
    expect(await errores({ personaje: 'x'.repeat(41) })).toEqual(['personaje']);
    expect(await errores({ color: 'verde' })).toEqual(['color']);
    expect(await errores({ color: '#05966' })).toEqual(['color']);
    expect(await errores({ color: '#05966A' })).toEqual(['color']);
  });
});
