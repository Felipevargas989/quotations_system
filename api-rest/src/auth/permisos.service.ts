import { BadRequestException, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
  CINCO_MINUTOS_MS,
  HORA_MS,
  cachePermisos,
  cacheTiposDeCliente,
  olvidarPermisos,
  olvidarTiposDeCliente,
} from 'src/cache/memoria';
import { SupabaseService } from 'src/supabase/supabase.service';
import { UserRole } from 'src/users/entities/user.entity';
import { assertDerecho, tieneDerecho, type Derecho } from './derechos';
import {
  CARGOS,
  CATALOGO_DE_PERMISOS,
  cambiaronSusTipos,
  claveDeTipo,
  definicionDe,
  permisosDelCargo,
  tipoDeFabrica,
  tipoPrendido,
  tiposQueTrabaja,
  trabajaElTipo,
  type Area,
  type FilaDePermiso,
  type Permiso,
  type TipoDeCliente,
  type TiposQueTrabaja,
} from './permisos';

// LOS PERMISOS POR CARGO DE CADA EMPRESA (doc 22 §4, 05-11-2026).
//
// La base guarda solo lo que la empresa apartó de fábrica
// (`permisos_por_cargo`, migración 188); la cuenta la hace
// `permisosDelCargo`. AuthGuard pide la lista del cargo en cada petición,
// de la memoria: una hora, y guardar un cambio la borra al instante, como
// el perfil al cambiar un cargo (03-11-2026). Con más de una copia del
// motor, la memoria de las otras tardaría hasta su vencimiento (mapa 16).
//
// En la misma tabla van los tipos de cliente que trabaja cada cargo (doc 22
// §9), con la clave `tipo_cliente:<id>`: la pantalla los muestra en su
// propio bloque, y `tiposDelCargo` le dice a `AlcanceDeRecepcion` (lo que
// ve cada cargo de las cotizaciones) y al perfil cuáles son.

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

