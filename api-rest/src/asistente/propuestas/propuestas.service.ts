import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AlcanceDeRecepcion } from 'src/clients/alcance-de-recepcion';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { LogisticsService } from 'src/logistics/logistics.service';
import { hoyEnChile } from 'src/oportunidades/analisis/comun';
import { QuotationFollowupsService } from 'src/quotation-followups/quotation-followups.service';
import { QuotationStatus } from 'src/quotations/constants/constants';
import type { UpdateQuotationDto } from 'src/quotations/dto/update-quotation.dto';
import { GenerarRepository } from 'src/quotations/generar/generar.repository';
import {
  esTourOperador,
  ofrecible,
} from 'src/quotations/generar/reglas-valle-del-sol';
import { QuotationsService } from 'src/quotations/quotations.service';
import { UserRole, type User } from 'src/users/entities/user.entity';
import { AsistenteRepository } from '../asistente.repository';
import {
  conDia,
  diaDelEvento,
  enlaceDe,
  ErrorDeHerramienta,
  pesos,
} from '../herramientas/comun';
import {
  revisarCabecera,
  type CabeceraNueva,
  type CambioDeCabecera,
} from './cabecera';
import {
  anotarComoBelia,
  aPedidoDe,
  aPedidoDeAlComienzo,
  ESTADOS,
  lineasDeLaTarjeta,
  type Canal,
  type ResultadoDeAplicar,
  type TarjetaDePropuesta,
} from './comun';
import {
  CotizacionNuevaService,
  type DatosDeLaNueva,
} from './cotizacion-nueva.service';
import { LoQuePuedeRecepcion } from './de-recepcion';
import {
  editarFoto,
  type Cambio,
  type FotoGuardada,
  type LineaDelCambio,
} from './editar-foto';
import {
  LeccionesDesdeElChat,
  type Decision,
  type LeccionPedida,
} from './lecciones-desde-el-chat';
import {
  PropuestasRepository,
  type EstadoDePropuesta,
  type Propuesta,
} from './propuestas.repository';
import {
  choqueConLoServido,
  cuotasDespues,
  huellaDe,
  parcheDe,
  porQueNo,
  type CotizacionParaCambiar,
  type Parche,
} from './reglas';
import { SeguimientoDesdeElChat } from './seguimiento-desde-el-chat';

const n = (v: unknown): number => Number(v) || 0;

// LA FASE 2 DE BELIA: PROPONE, Y LA PERSONA APRUEBA (doc 20 §3, regla 3;
// Felipe, 03-11: "vamos con lo que no puede hacer para dejarla lista hoy").
//
// 1. La herramienta arma la propuesta (`proponerServicios`, `proponerNota`)
//    sobre la cotización como está: el antes y el después, el total, las
//    cuotas y los avisos. Queda guardada en `asistente_propuestas` (181) y
//    la persona la ve en una tarjeta.
// 2. Con su «Sí, aplicar» (`aplicar`) se revisa todo de nuevo: que sea suya,
//    que no haya vencido, que nadie haya tocado la cotización entre medio
//    (la huella), el cargo, el estado y los días ya servidos. Recién ahí se
//    guarda, por la MISMA puerta del cotizador (`QuotationsService.update`,
//    con la cuenta del dinero y la cascada del plan de pagos).
// 3. Queda en la bitácora a nombre de BelIA y de quien lo pidió, con el
//    antes guardado para deshacer (`deshacer`, solo lo no vendido: en una
//    vendida la cascada del plan no tiene vuelta exacta).

@Injectable()
export class PropuestasService {
  constructor(
    private readonly repositorio: AsistenteRepository,
    private readonly guardadas: PropuestasRepository,
    private readonly catalogo: GenerarRepository,
    private readonly logistica: LogisticsService,
    private readonly cotizaciones: QuotationsService,
    private readonly bitacora: QuotationFollowupsService,
    private readonly logger: PinoLogger,
    private readonly nuevas: CotizacionNuevaService,
    // «Prepárame el seguimiento de la 600» (doc 20 §17, mejora 4).
    private readonly seguimientoDelChat?: SeguimientoDesdeElChat,
    // Lo que aprende de las correcciones (doc 20 §17, mejora 5).
    private readonly leccionesDelChat?: LeccionesDesdeElChat,
    // Lo que trabaja recepción (doc 21): las cotizaciones de particulares.
    // Sin ella, recepción solo crea requerimientos, como antes.
    @Optional() private readonly alcance?: AlcanceDeRecepcion,
  ) {
    this.logger.setContext(PropuestasService.name);
    this.deRecepcion = new LoQuePuedeRecepcion(this.guardadas, this.alcance);
  }

