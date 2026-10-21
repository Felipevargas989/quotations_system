import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger } from 'src/testing/mocks';
import type { FichaRepository } from '../ficha/ficha.repository';
import type { SeVieneService } from '../historia/se-viene.service';
import type { MercadoPublicoClient } from '../mercado-publico/mercado-publico.client';
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
    itemDeCompraAgil: jest.fn().mockResolvedValue(null),
    guardarProcesos: jest.fn().mockResolvedValue(undefined),
  };
  const fichas = {
    diasDeHistoriaPendientes: jest.fn().mockResolvedValue(900),
    responsableDe: jest.fn().mockResolvedValue(null),
    perfilDe: jest.fn().mockResolvedValue('perfil-felipe'),
  };
  const mp = { detalleCompraAgil: jest.fn().mockResolvedValue(null) };
  // El semáforo de «Se viene» (decisión 62) tiene sus propias pruebas
  // (se-viene.spec.ts): aquí deja pasar las series tal cual.
  const seViene = {
    conSemaforo: jest.fn((_empresa: number, series: unknown[]) =>
      Promise.resolve(series),
    ),
  };
  const servicio = new OportunidadesService(
    repo as unknown as OportunidadesRepository,
    mp as unknown as MercadoPublicoClient,
    mockPinoLogger() as unknown as PinoLogger,
    fichas as unknown as FichaRepository,
    seViene as unknown as SeVieneService,
  );
  return { repo, mp, fichas, seViene, servicio };
}

describe('OportunidadesService — el detalle de una compra ágil se pide al abrirla (decisión 20)', () => {
  const compra = (cambios: Record<string, unknown> = {}) => ({
    id: 70,
    codigo: '1234-56-COT26',
    proceso: {
      tipo: 'compra_agil',
      nombre: 'Almuerzo de camaradería',
      descripcion: null,
      productos: [],
      organismo_codigo: null,
      fecha_publicacion: null,
      fecha_cierre: '2026-10-20T15:00:00+00:00',
      ...cambios,
    },
  });
  const ITEM = {
    codigo: '1234-56-COT26',
    nombre: 'Almuerzo de camaradería',
    institucion: { nombre_region: 'Región del Ñuble' },
  };
  const esperar = () => new Promise((listo) => setImmediate(listo));

  it('sin detalle: la ficha sale al tiro con "trayendo" y el detalle se guarda por detrás', async () => {
    const { repo, mp, servicio } = armar();
    repo.ficha.mockResolvedValue(compra());
    repo.itemDeCompraAgil.mockResolvedValue(ITEM);
    mp.detalleCompraAgil.mockResolvedValue({
      descripcion: 'Almuerzo para 80 funcionarios',
      productos_solicitados: [{ nombre: 'Almuerzo', descripcion: '80' }],
    });

    const ficha = await servicio.ficha(1, 70);

    expect(ficha.detalle_mp).toBe('trayendo');
    await esperar();
    expect(mp.detalleCompraAgil).toHaveBeenCalledWith('1234-56-COT26');
    const [[guardados]] = repo.guardarProcesos.mock.calls as [
      [Array<Record<string, unknown>>],
    ];
    expect(guardados[0]).toMatchObject({
      codigo: '1234-56-COT26',
      descripcion: 'Almuerzo para 80 funcionarios',
    });
  });

  it('si Mercado Público no lo entrega, queda "no disponible" y no se vuelve a pedir al tiro', async () => {
    const { repo, mp, servicio } = armar();
    repo.ficha.mockResolvedValue(compra());
    repo.itemDeCompraAgil.mockResolvedValue(ITEM);
    mp.detalleCompraAgil.mockRejectedValue(new Error('504'));

    await servicio.ficha(1, 70);
    await esperar();
    const otraVez = await servicio.ficha(1, 70);

    expect(otraVez.detalle_mp).toBe('no_disponible');
    expect(mp.detalleCompraAgil).toHaveBeenCalledTimes(1);
    expect(repo.guardarProcesos).not.toHaveBeenCalled();
  });

  it('con detalle, o si es una licitación, no se pide nada', async () => {
    const { repo, mp, servicio } = armar();
    repo.ficha.mockResolvedValue(
      compra({ descripcion: 'Ya tiene descripción' }),
    );
    expect((await servicio.ficha(1, 70)).detalle_mp).toBeNull();
    repo.ficha.mockResolvedValue(compra({ tipo: 'licitacion' }));
    expect((await servicio.ficha(1, 70)).detalle_mp).toBeNull();
    await esperar();
    expect(mp.detalleCompraAgil).not.toHaveBeenCalled();
  });
});

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
      historia_pendiente: 900,
    });
    expect(repo.cambiosDe).toHaveBeenCalledWith('4364-13-LE26');
  });

  it('«Me interesa» sin responsable: queda quien la marcó, con su perfil (decisión 21)', async () => {
    const { repo, fichas, servicio } = armar();
    await servicio.actualizar(1, 9, { estado: 'en_estudio' }, 'sesion-felipe');
    expect(fichas.perfilDe).toHaveBeenCalledWith(1, 'sesion-felipe');
    expect(repo.actualizar).toHaveBeenLastCalledWith(1, 9, {
      estado: 'en_estudio',
      responsable_id: 'perfil-felipe',
    });
  });

  it('«Me interesa» con responsable, o eligiéndolo, no lo cambia', async () => {
    const { repo, fichas, servicio } = armar();
    fichas.responsableDe.mockResolvedValue('perfil-camila');
    await servicio.actualizar(1, 9, { estado: 'en_estudio' }, 'sesion-felipe');
    expect(repo.actualizar).toHaveBeenLastCalledWith(1, 9, {
      estado: 'en_estudio',
    });
    await servicio.actualizar(
      1,
      9,
      { estado: 'en_estudio', responsable_id: null },
      'sesion-felipe',
    );
    expect(repo.actualizar).toHaveBeenLastCalledWith(1, 9, {
      estado: 'en_estudio',
      responsable_id: null,
    });
    // Descartar no asigna a nadie.
    fichas.responsableDe.mockResolvedValue(null);
    await servicio.actualizar(1, 9, { estado: 'descartada' }, 'sesion-felipe');
    expect(repo.actualizar).toHaveBeenLastCalledWith(1, 9, {
      estado: 'descartada',
    });
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
    const { repo, seViene, servicio } = armar();
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
    expect(seViene.conSemaforo).toHaveBeenCalledWith(
      1,
      expect.any(Array),
      [expect.objectContaining({ codigo: '5040-25-LE25' })],
      {
        comunasCercanas: ['Quillón'],
        umbralAltoValor: 3_000_000,
        perfil: null,
      },
    );
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
