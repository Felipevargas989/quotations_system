import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { MODELO_HAIKU } from '../analisis/comun';
import { MercadoDeLaZonaRepository } from '../datos-abiertos/mercado-de-la-zona.repository';
import { normalizarRut } from '../historia/ganadores';
import { fichaDeCompetidor } from '../historia/mercado';
import { OferenteRepository } from '../oferente/oferente.repository';
import { OportunidadesRepository } from '../oportunidades.repository';
import {
  ActasDeLaZonaService,
  desdeTresAnios,
  type EstadoDeLasActas,
} from './actas.service';
import {
  competidoresReales,
  type CompetidorReal,
  type FichaDeMercado,
  fichaDeMercado,
} from './competencia';
import { CompetenciaRepository } from './competencia.repository';
import { etiquetaDelRubro, rankingDelRubro } from './rubro';
import { type EstadoDelRubro, RubroService } from './rubro.service';

// COMPETIDORES REALES (decisiones 70 y 71 del doc 17). La lista de «Tus
// competidores» (los que ofertaron donde ofertó la empresa, y los que
// sigue), el estudio de mercado de cada uno y «Quién gana en tu zona» (solo
// lo del rubro). Leer las actas y revisar el rubro corre solo
// (`ActasDeLaZonaService`, `RubroService`, de noche y al abrir la pestaña):
// la pantalla solo muestra cómo va.

export type EstadoDeLaCompetencia = {
  competidores: CompetidorReal[];
  /** El RUT de la empresa (de «Mi empresa»): sin él no hay «compitió». */
  rut_empresa: string | null;
  actas: EstadoDeLasActas;
};

export type QuienGanaEnTuZona = {
  ranking: ReturnType<typeof rankingDelRubro>;
  rubro: EstadoDelRubro;
};

const RUT_VALIDO = /^\d{6,9}-[\dK]$/;

@Injectable()
export class CompetenciaService {
  constructor(
    private readonly repo: CompetenciaRepository,
    private readonly oportunidades: OportunidadesRepository,
    private readonly oferente: OferenteRepository,
    private readonly actas: ActasDeLaZonaService,
    private readonly rubro: RubroService,
    private readonly logger: PinoLogger,
    /** Decisión 109: los triunfos de la zona salen del mercado, como en
     *  «Se viene» y la lista de competidores. Opcional: las pruebas de antes
     *  no lo traen. */
    @Optional() private readonly mercado?: MercadoDeLaZonaRepository,
  ) {
    this.logger.setContext(CompetenciaService.name);
  }

  private async rutDeLaEmpresa(companyId: number): Promise<string> {
    return normalizarRut((await this.oferente.oferente(companyId))?.rut ?? '');
  }

  /** «Tus competidores» y cómo va la lectura de actas (si falta, sigue
   *  leyendo por detrás). */
  async estado(companyId: number): Promise<EstadoDeLaCompetencia> {
    const rutEmpresa = await this.rutDeLaEmpresa(companyId);
    const propias = rutEmpresa ? await this.repo.ofertasDe(rutEmpresa) : [];
    const codigos = [...new Set(propias.map((o) => o.codigo))];
    const [conLaEmpresa, marcas, actas] = await Promise.all([
      this.repo.ofertasDeLicitaciones(codigos),
      this.repo.marcas(companyId),
      this.repo.actasDe(codigos),
    ]);
    const ruts = new Set(
      conLaEmpresa.filter((o) => o.rut !== rutEmpresa).map((o) => o.rut),
    );
    for (const m of marcas) if (m.seguido) ruts.add(normalizarRut(m.rut));
    const historial = await this.repo.ofertasDeRuts([...ruts]);
    const antes = await this.actas.estado(companyId);
    this.actas.leerSiHaceFalta(companyId, antes);
    // Si recién empezó a leer, que la pantalla lo sepa (y pregunte otra vez).
    const estadoDeLasActas = {
      ...antes,
      leyendo: this.actas.estaLeyendo(companyId),
    };
    return {
      competidores: competidoresReales({
        rutEmpresa,
        ofertasConLaEmpresa: conLaEmpresa,
        historial,
        actas,
        marcas,
      }),
      rut_empresa: rutEmpresa || null,
      actas: estadoDeLasActas,
    };
  }