  /** Lo que recepción trabaja con BelIA (doc 21, `de-recepcion.ts`). */
  private readonly deRecepcion: LoQuePuedeRecepcion;

  private conSeguimiento(): SeguimientoDesdeElChat {
    if (!this.seguimientoDelChat) {
      throw new ErrorDeHerramienta(
        'El seguimiento con IA no está disponible en este motor.',
      );
    }
    return this.seguimientoDelChat;
  }

  private conLecciones(): LeccionesDesdeElChat {
    if (!this.leccionesDelChat) {
      throw new ErrorDeHerramienta(
        'Las lecciones no están disponibles en este motor.',
      );
    }
    return this.leccionesDelChat;
  }

  /** Las lecciones (`lecciones-desde-el-chat.ts`): anotarlas, decidirlas y
   *  leerlas. */
  proponerLeccion(usuario: User, l: LeccionPedida) {
    return this.conLecciones().proponer(usuario, l);
  }

  proponerDecisionDeLeccion(
    usuario: User,
    d: { id: string; decision: Decision },
  ) {
    return this.conLecciones().proponerDecision(usuario, d);
  }

  leccionesVivas(usuario: User) {
    return this.conLecciones().vivas(usuario);
  }

  leccionesPorAprobar(usuario: User) {
    return this.leccionesDelChat
      ? this.leccionesDelChat.porAprobar(usuario)
      : Promise.resolve([]);
  }

  /** La tarjeta del borrador del seguimiento (`seguimiento-desde-el-chat.ts`). */
  async proponerSeguimiento(
    usuario: User,
    por: { numero: number } | { id: string },
  ): Promise<TarjetaDePropuesta> {
    await this.deRecepcion.alProponerSeguimiento(usuario, por);
    return this.conSeguimiento().proponer(usuario, por);
  }

  /** Arma la propuesta de cambiar los servicios y la guarda. Lo que no se
   *  puede vuelve como ErrorDeHerramienta, para que la IA lo explique. */
  async proponerServicios(
    usuario: User,
    por: { numero: number } | { id: string },
    cambios: Cambio[],
    resumen: string,
    hoy: string,
    // Las personas del evento y el descuento (04-11-2026; `cabecera.ts`).
    cabecera?: CambioDeCabecera,
  ): Promise<TarjetaDePropuesta> {
    const empresa = usuario.company_id;
    const q = await this.guardadas.cotizacionParaCambiar(empresa, por);
    if (!q) {
      throw new ErrorDeHerramienta(
        'numero' in por
          ? `No hay ninguna cotización N° ${por.numero} en esta empresa.`
          : 'No encontré la cotización abierta.',
      );
    }
    await this.deRecepcion.alProponer(usuario, q, 'cotizar');
    const armada = await this.armar(q, usuario, cambios, hoy, cabecera);
    const antes = n(q.total_amount);
    await this.guardadas.descartarPendientes(empresa, q.id, usuario.id);
    const fila = await this.guardadas.crearPropuesta({
      company_id: empresa,
      quotation_id: q.id,
      usuario_id: usuario.id,
      usuario_nombre: usuario.full_name?.trim() || null,
      tipo: 'servicios',
      resumen,
      // El respaldo para deshacer: la foto y la plata como estaban.
      antes: {
        items: q.items,
        total_amount: antes,
        subtotal_amount: q.subtotal_amount,
        value_per_person: q.value_per_person,
        fixed_value: q.fixed_value,
        discount_amount: q.discount_amount,
        tip_amount: q.tip_amount,
        // La cabecera, para que «Deshacer» la deje como estaba.
        people_count: q.people_count,
        children_count: q.children_count,
        discount_percentage: q.discount_percentage,
        event_date: q.event_date,
        event_end_date: q.event_end_date,
      },
      despues: {
        cambios,
        cabecera: armada.cabecera,
        parche: armada.parche,
        dias_tocados: armada.diasTocados,
        bajan_personas: armada.bajanPersonas,
      },
      huella_antes: huellaDe(q),
    });
    const desde = diaDelEvento(q.event_date);
    return {
      id: fila.id,
      tipo: 'servicios',
      numero: q.quotation_number,
      cliente: q.clients?.name ?? null,
      cotizacion_id: q.id,
      // A recepción solo le llega la de un particular (doc 21).
      enlace: enlaceDe(q, usuario.role, true),
      resumen,
      lineas: lineasDeLaTarjeta(armada.lineas, desde),
      total: {
        antes: pesos(antes),
        despues: pesos(armada.total),
        diferencia: `${armada.total - antes >= 0 ? '+' : '−'}${pesos(Math.abs(armada.total - antes))}`,
      },
      ...(armada.cuotas ?? {}),
      avisos: armada.avisos,
      se_puede_deshacer: q.quotation_status !== QuotationStatus.ACEPTADA,
      vence_at: fila.vence_at,
    };
  }

