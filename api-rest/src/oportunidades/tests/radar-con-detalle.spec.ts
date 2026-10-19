import { LECTURA_ACTUAL } from '../lectura/lectura.service';
import { armar } from './radar-de-prueba';

// LAS COMPRAS ÁGILES EN AMARILLO, CON SU DETALLE (la A; Felipe, 18-10:
// "corramos a, b, c y d"). El radar va con todo de mentira.

afterEach(() => jest.restoreAllMocks());

describe('RadarService — compras ágiles en amarillo, con su detalle (la A, 18-10)', () => {
  const ITEM = {
    codigo: 'CA-9',
    nombre: 'SERVICIO DE CATERING',
    organismo: 'I. MUNICIPALIDAD DE BULNES',
    region: 'Región del Ñuble',
    monto_disponible: 1_000_000,
    fecha_cierre: '2026-10-25T15:00:00',
  };

  it('pide el detalle de la que quedó en amarillo sin descripción, guarda el proceso completo y la relee', async () => {
    const { radar, repo, mp, lectura } = armar();
    repo.comprasAgilesSinDetalle.mockResolvedValue([
      { codigo: 'CA-9', item: ITEM },
    ]);
    mp.detalleCompraAgil.mockResolvedValue({
      descripcion:
        'Catering para 80 personas en el salón que proponga el oferente',
      productos: [{ nombre: 'Almuerzo', descripcion: 'Menú de tres tiempos' }],
    });
    lectura.leer.mockResolvedValue({
      semaforo: 'verde',
      etiquetas: ['alimentacion'],
      se_hace_en_el_complejo: 'si',
      razon: 'El lugar lo propone el oferente.',
    });

    const resumen = await radar.correr('reloj');

    expect(mp.detalleCompraAgil).toHaveBeenCalledWith('CA-9');
    expect(repo.guardarProcesos).toHaveBeenCalledWith([
      expect.objectContaining({ codigo: 'CA-9', tipo: 'compra_agil' }),
    ]);
    expect(lectura.leer).toHaveBeenCalledWith(
      expect.objectContaining({ codigo: 'CA-9' }),
      expect.anything(),
      expect.anything(),
    );
    expect(repo.guardarLectura).toHaveBeenCalledWith(
      1,
      'CA-9',
      expect.objectContaining({ semaforo: 'verde' }),
      LECTURA_ACTUAL,
      true,
    );
    expect(resumen?.lectura.con_detalle).toBe(1);
  });

  it('si Mercado Público no trae el detalle, no se relee y no se vuelve a pedir en la misma vida del motor', async () => {
    const { radar, repo, mp, lectura } = armar();
    repo.comprasAgilesSinDetalle.mockResolvedValue([
      { codigo: 'CA-9', item: ITEM },
    ]);
    mp.detalleCompraAgil.mockResolvedValue(null);

    await radar.correr('reloj');
    await radar.correr('reloj');

    expect(mp.detalleCompraAgil).toHaveBeenCalledTimes(1);
    expect(lectura.leer).not.toHaveBeenCalledWith(
      expect.objectContaining({ codigo: 'CA-9' }),
      expect.anything(),
      expect.anything(),
    );
  });
});
