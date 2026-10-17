import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ActualizarOportunidadDto } from './dto/actualizar-oportunidad.dto';
import type { GuardarConfigDto } from './dto/guardar-config.dto';
import type { ListarOportunidadesDto } from './dto/listar-oportunidades.dto';
import { normalizar } from './mercado-publico/mapeo';
import {
  type FilaDeLista,
  OportunidadesRepository,
} from './oportunidades.repository';

// LA PANTALLA DE OPORTUNIDADES (doc 17 §5.3 y §5.7, sprint 2). Lo que la
// empresa ve y decide. La lectura de la IA no se edita aquí: es la foto
// de lo que leyó el radar.

/** Tope de la bandeja: lo vigente de dos regiones son un par de miles. */
const LIMITE_DE_LA_BANDEJA = 3000;

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
  constructor(private readonly repo: OportunidadesRepository) {}

  /** La bandeja: por omisión solo lo vigente, de lo que cierra antes a lo
   *  que cierra después (sin cierre informado, al final). */
  async listar(
    companyId: number,
    dto: ListarOportunidadesDto,
  ): Promise<FilaDeLista[]> {
    const filas = await this.repo.listar(companyId, {
      vigentes: dto.vigentes !== false,
      semaforo: dto.semaforo,
      estado: dto.estado,
      tipo: dto.tipo,
      limite: dto.limite ?? LIMITE_DE_LA_BANDEJA,
    });
    return filas.sort(
      (a, b) =>
        instante(a.proceso.fecha_cierre) - instante(b.proceso.fecha_cierre),
    );
  }

  async ficha(companyId: number, id: number) {
    const ficha = await this.repo.ficha(companyId, id);
    if (!ficha) throw new NotFoundException('No encontramos esa oportunidad.');
    const cambios = await this.repo.cambiosDe(ficha.codigo);
    return { ...ficha, cambios };
  }

  async actualizar(
    companyId: number,
    id: number,
    dto: ActualizarOportunidadDto,
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

  async guardarConfig(companyId: number, dto: GuardarConfigDto) {
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
