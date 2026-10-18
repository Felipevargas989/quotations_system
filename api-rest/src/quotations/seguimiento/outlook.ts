// OUTLOOK, SOLO PARA DEJAR BORRADORES (doc 18, sección 6).
//
// La llave de aplicación de Microsoft de la empresa: la misma que usa
// `graph_borrador.py` (Borradores de correo/herramientas). Esta pieza sigue
// a esa herramienta, que ya resolvió el hilo, las copias y el aviso ámbar.
//
// Lo que NO hace, a propósito: enviar, borrar o mover. No existe un método
// para eso. Y solo toca los buzones de su lista: un buzón que no está en
// ella se rechaza antes de llamar a Microsoft.
//
// Desde el 17-10 también MIRA si un borrador ya salió (doc 18 §9): con el
// identificador INMUTABLE del mensaje, que es el mismo en Borradores, en
// Enviados y en Elementos eliminados (medido ese día con la 536, la 559 y
// la 607). Solo lee.

const GRAPH = 'https://graph.microsoft.com/v1.0';

/** Identificadores públicos de la aplicación de Valle del Sol en Microsoft
 *  (los mismos de graph_borrador.py; no son secretos). El secreto llega por
 *  MS_CLIENT_SECRET y nunca se imprime. */
export const INQUILINO_POR_DEFECTO = '61968cff-7f44-4290-b310-026325e00424';
export const APLICACION_POR_DEFECTO = '4c6be481-b346-4949-9264-65ca71b63335';

/** La letra de la casa (Aptos 11), como la herramienta de borradores. */
const FUENTE =
  'font-family:Aptos,Calibri,sans-serif;font-size:11pt;color:#000000';

export type MensajeDelBuzon = {
  id: string;
  hilo: string;
  de: string;
  para: string[];
  cc: string[];
  asunto: string;
  /** ISO, en UTC. */
  fecha: string;
  borrador: boolean;
  adelanto: string;
  /** Trae archivos: el envío de una cotización trae el PDF. */
  adjuntos?: boolean;
};

export type BorradorCreado = {
  id: string;
  /** La conversación del borrador. */
  hilo: string | null;
  /** Para abrirlo en Outlook web. */
  enlace: string | null;
  para: string[];
  cc: string[];
  asunto: string;
};

/** En qué está un borrador que dejó el seguimiento con IA. */
export type EstadoDelBorrador =
  | { estado: 'borrador'; hilo: string | null }
  | { estado: 'enviado'; hilo: string | null; enviado: string | null }
  /** Movido a Elementos eliminados sin enviarse. */
  | { estado: 'eliminado'; hilo: string | null }
  /** Ya no existe en el buzón (eliminado del todo). */
  | { estado: 'no_esta' };

type Direccion = { emailAddress?: { address?: string } };

type MensajeDeGraph = {
  id: string;
  conversationId?: string;
  subject?: string;
  from?: Direccion;
  toRecipients?: Direccion[];
  ccRecipients?: Direccion[];
  receivedDateTime?: string;
  sentDateTime?: string;
  bodyPreview?: string;
  isDraft?: boolean;
  hasAttachments?: boolean;
  parentFolderId?: string;
  body?: { contentType?: string; content?: string };
  webLink?: string;
};

export type OpcionesDeOutlook = {
  secreto: string;
  inquilino: string;
  aplicacion: string;
  /** Los únicos buzones que se tocan, en el orden en que se buscan. */
  buzones: string[];
  /** El nombre que firma el aviso ámbar. */
  empresa: string;
  /** Para las pruebas. */
  fetch?: typeof fetch;
  ahora?: () => number;
};

export class ErrorDeOutlook extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const correoDe = (d?: Direccion): string =>
  (d?.emailAddress?.address ?? '').trim().toLowerCase();

const direccion = (correo: string) => ({
  emailAddress: { address: correo.trim() },
});

const escapar = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** El aviso ámbar de la casa (Felipe, 18-09-2026): quien abra el borrador
 *  sabe que es una propuesta del asistente. Se borra antes de enviar. */
export const avisoDelBorrador = (empresa: string): string =>
  '<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 14px 0">' +
  '<tr><td bgcolor="#FFF3CD" style="background-color:#FFF3CD;border:1px solid #F0C36D;' +
  'border-left:6px solid #E0A800;padding:8px 12px;color:#7A5300;' +
  'font-family:Aptos,Calibri,sans-serif;font-size:11pt">' +
  `<b>SEGUIMIENTO SUGERIDO</b> por el asistente de ${escapar(empresa)}. ` +
  'Rev&iacute;salo, ajusta lo que quieras y borra este aviso antes de enviar.' +
  '</td></tr></table>\n';

