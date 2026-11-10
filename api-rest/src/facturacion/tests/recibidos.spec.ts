import { BadRequestException } from '@nestjs/common';
import { mockPinoLogger } from '../../testing/mocks';
import {
  FacturacionClCompras,
  datosDelRecibido,
  leerRespuestaDelLibro,
  sobreDelLibro,
} from '../facturacion-cl/compras';
import { RecibidosService } from '../recibidos/recibidos.service';

/**
 * LO RECIBIDO (doc 19 §9.28; Felipe, 07-11: *"¿ya trajiste las facturas
 * recibidas? ¿eso funcionará?"*). El Libro de Compras de facturacion.cl,
 * con la forma de su definición pública (`Compra?wsdl`, 08-11).
 */

const DTE = `<?xml version="1.0" encoding="ISO-8859-1"?>
<DTE version="1.0"><Documento ID="F1234T33"><Encabezado>
<IdDoc><TipoDTE>33</TipoDTE><Folio>1234</Folio><FchEmis>2026-11-03</FchEmis></IdDoc>
<Emisor><RUTEmisor>76.543.210-K</RUTEmisor><RznSoc>Distribuidora Ñuble SpA</RznSoc><GiroEmis>Venta de abarrotes</GiroEmis></Emisor>
<Receptor><RUTRecep>77701305-K</RUTRecep><RznSocRecep>VALLE DEL SOL QUILLON SPA</RznSocRecep></Receptor>
<Totales><MntNeto>100000</MntNeto><TasaIVA>19</TasaIVA><IVA>19000</IVA><MntTotal>119000</MntTotal></Totales>
</Encabezado></Documento></DTE>`;

const enBase64Latin = (xml: string) =>
  Buffer.from(xml, 'latin1').toString('base64');

const respuesta = (
  documentos: string,
  resultado = 'true',
  mensaje = 'Proceso exitoso.',
) =>
  `<?xml version="1.0" ?><S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/"><S:Body>` +
  `<ns2:obtenerCompraResponse xmlns:ns2="http://api.facturacion.com/"><return><WSPLANO>` +
  `<Resultado>${resultado}</Resultado><Mensaje>${mensaje}</Mensaje><Detalle>${documentos}</Detalle>` +
  `</WSPLANO></return></ns2:obtenerCompraResponse></S:Body></S:Envelope>`;

const documento = (xml: string) =>
  `<Documento><XML>${xml}</XML><RCV><recepcionSII>2026-11-03 10:15:00</recepcionSII>` +
  `<acuseSII></acuseSII><tipoCompra>1</tipoCompra></RCV>` +
  `<LinkPDF>https://www.facturacion.cl/pdf?x=1</LinkPDF></Documento>`;

const CREDENCIALES = { usuario: 'U', rut: '77.701.305-K', clave: 'secreta' };

describe('El Libro de Compras de facturacion.cl', () => {
  it('el sobre: RUT y clave en Base64, el mes y el enlace del PDF', () => {
    const sobre = sobreDelLibro(CREDENCIALES, '2026-11', true);
    expect(sobre).toContain('<api:obtenerCompra>');
    expect(sobre).toContain(
      `<Rut>${Buffer.from('77701305-K').toString('base64')}</Rut>`,
    );
    expect(sobre).toContain(
      `<Clave>${Buffer.from('secreta').toString('base64')}</Clave>`,
    );
    expect(sobre).not.toContain('secreta');
    expect(sobre).toContain('<periodo>2026-11</periodo>');
    expect(sobre).toContain('<IncluyeLink>1</IncluyeLink>');
  });

  it('lee cada documento: el XML en Base64 e ISO-8859-1, la recepción en el SII y el PDF', () => {
    const r = leerRespuestaDelLibro(respuesta(documento(enBase64Latin(DTE))));
    expect(r.ok).toBe(true);
    expect(r.documentos).toHaveLength(1);
    expect(r.documentos[0]).toMatchObject({
      recepcionSii: '2026-11-03 10:15:00',
      acuseSii: null,
      tipoCompra: 1,
      linkPdf: 'https://www.facturacion.cl/pdf?x=1',
    });
    expect(datosDelRecibido(r.documentos[0].xml as string)).toEqual({
      tipo: 33,
      folio: 1234,
      fecha_emision: '2026-11-03',
      rut_emisor: '76543210-K',
      razon_social_emisor: 'Distribuidora Ñuble SpA',
      neto: 100000,
      exento: null,
      iva: 19000,
      total: 119000,
    });
  });

  it('también el XML escapado o en CDATA, sin confundir sus etiquetas con las del sobre', () => {
    const escapado = DTE.replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const cdata = `<![CDATA[${DTE}]]>`;
    const r = leerRespuestaDelLibro(
      respuesta(documento(escapado) + documento(cdata)),
    );
    expect(r.documentos).toHaveLength(2);
    expect(
      r.documentos.map((d) => datosDelRecibido(d.xml as string)?.folio),
    ).toEqual([1234, 1234]);
  });

  it('un libro vacío o una negativa se leen tal cual', () => {
    const vacio = leerRespuestaDelLibro(
      respuesta('', 'false', 'Sin documentos'),
    );
    expect(vacio).toEqual({
      ok: false,
      mensaje: 'Sin documentos',
      documentos: [],
    });
  });

  it('una falla del servidor se dice sin mostrar las credenciales', async () => {
    const libro = new FacturacionClCompras({
      credenciales: CREDENCIALES,
      fetch: jest
        .fn()
        .mockResolvedValue(
          new Response(
            '<S:Envelope><S:Body><S:Fault><faultstring>Usuario no autorizado</faultstring></S:Fault></S:Body></S:Envelope>',
            { status: 500 },
          ),
        ) as never,
    });
    const error = await libro.obtenerCompra('2026-11').catch((e: Error) => e);
    expect((error as Error).message).toBe(
      'facturacion.cl respondió 500 al pedir el libro de compras: Usuario no autorizado',
    );
    expect((error as Error).message).not.toContain('secreta');
  });
});

