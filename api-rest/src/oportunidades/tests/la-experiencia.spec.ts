import type { EventoDeEventia } from '../eventia/eventia.repository';
import type { RespaldoDePostVenta } from '../oferente/respaldos-de-post-venta';
import {
  type Candidata,
  candidatasDeEventia,
  candidatasDeMiEmpresa,
  confirmadaDelTrabajo,
  experienciaDeLosAnexos,
  leerEleccion,
  MAX_SIN_RESPALDO,
  pidenExperiencia,
  respaldosDeLaExperiencia,
  sePuedeMostrar,
  textoDeLaCandidata,
  textoDeLasBases,
} from '../postulacion/la-experiencia';

// LA EXPERIENCIA QUE SE PRESENTA (decisión 76, 24-10): las reglas sin IA.
// Felipe: "en mi empresa debería solo estar la experiencia en mercado
// público, el resto todo de la base de Eventia"; "todo lo que sea
// municipalidad es correcto... CCU es buena opción porque es un cliente
// fidelizado... Fepasa no tanto, prefiero esconderlo"; "la IA no debe solo
// juntar facturas si no cumplir con lo que las bases dicen".

const evento = (
  numero: number,
  extra: Partial<EventoDeEventia> = {},
): EventoDeEventia => ({
  numero,
  tipo: 'Paseo fin de año',
  fecha: '2025-12-07',
  personas: 320,
  monto: 15_299_408,
  cliente: 'CCU',
  fijos: [],
  ...extra,
});

const leido = (
  numero: string,
  e: number,
  extra: Partial<RespaldoDePostVenta> = {},
): RespaldoDePostVenta => ({
  numero,
  mandante: 'Comercial CCU S.A.',
  contrato: 'Segundo pago Navidad 2025',
  anio: 2025,
  monto: 11_292_880,
  fuente: 'manual',
  evento: e,
  archivo: `Factura ${numero}.pdf`,
  ruta: `c1/event-documents/q-${e}/facturas/x_${numero}.pdf`,
  bytes: 900,
  ...extra,
});

describe('A quién se puede mostrar', () => {
  it('los públicos siempre, los particulares nunca y los demás solo si están en la lista', () => {
    const lista = ['cliente-ccu', 'cliente-barbara'];
    expect(sePuedeMostrar({ id: 'x', tipo: 'Empresas Publicas' }, [])).toBe(
      true,
    );
    expect(
      sePuedeMostrar({ id: 'cliente-barbara', tipo: 'Particulares' }, lista),
    ).toBe(false);
    expect(sePuedeMostrar({ id: 'cliente-ccu', tipo: 'Empresas' }, lista)).toBe(
      true,
    );
    expect(
      sePuedeMostrar({ id: 'cliente-fepasa', tipo: 'Empresas' }, lista),
    ).toBe(false);
    // Sin tipo ni cliente no se sabe: no se muestra.
    expect(sePuedeMostrar({}, lista)).toBe(false);
  });
});

