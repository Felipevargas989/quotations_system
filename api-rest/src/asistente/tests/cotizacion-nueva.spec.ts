import { RequestType } from 'src/quotations/constants/constants';
import { sumarDias } from '../herramientas/comun';
import type { DatosDeLaNueva } from '../propuestas/cotizacion-nueva.service';
import { armarServicio, camila, cotizacion, hoy } from './datos-de-prueba';

// «CREAR EVENTO» (doc 20 §8b): BelIA arma una cotización nueva y la persona
// la crea con «Sí, crear». Nada se crea al proponer; el cliente nuevo pasa
// por el portero de clientes parecidos y la cotización por la puerta del
// formulario.

describe('Crear evento', () => {
  const datos = (c: Partial<DatosDeLaNueva> = {}): DatosDeLaNueva => ({
    resumen: 'Cena de Ecofor, 40 personas',
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

  it('arma la cotización con el catálogo y la deja propuesta, sin crear nada', async () => {
    const { servicio, repositorio, cotizaciones } = armarServicio(cotizacion());
    const t = await servicio.proponerCotizacionNueva(camila(), datos(), hoy);
    // Cena nivel 1 con su sección fija: (500 + 9.000 + 2.000) × 40.
    expect(t.total?.despues).toBe('$460.000');
    expect(t.nueva).toMatchObject({
      es: 'cotización',
      cliente: 'Ecofor',
      cliente_nuevo: false,
      tipo_de_evento: 'Almuerzo o Cena',
    });
    expect(t.numero).toBeNull();
    const [fila] = repositorio.crearPropuesta.mock.calls[0] as [
      {
        tipo: string;
        quotation_id: null;
        despues: { dto: Record<string, unknown> };
      },
    ];
    expect(fila.tipo).toBe('cotizacion_nueva');
    expect(fila.quotation_id).toBeNull();
    // Lo que pidió el cliente va al comentario interno, nunca a las
    // observaciones (salen en el PDF).
    expect(fila.despues.dto.observations).toBe('');
    expect(String(fila.despues.dto.comentario_interno)).toContain(
      'Una cena con postre',
    );
    expect(cotizaciones.create).not.toHaveBeenCalled();
  });

  it('sin servicios, nace como requerimiento', async () => {
    const { servicio } = armarServicio(cotizacion());
    const t = await servicio.proponerCotizacionNueva(
      camila(),
      datos({ cambios: [] }),
      hoy,
    );
    expect(t.nueva?.es).toBe('requerimiento');
    expect(t.total).toBeUndefined();
  });

  it('un cliente nuevo parecido a otro no se propone sin preguntar', async () => {
    const { servicio, clientes } = armarServicio(cotizacion());
    clientes.coincidencias.mockResolvedValue([
      { cliente_id: 'c9', nombre: 'Ecofor S.A.', motivos: ['nombre'] },
    ]);
    const nuevo = {
      cliente_id: undefined,
      cliente_nuevo: { nombre: 'Ecofor', tipo: 'Empresas' },
    };
    await expect(
      servicio.proponerCotizacionNueva(camila(), datos(nuevo), hoy),
    ).rejects.toThrow('Ecofor S.A.');
    // Si la persona dice que es otro cliente, va con el aviso.
    const t = await servicio.proponerCotizacionNueva(
      camila(),
      datos({
        cliente_id: undefined,
        cliente_nuevo: { ...nuevo.cliente_nuevo, es_otro_cliente: true },
      }),
      hoy,
    );
    expect(t.nueva?.cliente_nuevo).toBe(true);
    expect(t.avisos[0]).toContain('se parece a «Ecofor S.A.»');
  });

  it('lo que no calza: fecha pasada y tipo de evento que no existe', async () => {
    const { servicio } = armarServicio(cotizacion());
    const falla = servicio.proponerCotizacionNueva(
      camila(),
      datos({ fecha: sumarDias(hoy, -1), tipo_de_evento: 'Bautizo' }),
      hoy,
    );
    await expect(falla).rejects.toThrow('La fecha del evento ya pasó');
    await expect(falla).rejects.toThrow(
      'Almuerzo o Cena, Estadía y Alimentación',
    );
  });

  it('«Sí, crear»: el cliente nuevo por el portero y la cotización por la puerta del formulario', async () => {
    const { servicio, repositorio, cotizaciones, clientes, bitacora } =
      armarServicio(cotizacion(), {
        tipo: 'cotizacion_nueva',
        quotation_id: null,
        huella_antes: 'nueva',
        despues: {
          cliente: {
            id: null,
            nombre: 'Ecofor',
            tipo: 'Empresas',
            nuevo: {
              name: 'Ecofor',
              client_type: 'Empresas',
              confirmado: false,
            },
          },
          dto: {
            event_type: 'Almuerzo o Cena',
            event_date: sumarDias(hoy, 10),
            request_type: RequestType.COTIZACION,
            total_amount: 460_000,
          },
        },
      });
    const r = await servicio.aplicar(camila(), 'p1');
    expect(clientes.crearDesdePantalla).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Ecofor', confirmado: false }),
      1,
    );
    expect(cotizaciones.create).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: 'c-nuevo' }),
      1,
      'perfil-1',
      expect.anything(),
    );
    expect(r).toMatchObject({ estado: 'aplicada', numero: 612 });
    expect(repositorio.moverPropuesta).toHaveBeenLastCalledWith(
      1,
      'p1',
      'aplicando',
      expect.objectContaining({ estado: 'aplicada', quotation_id: 'q-nueva' }),
    );
    expect(bitacora.crearComoBelia).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        quotation_id: 'q-nueva',
        note: expect.stringMatching(/^A pedido de.*: creó la cotización\./),
      }),
    );
    expect(bitacora.crearComoAsistente).not.toHaveBeenCalled();
  });
});
