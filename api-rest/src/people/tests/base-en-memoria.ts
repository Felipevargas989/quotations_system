/**
 * Lo justo de supabase-js para correr repositorios de verdad en las
 * pruebas: from → filtros → await. Sirve al candado y a la foto de lo
 * pagado (doc 10 §15).
 */
export type Fila = Record<string, unknown> & { id: number; company_id: number };

/** Lo justo de supabase-js para estas pruebas: from → filtros → await. */
export function baseEnMemoria(tablas: Record<string, Fila[]>) {
  let siguienteId = 9000;
  const consulta = (tabla: string) => {
    const filtros: ((f: Fila) => boolean)[] = [];
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let valores: Record<string, unknown> | Record<string, unknown>[] = {};
    let una: 'single' | 'maybe' | null = null;
    const filas = () => tablas[tabla] ?? (tablas[tabla] = []);
    const correr = () => {
      if (op === 'insert') {
        const nuevas = (valores as Record<string, unknown>[]).map(
          (v) => ({ id: siguienteId++, ...v }) as Fila,
        );
        filas().push(...nuevas);
        return una ? nuevas[0] : nuevas;
      }
      const elegidas = filas().filter((f) => filtros.every((p) => p(f)));
      if (op === 'update') {
        for (const f of elegidas) Object.assign(f, valores);
      }
      if (op === 'delete') {
        tablas[tabla] = filas().filter((f) => !elegidas.includes(f));
      }
      if (una) return elegidas[0] ?? null;
      return elegidas;
    };
    const q = {
      select: () => q,
      insert: (v: Record<string, unknown>[]) => (
        (op = 'insert'),
        (valores = v),
        q
      ),
      update: (v: Record<string, unknown>) => (
        (op = 'update'),
        (valores = v),
        q
      ),
      delete: () => ((op = 'delete'), q),
      eq: (c: string, v: unknown) => (filtros.push((f) => f[c] === v), q),
      in: (c: string, vs: unknown[]) => (
        filtros.push((f) => vs.includes(f[c])),
        q
      ),
      is: (c: string, v: unknown) => (
        filtros.push((f) => (f[c] ?? null) === v),
        q
      ),
      or: (expr: string) => {
        // «a.not.is.null,b.not.is.null» o «a.in.(1,2),b.in.(1,2)».
        const partes: string[] =
          expr.match(/[a-z_]+\.(?:not\.is\.null|in\.\([^)]*\))/g) ?? [];
        const pruebas = partes.map((p) => {
          const [col, resto] = [p.split('.')[0], p.slice(p.indexOf('.') + 1)];
          if (resto.startsWith('in.(')) {
            const vs = resto.slice(4, -1).split(',').map(Number);
            return (f: Fila) => vs.includes(Number(f[col]));
          }
          return (f: Fila) => f[col] != null;
        });
        filtros.push((f) => pruebas.some((t) => t(f)));
        return q;
      },
      not: (c: string, _op: string, v: unknown) => (
        filtros.push((f) => (f[c] ?? null) !== v),
        q
      ),
      gte: (c: string, v: string) => (
        filtros.push((f) => String(f[c]) >= v),
        q
      ),
      lte: (c: string, v: string) => (
        filtros.push((f) => String(f[c]) <= v),
        q
      ),
      order: () => q,
      limit: () => q,
      single: () => ((una = 'single'), q),
      maybeSingle: () => ((una = 'maybe'), q),
      then: (ok: (r: { data: unknown; error: null }) => unknown) =>
        Promise.resolve({ data: correr(), error: null }).then(ok),
    };
    return q;
  };
  return { client: { from: consulta } };
}
