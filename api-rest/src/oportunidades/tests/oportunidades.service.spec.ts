import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { OportunidadesRepository } from '../oportunidades.repository';
import { OportunidadesService } from '../oportunidades.service';

const fila = (id: number, fecha_cierre: string | null) => ({
  id,
  codigo: `C-${id}`,
  proceso: { fecha_cierre },
});

function armar() {
  const repo = {
    listar: jest.fn().mockResolvedValue([]),
    ficha: jest.fn().mockResolvedValue(null),
    cambiosDe: jest.fn().mockResolvedValue([]),
    actualizar: jest.fn().mockResolvedValue({ id: 9, estado: 'en_estudio' }),
    esUsuarioDeLaEmpresa: jest.fn().mockResolvedValue(true),
    configDe: jest.fn().mockResolvedValue(null),
    datosDeEmpresa: jest.fn().mockResolvedValue(null),
    guardarConfig: jest.fn().mockResolvedValue(undefined),
  };
  const servicio = new OportunidadesService(
    repo as unknown as OportunidadesRepository,
  );
  return { repo, servicio };
}

describe('OportunidadesService — la bandeja', () => {
  it('por omisión, solo lo vigente; de lo que cierra antes a lo que cierra después', async () => {
    const { repo, servicio } = armar();
    repo.listar.mockResolvedValue([
      fila(1, null),
      fila(2, '2026-11-20T18:00:00+00:00'),
      fila(3, '2026-10-19T19:00:00+00:00'),
    ]);

    const lista = await servicio.listar(1, {});

    expect(repo.listar).toHaveBeenCalledWith(1, {
      vigentes: true,
      semaforo: undefined,
      estado: undefined,
      tipo: undefined,
      limite: 3000,
    });
    expect(lista.map((f) => f.id)).toEqual([3, 2, 1]);
  });

  it('el historial se pide con vigentes: false', async () => {
    const { repo, servicio } = armar();
    await servicio.listar(1, { vigentes: false, estado: 'descartada' });
    expect(repo.listar).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ vigentes: false, estado: 'descartada' }),
    );
  });
});

describe('OportunidadesService — la ficha y decidir', () => {
  it('una ficha que no es de la empresa es 404', async () => {
    const { servicio } = armar();
    await expect(servicio.ficha(1, 9)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('la ficha trae el historial de cambios del proceso', async () => {
    const { repo, servicio } = armar();
    repo.ficha.mockResolvedValue({ id: 9, codigo: '4364-13-LE26' });
    repo.cambiosDe.mockResolvedValue([{ id: 1, tipo: 'fecha_cierre' }]);
    await expect(servicio.ficha(1, 9)).resolves.toMatchObject({
      id: 9,
      cambios: [{ id: 1, tipo: 'fecha_cierre' }],
    });
    expect(repo.cambiosDe).toHaveBeenCalledWith('4364-13-LE26');
  });

  it('el responsable tiene que ser de la empresa', async () => {
    const { repo, servicio } = armar();
    repo.esUsuarioDeLaEmpresa.mockResolvedValue(false);
    await expect(
      servicio.actualizar(1, 9, {
        responsable_id: 'b3c1e0f2-0000-4000-8000-000000000000',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.actualizar).not.toHaveBeenCalled();
  });

  it('las notas se guardan sin espacios de más; vacías quedan en nada', async () => {
    const { repo, servicio } = armar();
    await servicio.actualizar(1, 9, { notas: '  llamar el lunes  ' });
    expect(repo.actualizar).toHaveBeenLastCalledWith(1, 9, {
      notas: 'llamar el lunes',
    });
    await servicio.actualizar(1, 9, { notas: '   ' });
    expect(repo.actualizar).toHaveBeenLastCalledWith(1, 9, { notas: null });
  });

  it('sin nada que cambiar es 400, y si no era de la empresa es 404', async () => {
    const { repo, servicio } = armar();
    await expect(servicio.actualizar(1, 9, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    repo.actualizar.mockResolvedValue(null);
    await expect(
      servicio.actualizar(1, 9, { estado: 'descartada' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('OportunidadesService — la configuración', () => {
  it('trae lo de Configuración de empresa a la vista', async () => {
    const { repo, servicio } = armar();
    repo.configDe.mockResolvedValue({
      regiones: ['Ñuble'],
      comunas_cercanas: ['Quillón'],
      perfil: 'Complejo en Quillón',
    });
    repo.datosDeEmpresa.mockResolvedValue({
      high_value_threshold: 3_000_000,
      notifications: { replyTo: 'contacto@valledelsolquillon.cl' },
    });
    await expect(servicio.config(1)).resolves.toEqual({
      regiones: ['Ñuble'],
      comunas_cercanas: ['Quillón'],
      perfil: 'Complejo en Quillón',
      umbral_alto_valor: 3_000_000,
      correo_avisos: 'contacto@valledelsolquillon.cl',
    });
  });

  it('sin configuración todavía, viene vacía (no rompe)', async () => {
    const { servicio } = armar();
    await expect(servicio.config(52)).resolves.toEqual({
      regiones: [],
      comunas_cercanas: [],
      perfil: '',
      umbral_alto_valor: null,
      correo_avisos: null,
    });
  });

  it('al guardar limpia las listas: sin vacías ni repetidas (sin mirar tildes)', async () => {
    const { repo, servicio } = armar();
    await servicio.guardarConfig(1, {
      regiones: [' Ñuble ', 'Biobío', 'biobio', ''],
      comunas_cercanas: ['Quillón', 'Quillon', '  San   Ignacio '],
      perfil: '   ',
    });
    expect(repo.guardarConfig).toHaveBeenCalledWith(1, {
      regiones: ['Ñuble', 'Biobío'],
      comunas_cercanas: ['Quillón', 'San Ignacio'],
      perfil: null,
    });
  });

  it('guardar sin nada es 400', async () => {
    const { servicio } = armar();
    await expect(servicio.guardarConfig(1, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
