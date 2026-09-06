import {
  correoDeCotizacion,
  reparosDelPortero,
  totalesDeCotizacion,
} from '../../correo-cotizacion';
import type { Quotation } from '../../entities/quotation.entity';
import {
  firmarTokenImpresion,
  validarTokenImpresion,
  VIDA_DEL_TOKEN_MS,
} from '../../firma-impresion';

// El correo tipo de "Enviar cotización" (doc 13): el portero, la
// matemática calcada de la hoja y las reglas de la skill hechas código.

const base = (sobre?: Partial<Quotation>): Quotation =>
  ({
    id: 'q-1',
    quotation_number: 42,
    people_count: 100,
    children_count: 0,
    event_type: 'Matrimonio',
    event_date: '2026-03-14',
    created_at: '2026-02-01',
    // 100 personas × $20.000 + $500.000 fijo = $2.500.000 (IVA incluido)
    total_amount: 2_500_000,
    subtotal_amount: 2_500_000,
    tip_percentage: null,
    contact_name: 'maría josé pérez',
    client_id: 'cli-1',
    company_id: 1,
    items: {
      variable_services: [
        {
          category: 'Menú adulto',
          items: [
            { codigo: 'M1', nombre: 'Menú', precio: 20_000, quantity: 1 },
          ],
        },
      ] as Quotation['items']['variable_services'],
      fixed_services: [
        { nombre: 'Arriendo del salón', precio: 500_000, quantity: 1 },
      ] as Quotation['items']['fixed_services'],
    },
    clients: { name: 'Colegio San Pedro' },
    ...sobre,
  }) as unknown as Quotation;

describe('el portero del envío', () => {
  it('sin reparos con una cotización sana y correo de destino', () => {
    expect(reparosDelPortero(base(), 'ana@x.cl')).toEqual([]);
  });

  it('frena sin correo, con total $0 y con servicios en $0', () => {
    expect(reparosDelPortero(base(), null)[0]).toContain('correo');
    expect(
      reparosDelPortero(base({ total_amount: 0 }), 'ana@x.cl')[0],
    ).toContain('total $0');
    const conCero = base();
    conCero.items.fixed_services[0].precio = 0;
    const reparos = reparosDelPortero(conCero, 'ana@x.cl');
    expect(reparos[0]).toContain('Arriendo del salón');
  });
});

describe('la matemática de la hoja, calcada', () => {
  it('neto + IVA = total con IVA', () => {
    const t = totalesDeCotizacion(base());
    expect(t.neto + t.iva).toBe(t.totalConIva);
    expect(t.totalConIva).toBe(2_500_000);
    expect(t.neto).toBe(Math.round(2_500_000 / 1.19));
  });

  it('la propina se descuenta del total antes del IVA, como la hoja', () => {
    // Variables: 100 × $20.000 = $2.000.000; propina 10% = $200.000.
    const t = totalesDeCotizacion(
      base({ tip_percentage: 10, total_amount: 2_700_000 }),
    );
    expect(t.propina).toBe(200_000);
    expect(t.totalConIva).toBe(2_500_000);
  });
});

describe('el correo tipo', () => {
  const MARCA = {
    nombre: 'Valle del Sol',
    colorPrimario: '#1e3a2f',
    colorSecundario: '#ede8dc',
  };
  const { asunto, cuerpoHtml } = correoDeCotizacion(
    base(),
    MARCA,
    'maría josé pérez',
  );

  it('asunto con evento, cliente y fecha con día de semana calculado', () => {
    expect(asunto).toBe(
      'Cotización Matrimonio Colegio San Pedro — sábado 14 de marzo de 2026',
    );
  });

  it('saludo con el primer nombre, en mayúscula', () => {
    expect(cuerpoHtml).toContain('Hola María:');
  });

  it('la estructura de la hoja: valor por persona, subtotales y TOTAL', () => {
    // 100 adultos × $20.000: la fila resumida, no el grupo suelto.
    expect(cuerpoHtml).toContain('Valor por persona');
    expect(cuerpoHtml).toContain('ADULTOS');
    expect(cuerpoHtml).toContain('100 personas');
    expect(cuerpoHtml).toContain('$20.000');
    expect(cuerpoHtml).toContain('Subtotal alimentación');
    expect(cuerpoHtml).toContain('$2.000.000');
    expect(cuerpoHtml).toContain('Arriendo del salón');
    expect(cuerpoHtml).toContain('Subtotal servicios fijos');
    expect(cuerpoHtml).toContain('$500.000');
    expect(cuerpoHtml).toContain('Neto');
    expect(cuerpoHtml).toContain('IVA (19%)');
    expect(cuerpoHtml).toContain('TOTAL');
    expect(cuerpoHtml).toContain('$2.500.000');
    // La franja del secundario y la barra del primario, como la hoja.
    expect(cuerpoHtml).toContain('#ede8dc');
    expect(cuerpoHtml).toContain('#1e3a2f');
  });

  it('con propina: Total con IVA + propina + TOTAL, como la hoja', () => {
    const conPropina = correoDeCotizacion(
      base({ tip_percentage: 10, total_amount: 2_700_000 }),
      MARCA,
      'Ana',
    ).cuerpoHtml;
    expect(conPropina).toContain('Total con IVA');
    expect(conPropina).toContain('Propina sugerida (10% alimentación)');
    expect(conPropina).toContain('$2.700.000');
  });

  it('el reenvío cambia el asunto y cada correo lleva su sello de versión', () => {
    // Contra el "..." de Gmail (05-09): asunto propio para el reenvío
    // y un sello con fecha y hora que hace único cada correo.
    const enviadoEl = new Date('2026-09-06T17:32:00Z'); // 14:32 en Chile
    const r = correoDeCotizacion(base(), MARCA, 'Ana', 2, enviadoEl);
    expect(r.asunto).toBe(
      'Cotización actualizada Matrimonio Colegio San Pedro — sábado 14 de marzo de 2026 (v2)',
    );
    expect(r.cuerpoHtml).toContain('Hemos actualizado tu cotización');
    expect(r.cuerpoHtml).toContain(
      'Versión enviada el domingo 6 de septiembre de 2026 a las 14:32 h',
    );
    // La primera vez también lleva el sello (el tercer envío contra el
    // segundo serían idénticos sin él).
    expect(cuerpoHtml).toContain('Versión enviada el');
  });

  it('sin guion largo ni promesas de bloqueo en el cuerpo', () => {
    expect(cuerpoHtml).not.toContain('—');
    expect(cuerpoHtml.toLowerCase()).not.toContain('bloquea');
    expect(cuerpoHtml.toLowerCase()).not.toContain('no dudes');
  });
});

describe('el token de impresión', () => {
  const ahora = 1_700_000_000_000;

  it('firma y valida dentro de su vida útil', () => {
    const token = firmarTokenImpresion('q-9', 'secreto', ahora);
    expect(validarTokenImpresion(token, 'secreto', ahora + 60_000)).toBe('q-9');
  });

  it('vencido o adulterado devuelve null', () => {
    const token = firmarTokenImpresion('q-9', 'secreto', ahora);
    expect(
      validarTokenImpresion(token, 'secreto', ahora + VIDA_DEL_TOKEN_MS + 1),
    ).toBeNull();
    expect(validarTokenImpresion(token, 'otro-secreto', ahora)).toBeNull();
    expect(validarTokenImpresion('basura.mal', 'secreto', ahora)).toBeNull();
    expect(validarTokenImpresion('', 'secreto', ahora)).toBeNull();
  });
});