  /** Lo de la zona: el mercado de ChileCompra (decisión 109); si todavía no
   *  tiene nada, la historia que bajó el radar. */
  private async procesosDeLaZona(regiones: string[]) {
    const delMercado = this.mercado
      ? await this.mercado.procesosDeLaZona(regiones)
      : [];
    return delMercado.length > 0
      ? delMercado
      : this.oportunidades.procesosDeLaZona(regiones);
  }

  /** El estudio de mercado de un competidor. */
  async ficha(companyId: number, rut: string): Promise<FichaDeMercado> {
    const limpio = normalizarRut(rut);
    if (!RUT_VALIDO.test(limpio)) {
      throw new BadRequestException('Ese RUT no es válido.');
    }
    const [rutEmpresa, ofertas, marcas, config] = await Promise.all([
      this.rutDeLaEmpresa(companyId),
      this.repo.ofertasDe(limpio),
      this.repo.marcas(companyId),
      this.oportunidades.configDe(companyId),
    ]);
    const enSusLicitaciones = await this.repo.ofertasDeLicitaciones(
      ofertas.map((o) => o.codigo),
    );
    const conLaEmpresa = [
      ...new Set(
        enSusLicitaciones
          .filter((o) => rutEmpresa && o.rut === rutEmpresa)
          .map((o) => o.codigo),
      ),
    ];
    const [actas, procesos] = await Promise.all([
      this.repo.actasDe(conLaEmpresa),
      this.procesosDeLaZona(config?.regiones ?? []),
    ]);
    const deLaZona = fichaDeCompetidor(procesos, limpio);
    const ficha = fichaDeMercado({
      rut: limpio,
      rutEmpresa,
      ofertas,
      enSusLicitaciones,
      triunfosDeLaZona: deLaZona?.triunfos_detalle ?? [],
      actas,
      marca: marcas.find((m) => normalizarRut(m.rut) === limpio) ?? null,
      nombreDeLaZona: deLaZona?.nombre ?? null,
    });
    if (!ficha) {
      throw new NotFoundException(
        'No encontramos a ese proveedor en las actas ni en lo adjudicado en tu zona.',
      );
    }
    return ficha;
  }

  /** «Quién gana en tu zona», solo lo del rubro (si falta revisar, sigue
   *  por detrás). */
  async zona(companyId: number): Promise<QuienGanaEnTuZona> {
    const [filas, rubro] = await Promise.all([
      this.repo.filasDelRubro(
        companyId,
        desdeTresAnios(),
        etiquetaDelRubro(MODELO_HAIKU),
      ),
      this.rubro.estado(companyId),
    ]);
    this.rubro.clasificarSiHaceFalta(companyId, rubro);
    return {
      ranking: rankingDelRubro(filas),
      rubro: { ...rubro, revisando: this.rubro.estaRevisando(companyId) },
    };
  }

  /** «Seguir» o «No es mi competidor» (o deshacerlo). */
  async marcar(
    companyId: number,
    rut: string,
    cambios: { seguido?: boolean; descartado?: boolean },
  ) {
    const limpio = normalizarRut(rut);
    if (!RUT_VALIDO.test(limpio)) {
      throw new BadRequestException('Ese RUT no es válido.');
    }
    if (cambios.seguido === undefined && cambios.descartado === undefined) {
      throw new BadRequestException('No hay nada que cambiar.');
    }
    const nombre =
      (await this.repo.ofertasDe(limpio))[0]?.proveedor?.trim() ?? null;
    return this.repo.marcar(companyId, limpio, nombre, cambios);
  }
}
