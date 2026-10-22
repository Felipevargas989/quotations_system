import { NotFoundException } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import type { ClientsService } from 'src/clients/clients.service';
import type { QuotationFollowupsService } from 'src/quotation-followups/quotation-followups.service';
import type { GenerarRepository } from 'src/quotations/generar/generar.repository';
import type { QuotationsService } from 'src/quotations/quotations.service';
import { mockPinoLogger } from 'src/testing/mocks';
import type { User } from 'src/users/entities/user.entity';
import type { AnalisisRepository } from '../analisis/analisis.repository';
import type { OfertaDeLaPropuesta } from '../generacion/oferta-de-la-propuesta';
import {
  CotizacionDeLaPostulacionService,
  diasDeLaOferta,
  loQueTenia,
  nombreDelComprador,
  sumarDias,
  tipoDeEvento,
} from '../postulacion/cotizacion-de-la-postulacion.service';
import type { PostulacionRepository } from '../postulacion/postulacion.repository';
import { CATALOGO_DE_PRUEBA } from './generacion-de-prueba';

// LA COTIZACIÓN DE LA POSTULACIÓN Y «¿CALZA EL PRECIO?» (decisión 29 del
// doc 17, 19-10). Felipe: "tienen que ser equivalentes", "vincular
// solamente el número y reescribir todo" y "se ajusta como un descuento en
// dinero, así cuadramos al peso".

const USUARIO = {
  id: 'cuenta-1',
  company_id: 1,
  role: 'administrador',
  derechos: { cotizar: true },
  cotizaciones_mes: 3,
  plan: 'pro',
} as unknown as User;

const OFERTA = {
  cajas: [
    {
      dia: 1,
      categoria: 'Almuerzo',
      audiencia: 'adultos',
      personas: 235,
      menu_id: 7,
      quitar: [],
      servicios: [{ id: 13, cantidad: 1 }],
    },
  ],
  fijos: [{ dia: 0, id: 45, cantidad: 1 }],
};

// Por persona: Plateada 12.000 + Tiramisú 3.000 + Pollo arvejado 9.000 +
// la sección fija (Pan amasado 500) = 24.500; × 235 = 5.757.500; más la
// amplificación (250.000) = 6.007.500.
const CATALOGO_TOTAL = 6_007_500;

function armar() {
  const repo = {
    oportunidad: jest.fn().mockResolvedValue({
      id: 87,
      codigo: '4364-13-LE26',
      quotation_id: null,
      etiquetas: ['evento', 'alimentacion'],
      proceso: {
        nombre: 'Producción de Evento día del Profesor',
        organismo: 'I MUNICIPALIDAD DE QUILLON',
        monto: null,
        fecha_cierre: '2026-10-19T19:00:00Z',
      },
    }),
    vincular: jest.fn().mockResolvedValue(undefined),
    cotizacion: jest.fn().mockResolvedValue(null),
    ultimaPropuesta: jest
      .fn()
      .mockResolvedValue({ id: 31, resultado: { oferta: OFERTA } }),
    tiposDeCliente: jest
      .fn()
      .mockResolvedValue(['Particulares', 'Empresas Publicas']),
  };
  const analisis = {
    ultimo: jest.fn().mockResolvedValue({
      id: 5,
      estado: 'listo',
      resultado: {
        monto: 15_960_000,
        personas: 235,
        fecha_del_servicio_iso: '2026-10-28',
      },
    }),
  };
  const catalogos = {
    catalogo: jest.fn().mockResolvedValue(CATALOGO_DE_PRUEBA),
  };
  const cotizaciones = {
    create: jest.fn().mockResolvedValue({ id: 'q-nueva' }),
    update: jest.fn().mockResolvedValue({}),
  };
  const clientes = {
    coincidencias: jest
      .fn()
      .mockResolvedValue([
        { cliente_id: 'cli-quillon', nombre: 'Municipalidad de Quillón' },
      ]),
    create: jest.fn().mockResolvedValue({ id: 'cli-nuevo' }),
  };
  const bitacora = { create: jest.fn().mockResolvedValue({}) };
  const servicio = new CotizacionDeLaPostulacionService(
    repo as unknown as PostulacionRepository,
    analisis as unknown as AnalisisRepository,
    catalogos as unknown as GenerarRepository,
    cotizaciones as unknown as QuotationsService,
    clientes as unknown as ClientsService,
    bitacora as unknown as QuotationFollowupsService,
    mockPinoLogger() as unknown as PinoLogger,
  );
  const notas = () =>
    bitacora.create.mock.calls.map(([, dto]) => (dto as { note: string }).note);
  return {
    repo,
    analisis,
    cotizaciones,
    clientes,
    bitacora,
    servicio,
    notas,
  };
}

