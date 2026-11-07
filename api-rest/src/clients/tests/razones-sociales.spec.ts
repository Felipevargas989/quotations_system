import { ConflictException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { datosDeFacturacionLimpios } from '../../facturacion/datos-del-receptor';
import {
  CrearRazonSocialDto,
  EditarRazonSocialDto,
} from '../razones-sociales/razon-social.dto';
import { RazonesSocialesService } from '../razones-sociales/razones-sociales.service';

/**
 * LAS RAZONES SOCIALES DE UN CLIENTE (migración 184, doc 19 §9.12).
 *
 * Felipe, 04-11: un cliente se puede facturar a varios RUT. El caso es
 * real: el evento #481 de Santo Tomás tiene 3 OC a 2 RUT, el del CFT
 * (65.175.242-6) y el del Instituto Profesional (65.175.239-6). Lo que se
 * guarda va tal cual a la factura de facturacion.cl.
 */
const errores = async (
  clase: typeof CrearRazonSocialDto | typeof EditarRazonSocialDto,
  body: Record<string, unknown>,
) => (await validate(plainToInstance(clase, body))).map((e) => e.property);

const CFT = {
  rut: '65.175.242-6',
  razon_social: 'Corporación Centro de Formación Técnica Santo Tomás',
  giro: 'Educación',
  direccion: 'Av. Carlos Schorr 255',
  comuna: 'Talca',
  ciudad: 'Talca',
  correo_facturacion: 'facturas@santotomas.cl',
  referencias_exigidas: ['801'],
};

describe('Una razón social: lo que acepta el motor', () => {
  it('una completa pasa', async () => {
    expect(await errores(CrearRazonSocialDto, CFT)).toEqual([]);
  });

  it('al crearla, el RUT y la razón social son obligatorios', async () => {
    expect(await errores(CrearRazonSocialDto, { giro: 'Educación' })).toEqual([
      'rut',
      'razon_social',
    ]);
  });

  it('el RUT se revisa de verdad: un dígito verificador malo no pasa', async () => {
    expect(
      await errores(CrearRazonSocialDto, { ...CFT, rut: '65.175.242-5' }),
    ).toEqual(['rut']);
  });

  it('lo que no cabe en la factura no se guarda (el giro, hasta 40)', async () => {
    expect(
      await errores(CrearRazonSocialDto, {
        ...CFT,
        giro: '853202-ENSEÑANZA SUPERIOR EN CENTROS DE FORMACION TECNICA',
      }),
    ).toEqual(['giro']);
  });

  it('los correos, uno o varios, todos válidos; las referencias, las del SII', async () => {
    expect(
      await errores(CrearRazonSocialDto, {
        ...CFT,
        correo_facturacion: 'facturas@santotomas',
        referencias_exigidas: ['801', '999'],
      }),
    ).toEqual(['correo_facturacion', 'referencias_exigidas']);
  });

  it('al editar, basta lo que cambia; pero el RUT y la razón social no se vacían', async () => {
    expect(await errores(EditarRazonSocialDto, { giro: 'Enseñanza' })).toEqual(
      [],
    );
    expect(
      await errores(EditarRazonSocialDto, { rut: '', razon_social: '' }),
    ).toEqual(['rut', 'razon_social']);
  });
});

describe('Una razón social: cómo queda guardada', () => {
  it('el RUT limpio, los correos en minúscula y las referencias en el orden del SII', () => {
    expect(
      datosDeFacturacionLimpios({
        rut: '65.175.239-6',
        razon_social: '  Corporación   Instituto Profesional Santo Tomás ',
        giro: '',
        correo_facturacion: ' Facturas@SantoTomas.cl;pagos@santotomas.cl ',
        referencias_exigidas: ['HES', '802', '801', '802'],
      }),
    ).toEqual({
      rut: '65175239-6',
      razon_social: 'Corporación Instituto Profesional Santo Tomás',
      giro: null,
      correo_facturacion: 'facturas@santotomas.cl, pagos@santotomas.cl',
      referencias_exigidas: ['801', '802', 'HES'],
    });
  });

  it('solo toca lo que venía', () => {
    expect(datosDeFacturacionLimpios({ comuna: 'San Joaquín' })).toEqual({
      comuna: 'San Joaquín',
    });
  });
});

describe('Las razones sociales de un cliente', () => {
  const armar = (deLaEmpresa = true) => {
    const repo = {
      clienteDeLaEmpresa: jest.fn().mockResolvedValue(deLaEmpresa),
      deCliente: jest.fn().mockResolvedValue([]),
      crear: jest
        .fn()
        .mockImplementation((fila: object) =>
          Promise.resolve({ id: 1, ...fila }),
        ),
      editar: jest.fn().mockResolvedValue({ id: 1 }),
      borrar: jest.fn().mockResolvedValue(1),
    };
    return { repo, service: new RazonesSocialesService(repo as never) };
  };

  it('se guarda limpia, en el cliente y la empresa de la sesión, con quién la creó', async () => {
    const { repo, service } = armar();
    await service.crear(
      'santo-tomas',
      1,
      plainToInstance(CrearRazonSocialDto, CFT),
      'felipe',
    );
    expect(repo.clienteDeLaEmpresa).toHaveBeenCalledWith('santo-tomas', 1);
    expect(repo.crear).toHaveBeenCalledWith({
      rut: '65175242-6',
      razon_social: 'Corporación Centro de Formación Técnica Santo Tomás',
      giro: 'Educación',
      direccion: 'Av. Carlos Schorr 255',
      comuna: 'Talca',
      ciudad: 'Talca',
      correo_facturacion: 'facturas@santotomas.cl',
      referencias_exigidas: ['801'],
      company_id: 1,
      client_id: 'santo-tomas',
      origen: 'manual',
      creado_por: 'felipe',
    });
  });

  it('el cliente de otra empresa no existe para esta', async () => {
    const { repo, service } = armar(false);
    await expect(service.deCliente('ajeno', 1)).rejects.toThrow(
      NotFoundException,
    );
    await expect(
      service.crear(
        'ajeno',
        1,
        plainToInstance(CrearRazonSocialDto, CFT),
        null,
      ),
    ).rejects.toThrow(NotFoundException);
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it('el mismo RUT dos veces en un cliente se dice con palabras', async () => {
    const { repo, service } = armar();
    repo.crear.mockRejectedValue({ code: '23505' });
    await expect(
      service.crear(
        'santo-tomas',
        1,
        plainToInstance(CrearRazonSocialDto, CFT),
        null,
      ),
    ).rejects.toThrow(
      new ConflictException(
        'Ese RUT ya está en las razones sociales de este cliente',
      ),
    );
  });

  it('editar o borrar una que no es de este cliente: no existe', async () => {
    const { repo, service } = armar();
    repo.editar.mockResolvedValue(null);
    repo.borrar.mockResolvedValue(0);
    await expect(
      service.editar('santo-tomas', 1, 99, { giro: 'Educación' }),
    ).rejects.toThrow(NotFoundException);
    await expect(service.borrar('santo-tomas', 1, 99)).rejects.toThrow(
      NotFoundException,
    );
  });
});
