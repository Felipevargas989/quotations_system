import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { derechosDe } from 'src/auth/derechos';
import { DerechosService } from 'src/auth/derechos.service';
import { olvidarPerfil } from 'src/cache/memoria';
import { CompaniesRepository } from 'src/companies/companies.repository';
import { Company } from 'src/companies/entities/company.entity';
import { CustomerSatisfactionSurveyService } from 'src/customer_satisfaction_survey/service';
import { EmailService } from 'src/email/email.service';
import { EmailStructure } from 'src/email/types/index';
import {
  etiquetaDeOrigen,
  limpiarOrigen,
} from 'src/quotations/origen-del-lead';
import { CreateUserDto } from 'src/users/dto/create-user.dto';
import { UserRole } from 'src/users/entities/user.entity';
import { UsersService } from 'src/users/users.service';
import { logSafe } from '../logging/log-safe';
import { ActualizarEmpresaDto } from './dto/actualizar-empresa.dto';
import { CreateSuscriptionDto } from './dto/create-suscription.dto';
import { QuotationStatsResponse } from './dto/quotation-stats.dto';
import { RegisterLeadDto } from './dto/register-lead.dto';
import { TorreEmpresa, TorreResponse, TorreUsuario } from './dto/torre.dto';
import { SuperAdminRepository } from './super-admin.repository';

@Injectable()
export class SuperAdminService {
  constructor(
    private readonly logger: PinoLogger,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
    private readonly companiesRepository: CompaniesRepository,
    private readonly superAdminRepository: SuperAdminRepository,
    @Inject(forwardRef(() => CustomerSatisfactionSurveyService))
    private readonly customerSatisfactionSurveyService: CustomerSatisfactionSurveyService,
    private readonly emailService: EmailService,
    private readonly derechosService: DerechosService,
  ) {}

