import 'reflect-metadata';
import { FacturacionModule } from '../facturacion.module';

/**
 * CADA PIEZA DE FACTURACIÓN RECIBE LAS QUE PIDE (doc 19 §9.45, 09-11-2026).
 *
 * Nest inyecta por la clase de cada parámetro del constructor. Si la clase
 * se trae con `import type`, al compilar queda como `Function` u `Object`,
 * Nest no sabe cuál es y, si el parámetro es `@Optional()`, llega vacío sin
 * avisar. Pasó dos veces: la caja no recibía las solicitudes (Felipe, 09-11:
 * dejó una solicitud y el cierre decía «Sin documentos»), y las boletas y
 * las facturas no recibían la caja (lo de recepción no entraba a su turno).
 * Las pruebas de cada servicio no lo ven, porque arman el servicio a mano.
 */
describe('Las piezas de Facturación se inyectan de verdad', () => {
  const piezas = [
    ...(Reflect.getMetadata('providers', FacturacionModule) as unknown[]),
    ...(Reflect.getMetadata('controllers', FacturacionModule) as unknown[]),
  ].filter((p): p is new (...a: never[]) => unknown => typeof p === 'function');

  it('el módulo tiene sus piezas', () => {
    expect(piezas.length).toBeGreaterThan(20);
  });

  it.each(piezas.map((p) => [p.name, p] as const))(
    '%s: ningún parámetro del constructor quedó sin su clase',
    (_nombre, pieza) => {
      const tipos = (Reflect.getMetadata('design:paramtypes', pieza) ??
        []) as unknown[];
      // Los que llevan `@Inject(token)` no dependen de la clase.
      const conToken = new Set(
        (
          (Reflect.getMetadata('self:paramtypes', pieza) ?? []) as {
            index: number;
          }[]
        ).map((x) => x.index),
      );
      const sinClase = tipos
        .map((t, i) => ({ t, i }))
        .filter(
          ({ t, i }) =>
            !conToken.has(i) &&
            (t === Object || t === Function || t === undefined),
        )
        .map(({ i }) => i);
      expect(sinClase).toEqual([]);
    },
  );
});
