import { OPERATIONS_AND_UP } from 'src/auth/roles.decorator';
import {
  ErrorDeHerramienta,
  conDia,
  diaDelEvento,
  enlaceDe,
  fechaEnChile,
  pesos,
  texto,
  type Herramienta,
} from './comun';
import { tiposPara } from './recepcion';

// «¿En qué productos uso el choclo granado?», «¿a quién le compro la
// carne?», «¿cuántas sillas tenemos?». Proveedores, insumos, recetas y
// mobiliario: es de operaciones para arriba (SECTION_ROLES.logistics) con
// el derecho del plan `logistica`.
//
// Lo que necesita cada evento lo trae `lo_que_hay_que_comprar`
// (compras.ts), con la misma cuenta de Compras (03-11-2026).

const UNIDAD: Record<string, string> = {
  masa: 'kg',
  volumen: 'L',
  unidad: 'u',
};

const n = (v: unknown): number => Number(v) || 0;

export const insumos: Herramienta = {
  nombre: 'insumos',
  descripcion:
    'Un insumo de la despensa (carne mechada, choclo granado…): su precio y proveedor, en qué ' +
    'productos del catálogo va (la receta, con cuánto por persona) y lo que ya se compró para ' +
    'cada evento. Lo que necesitan los eventos que vienen lo trae lo_que_hay_que_comprar. ' +
    'Eventia no lleva el stock de bodega de los insumos.',
  esquema: {
    type: 'object',
    properties: {
      texto: { type: 'string', description: 'Parte del nombre del insumo.' },
    },
    required: ['texto'],
  },
  cargos: OPERATIONS_AND_UP,
  permiso: ['proveedores'],
  derecho: 'logistica',
  async ejecutar(entrada, ctx) {
    const buscado = texto(entrada.texto, 80);
    if (!buscado || buscado.length < 2) {
      throw new ErrorDeHerramienta(
        'Falta el insumo (dos letras por lo menos).',
      );
    }
    const empresa = ctx.usuario.company_id;
    const encontrados = await ctx.repositorio.insumos(empresa, buscado);
    if (encontrados.length === 0) {
      return {
        encontrados: 0,
        nota: `No hay ningún insumo que se llame «${buscado}».`,
      };
    }
    const usos = await ctx.repositorio.usosDeInsumos(
      empresa,
      encontrados.map((i) => i.id),
    );
    const { recetas } = usos;
    // Las compras de los eventos de un tipo de cliente que su cargo no
    // trabaja no aparecen (doc 22 §9, tanda 3).
    const tipos = await tiposPara(ctx);
    const compras =
      tipos && ctx.alcance
        ? await ctx.alcance.soloLasQueVe(
            ctx.usuario,
            usos.compras,
            (c) => c.quotations?.id,
          )
        : usos.compras;
    const nombres = await ctx.repositorio.nombresDeProductos(
      empresa,
      recetas
        .filter((r) => r.service_type === 'variable')
        .map((r) => r.service_id),
      recetas
        .filter((r) => r.service_type === 'fixed')
        .map((r) => r.service_id),
    );
    return {
      ...(tipos ? { trabaja: true as const } : {}),
      encontrados: encontrados.length,
      insumos: encontrados.map((i) => {
        const unidad = UNIDAD[i.unit_family ?? ''] ?? i.unit_family ?? '';
        return {
          nombre: i.name,
          precio: i.price != null ? `${pesos(i.price)} por ${unidad}` : null,
          proveedor: i.suppliers?.name ?? null,
          va_en: recetas
            .filter((r) => r.supply_id === i.id)
            .map((r) => ({
              producto:
                (r.service_type === 'fixed'
                  ? nombres.fijos.get(Number(r.service_id))
                  : nombres.variables.get(Number(r.service_id))) ??
                '(producto que ya no está en el catálogo)',
              tipo: r.service_type === 'fixed' ? 'fijo' : 'por persona',
              cantidad:
                r.qty_per_person != null
                  ? `${n(r.qty_per_person)} ${r.unit ?? unidad} por persona`
                  : undefined,
            })),
          compras_registradas: compras
            .filter((c) => c.supply_id === i.id)
            .slice(0, 10)
            .map((c) => ({
              numero: c.quotations?.quotation_number ?? null,
              enlace: c.quotations
                ? enlaceDe(c.quotations, ctx.usuario.role)
                : undefined,
              cliente: c.quotations?.clients?.name ?? null,
              evento: conDia(diaDelEvento(c.quotations?.event_date)),
              cantidad: `${n(c.qty_base)} ${unidad}`,
              costo: pesos(c.cost),
              proveedor: c.supplier_name ?? undefined,
              comprado: c.provisioned_at
                ? fechaEnChile(c.provisioned_at)
                : undefined,
            })),
        };
      }),
    };
  },
};

export const proveedores: Herramienta = {
  nombre: 'proveedores',
  descripcion:
    'Los proveedores activos (todos, o los que calzan con un nombre): contacto, teléfono, ' +
    'notas y los insumos que se les compran, con su precio.',
  esquema: {
    type: 'object',
    properties: {
      texto: {
        type: 'string',
        description: 'Parte del nombre del proveedor (opcional).',
      },
    },
  },
  cargos: OPERATIONS_AND_UP,
  permiso: ['proveedores'],
  derecho: 'logistica',
  // Lo que se le compra a cada proveedor, no plata de un cliente (doc 22 §9).
  plataLibre: true,
  async ejecutar(entrada, ctx) {
    const { proveedores: lista, insumos: suyos } =
      await ctx.repositorio.proveedores(
        ctx.usuario.company_id,
        texto(entrada.texto, 80),
      );
    return {
      encontrados: lista.length,
      proveedores: lista.map((p) => {
        const de = suyos.filter((i) => i.supplier_id === p.id);
        return {
          nombre: p.name,
          contacto: p.contact_name ?? undefined,
          telefono: p.phone ?? undefined,
          notas: p.notes ?? undefined,
          insumos: de.slice(0, 15).map((i) => ({
            nombre: i.name,
            precio:
              i.price != null
                ? `${pesos(i.price)} por ${UNIDAD[i.unit_family ?? ''] ?? i.unit_family ?? ''}`
                : undefined,
          })),
          insumos_en_total: de.length,
        };
      }),
    };
  },
};

export const mobiliario: Herramienta = {
  nombre: 'mobiliario',
  descripcion:
    'El mobiliario y su stock (sillas, mesas, toldos…), todo o lo que calza con un nombre. ' +
    'Es el único stock que lleva Eventia.',
  esquema: {
    type: 'object',
    properties: {
      texto: { type: 'string', description: 'Parte del nombre (opcional).' },
    },
  },
  cargos: OPERATIONS_AND_UP,
  permiso: ['proveedores'],
  derecho: 'logistica',
  // Precios del mobiliario, no plata de un cliente (doc 22 §9).
  plataLibre: true,
  async ejecutar(entrada, ctx) {
    const muebles = await ctx.repositorio.mobiliario(
      ctx.usuario.company_id,
      texto(entrada.texto, 80),
    );
    return {
      encontrados: muebles.length,
      mobiliario: muebles.map((m) => ({
        nombre: m.name,
        categoria: m.category ?? undefined,
        stock: n(m.stock),
      })),
    };
  },
};