  /** Arma la propuesta de una nota en la bitácora. */
  async proponerNota(
    usuario: User,
    por: { numero: number } | { id: string },
    texto: string,
    canal: Canal,
    proximoContacto: string | null,
  ): Promise<TarjetaDePropuesta> {
    const empresa = usuario.company_id;
    const q = await this.guardadas.cotizacionParaCambiar(empresa, por);
    if (!q) {
      throw new ErrorDeHerramienta(
        'numero' in por
          ? `No hay ninguna cotización N° ${por.numero} en esta empresa.`
          : 'No encontré la cotización abierta.',
      );
    }
    await this.deRecepcion.alProponer(usuario, q, 'anotar');
    await this.guardadas.descartarPendientes(empresa, q.id, usuario.id);
    const nota = { texto, canal, proximo_contacto: proximoContacto };
    const fila = await this.guardadas.crearPropuesta({
      company_id: empresa,
      quotation_id: q.id,
      usuario_id: usuario.id,
      usuario_nombre: usuario.full_name?.trim() || null,
      tipo: 'nota',
      resumen: 'Una nota en la bitácora',
      antes: {},
      despues: { nota },
      huella_antes: huellaDe(q),
    });
    return {
      id: fila.id,
      tipo: 'nota',
      numero: q.quotation_number,
      cliente: q.clients?.name ?? null,
      cotizacion_id: q.id,
      enlace: enlaceDe(q, usuario.role, true),
      resumen: fila.resumen,
      lineas: [],
      avisos: [],
      nota: {
        ...nota,
        proximo_contacto: proximoContacto ? conDia(proximoContacto) : null,
      },
      se_puede_deshacer: false,
      vence_at: fila.vence_at,
    };
  }

