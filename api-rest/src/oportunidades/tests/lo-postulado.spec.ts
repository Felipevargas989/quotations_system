import type { GenerarRepository } from 'src/quotations/generar/generar.repository';
import {
  ESCRIBIR_LA_OFERTA,
  laOfertaDecidida,
  textoDeLosProductos,
} from '../postulacion/la-oferta-en-texto';
import { LoPostuladoService } from '../postulacion/lo-postulado.service';
import type { PostulacionRepository } from '../postulacion/postulacion.repository';
import { CATALOGO_DE_PRUEBA } from './generacion-de-prueba';

// LOS DOCUMENTOS SALEN DE LO POSTULADO (decisión 33 del doc 17, sprint H,
// 19-10): la matriz de la oferta armada y sus productos con los nombres del
// catálogo; la cotización es su copia.

const OFERTA = {
  cajas: [
    {
      dia: 1,
      categoria: 'Almuerzo',
      audiencia: 'adultos' as const,
      personas: 160,
      menu_id: 7,
      quitar: [12],
      servicios: [{ id: 13, cantidad: 1 }],
    },
  ],
  fijos: [{ dia: 0, id: 45, cantidad: 2 }],
};

const MATRIZ = [
  {
    especificacion: 'Plato principal: plateada o salmón',
    pagina: 19,
    como: 'Plateada para 160 personas.',
    origen: 'catalogo' as const,
    productos: [11],
  },
];

describe('Lo postulado, en texto para los documentos', () => {
  it('los productos salen del catálogo, sin lo que se quitó del menú y sin precios', () => {
    expect(textoDeLosProductos(OFERTA, CATALOGO_DE_PRUEBA)).toEqual([
      '- Día 1 · Almuerzo · 160 personas: Plateada, Pollo arvejado',
      '- Servicios: Amplificación ×2',
    ]);
  });

  it('la matriz va tal cual, con los productos y el número de la cotización que la copia', () => {
    const texto = laOfertaDecidida({
      matriz: MATRIZ,
      productos: ['- Día 1 · Almuerzo · 160 personas: Plateada'],
      cotizacion: 481,
    }).join('\n');
    expect(texto).toContain(
      '1. Plato principal: plateada o salmón (pág. 19) → Plateada para 160 personas.',
    );
    expect(texto).toContain('- Día 1 · Almuerzo · 160 personas: Plateada');
    expect(texto).toContain('(La cotización N° 481 es la copia de esto.)');
    expect(texto).not.toContain('$');
    expect(ESCRIBIR_LA_OFERTA).toContain(
      'No decidas, no cambies ni agregues nada',
    );
  });

  it('sin oferta armada no hay nada que escribir; con ella, los productos con sus nombres', async () => {
    const repo = { loPostulado: jest.fn().mockResolvedValue(null) };
    const catalogos = {
      catalogo: jest.fn().mockResolvedValue(CATALOGO_DE_PRUEBA),
    };
    const servicio = new LoPostuladoService(
      repo as unknown as PostulacionRepository,
      catalogos as unknown as GenerarRepository,
    );
    expect(await servicio.paraDocumentos(1, 40)).toBeNull();
    expect(catalogos.catalogo).not.toHaveBeenCalled();

    repo.loPostulado.mockResolvedValue({
      matriz: MATRIZ,
      oferta: OFERTA,
      cotizacion: 481,
    });
    expect(await servicio.paraDocumentos(1, 40)).toEqual({
      matriz: MATRIZ,
      productos: [
        '- Día 1 · Almuerzo · 160 personas: Plateada, Pollo arvejado',
        '- Servicios: Amplificación ×2',
      ],
      cotizacion: 481,
    });
  });
});
