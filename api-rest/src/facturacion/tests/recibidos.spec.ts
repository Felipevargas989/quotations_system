import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { mockPinoLogger } from '../../testing/mocks';
import {
  FacturacionClCompras,
  datosDelRecibido,
  leerRespuestaDelLibro,
  sobreDelLibro,
} from '../facturacion-cl/compras';
import { FacturacionClPanel, leerPanel } from '../facturacion-cl/panel';
import {
  RecibidosService,
  plazoParaReclamar,
} from '../recibidos/recibidos.service';

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
      acusesDe: jest.fn().mockResolvedValue([]),
      documento: jest.fn().mockResolvedValue(null),
      anotarAcuse: jest.fn().mockResolvedValue(undefined),
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
      panel: () => ({
        ambiente: 'produccion',
        panel: null,
        motivo: 'sin panel',
      }),
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

describe('El Panel DTE Recibidos de facturacion.cl (§9.30)', () => {
  // El ejemplo del manual (`archivomanualwscompras.php`), escapado dentro
  // de `ConsultaPanelDteResult` como lo manda un servicio ASMX.
  const PANEL = (documentos: string, resultado = 'True') =>
    '<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>' +
    '<ConsultaPanelDteResponse xmlns="http://tempuri.org"><ConsultaPanelDteResult>' +
    `&lt;WSPLANO&gt;&lt;Resultado&gt;${resultado}&lt;/Resultado&gt;&lt;Mensaje&gt;Proceso exitoso.&lt;/Mensaje&gt;&lt;Detalle&gt;${documentos}&lt;/Detalle&gt;&lt;/WSPLANO&gt;` +
    '</ConsultaPanelDteResult></ConsultaPanelDteResponse></soap:Body></soap:Envelope>';
  const DOC =
    '&lt;Documento&gt;"folio":"10052","tipodte":"33","rutproveedor":"90635000-9","recepcionsii":"2019-08-07T17:15:19Z","montototal":"119000"&lt;/Documento&gt;';
  const CRED = { usuario: 'U', rut: '77.701.305-K', clave: 'secreta' };

  it('lee lo pendiente: folio, tipo, el RUT del proveedor, la recepción y el monto', () => {
    expect(
      leerPanel(
        '<WSPLANO><Resultado>True</Resultado><Mensaje>ok</Mensaje><Detalle><Documento>"folio":"10052","tipodte":"33","rutproveedor":"90.635.000-9","recepcionsii":"2019-08-07T17:15:19Z"</Documento></Detalle></WSPLANO>',
      ),
    ).toEqual({
      ok: true,
      mensaje: 'ok',
      pendientes: [
        {
          folio: 10052,
          tipo: 33,
          rut_emisor: '90635000-9',
          recepcion_sii: '2019-08-07T17:15:19Z',
          total: null,
        },
      ],
    });
  });

  it('pide lo pendiente con la entrada en Base64 y sin filtros, y lee la respuesta escapada', async () => {
    const llamar = jest
      .fn()
      .mockResolvedValue(new Response(PANEL(DOC), { status: 200 }));
    const panel = new FacturacionClPanel({
      credenciales: CRED,
      fetch: llamar as never,
    });
    const r = await panel.pendientes();
    expect(r.ok).toBe(true);
    expect(r.pendientes).toEqual([
      {
        folio: 10052,
        tipo: 33,
        rut_emisor: '90635000-9',
        recepcion_sii: '2019-08-07T17:15:19Z',
        total: 119000,
      },
    ]);
    const [url, init] = llamar.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://wss.facturacion.cl/WSDS/wspaneldte.asmx');
    expect(init.headers).toMatchObject({
      SOAPAction: '"http://tempuri.org/ConsultaPanelDte"',
    });
    const cuerpo = init.body as string;
    expect(cuerpo).toContain(
      `<Rut>${Buffer.from('77701305-K').toString('base64')}</Rut>`,
    );
    expect(cuerpo).not.toContain('secreta');
    expect(cuerpo).toContain(
      '<folio></folio><tipo></tipo><rutproveedor></rutproveedor>',
    );
  });

  it('el acuse va con el folio, el tipo, el RUT sin puntos y «a» o «r», y dice si salió', async () => {
    const llamar = jest
      .fn()
      .mockResolvedValue(
        new Response(
          '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><AcuseResponse xmlns="http://tempuri.org"><AcuseResult>true</AcuseResult></AcuseResponse></soap:Body></soap:Envelope>',
          { status: 200 },
        ),
      );
    const panel = new FacturacionClPanel({
      credenciales: CRED,
      fetch: llamar as never,
    });
    expect(
      await panel.acuse(
        { folio: 10052, tipo: 33, rut_emisor: '90.635.000-9' },
        'reclamar',
      ),
    ).toBe(true);
    const cuerpo = (llamar.mock.calls[0] as [string, RequestInit])[1]
      .body as string;
    expect(cuerpo).toContain(
      '<folio>10052</folio><tipo>33</tipo><rutproveedor>90635000-9</rutproveedor><accion>r</accion>',
    );
  });

  it('también la lista en JSON que responde de verdad (medido el 08-11 en el ambiente de prueba)', async () => {
    const lista = JSON.stringify([
      {
        folio: '93001',
        tipodte: '33',
        rutproveedor: '76543210-K',
        recepcionsii: '2026-03-10T00:00:00Z',
        montototal: '108038',
        xml: 'True',
      },
      { folio: '', tipodte: '33', rutproveedor: '' },
    ]);
    const panel = new FacturacionClPanel({
      credenciales: CRED,
      fetch: jest
        .fn()
        .mockResolvedValue(
          new Response(
            '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ConsultaPanelDteResponse xmlns="http://tempuri.org"><ConsultaPanelDteResult>' +
              lista
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/"/g, '&quot;') +
              '</ConsultaPanelDteResult></ConsultaPanelDteResponse></soap:Body></soap:Envelope>',
            { status: 200 },
          ),
        ) as never,
    });
    expect(await panel.pendientes()).toEqual({
      ok: true,
      mensaje: null,
      pendientes: [
        {
          folio: 93001,
          tipo: 33,
          rut_emisor: '76543210-K',
          recepcion_sii: '2026-03-10T00:00:00Z',
          total: 108038,
        },
      ],
    });
  });

  it('si la respuesta no trae «Resultado» ni «Mensaje», dice cómo empieza lo que respondió', async () => {
    const panel = new FacturacionClPanel({
      credenciales: CRED,
      fetch: jest
        .fn()
        .mockResolvedValue(
          new Response(
            '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ConsultaPanelDteResponse xmlns="http://tempuri.org"><ConsultaPanelDteResult>Usuario sin acceso al panel</ConsultaPanelDteResult></ConsultaPanelDteResponse></soap:Body></soap:Envelope>',
            { status: 200 },
          ),
        ) as never,
    });
    expect(await panel.pendientes()).toEqual({
      ok: false,
      mensaje: 'Usuario sin acceso al panel',
      pendientes: [],
    });
  });

  it('una falla del panel se dice sin mostrar las credenciales', async () => {
    const panel = new FacturacionClPanel({
      credenciales: CRED,
      fetch: jest.fn().mockRejectedValue(new Error('ECONNRESET')) as never,
    });
    const error = await panel.pendientes().catch((e: Error) => e);
    expect((error as Error).message).toMatch(
      /^facturacion.cl no respondió en el panel de recibidos/,
    );
    expect((error as Error).message).not.toContain('secreta');
  });

  it('el plazo para reclamar: 8 días corridos desde la recepción en el SII', () => {
    expect(plazoParaReclamar('2026-11-03 10:15:00', '2026-11-08')).toEqual({
      vence: '2026-11-11',
      quedan: 3,
    });
    expect(plazoParaReclamar('2026-10-20T13:00:00Z', '2026-11-08')).toEqual({
      vence: '2026-10-28',
      quedan: -11,
    });
    expect(plazoParaReclamar(null, '2026-11-08')).toBeNull();
  });
});