/** Un tipo de cliente de la empresa, con sus cuatro celdas (doc 22 §9). */
export type FilaDeTipo = {
  id: number;
  nombre: string;
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
  /** Los tipos de cliente de la empresa, en su orden. */
  tipos: FilaDeTipo[];
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

  /** Los tipos de cliente de la empresa con su marca de particular, de la
   *  memoria: cinco minutos, y cambiar un interruptor de tipo, o crear o
   *  borrar un tipo, los olvida. */
  async tiposDe(companyId: number): Promise<TipoDeCliente[]> {
    const ya = cacheTiposDeCliente.get(String(companyId));
    if (ya) return ya as TipoDeCliente[];
    const tipos = await this.leerTipos(companyId);
    cacheTiposDeCliente.set(String(companyId), tipos, CINCO_MINUTOS_MS);
    return tipos;
  }

  /** Los tipos de cliente que trabaja un cargo en su empresa (doc 22 §9);
   *  null si los trabaja todos. Vendedor para arriba sin ningún interruptor
   *  de tipo cambiado: null, sin leer los tipos (lo de siempre). */
  async tiposDelCargo(
    companyId: number,
    cargo: string | null | undefined,
  ): Promise<TiposQueTrabaja> {
    const filas = await this.apartados(companyId);
    if (
      cargo !== UserRole.RECEPCION &&
      !cambiaronSusTipos(cargo ?? '', filas)
    ) {
      return null;
    }
    return tiposQueTrabaja(cargo, await this.tiposDe(companyId), filas);
  }

  /** Para el perfil (la app): los nombres de los tipos que trabaja el
   *  cargo, en su orden; null si los trabaja todos. */
  async nombresDeSusTipos(
    companyId: number,
    cargo: string | null | undefined,
  ): Promise<string[] | null> {
    const tipos = await this.tiposDelCargo(companyId, cargo);
    if (!tipos) return null;
    return (await this.tiposDe(companyId))
      .filter((t) => trabajaElTipo(tipos, t.name))
      .map((t) => t.name);
  }

  /** La pantalla: cada permiso y cada tipo de cliente con sus cuatro
   *  celdas, y el último cambio. Lee de la base, no de la memoria: muestra
   *  lo guardado. */
  async pantalla(
    companyId: number,
    derechos: Derecho[] | undefined,
  ): Promise<PantallaDePermisos> {
    const [filas, tiposDeLaEmpresa, ultimoCambio] = await Promise.all([
      this.leer(companyId),
      this.leerTipos(companyId),
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
    const tipos = tiposDeLaEmpresa.map(
      (t): FilaDeTipo => ({
        id: t.id,
        nombre: t.name,
        celdas: Object.fromEntries(
          CARGOS.map((c) => [
            c,
            {
              prendido: tipoPrendido(c, t, filas),
              fabrica: tipoDeFabrica(c, t),
            },
          ]),
        ) as Record<UserRole, CeldaDePermiso>,
      }),
    );
    return {
      cargos: CARGOS,
      permisos,
      tipos,
      deFabrica:
        CARGOS.every(
          (c) => deLaEmpresa.get(c)!.join() === deFabrica.get(c)!.join(),
        ) &&
        tipos.every((t) =>
          CARGOS.every((c) => t.celdas[c].prendido === t.celdas[c].fabrica),
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

  /** Prende o apaga un tipo de cliente a un cargo (doc 22 §9). Sin
   *  candados: los cuatro cargos se pueden editar (Felipe, 05-11-2026:
   *  "podrían quedar todos abiertos"). Rige al instante y queda anotado,
   *  como un permiso. */
  async cambiarTipo(
    quien: QuienCambia,
    cargo: UserRole,
    tipoId: number,
    prendido: boolean,
  ): Promise<PantallaDePermisos> {
    if (!CARGOS.includes(cargo)) {
      throw new BadRequestException('Ese cargo no existe.');
    }
    const [filas, tipos] = await Promise.all([
      this.leer(quien.company_id),
      this.leerTipos(quien.company_id),
    ]);
    const tipo = tipos.find((t) => t.id === tipoId);
    if (!tipo) {
      throw new BadRequestException('Ese tipo de cliente no es de tu empresa.');
    }
    if (tipoPrendido(cargo, tipo, filas) !== prendido) {
      const { error } = await this.supabase.client.rpc(
        'permisos_por_cargo_cambiar',
        {
          p_company_id: quien.company_id,
          p_cargo: cargo,
          p_permiso: claveDeTipo(tipo.id),
          p_prendido: prendido,
          p_de_fabrica: tipoDeFabrica(cargo, tipo),
          p_usuario_id: quien.id,
          p_usuario_nombre: nombreDe(quien),
        },
      );
      if (error) throw error;
      olvidarPermisos(quien.company_id);
      olvidarTiposDeCliente(quien.company_id);
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

  /** Los tipos de cliente de la empresa, de la base, en el orden de
   *  «Gestionar tipos», con su marca de particular (doc 21, migración 186).
   *  Sin la columna todavía, son particulares los que se llaman así, como
   *  en `ClientsRepository.tiposConMarca`. */
  private async leerTipos(companyId: number): Promise<TipoDeCliente[]> {
    const leer = (columnas: string) =>
      this.supabase.client
        .from('client_types')
        .select(columnas)
        .eq('company_id', companyId)
        .order('sort_order', { ascending: true, nullsFirst: false })
        .order('name');
    const conMarca = await leer('id, name, es_particular');
    if (!conMarca.error) {
      return (conMarca.data ?? []) as unknown as TipoDeCliente[];
    }
    const { data, error } = await leer('id, name');
    if (error) throw error;
    return ((data ?? []) as unknown as TipoDeCliente[]).map((t) => ({
      ...t,
      es_particular: /^\s*(particular|persona\S*\s+natural)/i.test(t.name),
    }));
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
