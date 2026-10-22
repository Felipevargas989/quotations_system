import { Injectable } from '@nestjs/common';
import { GenerarRepository } from 'src/quotations/generar/generar.repository';
import {
  type OfertaParaDocumentos,
  textoDeLosProductos,
} from './la-oferta-en-texto';
import { PostulacionRepository } from './postulacion.repository';

// LO POSTULADO PARA LOS DOCUMENTOS (decisión 33, sprint H, 19-10): la
// matriz de la oferta armada y sus productos con los nombres del catálogo.
// Lo pide GeneracionService al armar la propuesta técnica y los anexos.

@Injectable()
export class LoPostuladoService {
  constructor(
    private readonly repo: PostulacionRepository,
    private readonly catalogos: GenerarRepository,
  ) {}

  async paraDocumentos(
    companyId: number,
    oportunidadId: number,
  ): Promise<OfertaParaDocumentos | null> {
    const lo = await this.repo.loPostulado(companyId, oportunidadId);
    if (!lo) return null;
    const catalogo = await this.catalogos.catalogo(companyId);
    return {
      matriz: lo.matriz,
      productos: textoDeLosProductos(lo.oferta, catalogo),
      cotizacion: lo.cotizacion,
    };
  }
}
