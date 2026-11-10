import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { AlcanceDeRecepcion } from 'src/clients/alcance-de-recepcion';
import type { ClientsService } from 'src/clients/clients.service';
import { UserRole } from 'src/users/entities/user.entity';
import type { FilaDeCliente } from '../asistente.repository';
import { herramientasPara } from '../herramientas';
import {
  ErrorDeHerramienta,
  type ContextoDeHerramienta,
} from '../herramientas/comun';
import {
  clientesQueRevisar,
  proponerCambioDeCliente,
  revisarClasificacion,
} from '../herramientas/mal-clasificados';
import { CambioDeCliente } from '../propuestas/cambio-de-cliente';
import type {
  Propuesta,
  PropuestasRepository,
} from '../propuestas/propuestas.repository';
import { armarServicio, camila, cotizacion } from './datos-de-prueba';

// LOS CLIENTES MAL CLASIFICADOS (doc 21 §6). Los casos son los del 04-11-2026:
// "el club de amigas debe ser o un gremio o adulto mayor, el club deportivo es
// un gremio, Fundación INDAE ... es una empresa privada, y los colegios son
// universidades o colegios"; y el Liceo Yungay, que era Patricia Bravo, una
// apoderada cotizando un paseo de curso.

const TIPOS = [
  'Particulares',
  'Club Adulto Mayor',
  'Colegios & Universidades',
  'Empresas',
  'Empresas Publicas',
  'Gremios y Agrupaciones',
  'Iglesias',
  'Tour Operadores',
];
const PARTICULARES: ReadonlySet<string> = new Set(['particulares']);

const cliente = (
  name: string,
  c: Partial<FilaDeCliente> = {},
): FilaDeCliente => ({
  id: 'c1',
  name,
  client_type: 'Particulares',
  email: null,
  phone: null,
  contact_person: null,
  ...c,
});

const revisar = (c: FilaDeCliente, tipos = TIPOS) =>
  revisarClasificacion(c, PARTICULARES, tipos);

describe('revisarClasificacion', () => {
  it('los clubes son gremios; el de adulto mayor, adulto mayor', () => {
    expect(
      revisar(cliente('Club de amigas de las manualidades'))?.sugerencia,
    ).toEqual({ tipo: 'Gremios y Agrupaciones' });
    expect(revisar(cliente('Club Deportivo Quillón'))?.sugerencia).toEqual({
      tipo: 'Gremios y Agrupaciones',
    });
    expect(
      revisar(cliente('Club Adulto Mayor Los Lotinos'))?.sugerencia,
    ).toEqual({ tipo: 'Club Adulto Mayor' });
  });

  it('una fundación es una empresa (privada, no pública)', () => {
    const a = revisar(cliente('Fundación INDAE'));
    expect(a?.sugerencia).toEqual({ tipo: 'Empresas' });
    expect(a?.motivo).toMatch(/Particulares.*una empresa/);
    expect(revisar(cliente('Transportes Pérez S.A.'))?.sugerencia).toEqual({
      tipo: 'Empresas',
    });
    expect(revisar(cliente('Municipalidad de Quillón'))?.sugerencia).toEqual({
      tipo: 'Empresas Publicas',
    });
  });

  it('un colegio, a colegios; con correo personal y contacto, el apoderado es el cliente', () => {
    expect(
      revisar(cliente('Colegio Santa María', { email: 'contacto@csm.cl' }))
        ?.sugerencia,
    ).toEqual({ tipo: 'Colegios & Universidades' });
    const apoderado = revisar(
      cliente('Liceo Yungay', {
        email: 'patricia.bravo@gmail.com',
        contact_person: 'Patricia Bravo',
      }),
    );
    expect(apoderado?.sugerencia).toEqual({ nombre: 'Patricia Bravo' });
    expect(apoderado?.o_bien).toEqual({ tipo: 'Colegios & Universidades' });
    expect(apoderado?.motivo).toMatch(/apoderado/);
  });

  it('una persona, nada; y los demás tipos no se revisan', () => {
    expect(revisar(cliente('Marcia Padilla'))).toBeNull();
    expect(
      revisar(
        cliente('Club Adulto Mayor', { client_type: 'Club Adulto Mayor' }),
      ),
    ).toBeNull();
    expect(
      revisar(cliente('Liceo Yungay', { client_type: 'Empresas' })),
    ).toBeNull();
  });

  it('sin un tipo que calce en la empresa, avisa igual, sin sugerencia', () => {
    const a = revisar(cliente('Parroquia San José'), [
      'Particulares',
      'Empresas',
    ]);
    expect(a?.sugerencia).toEqual({});
    expect(a?.motivo).toMatch(/revisa su tipo/);
  });
});

