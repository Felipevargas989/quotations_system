import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  TAREA_EN_PALABRAS,
  type EstadoDeLeccion,
  type Leccion,
  type TareaDeLeccion,
} from 'src/cerebro/lecciones';
import { LeccionesService } from 'src/cerebro/lecciones.service';
import { UserRole, type User } from 'src/users/entities/user.entity';
import { normal } from '../herramientas/buscar-en-catalogo';
import { ErrorDeHerramienta, fechaEnChile } from '../herramientas/comun';
import type { ResultadoDeAplicar, TarjetaDePropuesta } from './comun';
import { PropuestasRepository, type Propuesta } from './propuestas.repository';

// LO QUE APRENDE BELIA DE LAS CORRECCIONES (doc 20 §17, mejora 5; Felipe,
// 04-11-2026: «cuando le dices "No" o la corriges, te pregunta por qué y
// propone la lección para el cerebro común. Tú la apruebas»).
//
// Dos tarjetas, como todo lo que cambia algo:
// - «Sí, anotar» una lección: de administración queda aprobada al tiro; de
//   otro cargo, esperando a administración;
// - «Sí, aprobar», «Sí, descartar» o «Sí, olvidar» una (solo
//   administración). Nada se borra.
// Aprobada, la leen desde la pregunta siguiente BelIA, «✨ Crear con IA» y
// «✉ Generar seguimiento» (`cerebroPara` y `lecciones.ts` del cerebro).

export type LeccionPedida = {
  texto: string;
  tarea: TareaDeLeccion;
  motivo: string | null;
};

export type Decision = 'aprobar' | 'descartar' | 'olvidar';

/** De qué estado sale y a cuál llega cada decisión. */
const CAMINO: Record<Decision, { desde: EstadoDeLeccion; a: EstadoDeLeccion }> =
  {
    aprobar: { desde: 'pendiente', a: 'aprobada' },
    descartar: { desde: 'pendiente', a: 'descartada' },
    olvidar: { desde: 'aprobada', a: 'olvidada' },
  };

const ESTADO_EN_PALABRAS: Record<EstadoDeLeccion, string> = {
  pendiente: 'esperando a administración',
  aprobada: 'aprobada',
  descartada: 'descartada',
  olvidada: 'olvidada',
};

const TITULO: Record<Decision, string> = {
  aprobar: 'Aprobar una lección',
  descartar: 'Descartar una lección',
  olvidar: 'Olvidar una lección',
};

const esAdmin = (u: User) => u.role === UserRole.ADMINISTRADOR;

/** Una lección como la lee la IA en «¿Qué aprendiste?». */
export const leccionParaLeer = (l: Leccion) => ({
  id: l.id,
  texto: l.texto,
  para: TAREA_EN_PALABRAS[l.tarea],
  estado: ESTADO_EN_PALABRAS[l.estado],
  propuesta_por: l.propuesta_por_nombre ?? undefined,
  desde: fechaEnChile(l.decidida_at ?? l.created_at),
});

@Injectable()
export class LeccionesDesdeElChat {
  constructor(
    private readonly guardadas: PropuestasRepository,
    private readonly lecciones: LeccionesService,
  ) {}

  /** Las aprobadas y las que esperan, para «¿Qué aprendiste?». */
  async vivas(usuario: User) {
    const lista = await this.lecciones.vivas(usuario.company_id);
    return lista.map(leccionParaLeer);
  }

  /** Las que esperan, para los avisos de administración. */
  async porAprobar(usuario: User) {
    if (!esAdmin(usuario)) return [];
    const lista = await this.lecciones.vivas(usuario.company_id);
    return lista.filter((l) => l.estado === 'pendiente').map(leccionParaLeer);
  }

  async proponer(usuario: User, l: LeccionPedida): Promise<TarjetaDePropuesta> {
    const empresa = usuario.company_id;
    const igual = (await this.lecciones.vivas(empresa)).find(
      (v) => normal(v.texto) === normal(l.texto),
    );
    if (igual) {
      throw new ErrorDeHerramienta(
        `Esa lección ya está anotada (${ESTADO_EN_PALABRAS[igual.estado]}).`,
      );
    }
    const fila = await this.guardadas.crearPropuesta({
      company_id: empresa,
      quotation_id: null,
      usuario_id: usuario.id,
      usuario_nombre: usuario.full_name?.trim() || null,
      tipo: 'leccion',
      resumen: 'Una lección para lo que sabe BelIA',
      antes: {},
      despues: { leccion: l },
      huella_antes: 'leccion',
    });
    return {
      id: fila.id,
      tipo: 'leccion',
      numero: null,
      cliente: null,
      cotizacion_id: null,
      enlace: null,
      resumen: fila.resumen,
      lineas: [],
      leccion: {
        texto: l.texto,
        para: TAREA_EN_PALABRAS[l.tarea],
        motivo: l.motivo,
      },
      avisos: [
        esAdmin(usuario)
          ? 'Al anotarla queda aprobada: desde la próxima pregunta la leen BelIA, «✨ Crear con IA» y «✉ Generar seguimiento».'
          : 'Al anotarla queda esperando a administración: recién aprobada la leen las IA de Eventia.',
      ],
      se_puede_deshacer: false,
      vence_at: fila.vence_at,
    };
  }

