import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import { BadRequestException, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { costoEnDolares, MODELO_HAIKU } from '../analisis/comun';
import { bajarActa, leerActa } from '../historia/acta';
import { normalizarRut } from '../historia/ganadores';
import { OferenteRepository } from '../oferente/oferente.repository';
import { OportunidadesRepository } from '../oportunidades.repository';
import {
  competidoresReales,
  type CompetidorReal,
  type Encuentro,
  encuentrosCon,
  type OfertaLeida,
  ofertasDelActa,
} from './competencia';
import {
  CompetenciaRepository,
  type ProcesoConActa,
} from './competencia.repository';

// COMPETIDORES REALES (decisión 70 del doc 17, 22-10). Las actas públicas de
// adjudicación se leen sin IA (la página se abre sin código) y quedan en
// mp_ofertas; la lista sale de ahí. Lo único con IA es decir si un proveedor
// es un negocio parecido al de la empresa (Haiku 5.5, por centavos).
//
// «Buscar en las actas» lee, por detrás y de a una empresa a la vez, las de
// sus licitaciones, las de sus compradores y las de sus comunas cercanas de
// los últimos 3 años; después clasifica a los proveedores nuevos de sus
// compradores. De noche se sigue con lo que quede (competencia-cron).

const MINUTO = 60_000;
const TRES_ANIOS_MS = 3 * 365 * 24 * 60 * MINUTO;
/** Cuántas actas lee una búsqueda. */
export const ACTAS_POR_BUSQUEDA = 400;
/** Entre una página y otra: el acta es pública, pero sin apuro. */
export const PAUSA_ENTRE_ACTAS_MS = 800;
/** Cuántos proveedores se clasifican por búsqueda, y de a cuántos. */
export const CLASIFICAR_POR_BUSQUEDA = 300;
export const CLASIFICAR_POR_PEDIDO = 40;

export type EstadoDeLaCompetencia = {
  competidores: CompetidorReal[];
  /** El RUT de la empresa (de «Mi empresa»): sin él no hay «compitió». */
  rut_empresa: string | null;
  busqueda: {
    buscando: boolean;
    leidas: number;
    total: number;
    clasificados: number;
  };
};

export const ESQUEMA_DE_CLASIFICACION = {
  type: 'object',
  properties: {
    proveedores: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          rut: { type: 'string' },
          similar: { type: 'string', enum: ['si', 'no'] },
          razon: { type: 'string' },
        },
        required: ['rut', 'similar', 'razon'],
        additionalProperties: false,
      },
    },
  },
  required: ['proveedores'],
  additionalProperties: false,
} as const;

export const instruccionesDeClasificacion = (perfil: string | null): string =>
  [
    'Clasificas proveedores de licitaciones públicas de Chile según si compiten con esta empresa:',
    perfil?.trim() ||
      '(complejo turístico con salones, restaurante y cabañas, que da alimentación y eventos)',
    '',
    'Un proveedor es "si" (parecido) si su negocio es como el de la empresa: complejos turísticos, centros de eventos, hoteles o cabañas con salones, restaurantes, banqueterías o caterings que dan alimentación y eventos.',
    'Es "no" si es otra cosa (productoras solo de audio e iluminación, aseo, construcción, transporte, librerías, ferreterías, tecnología, artículos de oficina) o si no se puede saber por el nombre y lo que ofreció.',
    'Por cada proveedor de la lista: su "rut" tal cual, "similar" ("si" o "no") y una "razon" de menos de 12 palabras.',
  ].join('\n');

/** Solo los RUT de la lista, una vez cada uno. */
export const clasificacionValida = (
  salida: unknown,
  pedidos: ReadonlySet<string>,
): Array<{ rut: string; similar: 'si' | 'no'; razon: string }> => {
  const lista = (salida as { proveedores?: unknown })?.proveedores;
  if (!Array.isArray(lista)) return [];
  const vistos = new Set<string>();
  const r: Array<{ rut: string; similar: 'si' | 'no'; razon: string }> = [];
  for (const x of lista) {
    const f = x as { rut?: unknown; similar?: unknown; razon?: unknown };
    const rut = normalizarRut(typeof f.rut === 'string' ? f.rut : '');
    if (!pedidos.has(rut) || vistos.has(rut)) continue;
    if (f.similar !== 'si' && f.similar !== 'no') continue;
    vistos.add(rut);
    r.push({
      rut,
      similar: f.similar,
      razon: typeof f.razon === 'string' ? f.razon.trim().slice(0, 200) : '',
    });
  }
  return r;
};

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

