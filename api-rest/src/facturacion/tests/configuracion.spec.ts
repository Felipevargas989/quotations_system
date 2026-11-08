import { BadGatewayException } from '@nestjs/common';
import { mockPinoLogger } from '../../testing/mocks';
import {
  configuracionDeFacturacionCl,
  describirConfiguracion,
} from '../facturacion-cl/configuracion';
import { FacturacionClSimulado } from '../facturacion-cl/simulado';
import { FacturacionClSinConexion } from '../facturacion-cl/sin-conexion';
import { FacturacionClSoap } from '../facturacion-cl/soap';
import { ConexionConFacturacionCl } from '../facturas/conexion';

/**
 * QUÉ CONEXIÓN USA CADA MOTOR (doc 19 §9.18): el laboratorio solo con las
 * credenciales de prueba, producción solo con las de producción y nunca
 * simulada, y las credenciales solo para su empresa.
 */

const LAB = 'https://uonjtbyoxawxvhuikbgx.supabase.co';
const PROD = 'https://yxezscjznhlnxxdmuvoq.supabase.co';

const credenciales = (ambiente: string, empresa = '1') => ({
  FACTURACIONCL_USUARIO: 'integrador',
  FACTURACIONCL_RUT: '77701305-K',
  FACTURACIONCL_CLAVE: 'clave-secreta',
  FACTURACIONCL_AMBIENTE: ambiente,
  FACTURACIONCL_EMPRESA: empresa,
});

describe('la configuración de facturacion.cl', () => {
  it('el laboratorio sin credenciales sigue con el simulado', () => {
    expect(configuracionDeFacturacionCl({ SUPABASE_URL: LAB })).toEqual({
      modo: 'simulado',
      enProduccion: false,
    });
  });

  it('producción sin credenciales no emite, ni simulado (por NODE_ENV o por su base)', () => {
    for (const env of [
      { NODE_ENV: 'production', SUPABASE_URL: LAB },
      { SUPABASE_URL: PROD },
    ])
      expect(configuracionDeFacturacionCl(env)).toMatchObject({
        modo: 'sin_conexion',
        enProduccion: true,
        empresa: null,
        motivo: expect.stringContaining('faltan sus credenciales en Railway'),
      });
  });

  it('las de prueba en el laboratorio: conectado en prueba, solo para la empresa 1', () => {
    expect(
      configuracionDeFacturacionCl({
        SUPABASE_URL: LAB,
        ...credenciales(' Prueba '),
      }),
    ).toEqual({
      modo: 'conectado',
      enProduccion: false,
      empresa: 1,
      ambiente: 'prueba',
      credenciales: {
        usuario: 'integrador',
        rut: '77701305-K',
        clave: 'clave-secreta',
      },
    });
  });

  it('las de producción en producción, con o sin tilde', () => {
    expect(
      configuracionDeFacturacionCl({
        NODE_ENV: 'production',
        SUPABASE_URL: PROD,
        ...credenciales('Producción'),
      }),
    ).toMatchObject({ modo: 'conectado', ambiente: 'produccion', empresa: 1 });
  });

  it('cada credencial en su motor: las de producción no corren en el laboratorio, ni las de prueba en producción', () => {
    expect(
      configuracionDeFacturacionCl({
        SUPABASE_URL: LAB,
        ...credenciales('produccion'),
      }),
    ).toMatchObject({
      modo: 'sin_conexion',
      empresa: 1,
      motivo:
        'En el laboratorio van solo las credenciales de prueba de facturacion.cl',
    });
    expect(
      configuracionDeFacturacionCl({
        NODE_ENV: 'production',
        ...credenciales('prueba'),
      }),
    ).toMatchObject({
      modo: 'sin_conexion',
      motivo:
        'En producción van solo las credenciales de producción de facturacion.cl',
    });
  });

  it('a medias: dice qué variable falta, sin mostrar ninguna', () => {
    const c = configuracionDeFacturacionCl({
      SUPABASE_URL: LAB,
      ...credenciales('prueba'),
      FACTURACIONCL_CLAVE: '',
    });
    expect(c).toMatchObject({
      modo: 'sin_conexion',
      motivo: 'Faltan variables en Railway: FACTURACIONCL_CLAVE',
    });
    expect(
      configuracionDeFacturacionCl({
        SUPABASE_URL: LAB,
        ...credenciales('prueba', 'Valle del Sol'),
      }),
    ).toMatchObject({
      modo: 'sin_conexion',
      motivo: 'FACTURACIONCL_EMPRESA tiene que ser el N° de la empresa',
    });
    expect(
      configuracionDeFacturacionCl({
        SUPABASE_URL: LAB,
        ...credenciales('certificacion'),
      }),
    ).toMatchObject({ modo: 'sin_conexion' });
  });

  it('el registro del motor nunca lleva las credenciales', () => {
    const texto = describirConfiguracion(
      configuracionDeFacturacionCl({
        SUPABASE_URL: LAB,
        ...credenciales('prueba'),
      }),
    );
    expect(texto).toBe('conectado en prueba para la empresa 1');
    expect(texto).not.toMatch(/integrador|clave-secreta|77701305/);
  });
});

describe('la conexión de cada empresa', () => {
  const original = { ...process.env };
  const repo = { ultimoFolio: jest.fn().mockResolvedValue(0) };
  const conexionCon = (env: Record<string, string>) => {
    for (const k of Object.keys(process.env))
      if (k.startsWith('FACTURACIONCL_')) delete process.env[k];
    delete process.env.NODE_ENV;
    Object.assign(process.env, env);
    return new ConexionConFacturacionCl(
      repo as never,
      mockPinoLogger() as never,
    );
  };
  afterEach(() => {
    process.env = { ...original };
  });

  it('en el laboratorio con las de prueba: la empresa 1 de verdad y las demás simuladas', () => {
    const conexion = conexionCon({
      SUPABASE_URL: LAB,
      ...credenciales('prueba'),
    });
    expect(conexion.de(1)).toBeInstanceOf(FacturacionClSoap);
    expect(conexion.de(1).ambiente).toBe('prueba');
    expect(conexion.de(2)).toBeInstanceOf(FacturacionClSimulado);
    // Lo ya emitido se comprueba donde se emitió.
    expect(conexion.de(1, 'simulado')).toBeInstanceOf(FacturacionClSimulado);
    expect(conexion.de(1, 'produccion')).toBeNull();
  });

  it('en producción: la empresa 1 conectada, las demás sin conexión y nada simulado', async () => {
    const conexion = conexionCon({
      NODE_ENV: 'production',
      SUPABASE_URL: PROD,
      ...credenciales('produccion'),
    });
    expect(conexion.de(1).ambiente).toBe('produccion');
    expect(conexion.de(1, 'simulado')).toBeNull();
    const otra = conexion.de(2);
    expect(otra).toBeInstanceOf(FacturacionClSinConexion);
    await expect(otra.folioSiguiente(33)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('producción sin credenciales: no emite, lo dice y no deja nada por confirmar', async () => {
    const conexion = conexionCon({
      NODE_ENV: 'production',
      SUPABASE_URL: PROD,
    });
    const c = conexion.de(1);
    expect(c.sinConexion).toContain('faltan sus credenciales');
    await expect(c.folioSiguiente(33)).rejects.toThrow(
      'facturacion.cl todavía no está conectado',
    );
    // Si algo llegara a mandar, es un rechazo (no salió nada), no un corte.
    expect(await c.procesar('->Encabezado<-', 33)).toMatchObject({
      resultado: 'rechazado',
    });
  });
});
