import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { tieneDerecho } from 'src/auth/derechos';
import { ClientsService } from 'src/clients/clients.service';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { hoyEnChile } from 'src/oportunidades/analisis/comun';
import { QuotationFollowupsService } from 'src/quotation-followups/quotation-followups.service';
import {
  QuotationStatus,
  RequestType,
} from 'src/quotations/constants/constants';
import type { CreateQuotationDto } from 'src/quotations/dto/create-quotation.dto';
import { diasEntre, MAX_DIAS } from 'src/quotations/generar/fechas';
import { GenerarRepository } from 'src/quotations/generar/generar.repository';
import {
  esTourOperador,
  ofrecible,
} from 'src/quotations/generar/reglas-valle-del-sol';
import { QuotationsService } from 'src/quotations/quotations.service';
import { computeMoney } from 'src/quotations/utils/money';
import type { User } from 'src/users/entities/user.entity';
import {
  conDia,
  enlaceDe,
  ErrorDeHerramienta,
  pesos,
} from '../herramientas/comun';
import {
  anotarComoBelia,
  aPedidoDe,
  aPedidoDeAlComienzo,
  lineasDeLaTarjeta,
  type ResultadoDeAplicar,
  type TarjetaDePropuesta,
} from './comun';
import {
  editarFoto,
  type Cambio,
  type FotoGuardada,
  type LineaDelCambio,
} from './editar-foto';
import { PropuestasRepository, type Propuesta } from './propuestas.repository';

// «CREAR EVENTO» (doc 20 §8b, la lámina de Felipe; Felipe, 03-11: "haz las
// 3 primeras"). BelIA arma la propuesta de una cotización NUEVA y la persona
// la crea con «Sí, crear». Nada nuevo en la base: el cliente nuevo pasa por
// el portero de clientes parecidos de las pantallas
// (`ClientsService.crearDesdePantalla`) y la cotización por la puerta del
// formulario (`QuotationsService.create`: el N° atómico, el tope del plan y
// la cuenta del dinero). Los servicios se arman con las reglas de «Crear con
// IA» (`editarFoto` sobre una foto vacía). No se deshace: borrar es del rojo
// (doc 20 §4).

