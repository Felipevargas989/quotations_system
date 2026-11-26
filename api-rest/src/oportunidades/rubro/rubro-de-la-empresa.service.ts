import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import { BadRequestException, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { costoEnDolares, MODELO_HAIKU } from '../analisis/comun';
import { MercadoDeLaZonaRepository } from '../datos-abiertos/mercado-de-la-zona.repository';
import { OportunidadesRepository } from '../oportunidades.repository';
import {
  huellaDelPerfil,
  menuDeFamilias,
  propuestaValida,
  type RubroDeLaEmpresa,
  rubroLimpio,
  textoDelMenu,
  TOPE_DE_FAMILIAS,
  TOPE_DE_PALABRAS,
} from './rubro-de-la-empresa';
import { rubroDeLaInstalacion } from './rubro-de-la-instalacion';

// «LEER MI RUBRO DESDE EL PERFIL» (Licita, 25-11). Solo en una instalación
// de rubro «general»: cada empresa tiene su propio filtro del mercado
// (`rubro-de-la-empresa.ts`). La IA chica del módulo (Haiku, como la lectura
// del radar) lee el perfil que escribió la empresa y un MENÚ CERRADO de
// familias ONU sacado del catálogo que llena el cargador
// (`mercado_productos_onu`), y propone familias, palabras y exclusiones. La
// propuesta NO se guarda sola: la empresa la revisa, la edita y la guarda;
// al guardar, la base rehace sus marcas (`mercado_marcar_empresa`).
// En Eventia (rubro «eventos») las tres puertas responden 400: ahí el rubro
// es «la marca» de siempre y nada de esto se lee.

export const CODIGO_SOLO_RUBRO_GENERAL = 'SOLO_EN_RUBRO_GENERAL';

export type EstadoDelRubro = RubroDeLaEmpresa & {
  /** ¿Tiene perfil escrito? Sin él, la IA no tiene qué leer. */
  hay_perfil: boolean;
  /** El perfil cambió desde que se guardó el rubro: conviene revisarlo. */
  perfil_cambio: boolean;
};

export type PropuestaDelRubro = RubroDeLaEmpresa & {
  /** Por qué, en una frase (lo dice la IA). */
  razon: string;
  /** Las familias del menú con sus ejemplos, para mostrarlas con nombre. */
  menu: Array<{ codigo: string; ejemplos: string[] }>;
};

export const ESQUEMA_DEL_RUBRO_DE_LA_EMPRESA = {
  type: 'object',
  properties: {
    onu_familias: { type: 'array', items: { type: 'string' } },
    palabras: { type: 'array', items: { type: 'string' } },
    palabras_no: { type: 'array', items: { type: 'string' } },
    razon: { type: 'string' },
  },
  required: ['onu_familias', 'palabras', 'palabras_no', 'razon'],
  additionalProperties: false,
} as const;

type RespuestaDeLaIA = {
  onu_familias: string[];
  palabras: string[];
  palabras_no: string[];
  razon: string;
};

/** Lo que se le dice a la IA, con el menú adentro (va en caché). */
export const instruccionesDelRubroDeLaEmpresa = (menu: string): string =>
  [
    'Ayudas a una empresa chilena a decir qué compras del Estado (Mercado Público) son de su rubro.',
    'Te paso lo que la empresa escribió de sí misma. Con eso devuelves tres listas:',
    `- onu_familias: los códigos del MENÚ de lo que la empresa vende, hasta ${TOPE_DE_FAMILIAS}. Un código de 4 dígitos toma la familia entera; uno de 6, solo esa clase. Prefiere la clase si la familia mezcla cosas que la empresa no vende. SOLO códigos que estén en el menú, escritos tal cual.`,
    `- palabras: hasta ${TOPE_DE_PALABRAS} palabras o frases cortas que aparecen en el NOMBRE de una compra de su rubro, en minúsculas y sin tildes. Una palabra calza con el comienzo de una palabra del nombre: «limpiez» calza con «limpieza»; «aseo» no calza con «paseo». Evita palabras genéricas que calzan con todo («servicio», «adquisicion», «compra», «suministro»).`,
    '- palabras_no: palabras que dejan una compra FUERA aunque calce con lo anterior: lo que la empresa dice que no hace y suele aparecer junto a lo que sí hace.',
    '- razon: una frase corta en español que diga qué entendiste que vende.',
    'Si el perfil no dice qué vende, devuelve las listas vacías y dilo en la razón. Ante la duda, menos es mejor: la empresa puede agregar después.',
    '',
    'EL MENÚ (código: productos de ejemplo)',
    menu || '(vacío: el cargador del mercado todavía no anota productos)',
  ].join('\n');

const sinRubroGeneral = () =>
  new BadRequestException({
    codigo: CODIGO_SOLO_RUBRO_GENERAL,
    message:
      'El rubro por empresa es solo para una instalación de rubro general: aquí el rubro es el de eventos.',
  });

@Injectable()
export class RubroDeLaEmpresaService {
  private clienteAnthropic: Anthropic | null = null;

  constructor(
    private readonly repo: OportunidadesRepository,
    private readonly mercado: MercadoDeLaZonaRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RubroDeLaEmpresaService.name);
  }

  protected cliente(): Anthropic {
    if (!this.clienteAnthropic) {
      this.clienteAnthropic = new Anthropic({ maxRetries: 4 });
    }
    return this.clienteAnthropic;
  }

  private exigirRubroGeneral(): void {
    if (rubroDeLaInstalacion() !== 'general') throw sinRubroGeneral();
  }

  /** Lo guardado y si el perfil cambió desde entonces. */
  async leer(companyId: number): Promise<EstadoDelRubro> {
    this.exigirRubroGeneral();
    const config = await this.repo.configDe(companyId);
    const rubro = rubroLimpio(config);
    const huella = huellaDelPerfil(config?.perfil);
    const guardada = config?.rubro_leido_de ?? null;
    return {
      ...rubro,
      hay_perfil: huella !== null,
      perfil_cambio: guardada !== null && guardada !== huella,
    };
  }

  /** La propuesta de la IA, sin guardar nada. */
  async proponer(companyId: number): Promise<PropuestaDelRubro> {
    this.exigirRubroGeneral();
    const config = await this.repo.configDe(companyId);
    const perfil = config?.perfil?.trim() ?? '';
    if (!perfil) {
      throw new BadRequestException(
        'Primero escribe en el perfil qué vende tu empresa: la IA lee tu rubro desde ahí.',
      );
    }
    if (!process.env.ANTHROPIC_API_KEY?.trim()) {
      throw new BadRequestException(
        'La IA no está configurada en esta instalación.',
      );
    }
    const menu = menuDeFamilias(await this.mercado.catalogoOnu());
    let salida: RespuestaDeLaIA | null;
    try {
      const respuesta = await this.cliente().messages.parse({
        model: MODELO_HAIKU,
        max_tokens: 3000,
        output_config: {
          effort: 'low',
          format: jsonSchemaOutputFormat(ESQUEMA_DEL_RUBRO_DE_LA_EMPRESA),
        },
        system: [
          {
            type: 'text',
            text: instruccionesDelRubroDeLaEmpresa(textoDelMenu(menu)),
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [{ role: 'user', content: `LA EMPRESA\n${perfil}` }],
      });
      salida = (respuesta.parsed_output as RespuestaDeLaIA | null) ?? null;
      this.logger.info(
        `rubro de la empresa ${companyId}: propuesta leída, US$${costoEnDolares(respuesta.usage.input_tokens ?? 0, respuesta.usage.output_tokens ?? 0, MODELO_HAIKU)}`,
      );
    } catch (error) {
      this.logger.warn(
        `rubro de la empresa ${companyId}: la IA no respondió: ${mensajeDe(error)}`,
      );
      throw new BadRequestException(
        'La IA no pudo leer tu perfil ahora. Prueba de nuevo en un rato.',
      );
    }
    if (!salida) {
      throw new BadRequestException(
        'La IA no devolvió una propuesta. Prueba de nuevo en un rato.',
      );
    }
    const valida = propuestaValida(salida, menu);
    const elegidas = new Set(valida.onu_familias);
    return {
      ...valida,
      razon: (salida.razon ?? '').trim().slice(0, 500),
      menu: menu
        .filter((f) => elegidas.has(f.codigo))
        .map(({ codigo, ejemplos }) => ({ codigo, ejemplos })),
    };
  }

  /** Guarda el rubro (editado o no) con la huella del perfil de hoy y
   *  rehace las marcas de la empresa. Si marcar falla, lo guardado queda:
   *  `marcadas` llega null y las marcas se rehacen al cargar el próximo mes
   *  o al guardar otra vez. */
  async guardar(
    companyId: number,
    rubro: Partial<RubroDeLaEmpresa>,
  ): Promise<EstadoDelRubro & { marcadas: number | null }> {
    this.exigirRubroGeneral();
    const limpio = rubroLimpio(rubro);
    const config = await this.repo.configDe(companyId);
    await this.repo.guardarConfig(companyId, {
      ...limpio,
      rubro_leido_de: huellaDelPerfil(config?.perfil),
    });
    let marcadas: number | null = null;
    try {
      marcadas = await this.mercado.marcarEmpresa(companyId);
    } catch (error) {
      this.logger.warn(
        `rubro de la empresa ${companyId}: no se pudieron rehacer las marcas: ${mensajeDe(error)}`,
      );
    }
    return { ...(await this.leer(companyId)), marcadas };
  }
}