  /** El «Sí, aplicar» de la persona. */
  async aplicar(usuario: User, id: string): Promise<ResultadoDeAplicar> {
    const empresa = usuario.company_id;
    const p = await this.suya(usuario, id);
    // Recepción (doc 20 §13 y doc 21): requerimientos para cualquiera y las
    // cotizaciones de particulares; nunca lecciones. Lo de cada cotización
    // se revisa abajo, con la cotización leída. Si le cambiaron el cargo con
    // una propuesta vieja en la mano, también.
    if (
      usuario.role === UserRole.RECEPCION &&
      (p.tipo === 'leccion' || p.tipo === 'leccion_estado')
    ) {
      throw new ForbiddenException(
        'Con el cargo de recepción, BelIA no anota lecciones.',
      );
    }
    if (p.tipo === 'cotizacion_nueva') {
      await this.deRecepcion.alCrearLaNueva(usuario, p);
    }
    if (p.estado !== 'pendiente') {
      throw new ConflictException(`Esa propuesta ${ESTADOS[p.estado]}.`);
    }
    if (Date.parse(p.vence_at) < Date.now()) {
      await this.guardadas.moverPropuesta(empresa, id, 'pendiente', {
        estado: 'vencida',
      });
      throw new ConflictException(
        'La propuesta venció (duran 2 horas): pídemela de nuevo.',
      );
    }
    // El candado de dos clics: solo uno la toma.
    if (
      !(await this.guardadas.moverPropuesta(empresa, id, 'pendiente', {
        estado: 'aplicando',
      }))
    ) {
      throw new ConflictException('Esa propuesta ya se está aplicando.');
    }

    let q: CotizacionParaCambiar | null = null;
    let guardada = false;
    try {
      if (p.tipo === 'cotizacion_nueva') {
        return await this.nuevas.crear(usuario, p, () => {
          guardada = true;
        });
      }
      if (p.tipo === 'leccion' || p.tipo === 'leccion_estado') {
        const r =
          p.tipo === 'leccion'
            ? await this.conLecciones().anotar(usuario, p)
            : await this.conLecciones().decidir(usuario, p);
        guardada = true;
        await this.guardadas
          .moverPropuesta(empresa, id, 'aplicando', {
            estado: 'aplicada',
            aplicada_at: new Date().toISOString(),
          })
          .catch((e: unknown) =>
            this.logger.warn(`propuesta ${id}: ${mensajeDe(e)}`),
          );
        return r;
      }
      if (!p.quotation_id) {
        throw new NotFoundException('La cotización ya no existe.');
      }
      q = await this.guardadas.cotizacionParaCambiar(empresa, {
        id: p.quotation_id,
      });
      if (!q) throw new NotFoundException('La cotización ya no existe.');
      await this.deRecepcion.alAplicar(
        usuario,
        q,
        p.tipo === 'nota' ? 'anotar' : 'cotizar',
      );

      if (p.tipo === 'seguimiento') {
        // El borrador lo escribe el seguimiento con IA, con su nota en la
        // bitácora; nada más que guardar acá.
        const r = await this.conSeguimiento().dejar(usuario, q);
        guardada = true;
        await this.cerrar(empresa, id, 'aplicando', 'aplicada', q);
        return r;
      }

      if (p.tipo === 'nota') {
        const nota = (p.despues as { nota: NotaGuardada }).nota;
        await this.bitacora.crearComoBelia(empresa, {
          quotation_id: q.id,
          tipo: nota.canal,
          next_contact_date: nota.proximo_contacto,
          note: `${nota.texto}\n(${aPedidoDe(p)})`,
        });
        guardada = true;
        await this.cerrar(empresa, id, 'aplicando', 'aplicada', q);
        return {
          estado: 'aplicada',
          numero: q.quotation_number,
          enlace: enlaceDe(q, usuario.role, true),
        };
      }

      if (huellaDe(q) !== p.huella_antes) {
        throw new ConflictException(
          `La N° ${q.quotation_number} cambió desde que te lo propuse (alguien la guardó entre medio). Pídemelo de nuevo y lo armo sobre lo que tiene ahora.`,
        );
      }
      const despues = p.despues as DespuesGuardado;
      this.revisarDeNuevo(q, usuario, despues.dias_tocados);
      if (
        q.quotation_status === QuotationStatus.ACEPTADA &&
        despues.bajan_personas &&
        usuario.role !== UserRole.ADMINISTRADOR &&
        (await this.guardadas.comprasDelEvento(empresa, q.id)) > 0
      ) {
        throw new ForbiddenException(
          'Este evento ya tiene compras: solo un administrador baja personas.',
        );
      }

      await this.cotizaciones.update(
        q.id,
        despues.parche as unknown as UpdateQuotationDto,
        empresa,
        usuario.role,
        { derechos: usuario.derechos, plan: usuario.plan },
      );
      guardada = true;
      const antes = n((p.antes as { total_amount?: number }).total_amount);
      await this.cerrar(empresa, id, 'aplicando', 'aplicada', q);
      await anotarComoBelia(
        this.bitacora,
        this.logger,
        empresa,
        q.id,
        `${aPedidoDeAlComienzo(p)}: ${p.resumen}. Total ${pesos(antes)} → ${pesos(despues.parche.total_amount)}.`,
      );
      return {
        estado: 'aplicada',
        numero: q.quotation_number,
        enlace: enlaceDe(q, usuario.role, true),
        total: pesos(despues.parche.total_amount),
        se_puede_deshacer: q.quotation_status !== QuotationStatus.ACEPTADA,
      };
    } catch (e) {
      // Si alcanzó a guardarse, la propuesta quedó aplicada aunque falle lo
      // de después; si no, no sirve volver a intentarla tal cual.
      if (!guardada) {
        await this.guardadas
          .moverPropuesta(empresa, id, 'aplicando', { estado: 'vencida' })
          .catch(() => undefined);
      }
      throw this.comoHttp(e);
    }
  }

