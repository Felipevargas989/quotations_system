import { SALES_AND_UP } from 'src/auth/roles.decorator';
import { QuotationStatus } from 'src/quotations/constants/constants';
import {
  ErrorDeHerramienta,
  conDia,
  diaDelEvento,
  enlaceDe,
  estadoDe,
  pesos,
  texto,
  type Herramienta,
} from './comun';

// «¿Qué ha cotizado Ecofor?», «¿cuál es el teléfono de Rudel?». La lista de
// Clientes con su historia corta: lo cotizado, lo ganado y lo perdido. Es
// de quien vende (SECTION_ROLES.clients).

const GANADAS = new Set([QuotationStatus.ACEPTADA, QuotationStatus.REALIZADA]);

export const buscarClientes: Herramienta = {
  nombre: 'buscar_clientes',
  descripcion:
    'Busca clientes por parte del nombre: tipo, contacto, teléfono y correo, cuántas ' +
    'cotizaciones tienen (ganadas y perdidas) y las últimas seis con su enlace.',
  esquema: {
    type: 'object',
    properties: {
      texto: { type: 'string', description: 'Parte del nombre del cliente.' },
    },
    required: ['texto'],
  },
  cargos: SALES_AND_UP,
  async ejecutar(entrada, ctx) {
    const buscado = texto(entrada.texto, 80);
    if (!buscado || buscado.length < 2) {
      throw new ErrorDeHerramienta(
        'Falta el nombre (dos letras por lo menos).',
      );
    }
    const empresa = ctx.usuario.company_id;
    const clientes = await ctx.repositorio.clientes(empresa, buscado);
    const cotizaciones = await ctx.repositorio.cotizacionesDeClientes(
      empresa,
      clientes.map((c) => c.id),
    );
    return {
      encontrados: clientes.length,
      clientes: clientes.map((c) => {
        const suyas = cotizaciones.filter((q) => q.client_id === c.id);
        return {
          // El id, para crear un evento a este cliente (fase 2).
          id: c.id,
          nombre: c.name,
          tipo: c.client_type,
          contacto: c.contact_person,
          telefono: c.phone,
          correo: c.email,
          cotizaciones: suyas.length,
          ganadas: suyas.filter((q) => GANADAS.has(q.quotation_status)).length,
          perdidas: suyas.filter(
            (q) => q.quotation_status === QuotationStatus.RECHAZADA,
          ).length,
          ultimas: suyas.slice(0, 6).map((q) => ({
            numero: q.quotation_number,
            enlace: enlaceDe(q, ctx.usuario.role),
            estado: estadoDe(q.quotation_status),
            evento: q.event_type,
            fecha: conDia(diaDelEvento(q.event_date)),
            total: pesos(q.total_amount),
          })),
        };
      }),
    };
  },
};
