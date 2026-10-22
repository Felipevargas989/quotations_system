import {
  problemaDeLaSalida,
  problemaDelDocumento,
} from '../generacion/revision';
import { wordCon } from './zip-de-prueba';

// LO QUE ENTREGA LA IA SE REVISA ANTES DE GUARDARSE (revision.ts): un Word
// que se abre; el firmado, con el mismo texto y la firma; y desde el 19-10
// su PDF, solo si el Word pasó. Aparte de generacion.service.spec.ts, que
// llegaba a las 800 líneas del portero.

describe('lo que entrega la IA', () => {
  const ANTES = wordCon(['Firma: ________', 'Felipe Vargas'], 1);

  it('se guarda solo un Word que se abre; el firmado, con el mismo texto y la firma', () => {
    expect(problemaDelDocumento(Buffer.from('roto'))).toBe(
      'no es un Word que se pueda abrir',
    );
    expect(problemaDelDocumento(wordCon(['Anexo 1 lleno']))).toBeNull();
    expect(
      problemaDelDocumento(
        wordCon(['Firma: ________', 'Felipe Vargas'], 2),
        ANTES,
      ),
    ).toBeNull();
    expect(
      problemaDelDocumento(
        wordCon(['Firma: ________', 'Felipe Vargas'], 1),
        ANTES,
      ),
    ).toBe('no trae la firma');
    expect(
      problemaDelDocumento(
        wordCon(['Firma: ________', 'Felipe Vargas P.'], 2),
        ANTES,
      ),
    ).toContain('cambió el texto');
  });

  it('el PDF de un firmado: solo si su Word pasó, y que sea un PDF', () => {
    const pdf = Buffer.from('%PDF-1.7');
    const pasaron = new Set(['firmado_12.docx']);
    expect(
      problemaDeLaSalida(
        { siPasa: 'firmado_12.docx' },
        pdf,
        undefined,
        pasaron,
      ),
    ).toBeNull();
    expect(
      problemaDeLaSalida(
        { siPasa: 'firmado_13.docx' },
        pdf,
        undefined,
        pasaron,
      ),
    ).toContain('no pasó la revisión');
    expect(
      problemaDeLaSalida(
        { siPasa: 'firmado_12.docx' },
        Buffer.from('roto'),
        undefined,
        pasaron,
      ),
    ).toBe('no es un PDF que se pueda abrir');
  });
});