  /** Vuelve la cotización a como estaba antes de la propuesta. Solo lo no
   *  vendido, y solo si nadie la tocó después. */
  async deshacer(usuario: User, id: string): Promise<ResultadoDeAplicar> {
    const empresa = usuario.company_id;
    const p = await this.suya(usuario, id);
    if (p.tipo !== 'servicios' || p.estado !== 'aplicada' || !p.quotation_id) {
      throw new ConflictException(
        p.tipo === 'nota'
          ? 'Una nota de la bitácora no se deshace desde acá.'
          : p.tipo === 'cotizacion_nueva'
            ? 'Una cotización creada no se deshace desde acá: si no va, se anula o se borra desde el tablero.'
            : p.tipo === 'seguimiento'
              ? 'El borrador del seguimiento quedó en Outlook: si no va, bórralo desde ahí.'
              : p.tipo === 'leccion' || p.tipo === 'leccion_estado'
                ? 'Una lección no se deshace desde acá: pídeme que la olvide.'
                : `Esa propuesta ${ESTADOS[p.estado]}.`,
      );
    }
    const cotizacionId = p.quotation_id;
    if (
      !(await this.guardadas.moverPropuesta(empresa, id, 'aplicada', {
        estado: 'deshaciendo',
      }))
    ) {
      throw new ConflictException('Esa propuesta ya se está deshaciendo.');
    }
    let guardada = false;
    try {
      const q = await this.guardadas.cotizacionParaCambiar(empresa, {
        id: cotizacionId,
      });
      if (!q) throw new NotFoundException('La cotización ya no existe.');
      if (q.quotation_status === QuotationStatus.ACEPTADA) {
        throw new ConflictException(
          'Ya está aceptada: el plan de pagos no tiene vuelta exacta. Pídeme el cambio contrario y verás cómo quedan las cuotas antes de aplicar.',
        );
      }
      if (huellaDe(q) !== p.huella_despues) {
        throw new ConflictException(
          `La N° ${q.quotation_number} cambió después del cambio de BelIA: deshacerlo pisaría lo nuevo. Pídeme el cambio contrario.`,
        );
      }
      const despues = p.despues as DespuesGuardado;
      this.revisarDeNuevo(q, usuario, despues.dias_tocados);
      const antes = p.antes as {
        items: FotoGuardada | null;
        people_count?: number | null;
        children_count?: number | null;
        discount_percentage?: number | string | null;
        discount_amount?: number | string | null;
        event_date?: string | null;
        event_end_date?: string | null;
      };
      // Las propuestas desde el 04-11 guardan también la cabecera (las
      // personas y el descuento; desde §17, las fechas); las de antes no la
      // cambiaban.
      const inicio = diaDelEvento(antes.event_date);
      const ultimo = diaDelEvento(antes.event_end_date);
      const { parche } = parcheDe(
        q,
        antes.items ?? {},
        'people_count' in antes
          ? {
              people_count: n(antes.people_count),
              children_count: n(antes.children_count),
              discount_percentage: n(antes.discount_percentage),
              discount_amount: n(antes.discount_amount),
              ...(inicio ? { event_date: inicio } : {}),
              ...(ultimo ? { event_end_date: ultimo } : {}),
            }
          : {},
      );
      await this.cotizaciones.update(
        q.id,
        parche as unknown as UpdateQuotationDto,
        empresa,
        usuario.role,
        { derechos: usuario.derechos, plan: usuario.plan },
      );
      guardada = true;
      await this.guardadas
        .moverPropuesta(empresa, id, 'deshaciendo', {
          estado: 'deshecha',
          deshecha_at: new Date().toISOString(),
        })
        .catch((e: unknown) =>
          this.logger.warn(`propuesta ${id}: ${mensajeDe(e)}`),
        );
      await anotarComoBelia(
        this.bitacora,
        this.logger,
        empresa,
        q.id,
        `Deshizo, ${aPedidoDe(p)}: ${p.resumen}. Total de vuelta en ${pesos(parche.total_amount)}.`,
      );
      return {
        estado: 'deshecha',
        numero: q.quotation_number,
        enlace: enlaceDe(q, usuario.role, true),
        total: pesos(parche.total_amount),
      };
    } catch (e) {
      if (!guardada) {
        await this.guardadas
          .moverPropuesta(empresa, id, 'deshaciendo', { estado: 'aplicada' })
          .catch(() => undefined);
      }
      throw this.comoHttp(e);
    }
  }

