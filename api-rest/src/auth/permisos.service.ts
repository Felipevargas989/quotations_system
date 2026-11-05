import { BadRequestException, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { HORA_MS, cachePermisos, olvidarPermisos } from 'src/cache/memoria';
import { SupabaseService } from 'src/supabase/supabase.service';
import { UserRole } from 'src/users/entities/user.entity';
import { assertDerecho, tieneDerecho, type Derecho } from './derechos';
import {
  CARGOS,
  CATALOGO_DE_PERMISOS,
  definicionDe,
  permisosDelCargo,
  type Area,
  type FilaDePermiso,
  type Permiso,
} from './permisos';

// LOS PERMISOS POR CARGO DE CADA EMPRESA (doc 22 §4, 05-11-2026).
//
// La base guarda solo lo que la empresa apartó de fábrica
// (`permisos_por_cargo`, migración 188); la cuenta la hace
// `permisosDelCargo`. AuthGuard pide la lista del cargo en cada petición,
// de la memoria: una hora, y guardar un cambio la borra al instante, como
// el perfil al cambiar un cargo (03-11-2026). Con más de una copia del
// motor, la memoria de las otras tardaría hasta su vencimiento (mapa 16).

export type CeldaDePermiso = { prendido: boolean; fabrica: boolean };

export type FilaDeLaPantalla = {
  clave: Permiso;
  area: Area;
  nombre: string;
  /** 'fijo': Mi empresa y Usuarios. 'plan': el plan o los módulos de la
   *  empresa no lo traen, y va apagado de verdad. */
  candado: 'fijo' | 'plan' | null;
  celdas: Record<UserRole, CeldaDePermiso>;
};

export type UltimoCambio = {
  quien: string | null;
  cuando: string;
  /** 'cambio' = un interruptor; 'fabrica' = «Volver a lo de fábrica». */
  accion: 'cambio' | 'fabrica';
  cargo: string | null;
  permiso: string | null;
  prendido: boolean | null;
};

export type PantallaDePermisos = {
  cargos: readonly UserRole[];
  permisos: FilaDeLaPantalla[];
  /** Nada apartado de fábrica: «Volver a lo de fábrica» no tiene qué
   *  hacer. */
  deFabrica: boolean;
  ultimoCambio: UltimoCambio | null;
};

/** Quien cambia, como viene en la sesión. */
export type QuienCambia = {
  id: string;
  company_id: number;
  full_name?: string | null;
  email?: string | null;
  derechos?: Derecho[];
};

const nombreDe = (q: QuienCambia): string | null =>
  q.full_name?.trim() || q.email || null;

const mensajeDe = (e: unknown): string =>
  (e as { message?: string } | null)?.message ?? String(e);

@Injectable()
export class PermisosService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PermisosService.name);
  }

  /** Los permisos prendidos de un cargo en su empresa: lo que AuthGuard
   *  deja en la sesión y lo que el perfil le dice a la app. */
  async delCargo(
    companyId: number,
    cargo: string | null | undefined,
  ): Promise<Permiso[]> {
    return permisosDelCargo(cargo, await this.apartados(companyId));
  }

  /** La pantalla: cada permiso con sus cuatro celdas, y el último cambio.
   *  Lee de la base, no de la memoria: muestra lo guardado. */
  async pantalla(
    companyId: number,
    derechos: Derecho[] | undefined,
  ): Promise<PantallaDePermisos> {
    const [filas, ultimoCambio] = await Promise.all([
      this.leer(companyId),
      this.ultimoCambio(companyId),
    ]);
    const deLaEmpresa = new Map(
      CARGOS.map((c) => [c, permisosDelCargo(c, filas)]),
    );
    const deFabrica = new Map(CARGOS.map((c) => [c, permisosDelCargo(c)]));
    const permisos = CATALOGO_DE_PERMISOS.map((p): FilaDeLaPantalla => {
      const candado = p.fijo
        ? 'fijo'
        : p.derecho && !tieneDerecho(derechos, p.derecho)
          ? 'plan'
          : null;
      const celdas = Object.fromEntries(
        CARGOS.map((c) => [
          c,
          {
            prendido:
              candado !== 'plan' && deLaEmpresa.get(c)!.includes(p.clave),
            fabrica: deFabrica.get(c)!.includes(p.clave),
          },
        ]),
      ) as Record<UserRole, CeldaDePermiso>;
      return {
        clave: p.clave,
        area: p.area,
        nombre: p.nombre,
        candado,
        celdas,
      };
    });
    return {
      cargos: CARGOS,
      permisos,
      deFabrica: CARGOS.every(
        (c) => deLaEmpresa.get(c)!.join() === deFabrica.get(c)!.join(),
      ),
      ultimoCambio,
    };
  }

  /** Prende o apaga un permiso de un cargo. Rige al instante y queda
   *  anotado quién, qué y cuándo. Si ya estaba así, no anota nada. */
  async cambiar(
    quien: QuienCambia,
    cargo: UserRole,
    permiso: Permiso,
    prendido: boolean,
  ): Promise<PantallaDePermisos> {
    const p = definicionDe(permiso);
    if (!p || !CARGOS.includes(cargo)) {
      throw new BadRequestException('Ese permiso o ese cargo no existe.');
    }
    // El administrador nunca queda afuera (doc 22 §4.6).
    if (p.fijo) {
      throw new BadRequestException(
        `${p.nombre} es fijo: lo tiene el administrador y nadie más.`,
      );
    }
    // El plan manda arriba (doc 22 §4.7): lo que no trae no se prende.
    if (prendido && p.derecho) assertDerecho(quien.derechos, p.derecho);

    const filas = await this.leer(quien.company_id);
    if (permisosDelCargo(cargo, filas).includes(permiso) !== prendido) {
      const { error } = await this.supabase.client.rpc(
        'permisos_por_cargo_cambiar',
        {
          p_company_id: quien.company_id,
          p_cargo: cargo,
          p_permiso: permiso,
          p_prendido: prendido,
          p_de_fabrica: (p.fabrica as readonly string[]).includes(cargo),
          p_usuario_id: quien.id,
          p_usuario_nombre: nombreDe(quien),
        },
      );
      if (error) throw error;
      olvidarPermisos(quien.company_id);
    }
    return this.pantalla(quien.company_id, quien.derechos);
  }

  /** «Volver a lo de fábrica»: borra lo que la empresa apartó, y queda
   *  anotado como un cambio más. */
  async volverAFabrica(quien: QuienCambia): Promise<PantallaDePermisos> {
    const filas = await this.leer(quien.company_id);
    if (filas.length) {
      const { error } = await this.supabase.client.rpc(
        'permisos_por_cargo_a_fabrica',
        {
          p_company_id: quien.company_id,
          p_usuario_id: quien.id,
          p_usuario_nombre: nombreDe(quien),
        },
      );
      if (error) throw error;
      olvidarPermisos(quien.company_id);
    }
    return this.pantalla(quien.company_id, quien.derechos);
  }

  /** De la memoria. Si la base no responde (o la migración 188 no está
   *  aplicada), lo de fábrica, que es lo de hoy, sin recordarlo: la próxima
   *  petición vuelve a leer. */
  private async apartados(companyId: number): Promise<FilaDePermiso[]> {
    const ya = cachePermisos.get(String(companyId));
    if (ya) return ya as FilaDePermiso[];
    try {
      return await this.leer(companyId);
    } catch (e) {
      this.logger.warn(
        `no pude leer los permisos de la empresa ${companyId}: ${mensajeDe(e)}`,
      );
      return [];
    }
  }

  /** De la base, y queda en la memoria una hora. */
  private async leer(companyId: number): Promise<FilaDePermiso[]> {
    const { data, error } = await this.supabase.client
      .from('permisos_por_cargo')
      .select('cargo, permiso, prendido')
      .eq('company_id', companyId);
    if (error) throw error;
    const filas = (data ?? []) as FilaDePermiso[];
    cachePermisos.set(String(companyId), filas, HORA_MS);
    return filas;
  }

  private async ultimoCambio(companyId: number): Promise<UltimoCambio | null> {
    const { data, error } = await this.supabase.client
      .from('permisos_por_cargo_cambios')
      .select('usuario_nombre, creado_en, accion, cargo, permiso, prendido')
      .eq('company_id', companyId)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const f = data as {
      usuario_nombre: string | null;
      creado_en: string;
      accion: 'cambio' | 'fabrica';
      cargo: string | null;
      permiso: string | null;
      prendido: boolean | null;
    };
    return {
      quien: f.usuario_nombre,
      cuando: f.creado_en,
      accion: f.accion,
      cargo: f.cargo,
      permiso: f.permiso,
      prendido: f.prendido,
    };
  }
}
