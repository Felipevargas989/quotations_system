import { armarFoto } from '../../../generar/armar-foto';
import { catalogoComoTexto } from '../../../generar/catalogo';
import { avisosDeForma, tipoDeComida } from '../../../generar/forma-de-comida';
import {
  instrucciones,
  ofrecible,
  reglasDeArmado,
} from '../../../generar/reglas-valle-del-sol';
import type { CajaDelPlan, PlanDeLaIA } from '../../../generar/tipos';
import { catalogoDePrueba } from './catalogo-de-prueba';

// La forma de cada comida (Felipe, 17-10: "dos puntos de hidratación, dos
// principales, sin postre y sin guarnición… no tiene sentido") y el archivo
// único de reglas que leen el botón y la skill.

const cat = (nombre: string) =>
  catalogoDePrueba().categorias.find((c) => c.nombre === nombre)!;

describe('la forma de cada comida', () => {
  it('reconoce la comida, el desayuno y lo que no tiene forma pedida', () => {
    expect(tipoDeComida(cat('Cena'))).toBe('comida');
    expect(tipoDeComida(cat('Desayuno'))).toBe('desayuno');
    expect(tipoDeComida(cat('Servicios de Ingreso'))).toBeNull();
  });

  it('una cena con principal, guarnición y postre no tiene avisos', () => {
    expect(
      avisosDeForma(cat('Cena'), ['3001', '3002', '3003'], 'cena'),
    ).toEqual([]);
  });

  it('dos principales, sin guarnición ni postre: lo que vio Felipe en el lab', () => {
    expect(avisosDeForma(cat('Cena'), ['3001', '3004'], 'cena')).toEqual([
      'cena: trae 2 principales (la casa sirve uno).',
      'cena: no trae postre.',
    ]);
    expect(avisosDeForma(cat('Cena'), ['3001', '3003'], 'cena')).toEqual([
      'cena: el principal va sin guarnición.',
    ]);
  });

  it('un desayuno sin dulce se avisa', () => {
    expect(avisosDeForma(cat('Desayuno'), ['3101'], 'desayuno')).toEqual([
      'desayuno: no trae nada dulce.',
    ]);
  });

  it('el armado lleva los avisos, pero igual se puede guardar', () => {
    const caja: CajaDelPlan = {
      dia: 1,
      categoria: 'Cena',
      audiencia: 'adultos',
      personas: 41,
      menu_id: 0,
      servicios: [
        { id: 3001, cantidad: 1 },
        { id: 3004, cantidad: 1 },
      ],
    };
    const plan: PlanDeLaIA = {
      cajas: [caja],
      fijos: [],
      ultimo_dia: '',
      descuento_porcentaje: 0,
      presupuesto_cliente: { monto: 0, por: 'persona' },
      nota: 'ok',
    };
    const r = armarFoto(
      plan,
      catalogoDePrueba(),
      { fecha: '2026-12-20', personas: 41, ninos: 0, esTourOperador: false },
      ofrecible,
    );
    expect(r.ok).toBe(true);
    expect(r.ok && r.avisos).toEqual([
      'caja 1 (día 1, Cena): trae 2 principales (la casa sirve uno).',
      'caja 1 (día 1, Cena): no trae postre.',
    ]);
  });
});

describe('el catálogo por secciones y las reglas de la casa', () => {
  it('la IA ve qué plato es principal, guarnición o postre', () => {
    const t = catalogoComoTexto(catalogoDePrueba(), ofrecible);
    expect(t).toContain(
      '94 «Pollo arvejado - arroz» $10.900: Principales: Pollo arvejado; Guarniciones: Arroz primavera; Postres: Mousse de chocolate',
    );
    expect(t).toContain(
      '  Principales: 3001 «Pollo arvejado» $6.000 · 3004 «Plateada» $9.000',
    );
  });

  it('el botón lee el mismo archivo de reglas que la skill', () => {
    const reglas = reglasDeArmado();
    expect(reglas).toContain('# Reglas de armado de Valle del Sol');
    expect(reglas).toContain('## La forma de cada comida');
    expect(reglas).toContain('Los paquetes primero');
    expect(instrucciones()).toContain('QUÉ DEVUELVES');
    expect(instrucciones()).toContain('## Lecciones');
  });
});
