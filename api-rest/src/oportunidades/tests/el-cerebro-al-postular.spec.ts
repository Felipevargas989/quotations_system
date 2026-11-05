import { VALLE_DEL_SOL } from 'src/cerebro/cerebro';
import {
  instruccionesComunes,
  loQueSabeLaCasa,
  sistemaConCache,
} from '../analisis/comun';

// EL CEREBRO COMÚN AL POSTULAR (doc 20 §17, mejora 6): las IA de
// Oportunidades leen lo que sabe de la empresa toda la IA de Eventia, sin las
// guías de armar ni de escribir, y al postular mandan las bases. En el
// análisis y en las preguntas va dentro del mismo comienzo, así que la caché
// compartida sigue siendo una (decisión 115).

const CONTEXTO = {
  codigo: '1346350-37-COT26',
  nombre: 'Catamarán, alojamiento y colaciones',
  organismo: 'Municipalidad de Quillón',
  comuna: 'Quillón',
  perfil: 'complejo turístico con salones',
};

describe('lo que sabe la casa, al postular', () => {
  it('trae lo común y el complejo, sin las guías, y dice que mandan las bases', () => {
    const t = loQueSabeLaCasa(VALLE_DEL_SOL);
    expect(t).toContain('LO QUE SABE TODA LA IA DE EVENTIA DE ESTA EMPRESA');
    expect(t).toContain('lo que piden las bases manda sobre esto');
    expect(t).toContain('# Lo que sabe toda la IA de Eventia');
    expect(t).toContain('# Valle del Sol Quillón');
    expect(t).not.toContain('# Cómo se arma una cotización');
    expect(t).not.toContain('# Cómo se escribe un correo de seguimiento');
  });

  it('sin empresa no se suma nada', () => {
    expect(loQueSabeLaCasa(undefined)).toBe('');
    expect(instruccionesComunes(CONTEXTO)).not.toContain('LO QUE SABE');
  });

  it('el análisis y las preguntas mandan el mismo comienzo, con el cerebro antes de la marca de caché', () => {
    const delAnalisis = sistemaConCache({
      ...CONTEXTO,
      empresa: VALLE_DEL_SOL,
    });
    const deLasPreguntas = sistemaConCache({
      ...CONTEXTO,
      empresa: VALLE_DEL_SOL,
    });
    expect(delAnalisis).toEqual(deLasPreguntas);
    expect(delAnalisis[0].text).toContain('# Valle del Sol Quillón');
    expect(delAnalisis[0].cache_control).toBeDefined();
  });
});