describe('Las candidatas', () => {
  it('de «Mi empresa», solo las órdenes de Mercado Público, sin las «No usar» y sin repetir', () => {
    const c = candidatasDeMiEmpresa([
      {
        numero: '4366-146-SE23',
        mandante: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
        contrato: 'SERV. ARRIENDO ESPACIOS Y ALIMENTACIÓN',
        anio: 2023,
        monto: 16_500_000,
        fuente: 'mercado_publico',
        archivo: 'OC 4366-146-SE23.pdf',
      },
      {
        numero: '5040-536-SE23',
        mandante: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
        contrato: 'Personas mayores',
        anio: 2023,
        monto: 4_760_000,
        fuente: 'mercado_publico',
        archivo: 'Orden de compra - 5040-536-SE23.pdf',
      },
      // La misma orden subida otra vez (Felipe, 24-10).
      {
        numero: '5040-536-se23',
        mandante: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
        contrato: 'Personas mayores',
        anio: 2023,
        monto: 4_760_000,
        fuente: 'mercado_publico',
        archivo: '5040-536-SE23.pdf',
      },
      {
        numero: '260',
        mandante: 'Comercial CCU S.A.',
        contrato: 'Navidad',
        anio: 2025,
        monto: 11_292_880,
        fuente: 'manual',
        archivo: 'Factura 260.pdf',
      },
      {
        numero: '1213301-49-AG26',
        mandante: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
        contrato: 'Foros',
        anio: 2026,
        monto: 2_480_000,
        fuente: 'mercado_publico',
        no_usar: true,
        archivo: 'OC 1213301-49-AG26.pdf',
      },
    ]);
    expect(c.map((x) => x.clave)).toEqual([
      'mp:4366-146-SE23',
      'mp:5040-536-SE23',
    ]);
    expect(c[0]).toMatchObject({
      de: 'mi_empresa',
      con_respaldo: true,
      fuente: 'mercado_publico',
      archivo: 'OC 4366-146-SE23.pdf',
    });
  });

  it('de Eventia: con su factura leída, o sin ella para decir cuál subir; el que tiene documentos sin leer no se repite', () => {
    const c = candidatasDeEventia(
      [
        evento(118, {
          que_se_sirvio: ['Lomo liso', 'Papas rústicas'],
          fijos: ['Salón Cúpula'],
        }),
        // Sus documentos ya están en «Mi empresa»: no se repite.
        evento(415, {
          cliente: 'Municipalidad de Quillón',
          monto: 1_240_000,
        }),
        evento(236, { monto: 10_952_736, personas: 271 }),
      ],
      [leido('260', 118)],
      new Set([118, 415]),
    );
    expect(c.map((x) => [x.clave, x.con_respaldo])).toEqual([
      ['ev:118', true],
      ['ev:236', false],
    ]);
    expect(c[0]).toMatchObject({
      de: 'eventia',
      numero: '260',
      monto: 11_292_880,
      evento: 118,
      archivo: 'Factura 260.pdf',
      ruta: 'c1/event-documents/q-118/facturas/x_260.pdf',
      que_fue:
        'Paseo fin de año · 320 personas · se sirvió: Lomo liso, Papas rústicas · fijos: Salón Cúpula',
    });
    expect(c[1]).toMatchObject({
      numero: null,
      monto: 10_952_736,
      anio: 2025,
      archivo: null,
    });
    expect(textoDeLaCandidata(c[1])).toBe(
      '- [ev:236] · Eventia, evento N° 236 · CCU · Paseo fin de año · 2025 · $10.952.736 con impuestos · SIN FACTURA SUBIDA · fue: Paseo fin de año · 271 personas',
    );
  });

  it('sin factura, solo las más grandes', () => {
    const muchos = Array.from({ length: MAX_SIN_RESPALDO + 5 }, (_, i) =>
      evento(1000 + i, { monto: (i + 1) * 100_000 }),
    );
    const c = candidatasDeEventia(muchos, [], new Set());
    expect(c).toHaveLength(MAX_SIN_RESPALDO);
    expect(c[0].evento).toBe(1000 + MAX_SIN_RESPALDO + 4);
  });
});

describe('Lo que dicen las bases', () => {
  it('¿piden experiencia? Por los requisitos o los formularios que aplican', () => {
    expect(
      pidenExperiencia({ requisitos: [{ que: 'Acreditar experiencia' }] }),
    ).toBe(true);
    expect(
      pidenExperiencia({
        formularios: [{ nombre: 'Formulario N°3 Experiencia', aplica: false }],
      }),
    ).toBe(false);
    expect(pidenExperiencia(null)).toBe(false);
  });

  it('a la IA le llega lo que se licita y todo lo que piden de la experiencia', () => {
    const texto = textoDeLasBases({
      resumen: 'Día de Campo del Dirigente Social 2026 para 550 dirigentes.',
      personas: 550,
      fecha_del_servicio: 'Jueves 26 de noviembre de 2026',
      criterios: [
        {
          nombre: 'Experiencia del oferente',
          peso: '20%',
          como_se_evalua:
            'Cuenta los contratos similares de los últimos 4 años: 6 o más = 100.',
        },
        { nombre: 'Precio', peso: '30%', como_se_evalua: 'Menor precio.' },
      ],
      requisitos: [
        { que: 'Formulario N°3 Experiencia, con órdenes de compra o facturas' },
        { que: 'Patente municipal' },
      ],
    });
    expect(texto).toContain('Resumen: Día de Campo del Dirigente Social 2026');
    expect(texto).toContain('Personas: 550');
    expect(texto).toContain(
      '- Criterio «Experiencia del oferente» (20%): Cuenta los contratos similares de los últimos 4 años: 6 o más = 100.',
    );
    expect(texto).toContain(
      '- Formulario N°3 Experiencia, con órdenes de compra o facturas',
    );
    expect(texto).not.toContain('Patente');
    expect(texto).not.toContain('Precio');
  });
});