describe('clientesQueRevisar', () => {
  it('los lee con la empresa de la sesión; sin la pieza, ninguno', async () => {
    const repositorio = {
      clientesDeLaEmpresa: jest
        .fn()
        .mockResolvedValue([
          cliente('Marcia Padilla'),
          cliente('Fundación INDAE', { id: 'c2' }),
        ]),
      tiposDeCliente: jest.fn().mockResolvedValue(TIPOS),
    };
    const ctx = {
      usuario: camila(),
      repositorio,
      alcance: {
        particulares: jest.fn().mockResolvedValue(PARTICULARES),
        // Quien revisa trabaja todos los tipos (doc 22 §9).
        tiposDelCargo: jest.fn().mockResolvedValue(null),
      },
    } as unknown as ContextoDeHerramienta;
    const r = await clientesQueRevisar(ctx);
    expect(r.map((a) => a.id)).toEqual(['c2']);
    expect(repositorio.clientesDeLaEmpresa).toHaveBeenCalledWith(1);
    expect(await clientesQueRevisar({ ...ctx, alcance: undefined })).toEqual(
      [],
    );
  });
});

describe('proponer_cambio_de_cliente', () => {
  it('es de quien vende: recepción no cambia tipos', () => {
    const de = (role: UserRole) =>
      herramientasPara(camila(role)).map((h) => h.nombre);
    expect(de(UserRole.VENDEDOR)).toContain('proponer_cambio_de_cliente');
    expect(de(UserRole.RECEPCION)).not.toContain('proponer_cambio_de_cliente');
  });

  it('pide qué cambiar y un id de Eventia', async () => {
    const proponer = jest.fn().mockResolvedValue({
      cliente: 'Fundación INDAE',
      avisos: [],
    });
    const ctx = {
      usuario: camila(),
      propuestas: { proponerCambioDeCliente: proponer },
      tarjetas: [],
    } as unknown as ContextoDeHerramienta;
    const id = '0b4c9d2e-1f3a-4b5c-8d6e-7f8a9b0c1d2e';
    await expect(
      proponerCambioDeCliente.ejecutar({ cliente_id: id, motivo: 'x' }, ctx),
    ).rejects.toThrow('qué cambiar');
    await expect(
      proponerCambioDeCliente.ejecutar(
        { cliente_id: 'Fundación INDAE', tipo: 'Empresas', motivo: 'x' },
        ctx,
      ),
    ).rejects.toThrow('id de Eventia');
    await proponerCambioDeCliente.ejecutar(
      { cliente_id: id, tipo: 'Empresas', motivo: 'Es una fundación' },
      ctx,
    );
    expect(proponer).toHaveBeenCalledWith(
      expect.objectContaining({ role: UserRole.VENDEDOR }),
      {
        cliente_id: id,
        tipo: 'Empresas',
        nombre: undefined,
        motivo: 'Es una fundación',
      },
    );
    expect(ctx.tarjetas).toHaveLength(1);
  });
});