@Injectable()
export class CompetenciaService {
  private clienteAnthropic: Anthropic | null = null;
  /** Una búsqueda a la vez por empresa, con su avance. */
  private readonly enCurso = new Map<
    number,
    { leidas: number; total: number; clasificados: number }
  >();

  constructor(
    private readonly repo: CompetenciaRepository,
    private readonly oportunidades: OportunidadesRepository,
    private readonly oferente: OferenteRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CompetenciaService.name);
  }

  protected cliente(): Anthropic {
    if (!this.clienteAnthropic) {
      this.clienteAnthropic = new Anthropic({ maxRetries: 4 });
    }
    return this.clienteAnthropic;
  }

  /** Para las pruebas: no esperar entre una página y otra. */
  protected pausa(ms: number): Promise<void> {
    return esperar(ms);
  }

  /** La lista de competidores reales y cómo va la búsqueda. */
  async estado(companyId: number): Promise<EstadoDeLaCompetencia> {
    const rutEmpresa = normalizarRut(
      (await this.oferente.oferente(companyId))?.rut ?? '',
    );
    const progreso = this.enCurso.get(companyId);
    const busqueda = {
      buscando: Boolean(progreso),
      leidas: progreso?.leidas ?? 0,
      total: progreso?.total ?? 0,
      clasificados: progreso?.clasificados ?? 0,
    };
    const { ofertas, compradores } = await this.ofertasDeLaEmpresa(
      companyId,
      rutEmpresa,
    );
    return {
      competidores: competidoresReales({
        rutEmpresa,
        ofertas,
        compradores,
        marcas: await this.repo.marcas(companyId),
      }),
      rut_empresa: rutEmpresa || null,
      busqueda,
    };
  }

  /** Las licitaciones donde se cruzó con un proveedor, y su nombre (la
   *  ficha lo necesita aunque no haya ganado nada en la zona). */
  async encuentros(
    companyId: number,
    rut: string,
  ): Promise<{ nombre: string | null; encuentros: Encuentro[] }> {
    const limpio = normalizarRut(rut);
    const rutEmpresa = normalizarRut(
      (await this.oferente.oferente(companyId))?.rut ?? '',
    );
    if (!rutEmpresa) return { nombre: null, encuentros: [] };
    const mias = await this.repo.ofertasDe(rutEmpresa);
    const todas = await this.repo.ofertasDeLicitaciones(
      mias.map((o) => o.codigo),
    );
    return {
      nombre: todas.find((o) => o.rut === limpio)?.proveedor.trim() ?? null,
      encuentros: encuentrosCon(limpio, rutEmpresa, todas),
    };
  }

  /** «Seguir» o «No es mi competidor» (o deshacerlo). */
  async marcar(
    companyId: number,
    rut: string,
    cambios: { seguido?: boolean; descartado?: boolean },
  ) {
    const limpio = normalizarRut(rut);
    if (!/^\d{6,9}-[\dK]$/.test(limpio)) {
      throw new BadRequestException('Ese RUT no es válido.');
    }
    if (cambios.seguido === undefined && cambios.descartado === undefined) {
      throw new BadRequestException('No hay nada que cambiar.');
    }
    const nombre =
      (await this.repo.ofertasDe(limpio))[0]?.proveedor?.trim() ?? null;
    return this.repo.marcar(companyId, limpio, nombre, cambios);
  }

  /** «Buscar en las actas»: responde al tiro y sigue por detrás. */
  async buscar(companyId: number): Promise<EstadoDeLaCompetencia> {
    if (!this.enCurso.has(companyId)) {
      this.enCurso.set(companyId, { leidas: 0, total: 0, clasificados: 0 });
      void this.ejecutarBusqueda(companyId, Date.now() + 25 * MINUTO)
        .catch((e) =>
          this.logger.warn(`competencia ${companyId}: ${mensajeDe(e)}`),
        )
        .finally(() => this.enCurso.delete(companyId));
    }
    return this.estado(companyId);
  }

  /** De noche (competencia-cron): sigue con las actas que quedan de cada
   *  empresa del módulo, hasta la hora dada. */
  async leerDeNoche(hasta: number): Promise<void> {
    const empresas = await this.oportunidades.empresasConModulo();
    for (const { id } of empresas) {
      if (Date.now() > hasta) return;
      if (this.enCurso.has(id)) continue;
      this.enCurso.set(id, { leidas: 0, total: 0, clasificados: 0 });
      try {
        await this.ejecutarBusqueda(id, hasta);
      } catch (error) {
        this.logger.warn(`competencia de noche ${id}: ${mensajeDe(error)}`);
      } finally {
        this.enCurso.delete(id);
      }
    }
  }

  /** Lee las actas de la empresa (sus licitaciones, sus compradores y sus
   *  comunas cercanas) y clasifica a los proveedores nuevos. */
  async ejecutarBusqueda(companyId: number, hasta: number): Promise<void> {
    const progreso = this.enCurso.get(companyId) ?? {
      leidas: 0,
      total: 0,
      clasificados: 0,
    };
    const pendientes = await this.actasPorLeer(companyId);
    progreso.total = pendientes.length;
    for (const p of pendientes) {
      if (Date.now() > hasta) break;
      let bajada = false;
      try {
        const guardada = p.acta_guardada
          ? await this.repo.actaGuardada(p.codigo)
          : null;
        bajada = !guardada;
        const acta = guardada ?? leerActa(await bajarActa(p.url_acta));
        await this.repo.guardarOfertas(
          p.codigo,
          ofertasDelActa(p, acta),
          guardada ? undefined : acta,
        );
      } catch (error) {
        this.logger.warn(`acta ${p.codigo}: ${mensajeDe(error)}`);
      }
      progreso.leidas += 1;
      if (bajada) await this.pausa(PAUSA_ENTRE_ACTAS_MS);
    }
    if (Date.now() <= hasta) {
      progreso.clasificados = await this.clasificar(companyId);
    }
  }

  /** Las actas por leer de la empresa, sin repetir: primero sus
   *  licitaciones, después sus compradores y al final sus comunas. */
  private async actasPorLeer(companyId: number): Promise<ProcesoConActa[]> {
    const [mias, config] = await Promise.all([
      this.repo.misLicitaciones(companyId),
      this.oportunidades.configDe(companyId),
    ]);
    const desde = new Date(Date.now() - TRES_ANIOS_MS).toISOString();
    const organismos = [
      ...new Set(mias.map((m) => m.organismo_codigo).filter(Boolean)),
    ] as string[];
    const vistos = new Set<string>();
    const lista: ProcesoConActa[] = [];
    const sumar = (ps: ProcesoConActa[]) => {
      for (const p of ps) {
        if (lista.length >= ACTAS_POR_BUSQUEDA || vistos.has(p.codigo))
          continue;
        vistos.add(p.codigo);
        lista.push(p);
      }
    };
    sumar(
      await this.repo.actasPorLeer(
        { codigos: mias.map((m) => m.codigo) },
        ACTAS_POR_BUSQUEDA,
      ),
    );
    sumar(
      await this.repo.actasPorLeer({ organismos, desde }, ACTAS_POR_BUSQUEDA),
    );
    sumar(
      await this.repo.actasPorLeer(
        { comunas: config?.comunas_cercanas ?? [], desde },
        ACTAS_POR_BUSQUEDA,
      ),
    );
    return lista;
  }

  /** Las ofertas que importan a la empresa: las de las licitaciones donde
   *  ofertó y las de sus compradores (3 años). */
  private async ofertasDeLaEmpresa(
    companyId: number,
    rutEmpresa: string,
  ): Promise<{ ofertas: OfertaLeida[]; compradores: Set<string> }> {
    const [mias, propias] = await Promise.all([
      this.repo.misLicitaciones(companyId),
      rutEmpresa ? this.repo.ofertasDe(rutEmpresa) : Promise.resolve([]),
    ]);
    const compradores = new Set(
      [
        ...mias.map((m) => m.organismo_codigo),
        ...propias.map((o) => o.organismo_codigo),
      ].filter((x): x is string => Boolean(x)),
    );
    const desde = new Date(Date.now() - TRES_ANIOS_MS)
      .toISOString()
      .slice(0, 10);
    const [encuentros, enCompradores] = await Promise.all([
      this.repo.ofertasDeLicitaciones(propias.map((o) => o.codigo)),
      this.repo.ofertasEnCompradores([...compradores], desde),
    ]);
    const unicas = new Map<string, OfertaLeida>();
    for (const o of [...encuentros, ...enCompradores]) {
      unicas.set(`${o.codigo}|${o.rut}`, o);
    }
    return { ofertas: [...unicas.values()], compradores };
  }

  /** La IA dice si los proveedores nuevos de los compradores de la empresa
   *  son negocios parecidos al suyo. Devuelve cuántos clasificó. */
  private async clasificar(companyId: number): Promise<number> {
    if (!process.env.ANTHROPIC_API_KEY?.trim()) return 0;
    const rutEmpresa = normalizarRut(
      (await this.oferente.oferente(companyId))?.rut ?? '',
    );
    const [{ ofertas }, marcas, config] = await Promise.all([
      this.ofertasDeLaEmpresa(companyId, rutEmpresa),
      this.repo.marcas(companyId),
      this.oportunidades.configDe(companyId),
    ]);
    const yaClasificados = new Set(
      marcas.filter((m) => m.similar).map((m) => normalizarRut(m.rut)),
    );
    const candidatos = new Map<string, { nombre: string; detalle: string }>();
    for (const o of ofertas) {
      if (o.rut === rutEmpresa || yaClasificados.has(o.rut)) continue;
      const c = candidatos.get(o.rut) ?? { nombre: o.proveedor, detalle: '' };
      if (!c.detalle && o.detalle) c.detalle = o.detalle.slice(0, 160);
      candidatos.set(o.rut, c);
    }
    const lista = [...candidatos.entries()].slice(0, CLASIFICAR_POR_BUSQUEDA);
    let hechos = 0;
    for (let i = 0; i < lista.length; i += CLASIFICAR_POR_PEDIDO) {
      const lote = lista.slice(i, i + CLASIFICAR_POR_PEDIDO);
      try {
        const respuesta = await this.cliente().messages.parse({
          model: MODELO_HAIKU,
          max_tokens: 4000,
          output_config: {
            effort: 'low',
            format: jsonSchemaOutputFormat(ESQUEMA_DE_CLASIFICACION),
          },
          system: [
            {
              type: 'text',
              text: instruccionesDeClasificacion(config?.perfil ?? null),
              cache_control: { type: 'ephemeral' },
            },
          ],
          messages: [
            {
              role: 'user',
              content: lote
                .map(
                  ([rut, c]) =>
                    `${rut} | ${c.nombre}${c.detalle ? ` | ofreció: ${c.detalle}` : ''}`,
                )
                .join('\n'),
            },
          ],
        });
        const validos = clasificacionValida(
          respuesta.parsed_output,
          new Set(lote.map(([rut]) => rut)),
        );
        await this.repo.guardarClasificaciones(
          companyId,
          validos.map((v) => ({
            ...v,
            nombre: candidatos.get(v.rut)?.nombre ?? v.rut,
          })),
          MODELO_HAIKU,
        );
        hechos += validos.length;
        this.logger.info(
          `competencia ${companyId}: ${validos.length} clasificados, US$${costoEnDolares(respuesta.usage.input_tokens ?? 0, respuesta.usage.output_tokens ?? 0, MODELO_HAIKU)}`,
        );
      } catch (error) {
        this.logger.warn(
          `competencia ${companyId}: no se pudo clasificar: ${mensajeDe(error)}`,
        );
        return hechos;
      }
    }
    return hechos;
  }
}
