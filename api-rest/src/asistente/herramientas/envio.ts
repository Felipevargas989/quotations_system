import { SALES_AND_UP } from 'src/auth/roles.decorator';
import { RequestType } from 'src/quotations/constants/constants';
import { TOPE_DE_ENVIOS } from '../propuestas/envio-desde-el-chat';
import { laVeElCargo } from './buscar-cotizaciones';
import { entero, ErrorDeHerramienta, type Herramienta } from './comun';
import { mostrar } from './proponer';
import { tiposPara } from './recepcion';

// «ENVÍA LAS SOLICITADAS» (doc 20 §19; Felipe, 27-11-2026). La única
// herramienta que termina en un correo al cliente, y aun así no envía: deja
// cada correo listo en contacto@ y una tarjeta con el texto completo. Sale
// recién con el «Sí, enviar» de la persona.

export const proponerEnvioDeCotizaciones: Herramienta = {
  nombre: 'proponer_envio_de_cotizaciones',
  descripcion:
    'Prepara el envío por correo de las cotizaciones en Solicitada (no los requerimientos): por ' +
    'cada una, la IA de Eventia lee el hilo del cliente en contacto@, escribe el correo con la ' +
    'estructura de la casa y la tabla de valores, y lo deja listo en ese hilo con la firma de ' +
    `contacto@. Sin \`numeros\`, todas las que la persona ve (hasta ${TOPE_DE_ENVIOS} por pedido, por ` +
    'fecha del evento). Tarda cerca de un minuto por cada cinco. NO envía nada: la persona ve una ' +
    'tarjeta por cotización con lo que le dirá a cada cliente y aprueba con «Sí, enviar» (o ' +
    '«Enviar todas»). Úsala cuando la persona pida enviar las solicitadas o enviar cotizaciones ' +
    'por correo.',
  esquema: {
    type: 'object',
    properties: {
      numeros: {
        type: 'array',
        items: { type: 'integer' },
        description:
          'Solo estas (los N°). Sin esto, todas las solicitadas que la persona ve.',
      },
    },
  },
  cargos: SALES_AND_UP,
  dentroDe: ['cotizaciones'],
  derecho: 'seguimiento_con_ia',
  async ejecutar(entrada, ctx) {
    if (!ctx.envios) {
      throw new ErrorDeHerramienta(
        'El envío con BelIA no está disponible en este motor.',
      );
    }
    const numeros = Array.isArray(entrada.numeros)
      ? entrada.numeros
          .map((x) => entero(x, 1, 100_000_000))
          .filter((x): x is number => x !== undefined)
          .slice(0, 50)
      : undefined;
    const tipos = await tiposPara(ctx);
    const r = await ctx.envios.proponer(
      ctx.usuario,
      (q) =>
        laVeElCargo(tipos, {
          request_type: RequestType.COTIZACION,
          clients: q.clients,
        }),
      numeros,
    );
    r.tarjetas.forEach((t) => mostrar(ctx, t));
    return {
      listas: r.tarjetas.map((t) => ({
        numero: t.numero,
        cliente: t.cliente,
        para: t.envio?.para,
        lo_que_le_dice: t.resumen,
      })),
      no_preparadas: r.saltadas.map((s) => ({
        numero: s.numero,
        cliente: s.cliente,
        por_que: s.motivo,
      })),
      fallaron: r.fallas,
      quedan_sin_preparar: r.quedan,
      importante:
        'NADA se ha enviado todavía. La persona ve una tarjeta por cotización con el correo completo y aprueba con «Sí, enviar» o con «Enviar todas». Dile cuántas quedaron listas, cuáles no y por qué (en una línea cada una), y que revise y apruebe en las tarjetas. Si quedan sin preparar, que te lo pida de nuevo después de enviar estas.',
    };
  },
};
