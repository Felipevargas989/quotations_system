import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { bajarActa, leerActa } from '../historia/acta';
import { normalizarRut } from '../historia/ganadores';
import { esDeComunaCercana } from '../lectura/reglas';
import { regionCalza } from '../mercado-publico/mapeo';
import { OferenteRepository } from '../oferente/oferente.repository';
import { OportunidadesRepository } from '../oportunidades.repository';
import { ofertasDelActa } from './competencia';
import { CompetenciaRepository } from './competencia.repository';

// LAS ACTAS DE LA ZONA, SOLAS (decisión 71 del doc 17, 23-10). Felipe: "la
// lectura de actas debería ser automática y debería ser un dato que me lo
// entregara, no algo cliqueable". Se leen TODAS las actas de los últimos 3
// años de las regiones de la empresa (unas 6.000 en Ñuble y Biobío), para
// encontrar cada licitación donde ofertó y la historia de cada competidor.
// Orden: primero sus licitaciones, después sus compradores, sus comunas
// cercanas y al final el resto de la región; lo más nuevo primero.
//
// Corre de noche (competencia-cron) y, si al abrir la pestaña falta leer y
// nadie está leyendo, 20 minutos por detrás. El acta es una página pública
// sin código; entre una y otra, 0,8 s. Una que falla se reintenta en la
// próxima vuelta (no se marca).

const MINUTO = 60_000;
export const TRES_ANIOS_MS = 3 * 365 * 24 * 60 * MINUTO;
/** Entre una página y otra: el acta es pública, pero sin apuro. */
export const PAUSA_ENTRE_ACTAS_MS = 800;
/** Al abrir la pestaña, cuánto se lee por detrás. */
export const LECTURA_AL_ABRIR_MS = 20 * MINUTO;

export type EstadoDeLasActas = {
  /** Actas de la zona (3 años) y cuántas ya se leyeron. */
  leidas: number;
  total: number;
  leyendo: boolean;
};

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const desdeTresAnios = (ahora = Date.now()): string =>
  new Date(ahora - TRES_ANIOS_MS).toISOString();

@Injectable()
export class ActasDeLaZonaService {
  /** Una lectura a la vez por empresa. */
  private readonly enCurso = new Set<number>();

  constructor(
    private readonly repo: CompetenciaRepository,
    private readonly oportunidades: OportunidadesRepository,
    private readonly oferente: OferenteRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ActasDeLaZonaService.name);
  }

  /** Para las pruebas: no esperar entre una página y otra. */
  protected pausa(ms: number): Promise<void> {
    return esperar(ms);
  }

  /** Las actas por leer de la empresa, en el orden en que se leen. */
  async pendientes(companyId: number): Promise<string[]> {
    const [mias, config, oferente] = await Promise.all([
      this.repo.misLicitaciones(companyId),
      this.oportunidades.configDe(companyId),
      this.oferente.oferente(companyId),
    ]);
    const rut = normalizarRut(oferente?.rut ?? '');
    const regiones = config?.regiones ?? [];
    const comunas = config?.comunas_cercanas ?? [];
    const propias = new Set(mias.map((m) => m.codigo));
    const compradores = new Set(
      [
        ...mias.map((m) => m.organismo_codigo),
        ...(rut ? await this.repo.ofertasDe(rut) : []).map(
          (o) => o.organismo_codigo,
        ),
      ].filter((x): x is string => Boolean(x)),
    );
    const grupo = (p: {
      codigo: string;
      organismo_codigo: string | null;
      comuna: string | null;
      region: string | null;
    }): number => {
      if (propias.has(p.codigo)) return 0;
      if (p.organismo_codigo && compradores.has(p.organismo_codigo)) return 1;
      if (
        esDeComunaCercana(
          { comuna: p.comuna, organismo: null, unidad: null },
          comunas,
        )
      ) {
        return 2;
      }
      return regionCalza(p.region, regiones) ? 3 : 9;
    };
    return (await this.repo.zonaLigera(desdeTresAnios()))
      .filter((p) => p.url_acta && !p.ofertas_leidas_en)
      .map((p) => ({ p, g: grupo(p) }))
      .filter(({ g }) => g < 9)
      .sort(
        (a, b) =>
          a.g - b.g ||
          (b.p.fecha_publicacion ?? '').localeCompare(
            a.p.fecha_publicacion ?? '',
          ),
      )
      .map(({ p }) => p.codigo);
  }

  /** Cuántas actas de la zona hay y cuántas se leyeron. */
  async estado(companyId: number): Promise<EstadoDeLasActas> {
    const config = await this.oportunidades.configDe(companyId);
    const regiones = config?.regiones ?? [];
    const deLaZona = (await this.repo.zonaLigera(desdeTresAnios())).filter(
      (p) => p.url_acta && regionCalza(p.region, regiones),
    );
    return {
      leidas: deLaZona.filter((p) => p.ofertas_leidas_en).length,
      total: deLaZona.length,
      leyendo: this.enCurso.has(companyId),
    };
  }

  /** Al abrir la pestaña: si falta leer y nadie lee, 20 minutos por detrás. */
  leerSiHaceFalta(companyId: number, estado: EstadoDeLasActas): void {
    if (estado.leidas >= estado.total || this.enCurso.has(companyId)) return;
    void this.leer(companyId, Date.now() + LECTURA_AL_ABRIR_MS).catch((e) =>
      this.logger.warn(`actas ${companyId}: ${mensajeDe(e)}`),
    );
  }

  /** Lee las actas que faltan hasta la hora dada. Devuelve cuántas leyó. */
  async leer(companyId: number, hasta: number): Promise<number> {
    if (this.enCurso.has(companyId)) return 0;
    this.enCurso.add(companyId);
    let leidas = 0;
    try {
      const pendientes = await this.pendientes(companyId);
      for (let i = 0; i < pendientes.length; i += 50) {
        if (Date.now() > hasta) break;
        const lote = pendientes.slice(i, i + 50);
        const porCodigo = new Map(
          (await this.repo.procesosParaActa(lote)).map((p) => [p.codigo, p]),
        );
        for (const codigo of lote) {
          if (Date.now() > hasta) break;
          const p = porCodigo.get(codigo);
          if (!p) continue;
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
            leidas += 1;
          } catch (error) {
            this.logger.warn(`acta ${p.codigo}: ${mensajeDe(error)}`);
          }
          if (bajada) await this.pausa(PAUSA_ENTRE_ACTAS_MS);
        }
      }
      if (leidas > 0) {
        this.logger.info(`actas ${companyId}: ${leidas} leídas`);
      }
      return leidas;
    } finally {
      this.enCurso.delete(companyId);
      this.repo.olvidarLaZona();
    }
  }
}
