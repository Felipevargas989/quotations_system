import {
  CRITERIO_DE_LA_LEY,
  criteriosDeEvaluacion,
} from '../analisis/criterios-de-evaluacion';

// LOS CRITERIOS CON QUE SE EVALÚA (decisión 95): los de las bases o de la
// solicitud; en una compra ágil que no trae ninguno, el de la ley.

describe('los criterios de evaluación (decisión 95)', () => {
  const DEL_COMPRADOR = [
    { nombre: 'Precio', peso: '70%', como_se_evalua: 'menor precio' },
    { nombre: 'Plazo de entrega', peso: '30%', como_se_evalua: 'menor plazo' },
  ];

  it('si las bases o la solicitud traen criterios, son esos, sea licitación o compra ágil', () => {
    expect(criteriosDeEvaluacion(DEL_COMPRADOR, 'licitacion')).toEqual(
      DEL_COMPRADOR,
    );
    expect(criteriosDeEvaluacion(DEL_COMPRADOR, 'compra_agil')).toEqual(
      DEL_COMPRADOR,
    );
  });

  it('una compra ágil sin criterios lleva el de la ley; una licitación sin criterios, ninguno', () => {
    expect(criteriosDeEvaluacion([], 'compra_agil')).toEqual([
      CRITERIO_DE_LA_LEY,
    ]);
    expect(criteriosDeEvaluacion(undefined, 'compra_agil')).toEqual([
      CRITERIO_DE_LA_LEY,
    ]);
    expect(criteriosDeEvaluacion([], 'licitacion')).toEqual([]);
    expect(criteriosDeEvaluacion(null, undefined)).toEqual([]);
  });

  it('el de la ley: menor precio al 100%, la más económica que cumpla lo técnico, y si eligen otra lo justifican', () => {
    expect(CRITERIO_DE_LA_LEY).toMatchObject({
      nombre: 'Menor precio',
      peso: '100%',
      de_la_ley: true,
    });
    expect(CRITERIO_DE_LA_LEY.como_se_evalua).toContain(
      'gana la cotización más económica que cumpla los requisitos técnicos mínimos',
    );
    expect(CRITERIO_DE_LA_LEY.como_se_evalua).toContain('Directiva 35');
  });
});