describe('«Aceptar» o «Reclamar» (§9.30)', () => {
  const DOCUMENTO = {
    id: 1,
    periodo: '2026-11',
    rut_emisor: '76543210-K',
    tipo: 33,
    folio: 1234,
    recepcion_sii: '2026-11-03 10:15:00',
  };
  const POR = { id: 'u-felipe', nombre: 'Felipe' };
  const armar = ({
    respuesta = Promise.resolve(true),
    documento = DOCUMENTO as Record<string, unknown> | null,
    acuses = [] as Record<string, unknown>[],
    conPanel = true,
  } = {}) => {
    const repo = {
      documento: jest.fn().mockResolvedValue(documento),
      acusesDe: jest.fn().mockResolvedValue(acuses),
      anotarAcuse: jest.fn().mockResolvedValue(undefined),
      delPeriodo: jest.fn().mockResolvedValue([]),
    };
    const panel = {
      acuse: jest.fn().mockReturnValue(respuesta),
      pendientes: jest.fn(),
    };
    const conexion = {
      compras: () => ({ ambiente: 'produccion', libro: null, motivo: 'x' }),
      panel: () =>
        conPanel
          ? { ambiente: 'produccion', panel, motivo: null }
          : {
              ambiente: 'produccion',
              panel: null,
              motivo: 'Sin las credenciales',
            },
    };
    const servicio = new RecibidosService(
      repo as never,
      conexion as never,
      mockPinoLogger() as never,
    );
    return { servicio, repo, panel };
  };
  const PEDIDO = {
    rut_emisor: '76543210-K',
    tipo: 33,
    folio: 1234,
    accion: 'aceptar' as const,
  };

  it('acepta, lo anota con quién y devuelve que salió', async () => {
    const { servicio, repo, panel } = armar();
    expect(await servicio.acuse(1, PEDIDO, POR)).toEqual({
      ok: true,
      accion: 'aceptar',
    });
    expect(panel.acuse).toHaveBeenCalledWith(
      { rut_emisor: '76543210-K', tipo: 33, folio: 1234 },
      'aceptar',
    );
    expect(repo.anotarAcuse).toHaveBeenCalledWith(
      1,
      {
        rut_emisor: '76543210-K',
        tipo: 33,
        folio: 1234,
        accion: 'aceptar',
        resultado: true,
        mensaje: null,
      },
      POR,
    );
  });

  it('si facturacion.cl dice que no, queda anotado y se dice', async () => {
    const { servicio, repo } = armar({ respuesta: Promise.resolve(false) });
    await expect(servicio.acuse(1, PEDIDO, POR)).rejects.toThrow(
      new BadRequestException(
        'No se pudo aceptar en facturacion.cl: facturacion.cl respondió que no',
      ),
    );
    expect(repo.anotarAcuse).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ resultado: false }),
      POR,
    );
  });

  it('no se acusa lo que no está en lo recibido de la empresa, ni dos veces, ni sin conexión', async () => {
    await expect(
      armar({ documento: null }).servicio.acuse(1, PEDIDO, POR),
    ).rejects.toThrow(NotFoundException);
    const ya = armar({
      acuses: [
        {
          rut_emisor: '76543210-K',
          tipo: 33,
          folio: 1234,
          accion: 'aceptar',
          resultado: true,
          pedido_por_nombre: 'Camila',
          pedido_en: '2026-11-08T10:00:00Z',
        },
      ],
    });
    await expect(ya.servicio.acuse(1, PEDIDO, POR)).rejects.toThrow(
      new ConflictException('Ya se aceptó desde Eventia (Camila)'),
    );
    expect(ya.panel.acuse).not.toHaveBeenCalled();
    await expect(
      armar({ conPanel: false }).servicio.acuse(1, PEDIDO, POR),
    ).rejects.toThrow('Sin las credenciales');
  });

  it('pasados los 8 días ya no se reclama: la ley la da por aceptada', async () => {
    const { servicio, panel } = armar({
      documento: { ...DOCUMENTO, recepcion_sii: '2026-01-02 10:00:00' },
    });
    await expect(
      servicio.acuse(1, { ...PEDIDO, accion: 'reclamar' }, POR),
    ).rejects.toThrow(
      /Ya pasaron los 8 días para reclamarla \(vencieron el 2026-01-10\)/,
    );
    expect(panel.acuse).not.toHaveBeenCalled();
  });

  it('lo pendiente: sin la conexión, el porqué; si el panel falla, lo que dice', async () => {
    expect(await armar({ conPanel: false }).servicio.pendientes(1)).toEqual({
      se_puede: false,
      sin_conexion: 'Sin las credenciales',
      ok: false,
      mensaje: null,
      pendientes: [],
    });
    const { servicio, panel } = armar();
    panel.pendientes.mockRejectedValue(new Error('Empresa no Autorizada'));
    expect(await servicio.pendientes(1)).toMatchObject({
      se_puede: true,
      ok: false,
      mensaje: 'Empresa no Autorizada',
    });
  });
});
