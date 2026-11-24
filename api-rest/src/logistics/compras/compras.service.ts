import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import {
  costoEnDolares,
  errorDeIA,
  MODELO_SONNET,
} from 'src/oportunidades/analisis/comun';
import { LogisticsService } from '../logistics.service';
import {
  buildConsolidationContext,
  consolidateEvent,
  mapNameIds,
  newAccumulator,
  type EventItemsSnapshot,
  type LineaDeReceta,
  type MuebleBase,
} from '../utils/consolidacion';
import { calcularBodega, primerConteo, type ConsumoDeEvento } from './bodega';
import { ComprasRepository, type FilaDeLinea } from './compras.repository';
import {
  costoPorUnidad,
  ESQUEMA_DE_LA_COMPRA,
  instruccionesDeLaCompra,
  normalizar,
  propuestaDeLaCompra,
  proveedorDe,
  type InsumoParaLeer,
} from './leer-compra';

// COMPRAS CON IA Y BODEGA (doc 25, 23-11-2026). Reemplaza el modal
// «Confirmar la compra» (24-08), donde se escribían a mano lo comprado y lo
// gastado. El costo del catálogo de insumos ahora sale de las compras que
// se suben, siempre con el check de una persona.

const MEDIOS: Readonly<Record<string, string>> = {
  'application/pdf': 'application/pdf',
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
};
const MAX_BYTES = 10 * 1024 * 1024;

const n = (v: unknown) => Number(v) || 0;

@Injectable()
export class ComprasService {
  private clienteAnthropic?: Anthropic;

