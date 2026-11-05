import {
  QuotationStatus,
  RequestType,
} from 'src/quotations/constants/constants';
import { UserRole } from 'src/users/entities/user.entity';
import {
  filaComoLaVePersona,
  filasComoLasVePersona,
} from '../herramientas/buscar-cotizaciones';
import { buscarEnCatalogo } from '../herramientas/buscar-en-catalogo';
import { sumarDias, type ContextoDeHerramienta } from '../herramientas/comun';
import { taparPlata } from '../herramientas/recepcion';
import { verCotizacion } from '../herramientas/ver-cotizacion';
import type { DatosDeLaNueva } from '../propuestas/cotizacion-nueva.service';
import { armarServicio, camila, cotizacion, hoy } from './datos-de-prueba';

// RECEPCIÓN Y LOS PARTICULARES EN BELIA (doc 21; Felipe, 04-11-2026: "Belia
// sí le puede dar con montos para recepción, pero solo de cotizaciones para
// particulares"). Lo de un particular le llega completo y lo puede cotizar;
// lo demás, sin plata, como antes (recepcion.spec.ts).

const recepcion = () => camila(UserRole.RECEPCION);
const PLATA = /\$\s?\d/;
const PARTICULARES = { particulares: ['Particulares'] };

const fila = (tipo: string, c: Record<string, unknown> = {}) => ({
  id: 'q743',
  quotation_number: 743,
  quotation_status: QuotationStatus.ENVIADA,
  request_type: RequestType.COTIZACION,
  event_type: 'Graduación',
  event_date: '2026-11-27T00:00:00+00:00',
  event_end_date: null,
  people_count: 56,
  children_count: 0,
  total_amount: 4_452_800,
  sent_at: null,
  created_at: '2026-07-17T13:00:00+00:00',
  clients: { name: 'Marcia Padilla', client_type: tipo },
  ...c,
});

const deUnParticular = (c: Parameters<typeof cotizacion>[0] = {}) =>
  cotizacion({
    clients: { name: 'Marcia Padilla', client_type: 'Particulares' },
    ...c,
  });

describe('la red de recepción (taparPlata)', () => {
  it('tapa la plata fuera de lo particular y deja lo de un particular', () => {
    expect(
      taparPlata({
        cotizaciones: [
          {
            particular: true,
            numero: 459,
            total: '$4.452.800',
            nota: 'abonó $1.000.000',
          },
          { numero: 408, cliente: 'CCU', nota: 'pidió rebaja a $20.000' },
        ],
        texto: 'Total $2.835.000',
      }),
    ).toEqual({
      cotizaciones: [
        {
          particular: true,
          numero: 459,
          total: '$4.452.800',
          nota: 'abonó $1.000.000',
        },
        { numero: 408, cliente: 'CCU', nota: 'pidió rebaja a [monto]' },
      ],
      texto: 'Total [monto]',
    });
  });

  it('la marca vale solo si la pone el código: un texto que la diga se tapa', () => {
    expect(
      taparPlata({ nota: '{"particular": true, "total": "$9.000"}' }),
    ).toEqual({ nota: '{"particular": true, "total": "[monto]"}' });
    expect(taparPlata({ particular: 'true', total: '$9.000' })).toEqual({
      particular: 'true',
      total: '[monto]',
    });
  });
});

describe('las filas que ve recepción', () => {
  it('la de un particular: con el total, el enlace a su ficha y la marca', () => {
    expect(
      filaComoLaVePersona(
        fila('Particulares') as never,
        UserRole.RECEPCION,
        true,
      ),
    ).toMatchObject({
      particular: true,
      total: '$4.452.800',
      enlace: '/negocio/q743',
    });
  });

  it('un requerimiento de un particular lleva a Requerimientos', () => {
    const r = filaComoLaVePersona(
      fila('Particulares', {
        request_type: RequestType.REQUERIMIENTO,
      }) as never,
      UserRole.RECEPCION,
      true,
    );
    expect(r.enlace).toBe('/requests');
  });

  it('la lista: fila por fila, con los tipos de su empresa', async () => {
    const ctx = {
      usuario: recepcion(),
      alcance: {
        particulares: jest.fn().mockResolvedValue(new Set(['particulares'])),
      },
    } as unknown as ContextoDeHerramienta;
    const [a, b] = await filasComoLasVePersona(
      [
        fila('Particulares'),
        fila('Empresas', { id: 'q408', quotation_number: 408 }),
      ] as never,
      ctx,
    );
    expect(a).toMatchObject({ particular: true, total: '$4.452.800' });
    expect(b).not.toHaveProperty('total');
    expect(b).not.toHaveProperty('particular');
    // Sin la pieza, nadie: recepción sigue sin plata.
    const [sola] = await filasComoLasVePersona(
      [fila('Particulares')] as never,
      {
        usuario: recepcion(),
      } as unknown as ContextoDeHerramienta,
    );
    expect(sola).not.toHaveProperty('total');
  });
});

