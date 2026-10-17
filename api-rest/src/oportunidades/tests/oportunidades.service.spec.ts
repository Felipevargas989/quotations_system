import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { OportunidadesRepository } from '../oportunidades.repository';
import { OportunidadesService } from '../oportunidades.service';

const fila = (id: number, fecha_cierre: string | null) => ({
  id,
  codigo: `C-${id}`,
  proceso: {
    fecha_cierre,
    nombre: `Proceso ${id}`,
    organismo_codigo: null as string | null,
    fecha_publicacion: null as string | null,
  },
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
    historialDeOrganismos: jest.fn().mockResolvedValue([]),
    procesosDeLaZona: jest.fn().mockResolvedValue([]),
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

describe('OportunidadesService — el año anterior', () => {
  const profesor = {
    id: 9,
    codigo: '4364-13-LE26',
    proceso: {
      fecha_cierre: '2026-10-19T19:00:00+00:00',
      nombre: 'Producción de Evento día del Profesor',
      organismo_codigo: '1234',
      fecha_publicacion: '2026-10-09T18:54:00+00:00',
    },
  };
  const profesor2025 = {
    codigo: '4364-5-LE25',
    nombre: 'Producción de evento día del profesor',
    organismo_codigo: '1234',
    fecha_publicacion: '2025-10-03T15:00:00+00:00',
    monto: null,
    adjudicacion: {
      oferentes: 1,
      ganadores: [
        {
          nombre: 'SOL DE QUILLON SPA',
          cantidad: 1,
          monto_unitario: 12_000_000,
        },
      ],
    },
  };

  it('cada fila de la bandeja trae su compra del año anterior', async () => {
    const { repo, servicio } = armar();
    repo.listar.mockResolvedValue([profesor, fila(2, null)]);
    repo.historialDeOrganismos.mockResolvedValue([profesor2025]);

    const lista = await servicio.listar(1, {});

    expect(repo.historialDeOrganismos).toHaveBeenCalledWith(['1234']);
    expect(lista[0].anterior).toMatchObject({
      codigo: '4364-5-LE25',
      anio: 2025,
      ganadores: [{ nombre: 'SOL DE QUILLON SPA', monto: 12_000_000 }],
    });
    expect(lista[1].anterior).toBeNull();
  });

  it('el historial (lo cerrado) no lo busca', async () => {
    const { repo, servicio } = armar();
    repo.listar.mockResolvedValue([profesor]);
    await servicio.listar(1, { vigentes: false });
    expect(repo.historialDeOrganismos).not.toHaveBeenCalled();
  });

  it('la ficha también', async () => {
    const { repo, servicio } = armar();
    repo.ficha.mockResolvedValue(profesor);
    repo.historialDeOrganismos.mockResolvedValue([profesor2025]);
    const ficha = await servicio.ficha(1, 9);
    expect(ficha.anterior?.codigo).toBe('4364-5-LE25');
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
    repo.ficha.mockResolvedValue({
      id: 9,
      codigo: '4364-13-LE26',
      proceso: { nombre: 'x', organismo_codigo: null, fecha_publicacion: null },
    });
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

describe('OportunidadesService — Se viene y competidores', () => {
  // Hace un año menos 20 días: debería volver a salir en 20 días.
  const haceCasiUnAnio = () => {
    const d = new Date();
    d.setUTCFullYear(d.getUTCFullYear() - 1);
    d.setUTCDate(d.getUTCDate() + 20);
    return d.toISOString();
  };
  const campo = () => ({
    codigo: '5040-25-LE25',
    nombre: 'Día de campo del dirigente social',
    organismo: 'I MUNICIPALIDAD DE QUILLON',
    organismo_codigo: '5040',
    unidad: null,
    comuna: 'Quillón',
    region: 'Región del Ñuble',
    fecha_publicacion: haceCasiUnAnio(),
    monto: 17_000_000,
    adjudicacion: {
      oferentes: 1,
      ganadores: [
        {
          nombre: 'PARQUE AVENTURAS ANTU S.A.',
          rut: '76154667-8',
          cantidad: 1,
          monto_unitario: 17_000_000,
        },
      ],
    },
  });

  it('Se viene: lo de las regiones de la empresa, marcando comuna cercana y alto valor', async () => {
    const { repo, servicio } = armar();
    repo.configDe.mockResolvedValue({
      regiones: ['Ñuble'],
      comunas_cercanas: ['Quillón'],
      perfil: null,
    });
    repo.datosDeEmpresa.mockResolvedValue({
      high_value_threshold: 3_000_000,
      notifications: null,
    });
    repo.procesosDeLaZona.mockResolvedValue([campo()]);

    const r = await servicio.calendario(1);

    expect(repo.procesosDeLaZona).toHaveBeenCalledWith(['Ñuble']);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      comuna_cercana: true,
      alto_valor: true,
      atrasada: false,
    });
  });

  it('sin configuración, nada (no rompe)', async () => {
    const { repo, servicio } = armar();
    await expect(servicio.calendario(52)).resolves.toEqual([]);
    expect(repo.procesosDeLaZona).toHaveBeenCalledWith([]);
  });

  it('competidores y la ficha de uno; un RUT raro es 400 y uno sin triunfos 404', async () => {
    const { repo, servicio } = armar();
    repo.configDe.mockResolvedValue({
      regiones: ['Ñuble'],
      comunas_cercanas: [],
      perfil: null,
    });
    repo.procesosDeLaZona.mockResolvedValue([campo()]);

    const ranking = await servicio.competidores(1);
    expect(ranking.map((c) => c.rut)).toEqual(['76154667-8']);

    const ficha = await servicio.competidor(1, '76.154.667-8');
    expect(ficha.triunfos).toBe(1);

    await expect(servicio.competidor(1, 'hola')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(servicio.competidor(1, '11.111.111-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
