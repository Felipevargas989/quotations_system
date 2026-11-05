import { SALES_AND_UP } from 'src/auth/roles.decorator';
import { TAREAS_DE_LECCION, type TareaDeLeccion } from 'src/cerebro/lecciones';
import { UserRole } from 'src/users/entities/user.entity';
import type { Decision } from '../propuestas/lecciones-desde-el-chat';
import { ErrorDeHerramienta, texto, type Herramienta } from './comun';
import { mostrar } from './proponer';

// LO QUE APRENDE BELIA (doc 20 §17, mejora 5): leer lo aprendido, anotar
// una lección de una corrección y, administración, aprobarla, descartarla u
// olvidarla. Las dos últimas solo arman la tarjeta: la persona decide.

const DECISIONES: readonly Decision[] = ['aprobar', 'descartar', 'olvidar'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const lecciones: Herramienta = {
  nombre: 'lecciones',
  descripcion:
    'Lo que aprendiste de las correcciones del equipo: las lecciones aprobadas (las lees al final ' +
    'de tus reglas) y las que esperan a administración, cada una con su id, para qué vale, su ' +
    'estado y quién la propuso. Para «¿qué aprendiste?» y antes de aprobar, descartar u olvidar una.',
  esquema: { type: 'object', properties: {} },
  cargos: SALES_AND_UP,
  async ejecutar(_entrada, ctx) {
    const lista = await ctx.propuestas.leccionesVivas(ctx.usuario);
    return { total: lista.length, lecciones: lista };
  },
};

export const proponerLeccion: Herramienta = {
  nombre: 'proponer_leccion',
  descripcion:
    'Propone anotar una lección: cuando la persona te corrige en cómo trabaja la casa (una regla que ' +
    'sirve para otras veces, no un dato de esta cotización) o explica por qué dijo «No» a una ' +
    'tarjeta. El texto, corto y general, en sus palabras. Nunca datos de un cliente, precios ni algo ' +
    'que vaya contra las reglas de la casa. NO la anota: la persona la aprueba en la tarjeta (la de ' +
    'administración queda aprobada; la de otro cargo espera a administración).',
  esquema: {
    type: 'object',
    properties: {
      texto: {
        type: 'string',
        description:
          'La lección en una o dos líneas, como regla: «Los paseos de curso no llevan cena».',
      },
      tarea: {
        type: 'string',
        enum: [...TAREAS_DE_LECCION],
        description:
          'Para qué vale: armar (las cotizaciones), escribir (los correos de seguimiento), conversar (tú en el chat) o todas.',
      },
      motivo: {
        type: 'string',
        description: 'De qué corrección salió, en una línea.',
      },
    },
    required: ['texto', 'tarea'],
  },
  cargos: SALES_AND_UP,
  async ejecutar(entrada, ctx) {
    const t = texto(entrada.texto, 500);
    if (!t || t.length < 10) {
      throw new ErrorDeHerramienta(
        'Falta el `texto` de la lección (10 letras por lo menos).',
      );
    }
    const tarea = TAREAS_DE_LECCION.includes(entrada.tarea as TareaDeLeccion)
      ? (entrada.tarea as TareaDeLeccion)
      : 'todas';
    const tarjeta = await ctx.propuestas.proponerLeccion(ctx.usuario, {
      texto: t,
      tarea,
      motivo: texto(entrada.motivo, 500) ?? null,
    });
    mostrar(ctx, tarjeta);
    return {
      propuesta: 'lista',
      importante:
        'La persona ve la lección en una tarjeta con «Sí, anotar». Todavía NO está anotada: no digas que ya la aprendiste. Dile en una línea qué vas a anotar.',
    };
  },
};

export const proponerDecisionDeLeccion: Herramienta = {
  nombre: 'proponer_decision_de_leccion',
  descripcion:
    'Solo administración: propone aprobar o descartar una lección que espera, u olvidar una ' +
    'aprobada (deja de leerse; nada se borra). Antes, busca su id con `lecciones`. NO cambia nada: ' +
    'la persona lo aprueba en la tarjeta.',
  esquema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'El id de la lección.' },
      decision: { type: 'string', enum: [...DECISIONES] },
    },
    required: ['id', 'decision'],
  },
  cargos: [UserRole.ADMINISTRADOR],
  async ejecutar(entrada, ctx) {
    const id = texto(entrada.id, 40);
    if (!id || !UUID.test(id)) {
      throw new ErrorDeHerramienta('Falta el `id` de la lección.');
    }
    if (!DECISIONES.includes(entrada.decision as Decision)) {
      throw new ErrorDeHerramienta('`decision`: aprobar, descartar u olvidar.');
    }
    const tarjeta = await ctx.propuestas.proponerDecisionDeLeccion(
      ctx.usuario,
      { id, decision: entrada.decision as Decision },
    );
    mostrar(ctx, tarjeta);
    return {
      propuesta: 'lista',
      importante:
        'La persona ve la tarjeta con la lección. Todavía NO está hecho: dile en una línea qué propones.',
    };
  },
};