  /**
   * El mensaje real de un error, venga como venga (16-09-2026). Los
   * errores de Supabase NO son instancias de Error: son objetos planos
   * con `message` (PostgrestError, AuthError). `String(objeto)` fabrica
   * "[object Object]" — el mismo bicho del embudo del 14-09, que volvió
   * a morder EL MISMO DÍA que el alta salió al laboratorio, por esta
   * otra rendija. Se mira `message` antes de rendirse.
   */
  private mensajeDe(error: unknown): string {
    if (error instanceof Error) return error.message;
    const m = (error as { message?: unknown } | null)?.message;
    if (typeof m === 'string' && m) return m;
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  async createSuscription(createSuscriptionDto: CreateSuscriptionDto) {
    this.logger.info(
      `createSuscription with createSuscriptionDto ${logSafe(createSuscriptionDto)}`,
    );

    try {
      // DE DÓNDE LLEGÓ (migración 116, 18-09-2026): el navegador manda
      // las huellas crudas del aterrizaje; el motor filtra las llaves y
      // pone la etiqueta. Sin huellas = "Directo" (se registró sola, sin
      // campaña). Las empresas creadas a mano desde la Torre no pasan
      // por acá y quedan en NULL = "no se sabe".
      const origenDetalle = limpiarOrigen(createSuscriptionDto.origen_detalle);
      // 1. Create company in public.companies table
      const newCompany: Omit<Company, 'id'> = {
        name: createSuscriptionDto.company_name,
        // all notifications are enabled by default
        notifications: {
          emails: Object.values(EmailStructure).reduce(
            (acc, email) => {
              acc[email] = true;
              return acc;
            },
            {} as Record<EmailStructure, boolean>,
          ),
        },
        currency: createSuscriptionDto.currency,
        is_active: true,
        // LA PRUEBA DE 7 DÍAS (paso 3.2, 14-09-2026). Nace en el plan más
        // chico pero en estado `prueba`, que durante esos días le da los
        // derechos de Opera y Crece: la landing promete probar todo, y el
        // que prueba todo compra más arriba. Al vencer, el reloj de las
        // 11:00 la deja bloqueada sin borrarle ni un dato.
        plan: 'cotiza',
        estado_plan: 'prueba',
        prueba_vence: new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        origen: etiquetaDeOrigen(origenDetalle),
        origen_detalle: origenDetalle,
      };
      const { data: companyData, error: companyError } =
        await this.companiesRepository.create(newCompany);

      if (companyError) {
        throw new Error(`Failed to create company: ${companyError.message}`);
      }

      if (!companyData) {
        throw new Error(`Failed to create company`);
      }

      //  2. Create user
      const newUser: CreateUserDto = {
        email: createSuscriptionDto.admin_email,
        full_name: createSuscriptionDto.admin_full_name,
        role: UserRole.ADMINISTRADOR,
        password: createSuscriptionDto.admin_password,
      };

      let userData: unknown;
      try {
        // usersService.create sigue tipado `any` (deuda vieja): acá se le
        // pone la forma que de hecho devuelve, para que el lint no mire
        // para otro lado justo en la puerta pública.
        const resultado = (await this.usersService.create(
          newUser,
          companyData.id,
        )) as { data: unknown; error: unknown };
        // El objeto viaja TAL CUAL al catch: ahí se traduce y se mira
        // su `code`. Envolverlo antes le borraba el código de la base.
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        if (resultado.error) throw resultado.error;
        userData = resultado.data;
      } catch (userError) {
        // LA COMPENSACIÓN (16-09-2026): la empresa ya nació, pero su
        // administrador no pudo crearse (lo típico: el correo ya tiene
        // cuenta). Sin esto quedaba una empresa huérfana por CADA
        // intento fallido del visitante. Se borra la recién creada y se
        // responde algo que una persona entienda.
        const { error: errorDelBorrado } =
          await this.companiesRepository.deleteById(companyData.id);
        if (errorDelBorrado) {
          // Si el borrado también falla (el 16-09 fue por permisos de la
          // base), la huérfana queda y ALGUIEN tiene que enterarse: al
          // registro con su nombre, nunca en silencio.
          this.logger.error(
            `la compensación no pudo borrar la empresa ${companyData.id} (${companyData.name}): ${this.mensajeDe(errorDelBorrado)}`,
          );
        }
        const mensaje = this.mensajeDe(userError);
        const codigo = (userError as { code?: string } | null)?.code;
        if (
          codigo === '23505' ||
          /already|registered|exists|duplicate/i.test(mensaje)
        ) {
          throw new ConflictException(
            'Ese correo ya tiene una cuenta en Eventia. Entra con tu contraseña o recupérala desde "¿Olvidaste tu contraseña?".',
          );
        }
        throw new BadRequestException(`No pudimos crear tu cuenta: ${mensaje}`);
      }

      // create customer satisfaction survey template
      await this.customerSatisfactionSurveyService.createTemplate(
        companyData.id,
      );

      // send email to the admin
      try {
        void this.emailService.sendEmail(
          createSuscriptionDto.admin_email,
          EmailStructure.NEW_ACCOUNT,
          // La bienvenida útil (16-09-2026): nombre de la empresa y
          // cuándo vence la prueba. Antes iba genérica, sin siquiera un
          // enlace para entrar.
          {
            companyName: companyData.name,
            pruebaVence: newCompany.prueba_vence ?? null,
          },
        );
      } catch (error) {
        // Do not throw error, just log it
        this.logger.error(error);
      }
      // Torre de Control (05-08): aviso 🏢 SIN espera (cura 05-08) —
      // la respuesta al visitante jamás espera a Resend.
      void this.alertNuevaEmpresa(companyData.name);
      return {
        userData,
        companyData,
      };
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async getStatsLastMonth(): Promise<QuotationStatsResponse> {
    this.logger.info(`getStatsLastMonth for all companies`);

    try {
      const rangeEnd = new Date();
      const rangeStart = new Date(rangeEnd);
      rangeStart.setDate(rangeStart.getDate() - 30);
      const periodStart = rangeStart.toISOString().split('T')[0];
      const periodEnd = rangeEnd.toISOString().split('T')[0];
      const period = `${periodStart} to ${periodEnd}`;

      const { data, error } =
        await this.superAdminRepository.getStatsLastMonth();

      if (error) {
        this.logger.error(`Error getting stats: ${error.message}`);
        throw new Error(`Failed to get quotation stats: ${error.message}`);
      }

      if (!data) {
        throw new Error('No data returned from repository');
      }

      // Calculate total quotations and total amount for all companies
      const total_quotations_all_companies = data.reduce(
        (sum, company) => sum + company.total_quotations,
        0,
      );
      const total_amount_all_companies = data.reduce(
        (sum, company) => sum + company.total_amount,
        0,
      );

      // La serie diaria agregada se jubiló (05-08): el gráfico ahora es
      // de barras mensuales por empresa y la línea "Total" era ruido.

      const {
        data: usersLastSignIns,
        error: usersLastSignInsError,
        totals: userTotals,
      } = await this.superAdminRepository.getUsersLastSignIns({
        startDate: rangeStart,
        endDate: rangeEnd,
      });

      if (usersLastSignInsError) {
        this.logger.error(
          `Error getting auth user stats: ${usersLastSignInsError.message}`,
        );
        throw new Error(
          `Failed to get user stats: ${usersLastSignInsError.message}`,
        );
      }

      const response: QuotationStatsResponse = {
        period,
        companies: data,
        total_quotations_all_companies,
        total_amount_all_companies,
        user_sign_in_stats: {
          period_start: periodStart,
          period_end: periodEnd,
          total_users: userTotals.total_users,
          total_signed_in_in_period: userTotals.total_signed_in_in_period,
          total_never_signed_in: userTotals.total_never_signed_in,
          users: usersLastSignIns || [],
        },
      };

      this.logger.info(
        `Successfully retrieved stats for all companies: ${total_quotations_all_companies} quotations in period ${period}`,
      );

      return response;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error in getStatsLastMonth service: ${errorMessage}`);
      throw error;
    }
  }

  // Mudanza #7 (28-07): el área super-admin EXIGE estar en la
  // allowlist SUPER_ADMIN_EMAILS — antes bastaba cualquier sesión.
  assertSuperAdmin(email?: string) {
    const lista = (this.configService.get<string>('SUPER_ADMIN_EMAILS') || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (!email || !lista.includes(email.toLowerCase())) {
      throw new ForbiddenException('Solo super-administradores.');
    }
  }

  listCompanies() {
    return this.superAdminRepository.listCompanies();
  }

  async createCompanyOnly(name: string) {
    const empresa = await this.superAdminRepository.createCompanyOnly(name);
    // Torre de Control (05-08): aviso 🏢 SIN espera; nunca rompe ni
    // frena la creación (cura 05-08).
    void this.alertNuevaEmpresa(name);
    return empresa;
  }

  // ---------- Torre de Control (tanda 1, 05-08) ----------
  // Destinatarios de las alertas: SIEMPRE del ConfigService (la misma
  // allowlist de assertSuperAdmin), jamás correos escritos a fuego.
  private superAdminRecipients(): string[] {
    return (this.configService.get<string>('SUPER_ADMIN_EMAILS') || '')
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);
  }

  // Alerta 🔔 de lead nuevo. Con try/catch interno: el envío JAMÁS
  // rompe el flujo (el lead vale más que el correo).
  private async alertNuevoLead(dto: RegisterLeadDto): Promise<void> {
    try {
      const destinatarios = this.superAdminRecipients();
      if (destinatarios.length === 0) return;
      await this.emailService.sendEmail(
        destinatarios,
        EmailStructure.SUPER_ADMIN_NEW_LEAD,
        {
          nombre: dto.nombre,
          telefono: dto.telefono,
          email: dto.email,
          nombre_empresa: dto.nombre_empresa,
          personas_empresa: dto.personas_empresa,
          ventas_anuales: dto.ventas_anuales,
        },
      );
    } catch (error) {
      this.logger.error(
        `El lead quedó guardado pero la alerta falló: ${
          error instanceof Error ? error.message : 'error desconocido'
        }`,
      );
    }
  }

  // Alerta 🏢 de empresa nueva. Mismo contrato: jamás rompe el flujo.
  private async alertNuevaEmpresa(nombre: string): Promise<void> {
    try {
      const destinatarios = this.superAdminRecipients();
      if (destinatarios.length === 0) return;
      await this.emailService.sendEmail(
        destinatarios,
        EmailStructure.SUPER_ADMIN_NEW_COMPANY,
        { name: nombre },
      );
    } catch (error) {
      this.logger.error(
        `La empresa quedó creada pero la alerta falló: ${
          error instanceof Error ? error.message : 'error desconocido'
        }`,
      );
    }
  }

  // GET torre: la tabla "quién ha entrado" + las 6 tarjetas. El cruce
  // auth.users ↔ user_profiles va por EMAIL (los ids no calzan, medido
  // en la base); companies pone el nombre de la empresa.
  async getTorre(): Promise<TorreResponse> {
    this.logger.info('getTorre (super-admin)');
    // Inicio de mes en UTC, EXACTAMENTE como las stats mensuales (cura
    // 05-08): todo el sistema cuenta en UTC — coherencia manda.
    const ahora = new Date();
    const inicioMes = new Date(
      Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1),
    );

    const [base, leadsTotal, leadsMes] = await Promise.all([
      this.superAdminRepository.getTorreBase(),
      this.superAdminRepository.countLeads(),
      this.superAdminRepository.countLeads(inicioMes.toISOString()),
    ]);

    // Edge teórico OMITIDO a propósito (revisión 05-08): dos perfiles
    // con el mismo correo — gana el último; no hay caso real hoy.
    const perfilPorEmail = new Map(
      base.profiles
        .filter((p) => p.email)
        .map((p) => [String(p.email).toLowerCase(), p]),
    );
    const nombreEmpresa = new Map(base.companies.map((c) => [c.id, c.name]));

    const usuarios: TorreUsuario[] = base.authUsers
      .map((u) => {
        const perfil = u.email
          ? perfilPorEmail.get(u.email.toLowerCase())
          : undefined;
        return {
          email: u.email || '',
          nombre: perfil?.full_name || '',
          empresa:
            perfil?.company_id != null
              ? nombreEmpresa.get(perfil.company_id) || ''
              : '',
          rol: perfil?.role || '',
          ultimo_inicio_sesion: u.last_sign_in_at,
          creado: u.created_at,
        };
      })
      // Último inicio de sesión descendente; los que nunca han
      // entrado, al final.
      .sort((a, b) => {
        if (!a.ultimo_inicio_sesion && !b.ultimo_inicio_sesion) return 0;
        if (!a.ultimo_inicio_sesion) return 1;
        if (!b.ultimo_inicio_sesion) return -1;
        return a.ultimo_inicio_sesion < b.ultimo_inicio_sesion ? 1 : -1;
      });

    const delMes = (iso: string | null) =>
      !!iso && new Date(iso).getTime() >= inicioMes.getTime();

    // LA TABLA DE EMPRESAS CON SU PLAN (paso 3.2, 14-09-2026). Es por
    // donde Felipe vende a mano: ve en qué plan está cada cliente, cuánto
    // le queda de prueba y qué tan cerca está de sus topes. Los derechos
    // se calculan con la misma tabla que usa el motor, así que la Torre
    // nunca puede mostrar un plan distinto del que rige de verdad.
    const usuariosPorEmpresa = new Map<number, number>();
    for (const perfil of base.profiles) {
      if (perfil.company_id === null) continue;
      usuariosPorEmpresa.set(
        perfil.company_id,
        (usuariosPorEmpresa.get(perfil.company_id) ?? 0) + 1,
      );
    }
    const empresas: TorreEmpresa[] = base.companies
      .map((c) => {
        const derechos = derechosDe(c);
        return {
          id: c.id,
          nombre: c.name,
          creada: c.created_at,
          plan: c.plan ?? null,
          estado_plan: c.estado_plan ?? null,
          prueba_vence: c.prueba_vence ?? null,
          modulos_propios: c.modulos_propios ?? [],
          origen: c.origen ?? null,
          usuarios: usuariosPorEmpresa.get(c.id) ?? 0,
          usuarios_max: derechos.usuarios_max,
          cotizaciones_mes: derechos.cotizaciones_mes,
        };
      })
      .sort((a, b) => a.id - b.id);

    return {
      usuarios,
      tarjetas: {
        empresas_total: base.companies.length,
        empresas_mes: base.companies.filter((c) => delMes(c.created_at)).length,
        usuarios_total: base.authUsers.length,
        usuarios_mes: base.authUsers.filter((u) => delMes(u.created_at)).length,
        leads_total: leadsTotal,
        leads_mes: leadsMes,
      },
      empresas,
    };
  }

  async updateCompanyById(
    id: number,
    fields: Record<string, unknown> | ActualizarEmpresaDto,
  ) {
    const campos = { ...fields } as Record<string, unknown>;
    const cambiaElPlan =
      campos.plan !== undefined || campos.estado_plan !== undefined;
    if (cambiaElPlan) {
      campos.plan_cambiado_en = new Date().toISOString();
    }
    const empresa = await this.superAdminRepository.updateCompanyById(
      id,
      campos,
    );

    // QUE RIJA AL INSTANTE (paso 3.2, 14-09-2026). El motor recuerda cada
    // perfil una hora y los derechos de cada empresa cinco minutos: sin
    // esto, un cliente que acaba de pagar seguiría viendo su plan viejo
    // hasta que venciera la memoria. Se olvidan los perfiles de TODOS sus
    // usuarios, porque la memoria de perfiles se indexa por persona.
    if (cambiaElPlan) {
      this.derechosService.olvidar(id);
      const usuarios = await this.usersService.findAll(id);
      for (const usuario of usuarios) {
        olvidarPerfil(usuario.user_id);
      }
      this.logger.info(
        `empresa ${id}: plan/estado cambiado, ${usuarios.length} perfil(es) olvidado(s)`,
      );
    }
    return empresa;
  }

  // Mudanza #1 de "una sola puerta" (28-07): guardar el lead Y avisar
  // a los super-admins en UNA llamada. Desde la Torre de Control
  // (05-08) el aviso es la alerta 🔔 con los datos del lead; el que
  // falle no bota el registro (el lead vale más que el correo).
  async registerLead(dto: RegisterLeadDto) {
    // DE DÓNDE LLEGÓ (migración 116): mismo molde que el alta. El
    // interesado se guarda ANTES del alta, así que el origen queda
    // también para los que empezaron y no terminaron.
    const { origen_detalle, ...datos } = dto;
    const origenDetalle = limpiarOrigen(origen_detalle);
    const lead = await this.superAdminRepository.registerLead({
      ...datos,
      origen: etiquetaDeOrigen(origenDetalle),
      origen_detalle: origenDetalle,
    });
    // Disparo SIN espera (cura 05-08): la respuesta de la landing no
    // espera a Resend; el helper traga y anota sus propios errores.
    void this.alertNuevoLead(dto);
    return { success: true, id: lead.id };
  }

  // notifySuperAdmins se JUBILÓ (cura 05-08) junto con la puerta
  // @Public POST new-lead y el correo SUPER_ADMIN_NOTIFICATION:
  // cero llamadores vivos. Las alertas de la torre lo reemplazan.

  // create(createSuperAdminDto: CreateSuperAdminDto) {
  //   return 'This action adds a new superAdmin';
  // }
  // findAll() {
  //   return `This action returns all superAdmin`;
  // }
  // findOne(id: number) {
  //   return `This action returns a #${id} superAdmin`;
  // }
  // update(id: number, updateSuperAdminDto: UpdateSuperAdminDto) {
  //   return `This action updates a #${id} superAdmin`;
  // }
  // remove(id: number) {
  //   return `This action removes a #${id} superAdmin`;
  // }
}