describe('CambioDeCliente', () => {
  const armar = (
    guardado = {
      id: 'c1',
      name: 'Liceo Yungay',
      client_type: 'Particulares',
    },
  ) => {
    const guardadas = {
      clienteDeLaEmpresa: jest.fn().mockResolvedValue(guardado),
      tiposDeCliente: jest.fn().mockResolvedValue(TIPOS),
      crearPropuesta: jest.fn().mockImplementation((fila: object) =>
        Promise.resolve({
          ...fila,
          id: 'p-cliente',
          vence_at: '2026-11-05T05:00:00Z',
        }),
      ),
      moverPropuesta: jest.fn().mockResolvedValue(true),
    };
    const clientes = {
      coincidencias: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    };
    // Lo de fábrica (doc 22 §9): recepción trabaja los particulares y los
    // demás cargos, todos.
    const alcance = {
      trabaja: jest.fn((s: { role?: string }, tipo?: string | null) =>
        Promise.resolve(
          s.role !== UserRole.RECEPCION ||
            (tipo ?? '').toLowerCase() === 'particulares',
        ),
      ),
    };
    const servicio = new CambioDeCliente(
      guardadas as unknown as PropuestasRepository,
      clientes as unknown as ClientsService,
      alcance as unknown as AlcanceDeRecepcion,
    );
    return { servicio, guardadas, clientes };
  };

  it('arma la tarjeta: el antes y el después, y qué cambia para recepción', async () => {
    const { servicio, guardadas } = armar();
    const t = await servicio.proponer(camila(), {
      cliente_id: 'c1',
      nombre: 'Patricia Bravo',
      tipo: 'particulares',
      motivo: 'Es la apoderada que cotiza el paseo de curso',
    });
    // El tipo pedido es el mismo que tiene: solo cambia el nombre.
    expect(t.lineas).toEqual([
      {
        dia: 'Cliente',
        que: 'Nombre',
        quita: ['Liceo Yungay'],
        agrega: ['Patricia Bravo'],
      },
    ]);
    expect(t).toMatchObject({ tipo: 'cliente', enlace: '/clients/c1' });
    expect(guardadas.crearPropuesta).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 'cliente',
        quotation_id: null,
        huella_antes: 'Liceo Yungay|Particulares',
      }),
    );

    const otro = armar({
      id: 'c2',
      name: 'Fundación INDAE',
      client_type: 'Particulares',
    });
    const t2 = await otro.servicio.proponer(camila(), {
      cliente_id: 'c2',
      tipo: 'Empresas',
      motivo: 'Es una empresa privada',
    });
    expect(t2.avisos).toEqual([
      'Con el tipo «Empresas», recepción ya no ve sus cotizaciones.',
    ]);
  });

  it('el tipo tiene que existir, tiene que cambiar algo y recepción no cambia clientes', async () => {
    const { servicio } = armar();
    await expect(
      servicio.proponer(camila(), {
        cliente_id: 'c1',
        tipo: 'Colegios',
        motivo: 'x',
      }),
    ).rejects.toThrow('uno de estos');
    await expect(
      servicio.proponer(camila(), {
        cliente_id: 'c1',
        nombre: 'Liceo Yungay',
        motivo: 'x',
      }),
    ).rejects.toThrow('nada que cambiar');
    await expect(
      servicio.proponer(camila(UserRole.RECEPCION), {
        cliente_id: 'c1',
        tipo: 'Empresas',
        motivo: 'x',
      }),
    ).rejects.toBeInstanceOf(ErrorDeHerramienta);
  });

  const propuesta = (c: Partial<Propuesta> = {}): Propuesta =>
    ({
      id: 'p-cliente',
      tipo: 'cliente',
      despues: { cliente_id: 'c1', name: 'Patricia Bravo' },
      huella_antes: 'Liceo Yungay|Particulares',
      ...c,
    }) as unknown as Propuesta;

  it('al aplicar, si nadie lo tocó, lo guarda por la misma puerta de la ficha', async () => {
    const { servicio, clientes, guardadas } = armar();
    const guardado = jest.fn();
    const r = await servicio.aplicar(camila(), propuesta(), guardado);
    expect(clientes.update).toHaveBeenCalledWith(
      'c1',
      { name: 'Patricia Bravo' },
      1,
    );
    expect(guardado).toHaveBeenCalled();
    expect(guardadas.moverPropuesta).toHaveBeenCalledWith(
      1,
      'p-cliente',
      'aplicando',
      expect.objectContaining({ estado: 'aplicada' }),
    );
    expect(r.aviso).toMatch(/Patricia Bravo/);
  });

  it('si alguien lo cambió entre medio, no; y recepción, nunca', async () => {
    const { servicio, clientes } = armar({
      id: 'c1',
      name: 'Liceo Yungay (curso 4°B)',
      client_type: 'Particulares',
    });
    await expect(
      servicio.aplicar(camila(), propuesta(), jest.fn()),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      servicio.aplicar(camila(UserRole.RECEPCION), propuesta(), jest.fn()),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(clientes.update).not.toHaveBeenCalled();
  });

  it('PropuestasService se lo pasa; a recepción la frena antes', async () => {
    const cambio = {
      aplicar: jest.fn().mockResolvedValue({ estado: 'aplicada' }),
    };
    const { servicio } = armarServicio(
      cotizacion(),
      propuesta({
        quotation_id: null,
        estado: 'pendiente',
        usuario_id: 'perfil-1',
        vence_at: new Date(Date.now() + 3_600_000).toISOString(),
      }),
      { cambioDeCliente: cambio as unknown as CambioDeCliente },
    );
    await expect(servicio.aplicar(camila(), 'p-cliente')).resolves.toEqual({
      estado: 'aplicada',
    });
    await expect(
      servicio.aplicar(camila(UserRole.RECEPCION), 'p-cliente'),
    ).rejects.toThrow('cambia clientes');
  });
});
