import { armarBoleta } from '../archivo/boleta';
import { armarFactura } from '../archivo/factura';
import { EnvioSinRespuesta } from '../facturacion-cl/facturacion-cl';
import {
  FacturacionClSimulado,
  revisarArchivo,
} from '../facturacion-cl/simulado';

/**
 * FACTURACION.CL SIMULADO (doc 19 §9.9): responde como el de verdad y no
 * emite nada. Los pasos 1 a 4 se construyen contra él.
 */

const archivoDeFactura = (folio: number) => {
  const armado = armarFactura({
    tipo: 33,
    folio,
    fecha: '2026-11-04',
    receptor: {
      rut: '90.413.000-1',
      razon_social: 'Compañía Cervecerías Unidas S.A.',
      giro: 'Elaboración de cervezas',
      direccion: 'Av. Vitacura 2670',
      comuna: 'Las Condes',
    },
    lineas: [{ descripcion: 'Paseo fin de año', cantidad: 1, precio: 1000000 }],
  });
  if (!armado.ok) throw new Error(armado.problemas.join(' | '));
  return armado.archivo;
};

describe('facturacion.cl simulado', () => {
  it('sigue la numeración de la base: después de la 373 va la 374', async () => {
    const simulado = new FacturacionClSimulado({
      ultimoFolio: () => Promise.resolve(373),
    });
    expect(await simulado.folioSiguiente(33)).toBe(374);

    const respuesta = await simulado.procesar(archivoDeFactura(374), 33);
    expect(respuesta).toMatchObject({
      resultado: 'emitido',
      tipo: 33,
      folio: 374,
      fecha: '2026-11-04',
    });
    expect(await simulado.folioSiguiente(33)).toBe(375);
  });

  it('el folio repetido se rechaza con el mensaje de facturacion.cl (L3)', async () => {
    const simulado = new FacturacionClSimulado({
      ultimoFolio: () => Promise.resolve(373),
    });
    await simulado.procesar(archivoDeFactura(374), 33);
    const otraVez = await simulado.procesar(archivoDeFactura(374), 33);
    expect(otraVez).toMatchObject({
      resultado: 'rechazado',
      mensaje: 'ERROR: Ya existe el Documento del TipoDTE = 33 con Folio = 374',
    });
  });

  it('la boleta va con folio 0 y vuelve con el suyo', async () => {
    const simulado = new FacturacionClSimulado({
      ultimoFolio: () => Promise.resolve(41),
    });
    const armado = armarBoleta({
      fecha: '2026-11-04',
      lineas: [
        { descripcion: 'Cabaña 2 personas', cantidad: 1, precio: 48000 },
      ],
    });
    if (!armado.ok) throw new Error(armado.problemas.join(' | '));
    expect(await simulado.procesar(armado.archivo, 39)).toMatchObject({
      resultado: 'emitido',
      folio: 42,
    });
    expect(await simulado.procesar(armado.archivo, 39)).toMatchObject({
      resultado: 'emitido',
      folio: 43,
    });
  });

  it('un archivo mal armado se rechaza diciendo qué falló', async () => {
    const simulado = new FacturacionClSimulado();
    const conPuntoYComa = archivoDeFactura(1).replace(
      'Paseo fin de año',
      'Paseo; fin de año',
    );
    const respuesta = await simulado.procesar(conPuntoYComa, 33);
    expect(respuesta.resultado).toBe('rechazado');
    expect(respuesta.mensaje).toMatch(/->Detalle<- lleva 14 campos y trae 15/);
  });

  it('los totales que no cuadran se rechazan', () => {
    const malSumado = archivoDeFactura(1).replace(
      ';190000;1190000;',
      ';190001;1190001;',
    );
    expect(revisarArchivo(malSumado)).toEqual({
      error: 'El IVA 190001 no es el 19% del neto 1000000',
    });
  });

  it('si se corta la conexión, avisa y no reintenta: queda «por confirmar» (L5)', async () => {
    const simulado = new FacturacionClSimulado({ cortarEnElEnvio: true });
    await expect(
      simulado.procesar(archivoDeFactura(1), 33),
    ).rejects.toBeInstanceOf(EnvioSinRespuesta);
  });

  it('el PDF dice que es simulado', async () => {
    const pdf = await new FacturacionClSimulado().obtenerPdf(33, 374);
    const texto = pdf?.toString('latin1') ?? '';
    expect(texto.startsWith('%PDF-1.4')).toBe(true);
    expect(texto).toContain('DOCUMENTO SIMULADO - SIN VALIDEZ TRIBUTARIA');
    expect(texto).toContain('Tipo 33 - Folio 374');
  });
});