@Injectable()
export class CotizacionNuevaService {
  constructor(
    private readonly guardadas: PropuestasRepository,
    private readonly catalogo: GenerarRepository,
    private readonly cotizaciones: QuotationsService,
    private readonly clientes: ClientsService,
    private readonly bitacora: QuotationFollowupsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CotizacionNuevaService.name);
  }

  /** «Crear evento» (doc 20 §8b, la lámina de Felipe): arma la propuesta de
   *  una cotización NUEVA. Con servicios, nace como cotización; sin ellos,
   *  como requerimiento, para armarla después. Los servicios se arman con
   *  las reglas de «Crear con IA» (`editarFoto` sobre una foto vacía), el
   *  cliente nuevo pasa por el portero de clientes parecidos y la fecha se
   *  revisa contra los eventos aceptados. */
  async proponer(
    usuario: User,
    datos: DatosDeLaNueva,
    hoy: string,
  ): Promise<TarjetaDePropuesta> {
    const empresa = usuario.company_id;
    const errores: string[] = [];

    // El tipo de evento, como los ofrece el cotizador.
    const tipos = await this.guardadas.tiposDeEvento(empresa);
    const tipo = tipos.find(
      (t) => t.toLowerCase() === datos.tipo_de_evento.trim().toLowerCase(),
    );
    if (!tipo) {
      errores.push(
        `El tipo de evento tiene que ser uno de estos: ${tipos.join(', ')}.`,
      );
    }

    // Las fechas.
    if (datos.fecha < hoy) errores.push('La fecha del evento ya pasó.');
    const fin =
      datos.ultimo_dia && datos.ultimo_dia > datos.fecha
        ? datos.ultimo_dia
        : null;
    if (datos.ultimo_dia && datos.ultimo_dia < datos.fecha) {
      errores.push('El último día es anterior al primero.');
    }
    if (fin && diasEntre(datos.fecha, fin) + 1 > MAX_DIAS) {
      errores.push(`Un evento no puede durar más de ${MAX_DIAS} días.`);
    }
    if (fin && !tieneDerecho(usuario.derechos, 'varios_dias')) {
      errores.push('El plan de tu empresa no trae eventos de varios días.');
    }

    // Las personas.
    if (datos.personas < 1) errores.push('Faltan las personas del evento.');
    if (datos.ninos < 0 || datos.ninos > datos.personas) {
      errores.push('Los niños van dentro del total de personas.');
    }

    // El cliente: uno que ya existe, o uno nuevo que no se parezca a otro.
    const avisos: string[] = [];
    let cliente: ClienteDeLaNueva | null = null;
    if (datos.cliente_id) {
      const c = await this.guardadas.clienteDeLaEmpresa(
        empresa,
        datos.cliente_id,
      );
      if (!c) errores.push('Ese cliente no existe en esta empresa.');
      else {
        cliente = {
          id: c.id,
          nombre: c.name,
          tipo: c.client_type,
          nuevo: null,
        };
      }
    } else if (datos.cliente_nuevo) {
      const n = datos.cliente_nuevo;
      const tiposDeCliente = await this.guardadas.tiposDeCliente(empresa);
      const tipoDeCliente = tiposDeCliente.find(
        (t) => t.toLowerCase() === n.tipo.trim().toLowerCase(),
      );
      if (!n.nombre.trim()) errores.push('Falta el nombre del cliente nuevo.');
      if (!tipoDeCliente) {
        errores.push(
          `El tipo del cliente nuevo tiene que ser uno de estos: ${tiposDeCliente.join(', ')}.`,
        );
      } else {
        const nuevo: NuevoCliente = {
          name: n.nombre.trim(),
          client_type: tipoDeCliente,
          ...(n.correo ? { email: n.correo } : {}),
          ...(n.telefono ? { phone: n.telefono } : {}),
          ...(n.contacto ? { contact_person: n.contacto } : {}),
        };
        const parecidos = await this.clientes.coincidencias(
          { name: nuevo.name, email: nuevo.email, phone: nuevo.phone },
          empresa,
        );
        if (parecidos.length > 0 && !n.es_otro_cliente) {
          errores.push(
            `Ya hay ${parecidos.length === 1 ? 'un cliente parecido' : 'clientes parecidos'} en Eventia: ${parecidos
              .slice(0, 5)
              .map(
                (x) =>
                  `«${x.nombre}» (id ${x.cliente_id}, por ${x.motivos.join(' y ')})`,
              )
              .join(
                '; ',
              )}. Pregúntale a la persona si es ese (y usa su id) o si es otro cliente (es_otro_cliente).`,
          );
        } else {
          if (parecidos.length > 0) {
            avisos.push(
              `Se crea un cliente nuevo aunque se parece a «${parecidos[0].nombre}», como pediste.`,
            );
          }
          cliente = {
            id: null,
            nombre: nuevo.name,
            tipo: tipoDeCliente,
            nuevo: { ...nuevo, confirmado: parecidos.length > 0 },
          };
        }
      }
    } else {
      errores.push(
        'Falta el cliente: búscalo con buscar_clientes (cliente_id) o dime sus datos (cliente_nuevo).',
      );
    }
    if (errores.length > 0 || !tipo || !cliente) {
      throw new ErrorDeHerramienta(
        `No se puede armar así:\n- ${errores.join('\n- ')}`,
      );
    }

    // Los servicios, con las reglas de «Crear con IA».
    const cambios = datos.cambios ?? [];
    const ajenos = cambios.filter(
      (c) => c.accion !== 'poner_casilla' && c.accion !== 'poner_fijo',
    );
    if (ajenos.length > 0) {
      throw new ErrorDeHerramienta(
        'En una cotización nueva solo van casillas (poner_casilla) y fijos (poner_fijo).',
      );
    }
    let foto: FotoGuardada = { variable_services: [], fixed_services: [] };
    let lineas: LineaDelCambio[] = [];
    if (cambios.length > 0) {
      const catalogo = await this.catalogo.catalogo(empresa);
      const r = editarFoto(
        foto,
        cambios,
        catalogo,
        {
          fecha: datos.fecha,
          personas: datos.personas,
          ninos: datos.ninos,
          esTourOperador: esTourOperador(cliente.tipo),
          ultimoDia: fin,
        },
        ofrecible,
      );
      if (!r.ok) {
        throw new ErrorDeHerramienta(
          `No se puede armar así:\n- ${r.errores.slice(0, 12).join('\n- ')}`,
        );
      }
      foto = r.foto;
      lineas = r.lineas;
      avisos.push(...r.avisos);
    }
    const conServicios = cambios.length > 0;
    const t = computeMoney({
      items: foto as Parameters<typeof computeMoney>[0]['items'],
      people_count: datos.personas,
      children_count: datos.ninos,
      discount_percentage: 0,
      discount_amount: 0,
      tip_percentage: null,
    });

    // La fecha contra los eventos aceptados, como el aviso del cotizador.
    const { has_conflicts } =
      await this.cotizaciones.checkConflictsWithExistingQuotations(
        { event_date: datos.fecha, ...(fin ? { event_end_date: fin } : {}) },
        empresa,
      );
    if (has_conflicts) {
      avisos.unshift(
        'Esas fechas se topan con un evento aceptado (tope de calendario): revísalo antes de enviarla.',
      );
    }

    const dto: Partial<CreateQuotationDto> = {
      event_type: tipo,
      event_date: datos.fecha,
      event_end_date: fin,
      people_count: datos.personas,
      children_count: datos.ninos,
      contact_name: datos.contacto?.trim() || null,
      // Nada de lo que escribe la IA va a las observaciones (salen en el
      // PDF): el pedido va al comentario interno.
      observations: '',
      comentario_interno: datos.pedido?.trim()
        ? `Lo que pidió el cliente (BelIA, ${aPedidoDe({ usuario_nombre: usuario.full_name?.trim() || null })}): ${datos.pedido.trim()}`
        : null,
      quotation_status: QuotationStatus.SOLICITADA,
      request_type: conServicios
        ? RequestType.COTIZACION
        : RequestType.REQUERIMIENTO,
      items: (conServicios ? foto : undefined) as CreateQuotationDto['items'],
      value_per_person: t.valuePerPerson,
      fixed_value: t.fixedTotal,
      subtotal_amount: t.subtotalAmount,
      discount_percentage: 0,
      discount_amount: 0,
      tip_percentage: null,
      tip_amount: t.tipAmount,
      total_amount: t.totalAmount,
    };

    await this.guardadas.descartarNuevasPendientes(empresa, usuario.id);
    const fila = await this.guardadas.crearPropuesta({
      company_id: empresa,
      quotation_id: null,
      usuario_id: usuario.id,
      usuario_nombre: usuario.full_name?.trim() || null,
      tipo: 'cotizacion_nueva',
      resumen: datos.resumen,
      antes: {},
      despues: { cliente, dto },
      // No hay cotización que pueda cambiar entre medio: la huella es la
      // del pedido mismo.
      huella_antes: 'nueva',
    });
    const desde = datos.fecha;
    return {
      id: fila.id,
      tipo: 'cotizacion_nueva',
      numero: null,
      cliente: cliente.nombre,
      cotizacion_id: null,
      enlace: null,
      resumen: datos.resumen,
      nueva: {
        es: conServicios ? 'cotización' : 'requerimiento',
        cliente: cliente.nombre,
        cliente_nuevo: cliente.id === null,
        tipo_de_evento: tipo,
        fechas: fin
          ? `${conDia(desde)} a ${conDia(fin)}`
          : (conDia(desde) ?? desde),
        personas:
          datos.ninos > 0
            ? `${datos.personas} (${datos.personas - datos.ninos} adultos y ${datos.ninos} niños)`
            : `${datos.personas}`,
        ...(dto.contact_name ? { contacto: dto.contact_name } : {}),
      },
      lineas: lineasDeLaTarjeta(lineas, desde),
      ...(conServicios
        ? {
            total: {
              antes: pesos(0),
              despues: pesos(t.totalAmount),
              diferencia: `+${pesos(t.totalAmount)}`,
            },
          }
        : {}),
      avisos,
      se_puede_deshacer: false,
      vence_at: fila.vence_at,
    };
  }

  /** El «Sí, crear» de una cotización nueva: el cliente (si es nuevo) por
   *  el portero de las pantallas y la cotización por la puerta del
   *  formulario (`QuotationsService.create`: el N° atómico, el tope del
   *  plan y la cuenta del dinero). */
  async crear(
    usuario: User,
    p: Propuesta,
    alGuardar: () => void,
  ): Promise<ResultadoDeAplicar> {
    const empresa = usuario.company_id;
    const { cliente, dto } = p.despues as {
      cliente: ClienteDeLaNueva;
      dto: Partial<CreateQuotationDto>;
    };
    if (dto.event_date && dto.event_date < hoyEnChile()) {
      throw new ConflictException(
        'La fecha del evento ya pasó: pídemela de nuevo.',
      );
    }
    let clienteId = cliente.id;
    if (clienteId) {
      if (!(await this.guardadas.clienteDeLaEmpresa(empresa, clienteId))) {
        throw new NotFoundException('Ese cliente ya no existe.');
      }
    } else if (cliente.nuevo) {
      // Si entre medio apareció un cliente parecido, el portero responde
      // 409 y no se crea nada (doc 20: se vuelve a revisar todo).
      const creado = (await this.clientes.crearDesdePantalla(
        cliente.nuevo as Parameters<ClientsService['crearDesdePantalla']>[0],
        empresa,
      )) as { id?: string } | null;
      clienteId = creado?.id ?? null;
      if (!clienteId) throw new ConflictException('No pude crear el cliente.');
    }
    const q = await this.cotizaciones.create(
      { ...dto, client_id: clienteId } as CreateQuotationDto,
      empresa,
      usuario.id,
      {
        derechos: usuario.derechos,
        cotizaciones_mes: usuario.cotizaciones_mes,
        plan: usuario.plan,
      },
    );
    alGuardar();
    await this.guardadas
      .moverPropuesta(empresa, p.id, 'aplicando', {
        estado: 'aplicada',
        aplicada_at: new Date().toISOString(),
        quotation_id: q.id,
      })
      .catch((e: unknown) =>
        this.logger.warn(`propuesta ${p.id}: ${mensajeDe(e)}`),
      );
    await anotarComoBelia(
      this.bitacora,
      this.logger,
      empresa,
      q.id,
      `${aPedidoDeAlComienzo(p)}: creó ${dto.request_type === RequestType.COTIZACION ? 'la cotización' : 'el requerimiento'}. ${p.resumen}.`,
    );
    return {
      estado: 'aplicada',
      numero: q.quotation_number,
      enlace: enlaceDe(q, usuario.role),
      // Un requerimiento no tiene plata todavía (y recepción no la ve).
      ...(dto.request_type === RequestType.COTIZACION
        ? { total: pesos(dto.total_amount ?? 0) }
        : {}),
      se_puede_deshacer: false,
    };
  }
}

/** Lo que pide la IA para «Crear evento» (la herramienta ya lo leyó). */
export type DatosDeLaNueva = {
  cliente_id?: string;
  cliente_nuevo?: {
    nombre: string;
    tipo: string;
    correo?: string;
    telefono?: string;
    contacto?: string;
    /** La persona dijo que es otro cliente, aunque se parezca a uno. */
    es_otro_cliente?: boolean;
  };
  tipo_de_evento: string;
  /** AAAA-MM-DD. */
  fecha: string;
  ultimo_dia?: string;
  personas: number;
  ninos: number;
  contacto?: string;
  /** Lo que pidió el cliente: va al comentario interno. */
  pedido?: string;
  cambios?: Cambio[];
  resumen: string;
};

type NuevoCliente = {
  name: string;
  client_type: string;
  email?: string;
  phone?: string;
  contact_person?: string;
};

type ClienteDeLaNueva = {
  id: string | null;
  nombre: string;
  tipo: string | null;
  /** Los datos para crearlo, si es nuevo. */
  nuevo: (NuevoCliente & { confirmado: boolean }) | null;
};