  /** El «No» de la persona. */
  async descartar(usuario: User, id: string): Promise<{ estado: string }> {
    const p = await this.suya(usuario, id);
    if (p.estado !== 'pendiente') {
      throw new ConflictException(`Esa propuesta ${ESTADOS[p.estado]}.`);
    }
    await this.guardadas.moverPropuesta(usuario.company_id, id, 'pendiente', {
      estado: 'descartada',
    });
    return { estado: 'descartada' };
  }

  /** «Crear evento»: lo arma su propio servicio (cotizacion-nueva.service). */
  async proponerCotizacionNueva(
    usuario: User,
    datos: DatosDeLaNueva,
    hoy: string,
  ) {
    await this.deRecepcion.alProponerLaNueva(usuario, datos);
    return this.nuevas.proponer(usuario, datos, hoy);
  }

  // ---------- Por dentro ----------

  /** Aplica los cambios a una copia y revisa las reglas (doc 20 §4 y §5). */
  private async armar(
    q: CotizacionParaCambiar,
    usuario: User,
    cambios: Cambio[],
    hoy: string,
    cabecera?: CambioDeCabecera,
  ) {
    const no = porQueNo(q, usuario);
    if (no) throw new ErrorDeHerramienta(no);
    const empresa = usuario.company_id;
    // Los servicios, si la propuesta los trae (puede ser solo de cabecera).
    let r: {
      foto: FotoGuardada;
      lineas: LineaDelCambio[];
      avisos: string[];
      diasTocados: number[];
      bajanPersonas: boolean;
    } = {
      foto: q.items ?? {},
      lineas: [],
      avisos: [],
      diasTocados: [],
      bajanPersonas: false,
    };
    if (cambios.length > 0) {
      const catalogo = await this.catalogo.catalogo(empresa);
      const fecha = diaDelEvento(q.event_date) ?? hoy;
      const fin = diaDelEvento(q.event_end_date);
      const editada = editarFoto(
        q.items,
        cambios,
        catalogo,
        {
          fecha,
          personas: n(q.people_count),
          ninos: n(q.children_count),
          esTourOperador: esTourOperador(q.clients?.client_type),
          ultimoDia: fin && fin > fecha ? fin : null,
        },
        ofrecible,
      );
      if (!editada.ok) {
        throw new ErrorDeHerramienta(
          `No se puede armar así:\n- ${editada.errores.slice(0, 12).join('\n- ')}`,
        );
      }
      r = editada;
    }
    const conCabecera = revisarCabecera(q, usuario, r.foto, cabecera, hoy);
    // La fecha nueva contra los eventos aceptados, como «Crear evento»
    // (doc 20 §17, mejora 3).
    if (conCabecera.nueva.event_date) {
      const { has_conflicts } =
        await this.cotizaciones.checkConflictsWithExistingQuotations(
          {
            event_date: conCabecera.nueva.event_date,
            ...(conCabecera.nueva.event_end_date
              ? { event_end_date: conCabecera.nueva.event_end_date }
              : {}),
          },
          empresa,
        );
      if (has_conflicts) {
        conCabecera.avisos.unshift(
          'Esas fechas se topan con un evento aceptado (tope de calendario): revísalo antes de aplicar.',
        );
      }
    }
    if (cambios.length === 0 && conCabecera.lineas.length === 0) {
      throw new ErrorDeHerramienta(
        'No cambia nada: la cotización ya está así.',
      );
    }
    const diasTocados = [
      ...new Set([...r.diasTocados, ...conCabecera.diasTocados]),
    ];
    const choque = choqueConLoServido(q, diasTocados, hoy);
    if (choque) throw new ErrorDeHerramienta(choque);
    const { total, parche } = parcheDe(q, conCabecera.foto, conCabecera.nueva);
    const avisos = [...conCabecera.avisos, ...r.avisos];
    let cuotas: ReturnType<typeof cuotasDespues> | undefined;

    if (q.quotation_status === QuotationStatus.ACEPTADA) {
      if (total <= 0) {
        throw new ErrorDeHerramienta(
          'Una cotización aceptada no puede quedar en $0: para anularla se usa «Anular evento» en Post-Venta.',
        );
      }
      const [compras, impresas, plata] = await Promise.all([
        this.guardadas.comprasDelEvento(empresa, q.id),
        this.logistica.findDayPrints(empresa, q.id),
        this.repositorio.plataDe(q.id),
      ]);
      if (compras > 0) {
        if (r.bajanPersonas && usuario.role !== UserRole.ADMINISTRADOR) {
          throw new ErrorDeHerramienta(
            'Este evento ya tiene compras: solo un administrador baja personas (como en Post-Venta → Servicios).',
          );
        }
        avisos.unshift(
          'Este evento ya tiene compras registradas: Compras mostrará lo que falta o lo que sobra.',
        );
      }
      const yaImpresos = new Set(impresas.map((x) => Number(x.day)));
      const reimprimir = r.diasTocados.filter(
        (d) => d > 0 && yaImpresos.has(d),
      );
      if (reimprimir.length > 0) {
        avisos.push(
          `La ficha de cocina ${reimprimir.length === 1 ? `del día ${reimprimir[0]}` : `de los días ${reimprimir.join(', ')}`} ya se imprimió: hay que reimprimirla.`,
        );
      }
      cuotas = cuotasDespues(
        plata.cuotas,
        plata.abonos,
        plata.reembolsos,
        total - n(q.total_amount),
        hoy,
      );
    }
    return {
      lineas: [...conCabecera.lineas, ...r.lineas],
      diasTocados,
      bajanPersonas: r.bajanPersonas,
      avisos,
      total,
      parche,
      cuotas,
      cabecera: conCabecera.nueva,
    };
  }