describe('Lo que devuelve la IA, revisado', () => {
  const candidatas: Candidata[] = [
    ...candidatasDeEventia(
      [evento(118), evento(236, { monto: 10_952_736 })],
      [leido('260', 118)],
      new Set([118]),
    ),
  ];

  it('solo claves de la lista, sin repetir; elegidas con respaldo y faltan sin él', () => {
    const e = leerEleccion(
      {
        pide: 6,
        periodo: 'los últimos 4 años',
        condiciones: 'Contratos similares con orden de compra o factura.',
        elegidas: [
          { clave: 'ev:118', por_que: 'Paseo con almuerzo para 320' },
          { clave: 'ev:118', por_que: 'repetida' },
          { clave: 'ev:999', por_que: 'inventada' },
          { clave: 'ev:236', por_que: 'sin factura: no puede ir' },
        ],
        faltan: [{ clave: 'ev:236', por_que: 'Paseo para 271 personas' }],
        nota: 'Faltan 5 para el puntaje máximo.',
      },
      candidatas,
    );
    expect(e.pide).toBe(6);
    expect(e.elegidas.map((c) => [c.clave, c.por_que])).toEqual([
      ['ev:118', 'Paseo con almuerzo para 320'],
    ]);
    expect(e.faltan.map((c) => c.clave)).toEqual(['ev:236']);
    expect(e.nota).toBe('Faltan 5 para el puntaje máximo.');
  });

  it('un «pide» raro queda en 0', () => {
    expect(leerEleccion({ pide: -3 }, candidatas).pide).toBe(0);
    expect(leerEleccion({ pide: 'seis' }, candidatas).pide).toBe(0);
  });
});

describe('Lo confirmado', () => {
  const fila = {
    clave: 'ev:118',
    de: 'eventia',
    con_respaldo: true,
    numero: '260',
    mandante: 'Comercial CCU S.A.',
    contrato: 'Segundo pago',
    anio: 2025,
    monto: 11_292_880,
    fuente: 'manual',
    evento: 118,
    archivo: 'Factura 260.pdf',
    ruta: 'c1/event-documents/q-118/facturas/x_260.pdf',
    bytes: 900,
  };

  it('solo cuenta si está lista y confirmada; una ruta de otra empresa no pasa', () => {
    expect(
      confirmadaDelTrabajo(
        { estado: 'listo', resultado: { elegidas: [fila] } },
        1,
      ),
    ).toBeNull();
    expect(
      confirmadaDelTrabajo(
        {
          estado: 'procesando',
          resultado: { elegidas: [fila], confirmada: true },
        },
        1,
      ),
    ).toBeNull();
    const ajena = { ...fila, clave: 'ev:7', ruta: 'c9/event-documents/x.pdf' };
    const c = confirmadaDelTrabajo(
      {
        estado: 'listo',
        resultado: { elegidas: [fila, ajena], confirmada: true },
      },
      1,
    );
    expect(c?.filas.map((f) => f.clave)).toEqual(['ev:118']);
    // Confirmada sin ninguna: también es una decisión.
    expect(
      confirmadaDelTrabajo(
        { estado: 'listo', resultado: { elegidas: [], confirmada: true } },
        1,
      ),
    ).toEqual({ confirmada: true, filas: [] });
  });

  it('se lee igual desde los anexos y las de Eventia pasan al ZIP como respaldos de Post-venta', () => {
    const e = experienciaDeLosAnexos(
      { experiencia: { confirmada: true, filas: [fila] } },
      1,
    );
    expect(e?.filas).toHaveLength(1);
    expect(experienciaDeLosAnexos({ post_venta: [] }, 1)).toBeNull();
    expect(respaldosDeLaExperiencia(e!)).toEqual([
      {
        numero: '260',
        mandante: 'Comercial CCU S.A.',
        contrato: 'Segundo pago',
        anio: 2025,
        monto: 11_292_880,
        fuente: 'manual',
        evento: 118,
        archivo: 'Factura 260.pdf',
        ruta: 'c1/event-documents/q-118/facturas/x_260.pdf',
        bytes: 900,
      },
    ]);
  });
});
