import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { Plan } from 'src/auth/derechos';
import { DerechosService } from 'src/auth/derechos.service';
import { olvidarPerfil } from 'src/cache/memoria';
import { EmailService } from 'src/email/email.service';
import { EmailStructure } from 'src/email/types';
import { UserRole } from 'src/users/entities/user.entity';
import { UsersService } from 'src/users/users.service';
import { MercadoPagoService } from './mercadopago.service';
import { EmpresaParaCobro, PagosRepository } from './pagos.repository';

// LA MÁQUINA DE COBROS (16-09-2026, sprint B del paso 4+5).
//
// Dos entradas y ninguna más:
//  - `suscribir`: la empresa pide SU enlace de pago (con su id adentro).
//  - `procesarAviso`: llegó un aviso del proveedor, ya con la firma
//    verificada por el controller. Acá JAMÁS se confía en el cuerpo del
//    aviso: se consulta la verdad a Mercado Pago y recién ahí se toca
//    la empresa (plan §3.2, punto 10).
//
// La regla que está por encima de todas (plan §3.3 y §7.2): una empresa
// en `gratis` NUNCA entra a esta máquina. Valle del Sol y la demo no
// pagan, no se morosean, no se bloquean. Hay una prueba que lo demuestra.

const DIAS_DE_GRACIA = 7; // decisión 2, firmada el 16-09

// EL CAMBIO DE PLAN (18-09-2026, decisión de Felipe del 17-09 que
// mejora la decisión 4 del plan). Los planes se ordenan de menor a
// mayor; subir cobra hoy el proporcional de la diferencia por los días
// que quedan del mes pagado (sobre un mes de 30 días, como la
// industria), y bajar se agenda para cuando termine ese mes.
const ORDEN_DE_PLANES: Exclude<Plan, null>[] = ['cotiza', 'gestiona', 'crece'];
const DIAS_DEL_MES = 30;

export type CotizacionDeCambio = {
  modo: 'subir' | 'bajar' | 'igual';
  plan_actual: Exclude<Plan, null>;
  plan_nuevo: Exclude<Plan, null>;
  precio_actual: number;
  precio_nuevo: number;
  dias_restantes: number;
  /** Lo que se cobra HOY al subir (0 al bajar o si no quedan días). */
  proporcional: number;
  /** Cuándo rige: al subir, ahora; al bajar, cuando termine lo pagado. */
  rige_desde: string | null;
};

