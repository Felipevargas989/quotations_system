import { bajarActa, leerActa } from '../historia/acta';
import { ACTA_DE_PRUEBA } from './acta-de-prueba';

// EL ACTA PÚBLICA DE ADJUDICACIÓN (decisión 30 del doc 17, 19-10). La
// página de prueba copia la forma del acta real (los ids de cada campo),
// con datos inventados.

describe('El acta pública de adjudicación', () => {
  it('lee cada ítem con todas sus ofertas: quién, qué ofreció, a qué precio y si ganó', () => {
    expect(leerActa(ACTA_DE_PRUEBA)).toEqual({
      informada: '05/11/2026 10:12',
      monto_adjudicado: 56_034_300,
      items: [
        {
          numero: 1,
          producto: 'Servicios de viajes',
          especificacion:
            'Gira de estudio 4° medio: Pucón y Valdivia, 5 días, 45 alumnos & 3 profesores',
          cantidad: 1,
          ofertas: [
            {
              rut: '76.123.456-7',
              proveedor: 'TURISMO DEL SUR LIMITADA',
              detalle: 'Bus, alojamiento en hostal y alimentación completa',
              precio_unitario: 56_034_300,
              cantidad_adjudicada: 1,
              total_adjudicado: 56_034_300,
              adjudicada: true,
            },
            {
              rut: '77.987.654-K',
              proveedor: 'VIAJES ANDINOS SPA',
              detalle: 'Programa en Pucón con excursiones',
              precio_unitario: 61_500_000,
              cantidad_adjudicada: 0,
              total_adjudicado: 0,
              adjudicada: false,
            },
          ],
        },
      ],
    });
  });

  it('una página que no es un acta no trae ítems', () => {
    expect(leerActa('<html><body>Mantención</body></html>')).toEqual({
      informada: null,
      monto_adjudicado: null,
      items: [],
    });
  });

  it('solo va a buscar actas de Mercado Público', async () => {
    await expect(bajarActa('https://evil.example.com/acta')).rejects.toThrow(
      'no es de Mercado Público',
    );
    await expect(
      bajarActa(
        'http://www.mercadopublico.cl/Procurement/Modules/RFB/Other.aspx?qs=x',
      ),
    ).rejects.toThrow('no es de Mercado Público');
  });
});