  /** El «Sí, anotar». */
  async anotar(usuario: User, p: Propuesta): Promise<ResultadoDeAplicar> {
    const l = (p.despues as { leccion: LeccionPedida }).leccion;
    const nombre = usuario.full_name?.trim() || p.usuario_nombre || null;
    const admin = esAdmin(usuario);
    await this.lecciones.crear({
      company_id: usuario.company_id,
      tarea: l.tarea,
      texto: l.texto,
      motivo: l.motivo,
      propuesta_por: usuario.id,
      propuesta_por_nombre: nombre,
      estado: admin ? 'aprobada' : 'pendiente',
      ...(admin
        ? {
            decidida_por: usuario.id,
            decidida_por_nombre: nombre,
            decidida_at: new Date().toISOString(),
          }
        : {}),
    });
    return {
      estado: 'aplicada',
      aviso: admin
        ? 'Anotada y aprobada: la leen desde la próxima pregunta.'
        : 'Anotada: espera a que administración la apruebe.',
    };
  }

  async proponerDecision(
    usuario: User,
    d: { id: string; decision: Decision },
  ): Promise<TarjetaDePropuesta> {
    if (!esAdmin(usuario)) {
      throw new ErrorDeHerramienta(
        'Las lecciones las aprueba, descarta u olvida administración.',
      );
    }
    const empresa = usuario.company_id;
    const l = await this.lecciones.una(empresa, d.id);
    if (!l) throw new ErrorDeHerramienta('No encontré esa lección.');
    if (l.estado !== CAMINO[d.decision].desde) {
      throw new ErrorDeHerramienta(
        `Esa lección está ${ESTADO_EN_PALABRAS[l.estado]}: no se puede ${d.decision}.`,
      );
    }
    const fila = await this.guardadas.crearPropuesta({
      company_id: empresa,
      quotation_id: null,
      usuario_id: usuario.id,
      usuario_nombre: usuario.full_name?.trim() || null,
      tipo: 'leccion_estado',
      resumen: TITULO[d.decision],
      antes: { estado: l.estado },
      despues: { id: l.id, decision: d.decision },
      huella_antes: 'leccion',
    });
    return {
      id: fila.id,
      tipo: 'leccion_estado',
      numero: null,
      cliente: null,
      cotizacion_id: null,
      enlace: null,
      resumen: fila.resumen,
      lineas: [],
      leccion: {
        texto: l.texto,
        para: TAREA_EN_PALABRAS[l.tarea],
        motivo: l.motivo,
        decision: d.decision,
        propuesta_por: l.propuesta_por_nombre,
      },
      avisos: [
        d.decision === 'aprobar'
          ? 'Aprobada, la leen desde la próxima pregunta BelIA, «✨ Crear con IA» y «✉ Generar seguimiento».'
          : d.decision === 'olvidar'
            ? 'Olvidada, las IA dejan de leerla. Queda anotada: no se borra.'
            : 'Descartada, las IA nunca la leen. Queda anotada: no se borra.',
      ],
      se_puede_deshacer: false,
      vence_at: fila.vence_at,
    };
  }

  /** El «Sí, aprobar», «Sí, descartar» o «Sí, olvidar». */
  async decidir(usuario: User, p: Propuesta): Promise<ResultadoDeAplicar> {
    if (!esAdmin(usuario)) {
      throw new ForbiddenException('Las lecciones las decide administración.');
    }
    const { id, decision } = p.despues as { id: string; decision: Decision };
    const movida = await this.lecciones.mover(
      usuario.company_id,
      id,
      CAMINO[decision].desde,
      {
        estado: CAMINO[decision].a,
        decidida_por: usuario.id,
        decidida_por_nombre: usuario.full_name?.trim() || null,
      },
    );
    if (!movida) {
      throw new ConflictException(
        'Esa lección cambió entre medio: pídemela de nuevo.',
      );
    }
    return {
      estado: 'aplicada',
      aviso:
        decision === 'aprobar'
          ? 'Aprobada: la leen desde la próxima pregunta.'
          : decision === 'olvidar'
            ? 'Olvidada: las IA ya no la leen.'
            : 'Descartada.',
    };
  }
}