@Injectable()
export class PagosService {
  constructor(
    private readonly mercadoPago: MercadoPagoService,
    private readonly repo: PagosRepository,
    private readonly usersService: UsersService,
    private readonly derechosService: DerechosService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PagosService.name);
  }

  /**
   * La empresa pide su enlace de pago para un plan. Devuelve el enlace
   * del checkout de Mercado Pago, propio de esa empresa.
   */
  async suscribir(
    plan: Exclude<Plan, null>,
    companyId: number,
    correoDelPagador: string,
  ): Promise<{ enlace: string }> {
    if (!this.mercadoPago.configurado()) {
      throw new ServiceUnavailableException(
        'El pago en línea aún no está disponible: escríbenos y lo activamos altiro',
      );
    }
    const empresa = await this.empresa(companyId);
    if (empresa.estado_plan === 'gratis') {
      // Cortesía de la casa: no se le cobra (plan §3.3).
      throw new BadRequestException(
        'Tu cuenta es una cortesía: no necesita contratar un plan',
      );
    }
    const frontendUrl =
      this.config.get<string>('FRONTEND_URL') ?? 'https://www.eventi-app.com';
    const creada = await this.mercadoPago.crearSuscripcion(
      plan,
      companyId,
      correoDelPagador,
      `${frontendUrl}/plans/confirmation`,
    );
    // Se guarda la suscripción pendiente: cuando llegue el aviso, el
    // sistema ya sabe cuál esperaba. El plan NO se cambia todavía —
    // eso lo hace el aviso con la verdad del proveedor.
    await this.repo.actualizarEmpresa(companyId, {
      pago_proveedor: 'mercadopago',
      pago_suscripcion_id: creada.id,
    });
    this.logger.info(
      `empresa ${companyId} pidió su enlace del plan ${plan} (suscripción ${creada.id})`,
    );
    return { enlace: creada.init_point };
  }

  /** La pantalla "estamos confirmando tu pago" pregunta acá, directo a
   *  la base (sin memoria de por medio). */
  async estado(companyId: number) {
    const empresa = await this.empresa(companyId);
    return {
      plan: empresa.plan,
      estado_plan: empresa.estado_plan,
      pagado_hasta: empresa.pagado_hasta,
      // Para la pestaña Plan (18-09): si paga por Mercado Pago puede
      // cambiar de plan por acá, y si ya agendó una bajada se le dice.
      pago_proveedor: empresa.pago_proveedor,
      plan_programado: empresa.plan_programado,
    };
  }

  /**
   * Cuánto cuesta cambiar de plan, ANTES de que el cliente decida. Solo
   * para empresas activas que pagan por Mercado Pago con su suscripción
   * viva; las demás (prueba, cortesía, activadas a mano) no cambian de
   * plan acá.
   */
  async cotizarCambio(
    companyId: number,
    planNuevo: Exclude<Plan, null>,
    ahora = new Date(),
  ): Promise<CotizacionDeCambio> {
    const empresa = await this.empresaQuePuedeCambiar(companyId);
    const planActual = empresa.plan as Exclude<Plan, null>;
    const [precioActual, precioNuevo] = await Promise.all([
      this.mercadoPago.precioDelPlan(planActual),
      this.mercadoPago.precioDelPlan(planNuevo),
    ]);
    const posicionActual = ORDEN_DE_PLANES.indexOf(planActual);
    const posicionNueva = ORDEN_DE_PLANES.indexOf(planNuevo);
    const modo =
      posicionNueva > posicionActual
        ? 'subir'
        : posicionNueva < posicionActual
          ? 'bajar'
          : 'igual';
    const vence = empresa.pagado_hasta ? new Date(empresa.pagado_hasta) : null;
    const diasRestantes = vence
      ? Math.min(
          DIAS_DEL_MES,
          Math.max(
            0,
            Math.ceil(
              (vence.getTime() - ahora.getTime()) / (24 * 60 * 60 * 1000),
            ),
          ),
        )
      : 0;
    const proporcional =
      modo === 'subir'
        ? Math.round(
            ((precioNuevo - precioActual) * diasRestantes) / DIAS_DEL_MES,
          )
        : 0;
    return {
      modo,
      plan_actual: planActual,
      plan_nuevo: planNuevo,
      precio_actual: precioActual,
      precio_nuevo: precioNuevo,
      dias_restantes: diasRestantes,
      proporcional,
      rige_desde:
        modo === 'subir'
          ? ahora.toISOString()
          : modo === 'bajar'
            ? (empresa.pagado_hasta ?? null)
            : null,
    };
  }

  /**
   * El cambio de plan de verdad.
   *  - SUBIR: se cobra hoy el proporcional con un pago único; el plan
   *    nuevo rige cuando llega el aviso de ese pago (o al tiro si no
   *    hay nada que cobrar). El próximo cobro mensual sale con el
   *    precio nuevo.
   *  - BAJAR: queda agendado (plan_programado) y el monto de la
   *    suscripción baja desde ya, así el próximo cobro es el menor. El
   *    plan cambia cuando llega ese cobro o cuando el reloj ve
   *    cumplido lo pagado.
   */
  async cambiarPlan(
    companyId: number,
    planNuevo: Exclude<Plan, null>,
    correoDelPagador: string,
  ): Promise<
    | { modo: 'subir'; enlace: string | null; proporcional: number }
    | { modo: 'bajar'; rige_desde: string | null }
  > {
    const cotizacion = await this.cotizarCambio(companyId, planNuevo);
    const empresa = await this.empresaQuePuedeCambiar(companyId);
    if (cotizacion.modo === 'igual') {
      throw new BadRequestException('Ese ya es tu plan');
    }

    if (cotizacion.modo === 'bajar') {
      await this.mercadoPago.actualizarMontoSuscripcion(
        empresa.pago_suscripcion_id!,
        cotizacion.precio_nuevo,
      );
      await this.repo.actualizarEmpresa(companyId, {
        plan_programado: planNuevo,
      });
      this.logger.info(
        `empresa ${companyId} (${empresa.name}) baja a ${planNuevo} cuando termine lo pagado (${cotizacion.rige_desde})`,
      );
      return { modo: 'bajar', rige_desde: cotizacion.rige_desde };
    }

    // Subir sin nada que cobrar (el mes ya está por renovarse): rige al
    // tiro, y el próximo cobro sale con el precio nuevo.
    if (cotizacion.proporcional <= 0) {
      await this.aplicarSubida(companyId, planNuevo);
      return { modo: 'subir', enlace: null, proporcional: 0 };
    }

    const frontendUrl =
      this.config.get<string>('FRONTEND_URL') ?? 'https://www.eventi-app.com';
    const pago = await this.mercadoPago.crearPagoUnico({
      monto: cotizacion.proporcional,
      titulo: `Eventia · subir a ${planNuevo} (proporcional de ${cotizacion.dias_restantes} días)`,
      referencia: `cambio:${companyId}:${planNuevo}`,
      correoDelPagador,
      backUrl: `${frontendUrl}/plans/confirmation?plan=${planNuevo}`,
    });
    this.logger.info(
      `empresa ${companyId} (${empresa.name}) pidió subir a ${planNuevo}: proporcional $${cotizacion.proporcional} (pago ${pago.id})`,
    );
    return {
      modo: 'subir',
      enlace: pago.init_point,
      proporcional: cotizacion.proporcional,
    };
  }

  /**
   * Un aviso del proveedor, con la firma ya verificada. `tipo` y
   * `dataId` vienen de la URL del aviso; el resto se le pregunta a
   * Mercado Pago. Devuelve qué se hizo, para el log y las pruebas.
   */
  async procesarAviso(
    tipo: string,
    dataId: string,
    cuerpo: unknown,
  ): Promise<string> {
    // ¿Ya se procesó? La idempotencia vive en la base (migración 114):
    // Mercado Pago reenvía el mismo aviso cada 15 minutos hasta ver un
    // 200, y un pago no puede activar dos veces. El registro se hace
    // AL FINAL (tras procesar bien): si algo falla a mitad de camino,
    // el reenvío del proveedor reintenta completo.
    const clave = `${tipo}:${dataId}`;
    if (await this.repo.avisoYaProcesado(clave)) {
      return 'repetido: ya estaba procesado';
    }

    let resultado: { accion: string; companyId: number | null };
    if (tipo === 'subscription_preapproval') {
      resultado = await this.avisoDeSuscripcion(dataId);
    } else if (
      tipo === 'payment' ||
      tipo === 'subscription_authorized_payment'
    ) {
      resultado = await this.avisoDePago(tipo, dataId);
    } else {
      resultado = {
        accion: `tipo ${tipo} ignorado a propósito`,
        companyId: null,
      };
    }

    await this.repo.anotarAviso({
      aviso_id: clave,
      tipo,
      company_id: resultado.companyId,
      cuerpo,
    });
    return resultado.accion;
  }

  // ---- los dos tipos de aviso ----

  /** El external_reference viaja como `empresa:plan` (17-09). El plan
   *  va adentro porque la suscripción "con pago pendiente" no cuelga
   *  del plan en Mercado Pago — ver mercadopago.service. */
  private leerReferencia(ref: string | undefined): {
    companyId: number | null;
    plan: Exclude<Plan, null> | null;
    /** `cambio:empresa:plan` = el pago único del proporcional de una subida. */
    cambio: boolean;
  } {
    const partes = (ref ?? '').split(':');
    const cambio = partes[0] === 'cambio';
    const [idTexto, planTexto] = cambio ? partes.slice(1) : partes;
    const companyId = Number(idTexto);
    const plan = ['cotiza', 'gestiona', 'crece'].includes(planTexto)
      ? (planTexto as Exclude<Plan, null>)
      : null;
    return {
      companyId: Number.isFinite(companyId) && companyId > 0 ? companyId : null,
      plan,
      cambio,
    };
  }

  private async avisoDeSuscripcion(preapprovalId: string) {
    const suscripcion =
      await this.mercadoPago.consultarSuscripcion(preapprovalId);
    const referencia = this.leerReferencia(suscripcion.external_reference);
    const companyId = referencia.companyId;
    if (companyId === null) {
      return {
        accion: `suscripción ${preapprovalId} sin empresa adentro: ignorada`,
        companyId: null,
      };
    }
    const empresa = await this.empresa(companyId);
    if (empresa.estado_plan === 'gratis') {
      // La regla de oro: gratis no se toca NUNCA (plan §3.3).
      return {
        accion: `empresa ${companyId} es cortesía: aviso ignorado`,
        companyId,
      };
    }

    if (suscripcion.status === 'authorized') {
      const plan =
        referencia.plan ??
        this.mercadoPago.planDe(suscripcion.preapproval_plan_id);
      if (!plan) {
        this.logger.error(
          `suscripción ${preapprovalId} autorizada con un plan desconocido (${suscripcion.preapproval_plan_id})`,
        );
        return { accion: 'plan desconocido: no se activó nada', companyId };
      }
      await this.repo.actualizarEmpresa(companyId, {
        plan,
        estado_plan: 'activo',
        plan_cambiado_en: new Date().toISOString(),
        pago_proveedor: 'mercadopago',
        pago_suscripcion_id: suscripcion.id,
        pagado_hasta: suscripcion.next_payment_date ?? null,
        gracia_hasta: null,
      });
      await this.queRijaAlInstante(companyId);
      this.logger.info(
        `empresa ${companyId} (${empresa.name}) ACTIVA en ${plan}, pagada hasta ${suscripcion.next_payment_date}`,
      );
      return { accion: `activada en ${plan}`, companyId };
    }

    if (suscripcion.status === 'cancelled') {
      // Decisión 5: conserva su plan hasta que termine el mes pagado;
      // ahí el reloj lo bloquea. La marca de "canceló" es la
      // suscripción en NULL con el proveedor puesto (migración 114).
      await this.repo.actualizarEmpresa(companyId, {
        pago_suscripcion_id: null,
      });
      this.logger.warn(
        `empresa ${companyId} (${empresa.name}) canceló: conserva ${empresa.plan} hasta ${empresa.pagado_hasta ?? 'que el reloj la revise'}`,
      );
      return { accion: 'cancelada: conserva hasta lo pagado', companyId };
    }

    return {
      accion: `suscripción en ${suscripcion.status}: sin cambios`,
      companyId,
    };
  }

  private async avisoDePago(tipo: string, pagoId: string) {
    // El aviso de pago recurrente. Se consulta el pago para saber de
    // qué empresa es y si aprobó.
    const pago = await this.mercadoPago.consultarPago(pagoId).catch(() => null);
    if (!pago) {
      // Los avisos `subscription_authorized_payment` traen el id de la
      // FACTURA de la suscripción, no de un pago consultable en
      // /v1/payments. No es un error: la verdad de la activación y del
      // "pagado hasta" llega igual por el aviso de la suscripción.
      return {
        accion: `${tipo} ${pagoId} no consultable como pago: ignorado`,
        companyId: null,
      };
    }
    const referencia = this.leerReferencia(pago.external_reference);
    const companyId = referencia.companyId;
    if (companyId === null) {
      return { accion: 'pago sin empresa adentro: ignorado', companyId: null };
    }
    const empresa = await this.empresa(companyId);
    if (empresa.estado_plan === 'gratis') {
      return {
        accion: `empresa ${companyId} es cortesía: aviso ignorado`,
        companyId,
      };
    }

    // El pago único del proporcional de una SUBIDA (cambio de plan).
    if (referencia.cambio) {
      if (pago.status === 'approved' && referencia.plan) {
        await this.aplicarSubida(companyId, referencia.plan);
        return { accion: `subida a ${referencia.plan} aplicada`, companyId };
      }
      return {
        accion: `pago del cambio en ${pago.status}: sin cambios`,
        companyId,
      };
    }

    if (pago.status === 'approved') {
      // El "pagado hasta" de verdad lo dice la suscripción (su próximo
      // cobro), no el pago suelto.
      const suscripcionId = pago.metadata?.preapproval_id;
      let pagadoHasta: string | null = null;
      if (suscripcionId) {
        const suscripcion = await this.mercadoPago
          .consultarSuscripcion(suscripcionId)
          .catch(() => null);
        pagadoHasta = suscripcion?.next_payment_date ?? null;
      }
      // Si había una bajada agendada, este cobro (que ya salió con el
      // monto menor) es el que la hace efectiva.
      const bajada = empresa.plan_programado as Exclude<Plan, null> | null;
      await this.repo.actualizarEmpresa(companyId, {
        estado_plan: 'activo',
        pagado_hasta: pagadoHasta,
        gracia_hasta: null,
        ...(bajada
          ? {
              plan: bajada,
              plan_programado: null,
              plan_cambiado_en: new Date().toISOString(),
            }
          : {}),
      });
      await this.queRijaAlInstante(companyId);
      this.logger.info(
        `empresa ${companyId} (${empresa.name}): pago aprobado, corre hasta ${pagadoHasta ?? 'la próxima revisión'}${bajada ? `, ya en ${bajada}` : ''}`,
      );
      return {
        accion: bajada
          ? `pago aprobado: bajó a ${bajada}`
          : 'pago aprobado: al día',
        companyId,
      };
    }

    if (pago.status === 'rejected') {
      const gracia = new Date(
        Date.now() + DIAS_DE_GRACIA * 24 * 60 * 60 * 1000,
      ).toISOString();
      await this.repo.actualizarEmpresa(companyId, {
        estado_plan: 'moroso',
        plan_cambiado_en: new Date().toISOString(),
        gracia_hasta: gracia,
      });
      await this.queRijaAlInstante(companyId);
      await this.avisarPagoFallido(companyId, empresa.name, gracia);
      this.logger.warn(
        `empresa ${companyId} (${empresa.name}): pago RECHAZADO, morosa con gracia hasta ${gracia}`,
      );
      return { accion: 'pago rechazado: morosa con gracia', companyId };
    }

    return { accion: `pago en ${pago.status}: sin cambios`, companyId };
  }

  // ---- ayudantes ----

  private async empresa(companyId: number): Promise<EmpresaParaCobro> {
    const empresa = await this.repo.empresa(companyId);
    if (!empresa) {
      throw new BadRequestException(`No existe la empresa ${companyId}`);
    }
    return empresa;
  }

  /** Solo cambia de plan por acá la empresa activa que paga por Mercado
   *  Pago con su suscripción viva. Prueba, cortesía, morosa, bloqueada
   *  o activada a mano: no. */
  private async empresaQuePuedeCambiar(
    companyId: number,
  ): Promise<EmpresaParaCobro> {
    if (!this.mercadoPago.configurado()) {
      throw new ServiceUnavailableException(
        'El cambio de plan en línea aún no está disponible',
      );
    }
    const empresa = await this.empresa(companyId);
    if (empresa.estado_plan === 'gratis') {
      throw new BadRequestException(
        'Tu cuenta es una cortesía: no cambia de plan por acá',
      );
    }
    if (empresa.estado_plan !== 'activo') {
      throw new BadRequestException(
        'Para cambiar de plan tu cuenta tiene que estar activa y al día',
      );
    }
    if (
      empresa.pago_proveedor !== 'mercadopago' ||
      !empresa.pago_suscripcion_id ||
      !empresa.plan ||
      !ORDEN_DE_PLANES.includes(empresa.plan as Exclude<Plan, null>)
    ) {
      throw new BadRequestException(
        'Tu plan no se cobra por Mercado Pago: para cambiarlo escríbenos y lo arreglamos altiro',
      );
    }
    return empresa;
  }

  /** La subida rige al instante: plan nuevo, memoria olvidada, y la
   *  suscripción pasa a cobrar el precio nuevo desde el próximo mes. */
  private async aplicarSubida(
    companyId: number,
    planNuevo: Exclude<Plan, null>,
  ) {
    const empresa = await this.empresa(companyId);
    await this.repo.actualizarEmpresa(companyId, {
      plan: planNuevo,
      plan_programado: null,
      plan_cambiado_en: new Date().toISOString(),
    });
    await this.queRijaAlInstante(companyId);
    if (empresa.pago_suscripcion_id) {
      const precioNuevo = await this.mercadoPago.precioDelPlan(planNuevo);
      await this.mercadoPago
        .actualizarMontoSuscripcion(empresa.pago_suscripcion_id, precioNuevo)
        .catch((error: unknown) =>
          this.logger.error(
            `empresa ${companyId}: subió a ${planNuevo} pero no pude ajustar el monto de su suscripción: ${String(error)}`,
          ),
        );
    }
    this.logger.info(
      `empresa ${companyId} (${empresa.name}) SUBIÓ a ${planNuevo}: rige al instante`,
    );
  }

  /** Calco de la Torre (paso 3.2): el plan nuevo rige al instante o el
   *  cliente que acaba de pagar seguiría viendo el plan viejo. */
  private async queRijaAlInstante(companyId: number) {
    this.derechosService.olvidar(companyId);
    const usuarios = await this.usersService
      .findAll(companyId)
      .catch(() => [] as { user_id: string }[]);
    for (const usuario of usuarios) {
      olvidarPerfil(usuario.user_id);
    }
  }

  private async avisarPagoFallido(
    companyId: number,
    nombreDeLaEmpresa: string,
    graciaHasta: string,
  ) {
    try {
      const usuarios = await this.usersService.findAll(companyId);
      const correos = usuarios
        .filter((u) => u.role === UserRole.ADMINISTRADOR)
        .map((u) => u.email)
        .filter(Boolean);
      for (const correo of correos) {
        await this.emailService.sendEmail(correo, EmailStructure.PAGO_FALLIDO, {
          companyName: nombreDeLaEmpresa,
          graciaHasta,
        });
      }
    } catch (error) {
      // El correo jamás bota el procesamiento del aviso.
      this.logger.error(
        `no pude avisar el pago fallido de la empresa ${companyId}: ${String(error)}`,
      );
    }
  }
}