describe('la ficha que ve recepción', () => {
  const ficha = (tipo: string) => ({
    ...fila(tipo),
    clients: {
      name: 'Marcia Padilla',
      client_type: tipo,
      email: 'marcia@gmail.com',
      phone: '+56 9 7659 1726',
    },
    mandante: null,
    contact_name: null,
    subtotal_amount: 4_452_800,
    discount_amount: 0,
    discount_percentage: 0,
    tip_amount: 0,
    value_per_person: 79_514,
    items: {
      variable_services: [
        {
          category: 'Almuerzo',
          day: 1,
          items: [{ nombre: 'Asado', precio: 18_000, quantity: 1 }],
        },
      ],
    },
    observations: 'Valor por persona $79.514',
    comentario_interno: null,
    loss_reason: null,
  });
  const ctxDe = (tipo: string) =>
    ({
      usuario: recepcion(),
      cotizacionAbierta: null,
      repositorio: {
        fichaDeCotizacion: jest.fn().mockResolvedValue(ficha(tipo)),
      },
      bitacora: {
        findByQuotation: jest.fn().mockResolvedValue([
          {
            created_at: '2026-11-04T14:00:00+00:00',
            author_name: 'Felipe Vargas',
            tipo: 'correo',
            note: 'Se le envió la cotización por $4.452.800.',
          },
        ]),
      },
      alcance: {
        particulares: jest.fn().mockResolvedValue(new Set(['particulares'])),
      },
    }) as unknown as ContextoDeHerramienta;

  it('la de un particular, completa: la plata, los servicios y la bitácora sin tapar', async () => {
    const r = (await verCotizacion.ejecutar(
      { numero: 743 },
      ctxDe('Particulares'),
    )) as Record<string, unknown>;
    expect(r.particular).toBe(true);
    expect(r).toHaveProperty('plata');
    expect(r).toHaveProperty('dias');
    expect(r.enlace).toBe('/negocio/q743');
    expect(JSON.stringify(r.bitacora)).toContain('$4.452.800');
    // Y la red no la toca.
    expect(taparPlata(r)).toEqual(r);
  });

  it('la de una empresa, como siempre: sin plata', async () => {
    const r = (await verCotizacion.ejecutar(
      { numero: 743 },
      ctxDe('Empresas'),
    )) as Record<string, unknown>;
    expect(r).not.toHaveProperty('plata');
    expect(r).not.toHaveProperty('particular');
    expect(JSON.stringify(r)).not.toMatch(PLATA);
  });
});

describe('el catálogo', () => {
  it('lo lee recepción, sin su red: no es plata de un cliente', () => {
    expect(buscarEnCatalogo.cargos).toContain(UserRole.RECEPCION);
    expect(buscarEnCatalogo.plataLibre).toBe(true);
  });
});