/** Lo que escribió la IA, sin nada que pueda ejecutarse al abrirlo. */
export const limpiarHtml = (html: string): string =>
  html
    .replace(/<(script|style|iframe|object|embed)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(script|style|iframe|object|embed)\b[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');

/** La letra de la casa y aire entre párrafos: Outlook mete en las
 *  respuestas una regla p{margin:0} que pega los párrafos; el estilo en
 *  línea le gana (como `formatear` de la herramienta). */
export const formatear = (html: string): string => {
  const conEstilo = html
    .replace(/<p>/g, `<p style="margin:0 0 12pt 0;${FUENTE}">`)
    .replace(/<(ul|ol)>/g, `<$1 style="margin:0 0 12pt 0;${FUENTE}">`);
  return `<div id="vds-sugerencia" style="${FUENTE}">${conEstilo}</div>`;
};

/** El cuerpo de un correo como texto, para que la IA lo lea. */
export const aTexto = (html: string): string =>
  html
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h\d)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const aMensaje = (m: MensajeDeGraph): MensajeDelBuzon => ({
  id: m.id,
  hilo: m.conversationId ?? m.id,
  de: correoDe(m.from),
  para: (m.toRecipients ?? []).map(correoDe).filter(Boolean),
  cc: (m.ccRecipients ?? []).map(correoDe).filter(Boolean),
  asunto: m.subject ?? '',
  fecha: m.receivedDateTime ?? '',
  borrador: Boolean(m.isDraft),
  adelanto: (m.bodyPreview ?? '').slice(0, 200),
  adjuntos: Boolean(m.hasAttachments),
});

const aBorrador = (m: MensajeDeGraph): BorradorCreado => ({
  id: m.id,
  hilo: m.conversationId ?? null,
  enlace: m.webLink ?? null,
  para: (m.toRecipients ?? []).map(correoDe).filter(Boolean),
  cc: (m.ccRecipients ?? []).map(correoDe).filter(Boolean),
  asunto: m.subject ?? '',
});

export class OutlookDeLaCasa {
  private permiso: { valor: string; vence: number } | null = null;
  /** Elementos eliminados de cada buzón (su identificador no cambia). */
  private readonly carpetasDeEliminados = new Map<string, string>();
  /** Los buzones permitidos, en el orden en que se buscan. */
  readonly buzones: string[];
  private readonly dominiosDeLaCasa: Set<string>;

  constructor(private readonly o: OpcionesDeOutlook) {
    this.buzones = o.buzones.map((b) => b.trim().toLowerCase());
    // La casa son los dominios de sus buzones y el de Eventia (de ahí sale
    // el envío de la cotización, con copia oculta a contacto@).
    this.dominiosDeLaCasa = new Set([
      ...this.buzones.map((b) => b.split('@')[1]),
      'eventi-app.com',
    ]);
  }

  esDeLaCasa(correo: string): boolean {
    const limpio = correo.trim().toLowerCase();
    // Lo que sale de un buzón de la casa a veces llega con la dirección
    // interna de Exchange (/o=exchangelabs/…), sin @: es de la casa. Un
    // cliente siempre trae su correo (medido el 17-10 en los hilos de la
    // 536, la 559 y la 493).
    if (limpio.startsWith('/o=')) return true;
    const dominio = limpio.split('@')[1];
    return Boolean(dominio) && this.dominiosDeLaCasa.has(dominio);
  }

  /** El correo de «Enviar cotización» sale de Eventia (hola@eventi-app.com). */
  esDeEventia(correo: string): boolean {
    return correo.trim().toLowerCase().endsWith('@eventi-app.com');
  }

  private ahora(): number {
    return (this.o.ahora ?? Date.now)();
  }

  private pedir(url: string, init: RequestInit): Promise<Response> {
    return (this.o.fetch ?? fetch)(url, init);
  }

  /** El permiso de Microsoft (client credentials), guardado mientras dure. */
  private async token(): Promise<string> {
    if (this.permiso && this.permiso.vence > this.ahora()) {
      return this.permiso.valor;
    }
    const r = await this.pedir(
      `https://login.microsoftonline.com/${this.o.inquilino}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.o.aplicacion,
          client_secret: this.o.secreto,
          scope: 'https://graph.microsoft.com/.default',
          grant_type: 'client_credentials',
        }).toString(),
      },
    );
    if (!r.ok) {
      throw new ErrorDeOutlook(
        `Microsoft no entregó el permiso (${r.status}): revisa la llave de Outlook (MS_CLIENT_SECRET).`,
        r.status,
      );
    }
    const datos = (await r.json()) as {
      access_token: string;
      expires_in?: number;
    };
    const segundos = Math.max(60, (datos.expires_in ?? 3600) - 120);
    this.permiso = {
      valor: datos.access_token,
      vence: this.ahora() + segundos * 1000,
    };
    return datos.access_token;
  }

  /** El buzón, solo si está en la lista. */
  private buzon(b: string): string {
    const limpio = b.trim().toLowerCase();
    if (!this.buzones.includes(limpio)) {
      throw new ErrorDeOutlook(
        `El buzón ${b} no está en la lista del seguimiento.`,
        403,
      );
    }
    return encodeURIComponent(limpio);
  }

  private async llamar<T>(
    metodo: 'GET' | 'POST' | 'PATCH',
    ruta: string,
    cuerpo?: unknown,
    inmutable = false,
  ): Promise<T> {
    const permiso = await this.token();
    const r = await this.pedir(GRAPH + ruta, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${permiso}`,
        Accept: 'application/json',
        ...(cuerpo === undefined ? {} : { 'Content-Type': 'application/json' }),
        // El identificador que no cambia cuando el mensaje pasa de carpeta.
        ...(inmutable ? { Prefer: 'IdType="ImmutableId"' } : {}),
      },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    const texto = await r.text();
    if (!r.ok) {
      let detalle = texto.slice(0, 300);
      try {
        const e = (
          JSON.parse(texto) as { error?: { code?: string; message?: string } }
        ).error;
        if (e) detalle = `${e.code}: ${e.message}`;
      } catch {
        // la respuesta no era JSON: queda el texto recortado
      }
      throw new ErrorDeOutlook(
        `Outlook respondió ${r.status} en ${metodo} ${ruta.split('?')[0]}: ${detalle}`,
        r.status,
      );
    }
    return (texto ? JSON.parse(texto) : {}) as T;
  }

  /** Los mensajes del buzón (cualquier carpeta) donde participa ese correo,
   *  del más nuevo al más viejo, de los últimos `dias`. El envío de Eventia
   *  llega en copia oculta a contacto@ y las respuestas del cliente también. */
  async buscar(
    buzon: string,
    correo: string,
    dias = 400,
  ): Promise<MensajeDelBuzon[]> {
    const b = this.buzon(buzon);
    const consulta = encodeURIComponent(`"participants:${correo.trim()}"`);
    const datos = await this.llamar<{ value?: MensajeDeGraph[] }>(
      'GET',
      `/users/${b}/messages?$search=${consulta}&$top=50` +
        '&$select=id,conversationId,subject,from,toRecipients,ccRecipients,receivedDateTime,bodyPreview,isDraft',
    );
    const desde = new Date(this.ahora() - dias * 86_400_000).toISOString();
    return (datos.value ?? [])
      .map(aMensaje)
      .filter((m) => m.fecha >= desde)
      .sort((a, b) => Date.parse(b.fecha) - Date.parse(a.fecha));
  }

  /** El texto de un mensaje, recortado. Solo lee. */
  async leerTexto(buzon: string, id: string, tope = 4000): Promise<string> {
    const b = this.buzon(buzon);
    const datos = await this.llamar<MensajeDeGraph>(
      'GET',
      `/users/${b}/messages/${encodeURIComponent(id)}?$select=body`,
    );
    const contenido = datos.body?.content ?? '';
    const texto =
      (datos.body?.contentType ?? '').toLowerCase() === 'html'
        ? aTexto(contenido)
        : contenido;
    return texto.slice(0, tope);
  }

  private destinatarioValido(correo: string): void {
    if (!correo.includes('@') || this.esDeLaCasa(correo)) {
      throw new ErrorDeOutlook(
        `Destinatario no válido para un seguimiento: ${correo}`,
        400,
      );
    }
  }

  /** Seguimiento dentro del hilo de un mensaje de la casa, dirigido al
   *  cliente y no a quien lo envió: la cotización sale de Eventia desde
   *  hola@eventi-app.com y llega en copia oculta, así que un Responder
   *  normal le escribiría a Eventia o a la propia casa. */
  async borradorDeSeguimiento(
    buzon: string,
    idMensaje: string,
    html: string,
    para: string,
    cc: string[],
  ): Promise<BorradorCreado> {
    [para, ...cc].forEach((d) => this.destinatarioValido(d));
    const b = this.buzon(buzon);
    const borrador = await this.llamar<MensajeDeGraph>(
      'POST',
      `/users/${b}/messages/${encodeURIComponent(idMensaje)}/createReply`,
      {},
    );
    const listo = await this.llamar<MensajeDeGraph>(
      'PATCH',
      `/users/${b}/messages/${encodeURIComponent(borrador.id)}`,
      {
        toRecipients: [direccion(para)],
        ccRecipients: cc.map(direccion),
        body: {
          contentType: 'HTML',
          content:
            avisoDelBorrador(this.o.empresa) +
            formatear(html) +
            (borrador.body?.content ?? ''),
        },
      },
    );
    return aBorrador(listo);
  }

  /** Respuesta a todos sobre el último correo del cliente, en su hilo. */
  async borradorRespuestaATodos(
    buzon: string,
    idMensaje: string,
    html: string,
  ): Promise<BorradorCreado> {
    const b = this.buzon(buzon);
    const borrador = await this.llamar<MensajeDeGraph>(
      'POST',
      `/users/${b}/messages/${encodeURIComponent(idMensaje)}/createReplyAll`,
      {},
    );
    const listo = await this.llamar<MensajeDeGraph>(
      'PATCH',
      `/users/${b}/messages/${encodeURIComponent(borrador.id)}`,
      {
        body: {
          contentType: 'HTML',
          content:
            avisoDelBorrador(this.o.empresa) +
            formatear(html) +
            (borrador.body?.content ?? ''),
        },
      },
    );
    return aBorrador(listo);
  }

  /** Correo nuevo, cuando no hay hilo con el cliente. Queda en Borradores. */
  async borradorNuevo(
    buzon: string,
    html: string,
    para: string,
    asunto: string,
  ): Promise<BorradorCreado> {
    this.destinatarioValido(para);
    if (!asunto.trim()) {
      throw new ErrorDeOutlook('Falta el asunto del correo nuevo.', 400);
    }
    const b = this.buzon(buzon);
    const listo = await this.llamar<MensajeDeGraph>(
      'POST',
      `/users/${b}/messages`,
      {
        subject: asunto.trim(),
        body: {
          contentType: 'HTML',
          content: avisoDelBorrador(this.o.empresa) + formatear(html),
        },
        toRecipients: [direccion(para)],
      },
    );
    return aBorrador(listo);
  }

  /** El identificador inmutable de un mensaje (y su conversación): el que
   *  se guarda para saber después si el borrador salió. Solo lee. */
  async idInmutable(
    buzon: string,
    id: string,
  ): Promise<{ id: string; hilo: string | null }> {
    const b = this.buzon(buzon);
    const m = await this.llamar<MensajeDeGraph>(
      'GET',
      `/users/${b}/messages/${encodeURIComponent(id)}?$select=id,conversationId`,
      undefined,
      true,
    );
    return { id: m.id, hilo: m.conversationId ?? null };
  }

  /** La carpeta Elementos eliminados del buzón (no cambia nunca). */
  private async eliminados(buzon: string): Promise<string> {
    const guardada = this.carpetasDeEliminados.get(buzon);
    if (guardada) return guardada;
    const carpeta = await this.llamar<{ id: string }>(
      'GET',
      `/users/${this.buzon(buzon)}/mailFolders/deleteditems?$select=id`,
    );
    this.carpetasDeEliminados.set(buzon, carpeta.id);
    return carpeta.id;
  }

  /** ¿Salió el borrador? Con su identificador inmutable: sigue de borrador,
   *  ya está en Enviados, lo movieron a Elementos eliminados o ya no está.
   *  Solo lee. */
  async estadoDelBorrador(
    buzon: string,
    idInmutable: string,
  ): Promise<EstadoDelBorrador> {
    const b = this.buzon(buzon);
    let m: MensajeDeGraph;
    try {
      m = await this.llamar<MensajeDeGraph>(
        'GET',
        `/users/${b}/messages/${encodeURIComponent(idInmutable)}` +
          '?$select=id,conversationId,isDraft,sentDateTime,parentFolderId',
        undefined,
        true,
      );
    } catch (error) {
      if (error instanceof ErrorDeOutlook && error.status === 404) {
        return { estado: 'no_esta' };
      }
      throw error;
    }
    const hilo = m.conversationId ?? null;
    if (!m.isDraft) {
      return { estado: 'enviado', hilo, enviado: m.sentDateTime ?? null };
    }
    if (
      m.parentFolderId &&
      m.parentFolderId === (await this.eliminados(buzon))
    ) {
      return { estado: 'eliminado', hilo };
    }
    return { estado: 'borrador', hilo };
  }

  /** Los mensajes de una conversación en el buzón (cualquier carpeta), del
   *  más viejo al más nuevo: para contar los seguimientos sin respuesta.
   *  Solo lee. */
  async mensajesDelHilo(
    buzon: string,
    hilo: string,
  ): Promise<MensajeDelBuzon[]> {
    const b = this.buzon(buzon);
    const filtro = encodeURIComponent(
      `conversationId eq '${hilo.replace(/'/g, "''")}'`,
    );
    const datos = await this.llamar<{ value?: MensajeDeGraph[] }>(
      'GET',
      `/users/${b}/messages?$filter=${filtro}&$top=100` +
        '&$select=id,conversationId,subject,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,isDraft,hasAttachments',
      undefined,
      true,
    );
    return (datos.value ?? [])
      .map((m) => ({
        ...aMensaje(m),
        fecha: m.sentDateTime ?? m.receivedDateTime ?? '',
      }))
      .sort((x, y) => Date.parse(x.fecha) - Date.parse(y.fecha));
  }
}
