// La base falsa imita a Supabase: sus métodos son promesas aunque no esperen nada.
/* eslint-disable @typescript-eslint/require-await */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { User } from 'src/users/entities/user.entity';
import {
  cuerpoHtml,
  EN_BLANCO,
  fechaCorta,
  fechaLarga,
  hojaDelConvenio,
  llenarPlantilla,
  sha256,
  textoParaLeer,
  vencimiento,
} from '../convenios/convenio-plantilla';
import { AceptarConvenioDto } from '../convenios/convenio.dto';
import type {
  Convenio,
  DocumentoDelCliente,
  PlantillaDeConvenio,
} from '../convenios/convenios.repository';
import { ConveniosService } from '../convenios/convenios.service';

/**
 * EL CONVENIO DEL CLIENTE (doc 24, 19-11-2026).
 *
 * Felipe: «tengo muchos convenios con clientes dando vuelta»; el contrato se
 * manda por internet y el cliente lo acepta en línea, o se sube el firmado
 * en papel. Lo que estas pruebas cuidan: el enlace no se adivina ni se usa
 * dos veces, el RUT se revisa, una empresa no ve ni firma lo de otra, y el
 * PDF queda en los documentos del cliente.
 */

// ---------------------------------------------------------------------
// Una base en memoria con las mismas reglas que la migración 211.
// ---------------------------------------------------------------------
class BaseFalsa {
  plantillas: PlantillaDeConvenio[] = [];
  clientes: { id: string; company_id: number; name: string }[] = [];
  contactos: {
    id: number;
    company_id: number;
    client_id: string;
    name: string;
    email: string | null;
  }[] = [];
  convenios: Convenio[] = [];
  documentosGuardados: DocumentoDelCliente[] = [];
  razones: { company_id: number; client_id: string; razon_social: string }[] =
    [];
  private sec = 0;

  plantillaDe = jest.fn(
    async (c: number) =>
      this.plantillas.find((p) => p.company_id === c) ?? null,
  );
  plantillaPorId = jest.fn(
    async (c: number, id: number | null) =>
      this.plantillas.find(
        (p) => p.company_id === c && (id == null || p.id === id),
      ) ?? null,
  );
  clienteDe = jest.fn(async (c: number, id: string) => {
    const x = this.clientes.find((k) => k.id === id && k.company_id === c);
    return x ? { ...x, client_type: 'Empresas' } : null;
  });
  razonSocialDe = jest.fn(
    async (c: number, id: string) =>
      this.razones.find((r) => r.company_id === c && r.client_id === id)
        ?.razon_social ?? null,
  );
  contactoDe = jest.fn(
    async (c: number, cl: string, id: number) =>
      this.contactos.find(
        (k) => k.id === id && k.client_id === cl && k.company_id === c,
      ) ?? null,
  );
  vigente = jest.fn(
    async (c: number, cl: string) =>
      this.convenios.find(
        (k) =>
          k.company_id === c &&
          k.client_id === cl &&
          (k.estado === 'enviado' || k.estado === 'firmado'),
      ) ?? null,
  );
  porHuella = jest.fn(
    async (h: string) => this.convenios.find((k) => k.token_hash === h) ?? null,
  );
  porId = jest.fn(
    async (c: number, id: string) =>
      this.convenios.find((k) => k.id === id && k.company_id === c) ?? null,
  );
  crear = jest.fn(async (fila: Partial<Convenio>) => {
    // El índice único parcial de la 211.
    if (
      this.convenios.some(
        (k) =>
          k.client_id === fila.client_id &&
          (k.estado === 'enviado' || k.estado === 'firmado'),
      )
    ) {
      throw new Error('duplicate key convenios_uno_vigente_por_cliente');
    }
    const c = {
      id: `cv-${++this.sec}`,
      documento_id: null,
      ...fila,
    } as Convenio;
    this.convenios.push(c);
    return c;
  });
  actualizar = jest.fn(
    async (
      companyId: number,
      id: string,
      cambios: Partial<Convenio>,
      soloSiEstado?: Convenio['estado'],
    ) => {
      const c = this.convenios.find(
        (k) => k.id === id && k.company_id === companyId,
      );
      if (!c || (soloSiEstado && c.estado !== soloSiEstado)) return null;
      Object.assign(c, cambios);
      return { ...c };
    },
  );
  documentos = jest.fn(async (c: number, cl: string) =>
    this.documentosGuardados.filter(
      (d) => d.company_id === c && d.client_id === cl,
    ),
  );
  documento = jest.fn(
    async (c: number, id: number) =>
      this.documentosGuardados.find((d) => d.id === id && d.company_id === c) ??
      null,
  );
  agregarDocumento = jest.fn(
    async (fila: Omit<DocumentoDelCliente, 'id' | 'uploaded_at'>) => {
      const d = {
        ...fila,
        id: ++this.sec,
        uploaded_at: new Date().toISOString(),
      } as DocumentoDelCliente;
      this.documentosGuardados.push(d);
      return d;
    },
  );
  borrarDocumento = jest.fn(async (c: number, id: number) => {
    this.documentosGuardados = this.documentosGuardados.filter(
      (d) => !(d.id === id && d.company_id === c),
    );
  });
}

