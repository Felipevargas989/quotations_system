import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { sinComentarioAjeno } from '../../comentario-interno';
import { CreateQuotationPublicDto } from '../../dto/create-quotation-public.dto';
import { CreateQuotationDto } from '../../dto/create-quotation.dto';

// El comentario interno (17-10-2026, migración 128) es del equipo y nunca
// sale al cliente. GET /quotations/:id es pública (la encuesta la abre sin
// sesión): quien no es de la empresa recibe la cotización sin él.

const respuesta = (fila: Record<string, unknown> | null) => ({
  data: fila,
  error: null,
  status: 200,
});

const fila = {
  id: 'q1',
  company_id: 1,
  observations: 'Lo que ve el cliente',
  comentario_interno: 'Menú económico, tres días, con desayuno',
};

describe('comentario interno: la puerta pública', () => {
  it('sin sesión (la encuesta), la cotización llega sin el comentario', () => {
    const r = sinComentarioAjeno(respuesta(fila), null);
    expect(r.data).not.toHaveProperty('comentario_interno');
    expect(r.data).toMatchObject({
      id: 'q1',
      observations: 'Lo que ve el cliente',
    });
    expect(r.status).toBe(200);
  });

  it('con sesión de OTRA empresa, tampoco', () => {
    const r = sinComentarioAjeno(respuesta(fila), 2);
    expect(r.data).not.toHaveProperty('comentario_interno');
  });

  it('con sesión de la misma empresa, llega entero', () => {
    const r = sinComentarioAjeno(respuesta(fila), 1);
    expect(r.data).toHaveProperty(
      'comentario_interno',
      'Menú económico, tres días, con desayuno',
    );
  });

  it('el company_id que llega como texto igual se reconoce', () => {
    const r = sinComentarioAjeno(respuesta({ ...fila, company_id: '1' }), 1);
    expect(r.data).toHaveProperty('comentario_interno');
  });

  it('no toca la fila guardada: quita el campo de una copia', () => {
    const original = { ...fila };
    sinComentarioAjeno(respuesta(original), null);
    expect(original).toHaveProperty('comentario_interno');
  });

  it('sin fila (no existe o error), devuelve la respuesta tal cual', () => {
    const vacia = respuesta(null);
    expect(sinComentarioAjeno(vacia, null)).toBe(vacia);
  });
});

describe('comentario interno: quién lo puede escribir', () => {
  const opciones = { whitelist: true, forbidNonWhitelisted: true };

  it('el cotizador y Recepción lo mandan al crear o editar', async () => {
    const dto = plainToInstance(CreateQuotationDto, {
      client_id: 'c1',
      event_type: 'Matrimonio',
      people_count: 80,
      event_date: '2026-12-12',
      quotation_status: 'solicitada',
      request_type: 'requerimiento',
      comentario_interno: 'Menú económico, tres días',
    });
    const errores = await validate(dto, opciones);
    expect(errores.map((e) => e.property)).not.toContain('comentario_interno');
  });

  it('el formulario público NO lo puede mandar', async () => {
    const dto = plainToInstance(CreateQuotationPublicDto, {
      comentario_interno: 'colado desde afuera',
    });
    const errores = await validate(dto, opciones);
    const colado = errores.find((e) => e.property === 'comentario_interno');
    expect(colado?.constraints).toHaveProperty('whitelistValidation');
  });

  it('tiene tope de largo', async () => {
    const dto = plainToInstance(CreateQuotationDto, {
      comentario_interno: 'x'.repeat(5001),
    });
    const errores = await validate(dto, opciones);
    const largo = errores.find((e) => e.property === 'comentario_interno');
    expect(largo?.constraints).toHaveProperty('maxLength');
  });
});
