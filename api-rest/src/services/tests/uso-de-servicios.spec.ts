import { ServicesRepository } from '../services.repository';

// LAS DOS LLAVES DE UN SERVICIO EN LAS COTIZACIONES (13-08-2026).
//
// Bajo "codigo" las cotizaciones guardan dos cosas distintas: las
// nuevas anotan el ID del servicio ("2042") y las viejas anotaron el
// código del catálogo ("SF008"). Medido en producción: de 424
// referencias vivas, 120 calzan por id y 42 por código.
//
// Buscar solo por id dejaba borrar servicios que SÍ aparecen en
// cotizaciones antiguas (pillada de Felipe con "Bollería variedades").
// Estas pruebas fijan que se miren las DOS.
// La forma del filtro que arma el repositorio, para no leer a ciegas.
type FiltroContains = {
  fixed_services?: { codigo?: string }[];
  variable_services?: { items?: { codigo?: string }[] }[];
};

describe('Uso de servicios: se miran el id y el código', () => {
  // Doble de Supabase: devuelve un conteo distinto según qué "codigo"
  // se busque, para poder afirmar que se consultaron ambos.
  const armar = (conteos: Record<string, number>, code: string | null) => {
    const buscados: string[] = [];
    const cadena = () => {
      const c: Record<string, unknown> = {
        select: jest.fn(() => c),
        eq: jest.fn(() => c),
        maybeSingle: jest
          .fn()
          .mockResolvedValue({ data: { code }, error: null }),
        contains: jest.fn((_col: string, filtro: FiltroContains) => {
          const codigo =
            filtro.fixed_services?.[0]?.codigo ??
            filtro.variable_services?.[0]?.items?.[0]?.codigo;
          buscados.push(String(codigo));
          return Promise.resolve({ count: conteos[String(codigo)] ?? 0 });
        }),
      };
      return c;
    };
    const client = { from: jest.fn(() => cadena()) };
    const repo = new ServicesRepository(
      { client } as never,
      { setContext: jest.fn(), info: jest.fn(), error: jest.fn() } as never,
    );
    return { repo, buscados };
  };

  describe('servicio VARIABLE', () => {
    it('lo detecta cuando la cotización lo anotó por ID', async () => {
      const { repo } = armar({ '2042': 28 }, '10');
      const uso = await repo.variableServiceUsage(1, 2042);
      expect(uso.cotizaciones).toBe(28);
    });

    it('lo detecta cuando la cotización lo anotó por CÓDIGO', async () => {
      // El caso que se escapaba: id sin apariciones, código con 5.
      const { repo } = armar({ '10': 5 }, '10');
      const uso = await repo.variableServiceUsage(1, 2042);
      expect(uso.cotizaciones).toBe(5);
    });

    it('consulta LAS DOS llaves, no una', async () => {
      const { repo, buscados } = armar({}, 'P015');
      await repo.variableServiceUsage(1, 1758);
      expect(buscados.sort()).toEqual(['1758', 'P015']);
    });

    it('no suma dos veces si aparece por ambas: manda la mayor', async () => {
      const { repo } = armar({ '2042': 28, '10': 5 }, '10');
      const uso = await repo.variableServiceUsage(1, 2042);
      expect(uso.cotizaciones).toBe(28);
    });

    it('sin código en el catálogo, igual busca por id', async () => {
      const { repo, buscados } = armar({ '2042': 3 }, null);
      const uso = await repo.variableServiceUsage(1, 2042);
      expect(buscados).toEqual(['2042']);
      expect(uso.cotizaciones).toBe(3);
    });

    it('un servicio libre queda en cero (se puede borrar)', async () => {
      const { repo } = armar({}, 'X1');
      const uso = await repo.variableServiceUsage(1, 999);
      expect(uso.cotizaciones).toBe(0);
    });
  });

  describe('servicio FIJO', () => {
    it('lo detecta por CÓDIGO (el caso de "Sillas Chivari")', async () => {
      const { repo } = armar({ SF008: 12 }, 'SF008');
      expect(await repo.fixedServiceUsage(1, 48)).toBe(12);
    });

    it('lo detecta por ID', async () => {
      const { repo } = armar({ '48': 7 }, 'SF008');
      expect(await repo.fixedServiceUsage(1, 48)).toBe(7);
    });

    it('consulta las dos llaves', async () => {
      const { repo, buscados } = armar({}, 'SF008');
      await repo.fixedServiceUsage(1, 48);
      expect(buscados.sort()).toEqual(['48', 'SF008']);
    });
  });
});
