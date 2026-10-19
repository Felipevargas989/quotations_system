import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import type { ActualizarOportunidadDto } from './dto/actualizar-oportunidad.dto';
import type { GuardarConfigOportunidadesDto } from './dto/guardar-config.dto';
import type { ListarOportunidadesDto } from './dto/listar-oportunidades.dto';
import {
  FichaRepository,
  type MarcaDeExigencia,
} from './ficha/ficha.repository';
import {
  type Anterior,
  anteriorDe,
  indexarPorOrganismo,
} from './historia/anterior';
import {
  fichaDeCompetidor,
  rankingDeCompetidores,
  seVienen,
} from './historia/mercado';
import { normalizar, procesoDesdeCompraAgil } from './mercado-publico/mapeo';
import { MercadoPublicoClient } from './mercado-publico/mercado-publico.client';
import {
  type FichaDeOportunidad,
  type FilaDeLista,
  OportunidadesRepository,
} from './oportunidades.repository';

// LA PANTALLA DE OPORTUNIDADES (doc 17 §5.3 y §5.7, sprint 2). Lo que la
// empresa ve y decide. La lectura de la IA no se edita aquí: es la foto
// de lo que leyó el radar.

/** Tope de la bandeja: lo vigente de dos regiones son un par de miles. */
const LIMITE_DE_LA_BANDEJA = 3000;

/** El detalle de una compra ágil (descripción y productos) se pide a
 *  Mercado Público la primera vez que alguien la abre (decisión 20):
 *  'trayendo' mientras se pide por detrás; 'no_disponible' si no lo
 *  entregó, y no se vuelve a pedir hasta pasados unos minutos. */
export type DetalleMp = 'trayendo' | 'no_disponible' | null;
const REINTENTAR_DETALLE_MS = 10 * 60 * 1000;

const instante = (fecha: string | null): number => {
  const t = fecha ? new Date(fecha).getTime() : NaN;
  return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
};

/** Sin espacios de más, sin vacías y sin repetidas (sin mirar tildes ni
 *  mayúsculas: "Quillon" y "Quillón" son la misma). */
const limpiarLista = (valores: string[]): string[] => {
  const vistas = new Set<string>();
  const limpias: string[] = [];
  for (const valor of valores) {
    const v = valor.trim().replace(/\s+/g, ' ');
    const clave = normalizar(v);
    if (!clave || vistas.has(clave)) continue;
    vistas.add(clave);
    limpias.push(v);
  }
  return limpias;
};

@Injectable()
export class OportunidadesService {
  /** Compras ágiles cuyo detalle se está pidiendo, y cuándo falló cada una
   *  (en memoria: con un reinicio, a lo más se vuelve a pedir). */
  private readonly trayendo = new Set<string>();
  private readonly fallidas = new Map<string, number>();

  constructor(
    private readonly repo: OportunidadesRepository,
    private readonly mp: MercadoPublicoClient,
    private readonly logger: PinoLogger,
    private readonly fichas: FichaRepository,
  ) {
    this.logger.setContext(OportunidadesService.name);
  }

  /** La bandeja: por omisión solo lo vigente, de lo que cierra antes a lo
   *  que cierra después (sin cierre informado, al final), cada una con su
   *  compra del año anterior si la historia ya la tiene. */
  async listar(
    companyId: number,
    dto: ListarOportunidadesDto,
  ): Promise<Array<FilaDeLista & { anterior: Anterior | null }>> {
    const vigentes = dto.vigentes !== false;
    const filas = await this.repo.listar(companyId, {
      vigentes,
      semaforo: dto.semaforo,
      estado: dto.estado,
      tipo: dto.tipo,
      limite: dto.limite ?? LIMITE_DE_LA_BANDEJA,
    });
    filas.sort(
      (a, b) =>
        instante(a.proceso.fecha_cierre) - instante(b.proceso.fecha_cierre),
    );
    // El historial (lo ya cerrado) no lleva "año anterior": nadie lo mira
    // ahí y es la consulta más pesada.
    if (!vigentes || filas.length === 0) {
      return filas.map((f) => ({ ...f, anterior: null }));
    }
    const indice = indexarPorOrganismo(
      await this.repo.historialDeOrganismos(
        filas
          .map((f) => f.proceso.organismo_codigo)
          .filter((c): c is string => Boolean(c)),
      ),
    );
    return filas.map((f) => ({
      ...f,
      anterior: anteriorDe(
        {
          codigo: f.codigo,
          nombre: f.proceso.nombre,
          organismo_codigo: f.proceso.organismo_codigo,
          fecha_publicacion: f.proceso.fecha_publicacion,
        },
        indice.get(f.proceso.organismo_codigo ?? '') ?? [],
      ),
    }));
  }

