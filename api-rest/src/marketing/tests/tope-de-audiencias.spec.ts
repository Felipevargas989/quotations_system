import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
// Los DTO llevan @Type de class-transformer: fuera de Nest hay que
// cargar reflect-metadata a mano (antes del DTO) o `Reflect.getMetadata`
// no existe.
import 'reflect-metadata';
import {
  CrearCampanaDto,
  EditarCampanaDto,
  MAX_AUDIENCIAS_POR_CAMPANA,
} from '../dto/marketing.dto';

/**
 * EL TOPE DE AUDIENCIAS POR CAMPAÑA (18-09-2026). Nació en 10 el 27-08
 * como freno sin razón de negocio; Felipe chocó con él al elegir "todas"
 * sus audiencias (19) y pidió 30. Lo que se jura acá:
 *  - 30 pasan, 31 no, en el creador Y en el editor del borrador;
 *  - el rechazo habla español (antes: "audiencias must contain no more
 *    than 10 elements").
 */
const audiencias = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    audiencia_tipo: 'importada',
    audiencia_ref: `Lista ${String(i + 1)}`,
  }));

const erroresDeAudiencias = (Dto: new () => object, cuerpo: object) =>
  validateSync(plainToInstance(Dto, cuerpo)).filter(
    (e) => e.property === 'audiencias',
  );

describe('el tope de audiencias por campaña', () => {
  it('es 30', () => {
    expect(MAX_AUDIENCIAS_POR_CAMPANA).toBe(30);
  });

  it.each([
    ['crear', CrearCampanaDto],
    ['editar', EditarCampanaDto],
  ])('%s: 30 audiencias pasan, 31 se rechazan en español', (_nombre, Dto) => {
    expect(
      erroresDeAudiencias(Dto, { audiencias: audiencias(30) }),
    ).toHaveLength(0);

    const errores = erroresDeAudiencias(Dto, { audiencias: audiencias(31) });
    expect(errores).toHaveLength(1);
    const mensajes = Object.values(errores[0].constraints ?? {});
    expect(mensajes.join(' ')).toContain(
      'Puedes elegir hasta 30 audiencias por campaña',
    );
  });
});