describe('«Recibidos» (§9.28)', () => {
  const armar = ({
    libro = {
      obtenerCompra: jest
        .fn()
        .mockResolvedValue(
          leerRespuestaDelLibro(
            respuesta(
              documento(enBase64Latin(DTE)) +
                '<Documento><XML></XML></Documento>',
            ),
          ),
        ),
    } as { obtenerCompra: jest.Mock } | null,
  } = {}) => {
    const repo = {
      delPeriodo: jest.fn().mockResolvedValue([]),
      guardar: jest.fn().mockResolvedValue(undefined),
    };
    const conexion = {
      compras: () =>
        libro
          ? { ambiente: 'produccion', libro, motivo: null }
          : {
              ambiente: 'produccion',
              libro: null,
              motivo: 'facturacion.cl todavía no está conectado',
            },
    };
    const servicio = new RecibidosService(
      repo as never,
      conexion as never,
      mockPinoLogger() as never,
    );
    return { servicio, repo, libro };
  };

  it('trae el mes y guarda lo que se puede leer; lo que vino sin XML se cuenta', async () => {
    const { servicio, repo, libro } = armar();
    const r = await servicio.traer(1, '2026-11');
    expect(libro?.obtenerCompra).toHaveBeenCalledWith('2026-11');
    expect(repo.guardar).toHaveBeenCalledWith(1, '2026-11', [
      expect.objectContaining({
        rut_emisor: '76543210-K',
        tipo: 33,
        folio: 1234,
        total: 119000,
        link_pdf: 'https://www.facturacion.cl/pdf?x=1',
        recepcion_sii: '2026-11-03 10:15:00',
      }),
    ]);
    expect(r).toMatchObject({ traidos: 1, sin_datos: 1, se_puede_traer: true });
  });

  it('sin conexión no se puede traer, y lo dice', async () => {
    const { servicio } = armar({ libro: null });
    await expect(servicio.traer(1, '2026-11')).rejects.toThrow(
      'facturacion.cl todavía no está conectado',
    );
    expect(await servicio.delMes(1, '2026-11')).toMatchObject({
      se_puede_traer: false,
      sin_conexion: 'facturacion.cl todavía no está conectado',
    });
  });

  it('si facturacion.cl dice que no, se muestra lo que dice', async () => {
    const { servicio, repo } = armar({
      libro: {
        obtenerCompra: jest.fn().mockResolvedValue({
          ok: false,
          mensaje: 'Servicio no contratado',
          documentos: [],
        }),
      },
    });
    await expect(servicio.traer(1, '2026-11')).rejects.toThrow(
      new BadRequestException('facturacion.cl dice: «Servicio no contratado»'),
    );
    expect(repo.guardar).not.toHaveBeenCalled();
  });

  it('el mes va como AAAA-MM', async () => {
    const { servicio } = armar();
    await expect(servicio.delMes(1, '2026-13')).rejects.toThrow(
      'El mes va como AAAA-MM',
    );
  });
});