  /** «Exigencias de la licitación» (migración 152): lo que la empresa
   *  marca en cada una. Devuelve todas las marcas. */
  async marcarExigencia(
    companyId: number,
    id: number,
    clave: string,
    marca: MarcaDeExigencia | null,
  ): Promise<Record<string, MarcaDeExigencia>> {
    const marcas = await this.fichas.marcarExigencia(
      companyId,
      id,
      clave.trim().slice(0, 400),
      marca,
    );
    if (!marcas) throw new NotFoundException('No encontramos esa oportunidad.');
    return marcas;
  }

  async ficha(companyId: number, id: number) {
    const ficha = await this.repo.ficha(companyId, id);
    if (!ficha) throw new NotFoundException('No encontramos esa oportunidad.');
    const [cambios, pasados, historiaPendiente] = await Promise.all([
      this.repo.cambiosDe(ficha.codigo),
      ficha.proceso.organismo_codigo
        ? this.repo.historialDeOrganismos([ficha.proceso.organismo_codigo])
        : Promise.resolve([]),
      this.fichas.diasDeHistoriaPendientes(),
    ]);
    const anterior = anteriorDe(
      {
        codigo: ficha.codigo,
        nombre: ficha.proceso.nombre,
        organismo_codigo: ficha.proceso.organismo_codigo,
        fecha_publicacion: ficha.proceso.fecha_publicacion,
      },
      pasados,
    );
    return {
      ...ficha,
      cambios,
      anterior,
      detalle_mp: this.detalleDeCompraAgil(ficha),
      // "El año pasado": con 0, "no hubo" es cierto; antes, "aún cargando".
      historia_pendiente: historiaPendiente,
    };
  }

  /** Una compra ágil que entró solo con lo de la lista: se pide su detalle
   *  por detrás y la pantalla vuelve a preguntar hasta que llegue. */
  private detalleDeCompraAgil(ficha: FichaDeOportunidad): DetalleMp {
    const p = ficha.proceso;
    const sinDetalle =
      p.tipo === 'compra_agil' &&
      !p.descripcion?.trim() &&
      (p.productos ?? []).length === 0;
    if (!sinDetalle) return null;
    const fallo = this.fallidas.get(ficha.codigo);
    if (fallo && Date.now() - fallo < REINTENTAR_DETALLE_MS) {
      return 'no_disponible';
    }
    if (!this.trayendo.has(ficha.codigo)) void this.traerDetalle(ficha.codigo);
    return 'trayendo';
  }

  private async traerDetalle(codigo: string): Promise<void> {
    this.trayendo.add(codigo);
    try {
      const [item, detalle] = await Promise.all([
        this.repo.itemDeCompraAgil(codigo),
        this.mp.detalleCompraAgil(codigo),
      ]);
      const proceso =
        item && detalle ? procesoDesdeCompraAgil(item, detalle) : null;
      if (proceso) await this.repo.guardarProcesos([proceso]);
      // Sin descripción ni productos, la ficha seguiría pidiéndolo: se
      // anota como no disponible por un rato.
      if (
        !proceso ||
        (!proceso.descripcion && proceso.productos.length === 0)
      ) {
        this.fallidas.set(codigo, Date.now());
      } else {
        this.fallidas.delete(codigo);
      }
    } catch (error) {
      this.fallidas.set(codigo, Date.now());
      this.logger.warn(
        `compra ágil ${codigo}: no se pudo traer el detalle: ${mensajeDe(error)}`,
      );
    } finally {
      this.trayendo.delete(codigo);
    }
  }