  constructor(
    private readonly repo: ComprasRepository,
    private readonly logistica: LogisticsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ComprasService.name);
  }

  protected cliente(): Anthropic {
    if (!this.clienteAnthropic) {
      this.clienteAnthropic = new Anthropic({
        maxRetries: 2,
        timeout: 3 * 60 * 1000,
      });
    }
    return this.clienteAnthropic;
  }

  private async insumosParaLeer(companyId: number): Promise<InsumoParaLeer[]> {
    return (await this.repo.insumos(companyId))
      .filter((i) => i.is_active !== false)
      .map((i) => ({
        id: Number(i.id),
        name: i.name,
        unit_family: i.unit_family,
        price: n(i.price),
        package_qty: i.package_qty ? n(i.package_qty) : null,
        supplier_id: i.supplier_id,
      }));
  }

  // ---------- Subir y leer ----------

  async subir(
    companyId: number,
    usuario: string | null,
    archivo?: Express.Multer.File,
  ) {
    if (!archivo?.buffer?.length) {
      throw new BadRequestException('Falta el archivo de la compra.');
    }
    const medio = MEDIOS[archivo.mimetype];
    if (!medio) {
      throw new BadRequestException(
        'Sube la compra en PDF o como foto (JPG, PNG o WebP).',
      );
    }
    if (archivo.size > MAX_BYTES) {
      throw new BadRequestException('Pesa más de 10 MB.');
    }
    if (!process.env.ANTHROPIC_API_KEY?.trim()) {
      throw new BadRequestException('Falta la llave de Anthropic en el motor.');
    }
    const [insumos, equivalentes, proveedores, empresa] = await Promise.all([
      this.insumosParaLeer(companyId),
      this.repo.equivalentes(companyId),
      this.repo.proveedores(companyId),
      this.repo.nombreEmpresa(companyId),
    ]);
    const data = archivo.buffer.toString('base64');
    const bloque: Anthropic.ContentBlockParam =
      medio === 'application/pdf'
        ? {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data },
          }
        : {
            type: 'image',
            source: {
              type: 'base64',
              media_type: medio as 'image/jpeg' | 'image/png' | 'image/webp',
              data,
            },
          };
    let salida: unknown;
    let usd = 0;
    try {
      const r = await this.cliente().messages.parse({
        model: MODELO_SONNET,
        max_tokens: 8000,
        output_config: { format: jsonSchemaOutputFormat(ESQUEMA_DE_LA_COMPRA) },
        system: instruccionesDeLaCompra(empresa, insumos, equivalentes),
        messages: [
          {
            role: 'user',
            content: [bloque, { type: 'text', text: 'Lee esta compra.' }],
          },
        ],
      });
      salida = r.parsed_output;
      const entrada = r.usage.input_tokens ?? 0;
      const sale = r.usage.output_tokens ?? 0;
      usd = Number(costoEnDolares(entrada, sale, MODELO_SONNET)) || 0;
      this.logger.info(
        `compra leída (empresa ${companyId}): ${entrada} tokens de entrada, ${sale} de salida, US$${usd}`,
      );
    } catch (error) {
      this.logger.warn(`leer una compra: ${mensajeDe(error)}`);
      throw new BadRequestException(
        errorDeIA(error, 'BelIA no pudo leer la compra'),
      );
    }
    const proveedorTexto =
      ((salida ?? {}) as { proveedor?: string }).proveedor ?? null;
    const supplierId = proveedorDe(proveedorTexto, proveedores);
    const leida = propuestaDeLaCompra(
      salida,
      insumos,
      equivalentes,
      supplierId,
    );
    if (!leida) {
      throw new BadRequestException(
        'Ese documento no parece una compra a un proveedor.',
      );
    }
    const avisos: string[] = [];
    if (
      leida.numero &&
      (await this.repo.compraRepetida(
        companyId,
        leida.numero,
        leida.proveedor,
        supplierId,
      ))
    ) {
      avisos.push(
        `La ${leida.tipo_documento} N° ${leida.numero} ya se había subido.`,
      );
    }
    const ruta = await this.repo.guardarArchivo(
      companyId,
      archivo.originalname || 'compra',
      archivo.buffer,
      archivo.mimetype,
    );
    const id = await this.repo.crearCompra(
      companyId,
      ruta,
      archivo.originalname || 'compra',
      leida,
      supplierId,
      usd,
      usuario,
    );
    return { compra: await this.repo.compra(companyId, id), avisos };
  }

  // ---------- Revisar ----------

  /** Cambia el insumo, la cantidad o el total de una línea, o la marca
   *  «no es insumo». El costo se recalcula. */
  async cambiarLinea(
    companyId: number,
    id: number,
    cambios: {
      supply_id?: number | null;
      cantidad_base?: number | null;
      total?: number | null;
      no_es_insumo?: boolean;
    },
  ) {
    const linea = await this.repo.linea(companyId, id);
    if (!linea) throw new NotFoundException('Esa línea no existe');
    if (linea.estado === 'aplicada') {
      throw new BadRequestException('Esa línea ya se aplicó.');
    }
    const insumos = await this.insumosParaLeer(companyId);
    const nueva: Partial<FilaDeLinea> = {};
    if (cambios.no_es_insumo !== undefined) {
      nueva.estado = cambios.no_es_insumo ? 'no_es_insumo' : 'propuesta';
    }
    if (cambios.supply_id !== undefined) {
      if (
        cambios.supply_id !== null &&
        !insumos.some((i) => i.id === cambios.supply_id)
      ) {
        throw new NotFoundException('Ese insumo no es de tu empresa');
      }
      nueva.supply_id = cambios.supply_id;
      nueva.equivalente = null;
      nueva.estado = 'propuesta';
    }
    if (cambios.cantidad_base !== undefined)
      nueva.cantidad_base = cambios.cantidad_base;
    if (cambios.total !== undefined) {
      nueva.total = cambios.total === null ? null : Math.round(cambios.total);
    }
    const supplyId =
      nueva.supply_id !== undefined ? nueva.supply_id : linea.supply_id;
    const insumo = insumos.find((i) => i.id === supplyId);
    const total = nueva.total !== undefined ? nueva.total : linea.total;
    const cant =
      nueva.cantidad_base !== undefined
        ? nueva.cantidad_base
        : linea.cantidad_base;
    nueva.costo_base = insumo ? costoPorUnidad(n(total), n(cant)) : null;
    nueva.costo_antes = insumo ? insumo.price : null;
    await this.repo.actualizarLinea(companyId, id, nueva);
    return this.repo.compra(companyId, linea.compra_id);
  }

  /**
   * Aplica las líneas marcadas: el costo va al catálogo, la cantidad suma a
   * la bodega y el texto queda aprendido para la próxima compra de ese
   * proveedor. Nada se aplica sin este paso (el check de una persona).
   */
  async aplicar(
    companyId: number,
    compraId: number,
    lineaIds: number[],
    usuario: string | null,
  ) {
    const compra = await this.repo.compra(companyId, compraId);
    if (!compra) throw new NotFoundException('Esa compra no existe');
    const insumos = new Map(
      (await this.insumosParaLeer(companyId)).map((i) => [i.id, i]),
    );
    const pedidas = new Set(lineaIds);
    let aplicadas = 0;
    const etiqueta = [
      compra.tipo_documento ?? 'compra',
      compra.numero ? `N° ${compra.numero}` : null,
      compra.proveedor_texto,
    ]
      .filter(Boolean)
      .join(' · ');
    for (const l of compra.lineas ?? []) {
      if (!pedidas.has(l.id) || l.estado !== 'propuesta' || !l.supply_id)
        continue;
      const insumo = insumos.get(l.supply_id);
      if (!insumo) continue;
      const costo = n(l.costo_base);
      if (costo > 0) {
        await this.repo.ponerCosto(
          companyId,
          insumo.id,
          costo,
          insumo.package_qty ?? null,
        );
      }
      if (n(l.cantidad_base) > 0) {
        await this.repo.agregarMovimiento(companyId, {
          supply_id: insumo.id,
          tipo: 'compra',
          cantidad_base: n(l.cantidad_base),
          linea_id: l.id,
          nota: etiqueta.slice(0, 200),
          creado_por: usuario,
        });
      }
      await this.repo.agregarEquivalente(companyId, {
        supply_id: insumo.id,
        nombre: l.texto.slice(0, 200),
        nombre_normal: normalizar(l.texto),
        tipo: 'texto',
        supplier_id: compra.supplier_id,
      });
      await this.repo.actualizarLinea(companyId, l.id, {
        estado: 'aplicada',
        aplicada_at: new Date().toISOString(),
      });
      aplicadas += 1;
    }
    const despues = await this.repo.compra(companyId, compraId);
    const quedan = (despues?.lineas ?? []).some(
      (l) => l.estado === 'propuesta' && l.supply_id,
    );
    if (!quedan) await this.repo.marcarCompra(companyId, compraId, 'aplicada');
    this.logger.info(
      `compra ${compraId} (empresa ${companyId}): ${aplicadas} líneas aplicadas`,
    );
    return { aplicadas, compra: await this.repo.compra(companyId, compraId) };
  }

  async descartar(companyId: number, compraId: number) {
    const compra = await this.repo.compra(companyId, compraId);
    if (!compra) throw new NotFoundException('Esa compra no existe');
    await this.repo.marcarCompra(companyId, compraId, 'descartada');
    return { ok: true };
  }

  // ---------- Equivalentes ----------

  async agregarEquivalente(
    companyId: number,
    supplyId: number,
    nombre: string,
    tipo: 'corte' | 'marca',
  ) {
    const insumos = await this.insumosParaLeer(companyId);
    if (!insumos.some((i) => i.id === supplyId)) {
      throw new NotFoundException('Ese insumo no es de tu empresa');
    }
    const limpio = nombre.trim().slice(0, 80);
    if (!limpio) throw new BadRequestException('Falta el nombre.');
    await this.repo.agregarEquivalente(companyId, {
      supply_id: supplyId,
      nombre: limpio,
      nombre_normal: normalizar(limpio),
      tipo,
      supplier_id: null,
    });
    return { ok: true };
  }

  async borrarEquivalente(companyId: number, id: number) {
    await this.repo.borrarEquivalente(companyId, id);
    return { ok: true };
  }

  // ---------- Bodega ----------

  async moverBodega(
    companyId: number,
    usuario: string | null,
    supplyId: number,
    tipo: 'tengo' | 'saque',
    cantidad: number,
    nota?: string,
  ) {
    const insumos = await this.insumosParaLeer(companyId);
    if (!insumos.some((i) => i.id === supplyId)) {
      throw new NotFoundException('Ese insumo no es de tu empresa');
    }
    await this.repo.agregarMovimiento(companyId, {
      supply_id: supplyId,
      tipo,
      cantidad_base: Math.max(0, cantidad),
      nota: nota?.trim().slice(0, 200) || null,
      creado_por: usuario,
    });
    return { ok: true };
  }

  /** Lo que consumieron, por receta, los eventos realizados desde un día. */
  private async consumoDeEventos(
    companyId: number,
    desde: string,
  ): Promise<ConsumoDeEvento[]> {
    // Un evento de varios días puede haber partido antes del conteo y
    // terminar después: se mira un mes hacia atrás y se filtra por el
    // último día.
    const atras = new Date(`${desde}T12:00:00Z`);
    atras.setUTCDate(atras.getUTCDate() - 31);
    const [eventos, recetas, insumos, nombres] = await Promise.all([
      this.repo.eventosRealizadosDesde(
        companyId,
        atras.toISOString().slice(0, 10),
      ),
      this.logistica.findAllRecipeItems(companyId),
      this.logistica.findAllSupplies(companyId),
      this.logistica.catalogServiceNames(companyId),
    ]);
    if (!eventos.length) return [];
    const lista = (insumos as unknown as InsumoParaLeer[]).map((i) => ({
      ...i,
      price: n(i.price),
      waste_pct: n((i as unknown as { waste_pct?: number }).waste_pct),
    }));
    const cuenta = buildConsolidationContext<
      (typeof lista)[number],
      MuebleBase
    >(
      (recetas as unknown as LineaDeReceta[]).map((r) => ({
        ...r,
        qty_per_person: n(r.qty_per_person),
      })),
      lista,
      [],
      mapNameIds(nombres as Parameters<typeof mapNameIds>[0]),
      {},
    );
    return eventos
      .map((e) => {
        const dia = (e.event_end_date || e.event_date || '').slice(0, 10);
        const acc = newAccumulator<(typeof lista)[number]>();
        const r = consolidateEvent(
          e.items as EventItemsSnapshot,
          e.people_count || 0,
          cuenta,
          acc,
        );
        return {
          quotation_id: e.id,
          numero: e.quotation_number,
          dia,
          consumo: r.supplyUse,
        };
      })
      .filter((e) => e.dia > desde || e.dia === desde);
  }

  /** Todo lo de la pestaña Stock en una sola respuesta. */
  async estado(companyId: number) {
    const [movimientos, equivalentes, compras] = await Promise.all([
      this.repo.movimientos(companyId),
      this.repo.equivalentes(companyId),
      this.repo.compras(companyId),
    ]);
    const desde = primerConteo(movimientos);
    const eventos = desde ? await this.consumoDeEventos(companyId, desde) : [];
    const bodega = [...calcularBodega(movimientos, eventos).values()].map(
      (b) => ({
        ...b,
        historia: b.historia.slice(0, 12),
      }),
    );
    return {
      bodega,
      equivalentes: equivalentes.filter((e) => e.tipo !== 'texto'),
      compras,
    };
  }

  /** Solo la bodega (para la lista de Compras): insumo → stock. */
  async soloBodega(companyId: number) {
    const movimientos = await this.repo.movimientos(companyId);
    const desde = primerConteo(movimientos);
    const eventos = desde ? await this.consumoDeEventos(companyId, desde) : [];
    return [...calcularBodega(movimientos, eventos).values()]
      .filter((b) => b.stock !== null)
      .map((b) => ({ supply_id: b.supply_id, stock: b.stock }));
  }
}