const PLANTILLA_TEXTO = `# CONVENIO ENTRE LA CASA Y {{razon_social}}

En Santiago, a {{fecha_firma}}, {{razon_social}}, RUT Nº {{rut_empresa}}, representada por su {{representante_cargo}}, don(a) {{representante_nombre}}, cédula N° {{representante_rut}}, domiciliados en {{domicilio}}, comuna de {{comuna}} Región de {{region}}.

Correo de la casa: {{correo_de_contacto}}. Correo de la empresa: {{correo_empresa}}.

La personería consta en {{personeria_documento}} de fecha {{personeria_fecha}}, ante el Notario {{personeria_notario}}`;

const preparar = () => {
  const base = new BaseFalsa();
  base.plantillas.push({
    id: 10,
    company_id: 1,
    nombre: 'Convenio simple',
    titulo: 'Convenio de beneficios',
    texto: PLANTILLA_TEXTO,
    beneficios: [{ titulo: '20% en cabañas', detalle: 'marzo a noviembre' }],
    vigencia_anios: 3,
    correo_de_contacto: 'contacto@casa.cl',
  });
  base.clientes.push(
    { id: 'cli-1', company_id: 1, name: 'Forestal Arauco' },
    { id: 'cli-2', company_id: 2, name: 'Cliente de otra empresa' },
  );
  base.contactos.push(
    {
      id: 7,
      company_id: 1,
      client_id: 'cli-1',
      name: 'Ana Pérez',
      email: 'ana@prueba.cl',
    },
    {
      id: 8,
      company_id: 1,
      client_id: 'cli-1',
      name: 'Sin Correo',
      email: null,
    },
  );
  const companies = {
    findOne: jest.fn(async (id: number) => ({
      data: {
        name: id === 1 ? 'La Casa' : 'Otra',
        colors: { primary: '#0f766e' },
        notifications: { replyTo: 'contacto@casa.cl' },
      },
      error: null,
    })),
  };
  const storage = {
    guardarDelMotor: jest.fn(
      async (c: number, carpeta: string, sub: string, nombre: string) => ({
        url: `c${c}/${carpeta}/${sub}/x_${nombre}`,
      }),
    ),
    remove: jest.fn(async () => ({ deleted: true })),
  };
  const impresora = {
    imprimir: jest.fn(async (html: string) =>
      Buffer.from(`PDF:${html.length}`),
    ),
  };
  const correos = { enviar: jest.fn(async () => undefined) };
  const config = {
    get: jest.fn((k: string) =>
      k === 'FRONTEND_URL' ? 'https://lab.ejemplo.cl' : undefined,
    ),
  };
  const logger = {
    setContext: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  const service = new ConveniosService(
    base as never,
    companies as never,
    storage as never,
    impresora as never,
    correos as never,
    config as never,
    logger as never,
  );
  return { base, service, storage, impresora, correos };
};

const VENDEDOR = {
  id: 'u-1',
  company_id: 1,
  role: 'vendedor',
  name: 'Vendedora',
  email: 'vende@casa.cl',
} as unknown as User;
const DE_OTRA = { ...VENDEDOR, id: 'u-9', company_id: 2 } as unknown as User;

const FORMULARIO = {
  razon_social: 'Forestal Arauco S.A.',
  rut_empresa: '93.458.000-1',
  representante_nombre: 'Juan Soto',
  representante_rut: '12.345.678-5',
  representante_cargo: 'Gerente de Personas',
  correo: 'juan@arauco.cl',
  domicilio: 'Av. El Golf 150',
  comuna: 'Las Condes',
  region: 'Metropolitana',
  acepto: true,
  declaro_representacion: true,
};

/** Envía el convenio y devuelve el enlace en claro que salió en el correo. */
const enviarYTomarEnlace = async (
  service: ConveniosService,
  correos: { enviar: jest.Mock },
) => {
  await service.enviar('cli-1', 7, VENDEDOR);
  const llamada = correos.enviar.mock.calls.at(-1) as unknown[];
  const html = (llamada[0] as { html: string }).html;
  const m = html.match(/\/convenio\/([A-Za-z0-9_-]{43})/);
  if (!m) throw new Error('el correo no trae el enlace');
  return m[1];
};

// ---------------------------------------------------------------------
describe('La plantilla del convenio (pura)', () => {
  it('llena cada hueco; lo que falta queda como línea en blanco', () => {
    const t = llenarPlantilla(PLANTILLA_TEXTO, {
      razon_social: 'ACME',
      rut_empresa: '76.000.000-0',
      fecha_firma: '19 de noviembre del 2026',
    });
    expect(t).toContain('CONVENIO ENTRE LA CASA Y ACME');
    expect(t).toContain('a 19 de noviembre del 2026');
    expect(t).toContain(`consta en ${EN_BLANCO} de fecha ${EN_BLANCO}`);
    expect(t).not.toMatch(/\{\{/);
  });

  it('no inventa variables: una desconocida queda a la vista', () => {
    expect(llenarPlantilla('hola {{otra_cosa}}', {})).toBe(
      'hola {{otra_cosa}}',
    );
  });

  it('para leer antes de firmar, los huecos se ven con su nombre', () => {
    expect(textoParaLeer('RUT {{rut_empresa}}', {})).toBe('RUT [rut empresa]');
  });

  it('fechas en hora de Chile y dd-mm-aaaa', () => {
    // 20-11 a las 01:30 UTC es todavía 19-11 en Chile (verano, UTC-3).
    const instante = new Date('2026-11-20T01:30:00Z');
    expect(fechaCorta(instante)).toBe('19-11-2026');
    expect(fechaLarga(instante)).toBe('19 de noviembre del 2026');
    expect(fechaCorta('2029-11-19')).toBe('19-11-2029');
  });

  it('vence a los años de la vigencia; un 29 de febrero cae el 28', () => {
    expect(vencimiento('2026-11-19', 3)).toBe('2029-11-19');
    expect(vencimiento('2028-02-29', 3)).toBe('2031-02-28');
  });

  it('el HTML escapa lo que escribe el cliente y arma las firmas lado a lado', () => {
    const h = cuerpoHtml(
      '# Título\n\nUn <b>texto</b>\n\n___\nJuan\nGerente\n\n___\nAna\nAdministradora',
    );
    expect(h).toContain('&lt;b&gt;texto&lt;/b&gt;');
    expect(h).toContain('<h1>Título</h1>');
    expect(h.match(/class="firma"/g)).toHaveLength(2);
    expect(h.match(/class="firmas"/g)).toHaveLength(1);
  });
});

describe('El formulario público: lo que acepta el motor', () => {
  const errores = async (body: Record<string, unknown>) =>
    (await validate(plainToInstance(AceptarConvenioDto, body))).map(
      (e) => e.property,
    );

  it('completo pasa (la personería es opcional)', async () => {
    expect(await errores(FORMULARIO)).toEqual([]);
  });

  it('un RUT malo no pasa: ni el de la empresa ni el del representante', async () => {
    expect(
      await errores({
        ...FORMULARIO,
        rut_empresa: '93.458.000-2',
        representante_rut: '11.111.111-1',
      }),
    ).toEqual(['rut_empresa', 'representante_rut']);
  });

  it('sin marcar «Leí el convenio y lo acepto» no se acepta', async () => {
    expect(await errores({ ...FORMULARIO, acepto: false })).toEqual(['acepto']);
  });

  it('sin la declaración de representación no se acepta (doc 24 §8)', async () => {
    const sin: Record<string, unknown> = { ...FORMULARIO };
    delete sin.declaro_representacion;
    expect(await errores(sin)).toEqual(['declaro_representacion']);
    expect(
      await errores({ ...FORMULARIO, declaro_representacion: false }),
    ).toEqual(['declaro_representacion']);
  });
});

describe('Enviar el convenio', () => {
  it('manda el correo a la persona elegida y queda «enviado» con solo la huella del enlace', async () => {
    const { base, service, correos } = preparar();
    const enlace = await enviarYTomarEnlace(service, correos);
    const envio = (correos.enviar.mock.calls[0] as unknown[])[0] as {
      para: string[];
      copiaOculta: string[];
    };
    expect(envio.para).toEqual(['ana@prueba.cl']);
    expect(base.convenios).toHaveLength(1);
    const c = base.convenios[0];
    expect(c.estado).toBe('enviado');
    expect(c.token_hash).toBe(sha256(enlace));
    expect(JSON.stringify(c)).not.toContain(enlace);
  });

  it('reenviar pone un enlace nuevo y el anterior deja de servir', async () => {
    const { service, correos } = preparar();
    const viejo = await enviarYTomarEnlace(service, correos);
    const nuevo = await enviarYTomarEnlace(service, correos);
    expect(nuevo).not.toBe(viejo);
    await expect(service.verPublico(viejo)).rejects.toThrow(NotFoundException);
    await expect(service.verPublico(nuevo)).resolves.toMatchObject({
      estado: 'pendiente',
    });
  });

  it('una persona sin correo no se puede elegir', async () => {
    const { service } = preparar();
    await expect(service.enviar('cli-1', 8, VENDEDOR)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('si el correo no sale, la ficha no dice «Enviado»', async () => {
    const { base, service, correos } = preparar();
    correos.enviar.mockRejectedValueOnce(new Error('Resend caído'));
    await expect(service.enviar('cli-1', 7, VENDEDOR)).rejects.toThrow(
      BadRequestException,
    );
    expect(base.convenios).toHaveLength(0);
  });

  it('una empresa sin plantilla no ofrece convenio', async () => {
    const { base, service } = preparar();
    base.plantillas = [];
    await expect(service.estado('cli-1', VENDEDOR)).resolves.toMatchObject({
      ofrece: false,
    });
    await expect(service.enviar('cli-1', 7, VENDEDOR)).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('La página pública', () => {
  it('un enlace inválido o inventado: 404 sin pistas', async () => {
    const { service } = preparar();
    await expect(service.verPublico('corto')).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.verPublico('A'.repeat(43))).rejects.toThrow(
      NotFoundException,
    );
    await expect(
      service.aceptar('A'.repeat(43), FORMULARIO as never, null, null),
    ).rejects.toThrow(NotFoundException);
  });

  it('del cliente muestra solo la razón social; la empresa sale de su marca', async () => {
    const { base, service, correos } = preparar();
    base.razones.push({
      company_id: 1,
      client_id: 'cli-1',
      razon_social: 'Forestal Arauco S.A.',
    });
    const enlace = await enviarYTomarEnlace(service, correos);
    const vista = await service.verPublico(enlace);
    expect(vista).toMatchObject({
      estado: 'pendiente',
      empresa: { nombre: 'La Casa' },
      razon_social: 'Forestal Arauco S.A.',
    });
    const json = JSON.stringify(vista);
    expect(json).not.toContain('ana@prueba.cl');
    expect(json).not.toContain('Ana Pérez');
    expect(json).not.toContain('cli-1');
  });
});

describe('Aceptar el convenio en línea', () => {
  it('queda firmado con la constancia y el PDF en los documentos del cliente', async () => {
    const { base, service, correos, impresora } = preparar();
    const enlace = await enviarYTomarEnlace(service, correos);
    const r = await service.aceptar(
      enlace,
      FORMULARIO as never,
      '200.1.2.3',
      'Mozilla/5.0',
    );
    expect(r).toMatchObject({ firmado: true });
    const c = base.convenios[0];
    expect(c).toMatchObject({
      estado: 'firmado',
      origen: 'en_linea',
      firmante_nombre: 'Juan Soto',
      firmante_rut: '12345678-5',
      rut_empresa: '93458000-1',
      firmante_cargo: 'Gerente de Personas',
      firmante_correo: 'juan@arauco.cl',
      ip: '200.1.2.3',
      user_agent: 'Mozilla/5.0',
      declara_representacion: true,
    });
    expect(c.texto_firmado).toContain(
      'CONVENIO ENTRE LA CASA Y Forestal Arauco S.A.',
    );
    expect(c.texto_firmado).toContain('Correo de la casa: contacto@casa.cl');
    expect(c.texto_sha256).toBe(sha256(c.texto_firmado as string));
    // El PDF: impreso con la constancia y guardado en Documentos del cliente.
    const html = impresora.imprimir.mock.calls[0][0];
    expect(html).toContain('Constancia de aceptación en línea');
    expect(html).toContain('200.1.2.3');
    expect(html).toContain(
      'Juan Soto, RUT 12.345.678-5, Gerente de Personas, declaró tener facultades para representar a Forestal Arauco S.A. y aceptó el convenio en su nombre.',
    );
    expect(base.documentosGuardados).toHaveLength(1);
    expect(base.documentosGuardados[0]).toMatchObject({
      client_id: 'cli-1',
      categoria: 'convenio',
    });
    expect(base.documentosGuardados[0].file_url).toMatch(
      /^c1\/client-documents\/cli-1\//,
    );
    expect(c.documento_id).toBe(base.documentosGuardados[0].id);
    // Copia al firmante con el PDF, y aviso a la empresa.
    const despues = correos.enviar.mock.calls.slice(1).map(
      (x) =>
        (x as unknown[])[0] as {
          para: string[];
          adjuntos: unknown[];
        },
    );
    expect(despues.map((d) => d.para[0])).toEqual([
      'juan@arauco.cl',
      'contacto@casa.cl',
    ]);
    expect(despues[0].adjuntos).toHaveLength(1);
    const estado = await service.estado('cli-1', VENDEDOR);
    expect(estado.convenio).toMatchObject({
      estado: 'firmado',
      pdf_pendiente: false,
    });
  });

  it('un enlace ya usado dice «Este convenio ya fue firmado» con la fecha', async () => {
    const { service, correos } = preparar();
    const enlace = await enviarYTomarEnlace(service, correos);
    await service.aceptar(enlace, FORMULARIO as never, null, null);
    const vista = await service.verPublico(enlace);
    expect(vista).toMatchObject({ estado: 'firmado' });
    expect((vista as { firmado_el: string }).firmado_el).toMatch(
      /^\d{2}-\d{2}-\d{4}$/,
    );
    await expect(
      service.aceptar(enlace, FORMULARIO as never, null, null),
    ).rejects.toThrow(/ya fue firmado el \d{2}-\d{2}-\d{4}/);
  });

  it('dos aceptaciones a la vez (doble clic o dos pestañas): una sola firma y un solo PDF', async () => {
    const { base, service, correos, impresora } = preparar();
    const enlace = await enviarYTomarEnlace(service, correos);
    const resultados = await Promise.allSettled([
      service.aceptar(enlace, FORMULARIO as never, null, null),
      service.aceptar(enlace, FORMULARIO as never, null, null),
    ]);
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rechazo = resultados.find((r) => r.status === 'rejected');
    expect(rechazo?.reason).toBeInstanceOf(ConflictException);
    expect(impresora.imprimir).toHaveBeenCalledTimes(1);
    expect(base.documentosGuardados).toHaveLength(1);
  });

  it('dos procesos del motor a la vez: la base deja pasar solo una firma', async () => {
    const { base, service, correos } = preparar();
    const enlace = await enviarYTomarEnlace(service, correos);
    // Otro proceso ya firmó entre que este leyó y escribió.
    base.actualizar.mockImplementationOnce(async () => {
      base.convenios[0].estado = 'firmado';
      base.convenios[0].firmado_at = '2026-11-19T15:00:00Z';
      return null;
    });
    await expect(
      service.aceptar(enlace, FORMULARIO as never, null, null),
    ).rejects.toThrow(ConflictException);
  });

  it('sin la declaración de representación el motor no acepta y nada cambia (doc 24 §8)', async () => {
    const { base, service, correos } = preparar();
    const enlace = await enviarYTomarEnlace(service, correos);
    await expect(
      service.aceptar(
        enlace,
        { ...FORMULARIO, declaro_representacion: false } as never,
        null,
        null,
      ),
    ).rejects.toThrow('facultades para representar');
    expect(base.convenios[0].estado).toBe('enviado');
    expect(base.documentosGuardados).toHaveLength(0);
  });

  it('un convenio firmado antes de la declaración no cambia: su PDF no la trae', () => {
    const constancia = {
      firmante_nombre: 'PRUEBA Representante',
      firmante_rut: '11.222.333-9',
      firmante_cargo: 'Gerente',
      firmante_correo: 'x@y.cl',
      razon_social: 'PRUEBA SpA',
      rut_empresa: '76.123.456-0',
      firmado_at: new Date('2026-11-19T18:00:00Z'),
      ip: null,
      user_agent: null,
      texto_sha256: 'a'.repeat(64),
      empresa: 'La Casa',
      vence: '2029-11-19',
    };
    const antes = hojaDelConvenio({
      textoLleno: 'texto',
      colorPrimario: '#059669',
      constancia: { ...constancia, declara_representacion: false },
    });
    expect(antes).not.toContain('declaró tener facultades');
    expect(antes).toContain(
      'Leí el convenio y lo acepto en nombre de la empresa',
    );
    const ahora = hojaDelConvenio({
      textoLleno: 'texto',
      colorPrimario: '#059669',
      constancia: { ...constancia, declara_representacion: true },
    });
    expect(ahora).toContain(
      'PRUEBA Representante, RUT 11.222.333-9, Gerente, declaró tener facultades para representar a PRUEBA SpA',
    );
  });

  it('si el PDF falla, la firma queda y la ficha dice «PDF pendiente»; se puede generar después', async () => {
    const { base, service, correos, impresora } = preparar();
    const enlace = await enviarYTomarEnlace(service, correos);
    impresora.imprimir.mockRejectedValueOnce(new Error('Chromium no arrancó'));
    await service.aceptar(enlace, FORMULARIO as never, null, null);
    expect(base.convenios[0].estado).toBe('firmado');
    let estado = await service.estado('cli-1', VENDEDOR);
    expect(estado.convenio).toMatchObject({ pdf_pendiente: true });
    await service.regenerarPdf('cli-1', VENDEDOR);
    estado = await service.estado('cli-1', VENDEDOR);
    expect(estado.convenio).toMatchObject({ pdf_pendiente: false });
    expect(base.documentosGuardados).toHaveLength(1);
  });
});

describe('Firmado en papel', () => {
  it('sube el PDF, queda firmado con la fecha y vence a los 3 años', async () => {
    const { base, service } = preparar();
    await service.firmadoEnPapel(
      'cli-1',
      {
        file_url: 'c1/client-documents/cli-1/x_convenio.pdf',
        file_name: 'convenio.pdf',
        fecha_firma: '2025-03-10',
        firmante: 'María Rojas',
      },
      VENDEDOR,
    );
    expect(base.convenios[0]).toMatchObject({
      estado: 'firmado',
      origen: 'papel',
      vence_at: '2028-03-10',
      firmante_nombre: 'María Rojas',
    });
    expect(base.documentosGuardados[0].categoria).toBe('convenio');
  });

  it('un archivo de otro cliente o de otra empresa no se acepta', async () => {
    const { service } = preparar();
    await expect(
      service.firmadoEnPapel(
        'cli-1',
        {
          file_url: 'c2/client-documents/cli-1/x.pdf',
          file_name: 'x.pdf',
          fecha_firma: '2025-03-10',
        },
        VENDEDOR,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('una fecha futura no se acepta', async () => {
    const { service } = preparar();
    await expect(
      service.firmadoEnPapel(
        'cli-1',
        {
          file_url: 'c1/client-documents/cli-1/x.pdf',
          file_name: 'x.pdf',
          fecha_firma: '2999-01-01',
        },
        VENDEDOR,
      ),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('Otra empresa no ve ni toca lo ajeno', () => {
  it('no ve el convenio ni los documentos, no envía ni sube ni borra', async () => {
    const { base, service, correos } = preparar();
    await enviarYTomarEnlace(service, correos);
    await service.agregarDocumento(
      'cli-1',
      { file_url: 'c1/client-documents/cli-1/x_a.pdf', file_name: 'a.pdf' },
      VENDEDOR,
    );
    const doc = base.documentosGuardados[0];
    await expect(service.estado('cli-1', DE_OTRA)).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.documentos('cli-1', DE_OTRA)).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.enviar('cli-1', 7, DE_OTRA)).rejects.toThrow(
      NotFoundException,
    );
    await expect(
      service.agregarDocumento(
        'cli-1',
        { file_url: 'c2/client-documents/cli-1/x.pdf', file_name: 'x.pdf' },
        DE_OTRA,
      ),
    ).rejects.toThrow(NotFoundException);
    await expect(
      service.borrarDocumento('cli-1', doc.id, DE_OTRA),
    ).rejects.toThrow(NotFoundException);
    await expect(service.regenerarPdf('cli-1', DE_OTRA)).rejects.toThrow(
      BadRequestException,
    );
    expect(base.documentosGuardados).toHaveLength(1);
  });

  it('no puede colgar de su cliente un archivo de la carpeta de otra empresa', async () => {
    const { service } = preparar();
    await expect(
      service.agregarDocumento(
        'cli-2',
        { file_url: 'c1/client-documents/cli-1/x_a.pdf', file_name: 'a.pdf' },
        DE_OTRA,
      ),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('Documentos del cliente', () => {
  it('se agregan y se borran (también el archivo del balde)', async () => {
    const { base, service, storage } = preparar();
    const d = await service.agregarDocumento(
      'cli-1',
      { file_url: 'c1/client-documents/cli-1/x_a.pdf', file_name: 'a.pdf' },
      VENDEDOR,
    );
    expect(await service.documentos('cli-1', VENDEDOR)).toHaveLength(1);
    await service.borrarDocumento('cli-1', d.id, VENDEDOR);
    expect(base.documentosGuardados).toHaveLength(0);
    expect(storage.remove).toHaveBeenCalledWith(
      'c1/client-documents/cli-1/x_a.pdf',
      1,
    );
  });

  it('el convenio firmado no se borra desde la lista', async () => {
    const { base, service, correos } = preparar();
    const enlace = await enviarYTomarEnlace(service, correos);
    await service.aceptar(enlace, FORMULARIO as never, null, null);
    const id = base.documentosGuardados[0].id;
    await expect(
      service.borrarDocumento('cli-1', id, VENDEDOR),
    ).rejects.toThrow(BadRequestException);
  });
});