/** Lo que se le pasó a `create` la primera vez. */
const creadaDe = (create: jest.Mock): Record<string, unknown> =>
  (create.mock.calls[0] as [Record<string, unknown>])[0];

/** La cotización vinculada después de crearla, con lo que se guardó. */
const vinculada = (
  creada: Record<string, unknown>,
  extra: Record<string, unknown> = {},
) => ({
  id: 'q-nueva',
  quotation_number: 612,
  quotation_status: 'solicitada',
  people_count: 235,
  children_count: 0,
  event_date: '2026-10-28',
  items: creada.items,
  subtotal_amount: creada.subtotal_amount,
  discount_amount: creada.discount_amount,
  total_amount: creada.total_amount,
  client: { name: 'Municipalidad de Quillón' },
  ...extra,
});

describe('La cotización de la postulación', () => {
  it('se crea con la oferta de la propuesta técnica y los precios del catálogo, para el comprador que ya existe', async () => {
    const { repo, cotizaciones, clientes, servicio, notas } = armar();

    await servicio.llevar(USUARIO, 87);

    expect(clientes.coincidencias).toHaveBeenCalledWith(
      { name: 'MUNICIPALIDAD DE QUILLON' },
      1,
    );
    const [dto, empresa, cuenta, derechos] = cotizaciones.create.mock
      .calls[0] as [Record<string, unknown>, number, string, unknown];
    expect(empresa).toBe(1);
    expect(cuenta).toBe('cuenta-1');
    expect(derechos).toEqual({
      derechos: { cotizar: true },
      cotizaciones_mes: 3,
      plan: 'pro',
    });
    expect(dto).toMatchObject({
      client_id: 'cli-quillon',
      event_type: 'Celebraciones',
      event_date: '2026-10-28',
      people_count: 235,
      quotation_status: 'solicitada',
      request_type: 'cotizacion',
      subtotal_amount: CATALOGO_TOTAL,
      discount_amount: 0,
      total_amount: CATALOGO_TOTAL,
    });
    expect(repo.vincular).toHaveBeenCalledWith(1, 87, 'q-nueva');
    expect(notas()[0]).toContain(
      'Creada desde la propuesta técnica de la licitación 4364-13-LE26',
    );
    expect(dto.comentario_interno).toContain(
      'Postulación a la licitación 4364-13-LE26',
    );
  });

  it('el comentario interno lleva los detalles de lo postulado y el pedido al proveedor (decisión 57)', async () => {
    const { repo, cotizaciones, servicio } = armar();
    repo.ultimaPropuesta.mockResolvedValue({
      id: 31,
      resultado: {
        oferta: OFERTA,
        detalles: ['Copa de helado con galletas'],
        subcontratar: ['Pódium, los dos días'],
      },
    });
    await servicio.llevar(USUARIO, 87);
    const [dto] = cotizaciones.create.mock.calls[0] as [Record<string, string>];
    expect(dto.comentario_interno).toContain(
      'Detalles de lo postulado:\n- Copa de helado con galletas',
    );
    expect(dto.comentario_interno).toContain(
      'Subcontratar (pedir al proveedor):\n- Pódium, los dos días',
    );
  });

  it('sin una oferta armada, no hay de dónde sacar los productos', async () => {
    const { repo, cotizaciones, servicio } = armar();
    repo.ultimaPropuesta.mockResolvedValue({ id: 30, resultado: {} });
    await expect(servicio.llevar(USUARIO, 87)).rejects.toThrow(
      'Primero arma la postulación',
    );
    expect(cotizaciones.create).not.toHaveBeenCalled();
  });

  it('postulada o ganada, lo postulado queda fijo: ni cotización nueva, ni vincular, ni cambiar la oferta (decisión 33)', async () => {
    const { repo, cotizaciones, servicio } = armar();
    repo.oportunidad.mockResolvedValue({
      ...(await repo.oportunidad()),
      estado: 'postulada',
    });
    await expect(servicio.llevar(USUARIO, 87)).rejects.toThrow(
      'Ya la postulaste: lo postulado queda fijo',
    );
    await expect(servicio.llevar(USUARIO, 87, 481)).rejects.toThrow(
      'Ya la postulaste',
    );
    repo.oportunidad.mockResolvedValue({
      ...(await repo.oportunidad()),
      estado: 'ganada',
    });
    await expect(servicio.fijarOferta(USUARIO, 87, 10_000_000)).rejects.toThrow(
      'La ganaste: lo postulado es el contrato',
    );
    expect(cotizaciones.create).not.toHaveBeenCalled();
    expect(cotizaciones.update).not.toHaveBeenCalled();
  });

  it('vincular = el número y se reescribe entera, con lo que tenía en su bitácora; una aceptada no se toca', async () => {
    const { repo, cotizaciones, servicio, notas } = armar();
    repo.cotizacion.mockResolvedValue({
      id: 'q-vieja',
      quotation_number: 598,
      quotation_status: 'enviada',
      people_count: 200,
      children_count: 0,
      event_date: '2026-10-28',
      items: {
        variable_services: [
          {
            category: 'Almuerzo',
            people: 200,
            items: [{ nombre: 'Lasaña', quantity: 1 }],
          },
        ],
        fixed_services: [{ nombre: 'Decoración', quantity: 2 }],
      },
      subtotal_amount: 4_000_000,
      discount_amount: 0,
      total_amount: 4_000_000,
      comentario_interno: 'Llamar a la Sra. Pérez.',
      client: { name: 'Municipalidad de Quillón' },
    });

    await servicio.llevar(USUARIO, 87, 598);

    expect(repo.cotizacion).toHaveBeenCalledWith(1, { numero: 598 });
    expect(cotizaciones.create).not.toHaveBeenCalled();
    const [id, cambios, , rol] = cotizaciones.update.mock.calls[0] as [
      string,
      Record<string, unknown>,
      number,
      string,
    ];
    expect(id).toBe('q-vieja');
    expect(rol).toBe('administrador');
    // Sin fechas elegidas, la reescrita guarda las suyas (decisión 69).
    expect(cambios).not.toHaveProperty('event_date');
    expect(cambios).toMatchObject({
      people_count: 235,
      total_amount: CATALOGO_TOTAL,
      discount_amount: 0,
    });
    // Decisión 57: el bloque de la licitación arriba; la nota, se queda.
    expect(cambios.comentario_interno).toMatch(
      /^Postulación a la licitación 4364-13-LE26[\s\S]*Llamar a la Sra\. Pérez\.$/,
    );
    expect(notas()[0]).toContain(
      'Antes tenía: Almuerzo (200 pers.): Lasaña · Fijos: Decoración x2 ($4.000.000)',
    );
    expect(repo.vincular).toHaveBeenCalledWith(1, 87, 'q-vieja');

    repo.cotizacion.mockResolvedValue({
      id: 'q-evento',
      quotation_number: 590,
      quotation_status: 'aceptada',
    });
    await expect(servicio.llevar(USUARIO, 87, 590)).rejects.toThrow(
      'no se reescribe un evento confirmado',
    );
    repo.cotizacion.mockResolvedValue(null);
    await expect(servicio.llevar(USUARIO, 87, 999)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('un comprador nuevo entra como cliente con el tipo de los públicos', async () => {
    const { clientes, cotizaciones, servicio } = armar();
    clientes.coincidencias.mockResolvedValue([]);
    await servicio.llevar(USUARIO, 87);
    expect(clientes.create).toHaveBeenCalledWith(
      { name: 'MUNICIPALIDAD DE QUILLON', client_type: 'Empresas Publicas' },
      1,
    );
    expect(creadaDe(cotizaciones.create)).toMatchObject({
      client_id: 'cli-nuevo',
    });
  });
});

describe('«¿Calza el precio?»', () => {
  it('la oferta es el total de la cotización: la diferencia con el catálogo entra como descuento en dinero', async () => {
    const { repo, cotizaciones, servicio, notas } = armar();
    await servicio.llevar(USUARIO, 87);
    const creada = creadaDe(cotizaciones.create);
    repo.oportunidad.mockResolvedValue({
      ...(await repo.oportunidad()),
      quotation_id: 'q-nueva',
    });
    repo.cotizacion.mockResolvedValue(vinculada(creada));

    await servicio.fijarOferta(USUARIO, 87, 5_500_000);

    const [id, cambios] = cotizaciones.update.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(id).toBe('q-nueva');
    expect(cambios).toMatchObject({
      subtotal_amount: CATALOGO_TOTAL,
      discount_percentage: 0,
      discount_amount: 507_500,
      total_amount: 5_500_000,
      tip_percentage: null,
    });
    expect(notas().at(-1)).toBe(
      'Oferta de la licitación 4364-13-LE26: $5.500.000. Descuento de $507.500 (8,4 %) sobre el catálogo ($6.007.500).',
    );
  });

  it('con el precio de «Armar postulación», crear o vincular la deja con ese total (decisión 35)', async () => {
    const { repo, cotizaciones, servicio } = armar();
    const base = await repo.oportunidad();
    repo.vincular.mockImplementation(() => {
      repo.oportunidad.mockResolvedValue({ ...base, quotation_id: 'q-nueva' });
      repo.cotizacion.mockResolvedValue(
        vinculada(creadaDe(cotizaciones.create)),
      );
      return Promise.resolve();
    });

    await servicio.llevar(USUARIO, 87, undefined, 5_500_000);

    const [id, cambios] = cotizaciones.update.mock.calls.at(-1) as [
      string,
      Record<string, unknown>,
    ];
    expect(id).toBe('q-nueva');
    expect(cambios).toMatchObject({
      total_amount: 5_500_000,
      discount_amount: 507_500,
    });
  });

  it('una oferta mayor que el catálogo NO frena (decisión 69): la cotización queda con lo que hay, a precio de catálogo, y la diferencia se anota; sin cotización, primero crearla', async () => {
    const { repo, cotizaciones, servicio, notas } = armar();
    await expect(servicio.fijarOferta(USUARIO, 87, 5_000_000)).rejects.toThrow(
      'Primero crea o vincula la cotización',
    );
    await servicio.llevar(USUARIO, 87);
    const creada = creadaDe(cotizaciones.create);
    repo.oportunidad.mockResolvedValue({
      ...(await repo.oportunidad()),
      quotation_id: 'q-nueva',
    });
    repo.cotizacion.mockResolvedValue(vinculada(creada));
    await expect(
      servicio.fijarOferta(USUARIO, 87, 7_000_000),
    ).resolves.toMatchObject({ cotizacion: { total: CATALOGO_TOTAL } });
    // Nunca un precio a dedo: no se toca el precio, se anota lo que falta.
    expect(cotizaciones.update).not.toHaveBeenCalled();
    expect(notas().at(-1)).toBe(
      'Oferta de la licitación 4364-13-LE26: $7.000.000. Tu catálogo suma $6.007.500: faltan $992.500 en la cotización (lo que se subcontrata o no está en tu catálogo; la lista está en el comentario interno). Agrégalo para cuadrar.',
    );
  });

  it('crear siempre (decisión 69): con una oferta mayor que el catálogo, «Vincular» crea la cotización igual, sin error', async () => {
    const { repo, cotizaciones, servicio } = armar();
    const base = await repo.oportunidad();
    repo.vincular.mockImplementation(() => {
      repo.oportunidad.mockResolvedValue({ ...base, quotation_id: 'q-nueva' });
      repo.cotizacion.mockResolvedValue(
        vinculada(creadaDe(cotizaciones.create)),
      );
      return Promise.resolve();
    });
    await expect(
      servicio.llevar(USUARIO, 87, undefined, 7_090_000),
    ).resolves.toMatchObject({ cotizacion: { numero: 612 } });
    expect(repo.vincular).toHaveBeenCalledWith(1, 87, 'q-nueva');
    expect(cotizaciones.update).not.toHaveBeenCalled();
  });

  it('las fechas (decisión 69): las elegidas al crear van a la cotización; un término que no es después del inicio no cuenta', async () => {
    const { cotizaciones, servicio } = armar();
    await servicio.llevar(USUARIO, 87, undefined, undefined, {
      desde: '2026-11-06',
      hasta: '2026-11-08',
    });
    expect(creadaDe(cotizaciones.create)).toMatchObject({
      event_date: '2026-11-06',
      event_end_date: '2026-11-08',
    });
    cotizaciones.create.mockClear();
    await servicio.llevar(USUARIO, 87, undefined, undefined, {
      desde: '2026-11-06',
      hasta: '2026-11-01',
    });
    expect(creadaDe(cotizaciones.create)).toMatchObject({
      event_date: '2026-11-06',
      event_end_date: null,
    });
  });

  it('lo ofrecido de varios días calza: el término nunca queda antes de lo que dura (un «hasta» más corto se alarga)', async () => {
    const { repo, cotizaciones, servicio } = armar();
    repo.ultimaPropuesta.mockResolvedValue({
      id: 31,
      resultado: {
        oferta: {
          ...OFERTA,
          cajas: [...OFERTA.cajas, { ...OFERTA.cajas[0], dia: 3 }],
        },
      },
    });
    await servicio.llevar(USUARIO, 87, undefined, undefined, {
      desde: '2026-11-06',
      hasta: '2026-11-07',
    });
    expect(creadaDe(cotizaciones.create)).toMatchObject({
      event_date: '2026-11-06',
      event_end_date: '2026-11-08',
    });
  });

  it('sin fechas elegidas: la de las bases y, si lo ofrecido dura varios días, el término que corresponde', async () => {
    const { repo, cotizaciones, servicio } = armar();
    repo.ultimaPropuesta.mockResolvedValue({
      id: 31,
      resultado: {
        oferta: {
          ...OFERTA,
          cajas: [...OFERTA.cajas, { ...OFERTA.cajas[0], dia: 3 }],
        },
      },
    });
    await servicio.llevar(USUARIO, 87);
    expect(creadaDe(cotizaciones.create)).toMatchObject({
      event_date: '2026-10-28',
      event_end_date: '2026-10-30',
    });
  });

  it('el estado: el presupuesto (el publicado o el de las bases), la cotización y cuántos productos trae la propuesta', async () => {
    const { repo, cotizaciones, servicio } = armar();
    expect(await servicio.estado(1, 87)).toEqual({
      cotizacion: null,
      presupuesto: 15_960_000,
      propuesta: { id: 31, productos: 3 },
      faltan: [],
      fechas: { desde: '2026-10-28', hasta: null },
    });
    await servicio.llevar(USUARIO, 87);
    const creada = creadaDe(cotizaciones.create);
    repo.oportunidad.mockResolvedValue({
      ...(await repo.oportunidad()),
      quotation_id: 'q-nueva',
    });
    repo.cotizacion.mockResolvedValue(
      vinculada(creada, { discount_amount: 507_500, total_amount: 5_500_000 }),
    );
    expect((await servicio.estado(1, 87)).cotizacion).toEqual({
      id: 'q-nueva',
      numero: 612,
      estado: 'solicitada',
      cliente: 'Municipalidad de Quillón',
      catalogo: CATALOGO_TOTAL,
      descuento: 507_500,
      total: 5_500_000,
    });
  });

  it('el estado trae lo que falta en la cotización: lo que la oferta subcontrata (decisión 69)', async () => {
    const { repo, servicio } = armar();
    repo.ultimaPropuesta.mockResolvedValue({
      id: 31,
      resultado: {
        oferta: OFERTA,
        subcontratar: [
          'Catamarán para 30 personas con capitán y ayudante, del 2 al 8 de noviembre',
          '50 chalecos salvavidas y 4 aros salvavidas',
        ],
      },
    });
    expect((await servicio.estado(1, 87)).faltan).toEqual([
      'Catamarán para 30 personas con capitán y ayudante, del 2 al 8 de noviembre',
      '50 chalecos salvavidas y 4 aros salvavidas',
    ]);
  });

  it('las piezas de las fechas: sumar días sin saltos de zona y los días que dura lo ofrecido', () => {
    expect(sumarDias('2026-11-06', 2)).toBe('2026-11-08');
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(diasDeLaOferta(OFERTA as unknown as OfertaDeLaPropuesta)).toBe(1);
    expect(
      diasDeLaOferta({
        ...OFERTA,
        fijos: [{ dia: 4, id: 45, cantidad: 1 }],
      } as unknown as OfertaDeLaPropuesta),
    ).toBe(4);
  });

  it('el tipo de evento es uno de los que acepta la base, según la licitación (QA del 19-10)', () => {
    expect(tipoDeEvento('Ceremonia y Cena Día del Funcionario')).toBe(
      'Celebraciones',
    );
    expect(tipoDeEvento('SERVICIO PARA GIRAS DE ESTUDIO DEL LICEO')).toBe(
      'Paseo de Curso',
    );
    expect(tipoDeEvento('Paseo de fin de año funcionarios')).toBe(
      'Paseo fin de año',
    );
    expect(tipoDeEvento('Capacitación para funcionarios de salud')).toBe(
      'Uso salones',
    );
    expect(tipoDeEvento('Servicio de alojamiento para delegación')).toBe(
      'Estadía y Alimentación',
    );
    expect(tipoDeEvento('Servicio de alimentación', ['alimentacion'])).toBe(
      'Almuerzo o Cena',
    );
    expect(tipoDeEvento('Arriendo de equipos')).toBe('Celebraciones');
  });

  it('los textos de apoyo: el nombre del comprador y lo que tenía la cotización', () => {
    expect(nombreDelComprador('I MUNICIPALIDAD DE QUILLON')).toBe(
      'MUNICIPALIDAD DE QUILLON',
    );
    expect(nombreDelComprador('Ilustre Municipalidad de Bulnes')).toBe(
      'Municipalidad de Bulnes',
    );
    expect(nombreDelComprador('SEREMI de Educación')).toBe(
      'SEREMI de Educación',
    );
    expect(loQueTenia(null)).toBe('sin productos');
  });
});