describe('lo que propone y aplica recepción', () => {
  it('cambia los servicios solo en las de particulares', async () => {
    const deEmpresa = armarServicio(cotizacion(), {}, PARTICULARES);
    await expect(
      deEmpresa.servicio.proponerServicios(
        recepcion(),
        { numero: 500 },
        [],
        'Cincuenta personas',
        hoy,
        { personas: { total: 50 } },
      ),
    ).rejects.toThrow('particulares');
    expect(deEmpresa.repositorio.crearPropuesta).not.toHaveBeenCalled();

    const suya = armarServicio(deUnParticular(), {}, PARTICULARES);
    const t = await suya.servicio.proponerServicios(
      recepcion(),
      { numero: 500 },
      [],
      'Cincuenta personas',
      hoy,
      { personas: { total: 50 } },
    );
    expect(t.enlace).toBe('/negocio/q500');
  });

  it('sin descuento: su tope es 0 %', async () => {
    const { servicio } = armarServicio(deUnParticular(), {}, PARTICULARES);
    await expect(
      servicio.proponerServicios(recepcion(), { numero: 500 }, [], '5 %', hoy, {
        descuento: { porcentaje: 5 },
      }),
    ).rejects.toThrow('no se aplican descuentos');
  });

  it('una aceptada es de operaciones', async () => {
    const { servicio } = armarServicio(
      deUnParticular({ quotation_status: QuotationStatus.ACEPTADA }),
      {},
      PARTICULARES,
    );
    await expect(
      servicio.proponerServicios(
        recepcion(),
        { numero: 500 },
        [],
        'Cincuenta personas',
        hoy,
        { personas: { total: 50 } },
      ),
    ).rejects.toThrow('operaciones');
  });

  it('al aplicar se revisa de nuevo: la de una empresa no se guarda', async () => {
    const { servicio, cotizaciones } = armarServicio(
      cotizacion(),
      {},
      PARTICULARES,
    );
    await expect(servicio.aplicar(recepcion(), 'p1')).rejects.toThrow(
      'particulares',
    );
    expect(cotizaciones.update).not.toHaveBeenCalled();
  });

  it('una nota: en los requerimientos de cualquiera y en las de particulares', async () => {
    const req = armarServicio(
      cotizacion({ request_type: RequestType.REQUERIMIENTO }),
      {},
      PARTICULARES,
    );
    await expect(
      req.servicio.proponerNota(
        recepcion(),
        { numero: 500 },
        'Llamó: viene el lunes a ver el salón',
        'llamada',
        null,
      ),
    ).resolves.toMatchObject({ tipo: 'nota', enlace: '/requests' });

    const deEmpresa = armarServicio(cotizacion(), {}, PARTICULARES);
    await expect(
      deEmpresa.servicio.proponerNota(
        recepcion(),
        { numero: 500 },
        'Llamó',
        'llamada',
        null,
      ),
    ).rejects.toThrow('particulares');
  });

  it('el seguimiento, solo de un particular', async () => {
    const { servicio, seguimientoDelChat } = armarServicio(
      cotizacion(),
      {},
      PARTICULARES,
    );
    await expect(
      servicio.proponerSeguimiento(recepcion(), { numero: 500 }),
    ).rejects.toThrow('particulares');
    expect(seguimientoDelChat.proponer).not.toHaveBeenCalled();
  });

  describe('una cotización nueva', () => {
    const datos = (c: Partial<DatosDeLaNueva> = {}): DatosDeLaNueva => ({
      resumen: 'Graduación de Marcia, 40 personas',
      cliente_id: 'c1',
      tipo_de_evento: 'almuerzo o cena',
      fecha: sumarDias(hoy, 10),
      personas: 40,
      ninos: 0,
      pedido: 'Una cena con postre',
      cambios: [
        {
          accion: 'poner_casilla',
          dia: 1,
          categoria: 'Cena',
          audiencia: 'adultos',
          personas: 40,
          menu_id: 900,
        },
      ],
      ...c,
    });

    it('con servicios, solo a un particular; a los demás, el requerimiento', async () => {
      const { servicio, repositorio } = armarServicio(
        cotizacion(),
        {},
        PARTICULARES,
      );
      // c1 es Ecofor, de Empresas.
      await expect(
        servicio.proponerCotizacionNueva(recepcion(), datos(), hoy),
      ).rejects.toThrow('particulares');
      await expect(
        servicio.proponerCotizacionNueva(
          recepcion(),
          datos({ cambios: [] }),
          hoy,
        ),
      ).resolves.toMatchObject({ nueva: { es: 'requerimiento' } });

      repositorio.clienteDeLaEmpresa.mockResolvedValue({
        id: 'c1',
        name: 'Marcia Padilla',
        client_type: 'Particulares',
      });
      const t = await servicio.proponerCotizacionNueva(
        recepcion(),
        datos(),
        hoy,
      );
      expect(t.nueva).toMatchObject({ es: 'cotización' });
    });

    it('un cliente nuevo de tipo Particulares, también', async () => {
      const { servicio } = armarServicio(cotizacion(), {}, PARTICULARES);
      const t = await servicio.proponerCotizacionNueva(
        recepcion(),
        datos({
          cliente_id: undefined,
          cliente_nuevo: {
            nombre: 'Patricia Bravo',
            tipo: 'Particulares',
            correo: 'patricia@gmail.com',
            es_otro_cliente: false,
          },
        }),
        hoy,
      );
      expect(t.nueva).toMatchObject({ es: 'cotización' });
    });

    it('al crear se revisa de nuevo: la de una empresa no se crea', async () => {
      const { servicio, cotizaciones } = armarServicio(
        cotizacion(),
        {
          tipo: 'cotizacion_nueva',
          quotation_id: null,
          despues: {
            cliente: { id: 'c1', nombre: 'Ecofor', tipo: 'Empresas' },
            dto: {
              request_type: RequestType.COTIZACION,
              event_date: sumarDias(hoy, 10),
            },
          },
        },
        PARTICULARES,
      );
      await expect(servicio.aplicar(recepcion(), 'p1')).rejects.toThrow(
        'particulares',
      );
      expect(cotizaciones.create).not.toHaveBeenCalled();
    });
  });
});
