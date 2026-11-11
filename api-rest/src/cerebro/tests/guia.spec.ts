import { BadRequestException } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import type { User } from 'src/users/entities/user.entity';
import { cerebroPara, VALLE_DEL_SOL } from '../cerebro';
import {
  guardarGuia,
  guiaDe,
  limpiarGuia,
  reemplazarGuias,
  seccionDeLaGuia,
  TOPES_DE_LA_GUIA,
} from '../guia';
import type { GuiaRepository } from '../guia.repository';
import { GuiaService } from '../guia.service';

// LA GUÍA DE LA CASA (doc 20 §18; Felipe, 10-11-2026: «BelIA será quien
// responda todo esto»). La escribe administración; la leen BelIA y los
// correos de seguimiento, al final del cerebro y antes de las lecciones.

const TINAJA = {
  titulo: 'Tinaja',
  texto: '$25.000, con tabla de frutos secos, quesos y fruta, y espumante.',
};

afterEach(() => reemplazarGuias(new Map()));

describe('limpiarGuia', () => {
  it('saca los temas vacíos y recorta los espacios', () => {
    expect(
      limpiarGuia([
        { titulo: '  Tinaja ', texto: ` ${TINAJA.texto}\r\n` },
        { titulo: '', texto: '' },
      ]),
    ).toEqual([TINAJA]);
  });

  it('un tema sin título o sin texto no se guarda', () => {
    expect(limpiarGuia([{ titulo: '', texto: 'algo' }])).toMatch('título');
    expect(limpiarGuia([{ titulo: 'Horarios', texto: ' ' }])).toMatch(
      'no tiene texto',
    );
  });

  it('respeta los topes', () => {
    const muchos = Array.from(
      { length: TOPES_DE_LA_GUIA.secciones + 1 },
      () => TINAJA,
    );
    expect(limpiarGuia(muchos)).toMatch('máximo');
    expect(
      limpiarGuia([
        { titulo: 'Largo', texto: 'x'.repeat(TOPES_DE_LA_GUIA.texto + 1) },
      ]),
    ).toMatch('pasa de');
    const grandes = Array.from({ length: 10 }, (_, i) => ({
      titulo: `Tema ${i}`,
      texto: 'x'.repeat(TOPES_DE_LA_GUIA.texto),
    }));
    expect(limpiarGuia(grandes)).toMatch('letras: el máximo');
  });
});

describe('seccionDeLaGuia', () => {
  it('la leen BelIA y los correos; «Crear con IA» y Oportunidades no', () => {
    expect(seccionDeLaGuia([TINAJA], 'conversar')).toContain('## Tinaja');
    expect(seccionDeLaGuia([TINAJA], 'escribir')).toContain('$25.000');
    expect(seccionDeLaGuia([TINAJA], 'armar')).toBeNull();
    expect(seccionDeLaGuia([TINAJA], 'postular')).toBeNull();
  });

  it('vacía, no suma nada', () => {
    expect(seccionDeLaGuia([], 'conversar')).toBeNull();
  });
});

describe('la guía en el cerebro', () => {
  it('va después de lo del complejo y es solo de su empresa', () => {
    guardarGuia(VALLE_DEL_SOL, [TINAJA]);
    const t = cerebroPara(VALLE_DEL_SOL, 'conversar');
    expect(t.indexOf('# La guía de la casa')).toBeGreaterThan(
      t.indexOf('# Valle del Sol Quillón'),
    );
    expect(cerebroPara(2, 'conversar')).not.toContain('Tinaja');
    expect(cerebroPara(VALLE_DEL_SOL, 'armar')).not.toContain(
      '# La guía de la casa',
    );
  });
});

describe('GuiaService', () => {
  const logger = {
    setContext: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  } as unknown as PinoLogger;
  const admin = {
    id: 'sesion-1',
    full_name: 'Felipe Vargas',
    company_id: VALLE_DEL_SOL,
  } as User;

  it('guarda y la deja al tiro en la memoria', async () => {
    const repo = {
      guardar: jest.fn().mockResolvedValue({
        secciones: [TINAJA],
        actualizada_por_nombre: 'Felipe Vargas',
        updated_at: '2026-11-10T20:00:00Z',
      }),
    };
    const s = new GuiaService(repo as unknown as GuiaRepository, logger);
    await s.guardar(admin, [TINAJA]);
    expect(repo.guardar).toHaveBeenCalledWith(VALLE_DEL_SOL, [TINAJA], {
      id: 'sesion-1',
      nombre: 'Felipe Vargas',
    });
    expect(guiaDe(VALLE_DEL_SOL)).toEqual([TINAJA]);
  });

  it('lo que no cumple, no llega a la base', async () => {
    const repo = { guardar: jest.fn() };
    const s = new GuiaService(repo as unknown as GuiaRepository, logger);
    await expect(
      s.guardar(admin, [{ titulo: '', texto: 'sin título' }]),
    ).rejects.toThrow(BadRequestException);
    expect(repo.guardar).not.toHaveBeenCalled();
  });

  it('si la base no responde al arrancar, sigue sin guía', async () => {
    const repo = { todas: jest.fn().mockRejectedValue(new Error('caída')) };
    const s = new GuiaService(repo as unknown as GuiaRepository, logger);
    await expect(s.cargarTodas()).resolves.toBeUndefined();
    expect(guiaDe(VALLE_DEL_SOL)).toEqual([]);
  });
});