  async actualizar(
    companyId: number,
    id: number,
    dto: ActualizarOportunidadDto,
    /** Quien tiene la sesión: con «Me interesa» queda de responsable si no
     *  había nadie (decisión 21). */
    usuarioId?: string,
  ) {
    const cambios: {
      estado?: string;
      responsable_id?: string | null;
      notas?: string | null;
    } = {};
    if (dto.estado !== undefined) cambios.estado = dto.estado;
    if (dto.responsable_id !== undefined) {
      cambios.responsable_id = dto.responsable_id;
    }
    if (dto.notas !== undefined) {
      cambios.notas = dto.notas === null ? null : dto.notas.trim() || null;
    }
    if (Object.keys(cambios).length === 0) {
      throw new BadRequestException('No hay nada que cambiar.');
    }
    // «Me interesa» sin responsable: queda quien la marcó (Felipe, 17-10).
    if (
      cambios.estado === 'en_estudio' &&
      dto.responsable_id === undefined &&
      usuarioId
    ) {
      const actual = await this.fichas.responsableDe(companyId, id);
      if (actual === null) {
        const perfil = await this.fichas.perfilDe(companyId, usuarioId);
        if (perfil) cambios.responsable_id = perfil;
      }
    }
    if (
      cambios.responsable_id &&
      !(await this.repo.esUsuarioDeLaEmpresa(companyId, cambios.responsable_id))
    ) {
      throw new BadRequestException(
        'El responsable tiene que ser un usuario de tu empresa.',
      );
    }
    const fila = await this.repo.actualizar(companyId, id, cambios);
    if (!fila) throw new NotFoundException('No encontramos esa oportunidad.');
    return fila;
  }

  /** SE VIENE (doc 17 §5.3): lo que se repite cada año en las regiones de
   *  la empresa y todavía no sale, en los próximos 90 días. Marca las de
   *  comuna cercana y las de alto valor, como la bandeja. */
  async calendario(companyId: number) {
    const [config, empresa] = await Promise.all([
      this.repo.configDe(companyId),
      this.repo.datosDeEmpresa(companyId),
    ]);
    const procesos = await this.repo.procesosDeLaZona(config?.regiones ?? []);
    return seVienen(procesos, new Date(), {
      comunas: config?.comunas_cercanas ?? [],
      umbralAltoValor: empresa?.high_value_threshold ?? null,
    });
  }

  /** Quién gana en las regiones de la empresa (los últimos 3 años). */
  async competidores(companyId: number) {
    const config = await this.repo.configDe(companyId);
    return rankingDeCompetidores(
      await this.repo.procesosDeLaZona(config?.regiones ?? []),
    );
  }

  /** La ficha de un proveedor: lo que ganó en las regiones de la empresa. */
  async competidor(companyId: number, rut: string) {
    if (!/^[\d.]{6,12}-[\dkK]$/.test(rut.trim())) {
      throw new BadRequestException('Ese RUT no es válido.');
    }
    const config = await this.repo.configDe(companyId);
    const ficha = fichaDeCompetidor(
      await this.repo.procesosDeLaZona(config?.regiones ?? []),
      rut.trim(),
    );
    if (!ficha) {
      throw new NotFoundException(
        'No encontramos triunfos de ese proveedor en tus regiones.',
      );
    }
    return ficha;
  }

  /** La configuración del módulo, con lo que se cambia en Configuración
   *  de empresa a la vista (y solo a la vista). */
  async config(companyId: number) {
    const [config, empresa] = await Promise.all([
      this.repo.configDe(companyId),
      this.repo.datosDeEmpresa(companyId),
    ]);
    return {
      regiones: config?.regiones ?? [],
      comunas_cercanas: config?.comunas_cercanas ?? [],
      perfil: config?.perfil ?? '',
      umbral_alto_valor: empresa?.high_value_threshold ?? null,
      correo_avisos: empresa?.notifications?.replyTo ?? null,
    };
  }

  async guardarConfig(companyId: number, dto: GuardarConfigOportunidadesDto) {
    const cambios: {
      regiones?: string[];
      comunas_cercanas?: string[];
      perfil?: string | null;
    } = {};
    if (dto.regiones !== undefined)
      cambios.regiones = limpiarLista(dto.regiones);
    if (dto.comunas_cercanas !== undefined) {
      cambios.comunas_cercanas = limpiarLista(dto.comunas_cercanas);
    }
    if (dto.perfil !== undefined) cambios.perfil = dto.perfil.trim() || null;
    if (Object.keys(cambios).length === 0) {
      throw new BadRequestException('No hay nada que guardar.');
    }
    await this.repo.guardarConfig(companyId, cambios);
    return this.config(companyId);
  }
}