  /** Al aplicar o deshacer, las reglas otra vez: pudo pasar el día. */
  private revisarDeNuevo(
    q: CotizacionParaCambiar,
    usuario: User,
    diasTocados: number[],
  ) {
    const no = porQueNo(q, usuario);
    if (no) throw new ForbiddenException(no);
    const choque = choqueConLoServido(q, diasTocados, hoyEnChile());
    if (choque) throw new ConflictException(choque);
  }

  private async suya(usuario: User, id: string): Promise<Propuesta> {
    const p = await this.guardadas.propuesta(usuario.company_id, id);
    // Solo quien la pidió la aplica: la tarjeta está en su conversación.
    if (!p || p.usuario_id !== usuario.id) {
      throw new NotFoundException('Esa propuesta no existe o no es tuya.');
    }
    return p;
  }

  private async cerrar(
    empresa: number,
    id: string,
    desde: EstadoDePropuesta,
    estado: EstadoDePropuesta,
    q: CotizacionParaCambiar,
  ) {
    try {
      // La huella de cómo quedó, para que deshacer sepa si alguien la tocó
      // después.
      const ahora = await this.guardadas.cotizacionParaCambiar(empresa, {
        id: q.id,
      });
      await this.guardadas.moverPropuesta(empresa, id, desde, {
        estado,
        aplicada_at: new Date().toISOString(),
        huella_despues: ahora ? huellaDe(ahora) : null,
      });
    } catch (e) {
      this.logger.warn(`propuesta ${id}: ${mensajeDe(e)}`);
    }
  }

  /** Un ErrorDeHerramienta (lo que no se puede) llega a la pantalla como
   *  conflicto, con su texto. */
  private comoHttp(e: unknown): unknown {
    return e instanceof ErrorDeHerramienta
      ? new ConflictException(e.message)
      : e;
  }
}

type NotaGuardada = {
  texto: string;
  canal: Canal;
  proximo_contacto: string | null;
};

type DespuesGuardado = {
  cambios: Cambio[];
  cabecera?: CabeceraNueva;
  parche: Parche;
  dias_tocados: number[];
  bajan_personas: boolean;
};
