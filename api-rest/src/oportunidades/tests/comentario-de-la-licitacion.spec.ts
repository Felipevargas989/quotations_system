import {
  bloqueDeLaLicitacion,
  comentarioConLaLicitacion,
  FIN_DEL_BLOQUE,
} from '../postulacion/comentario-de-la-licitacion';

// EL COMENTARIO INTERNO DE LA COTIZACIÓN DE UNA LICITACIÓN (decisión 57,
// 20-10). Felipe: "si me piden carne con un topping de cilantro, no puedo
// crearla, sino que un comentario que tiene que ir en los comentarios
// internos para yo poder hacer seguimiento".

const BLOQUE = bloqueDeLaLicitacion({
  codigo: '4364-13-LE26',
  nombre: 'Producción de Evento día del Profesor',
  detalles: ['Empanadas de cóctel: 2 de queso y 1 de carne por persona'],
  subcontratar: ['Pódium, los dos días', 'Amplificación y micrófonos'],
});

describe('El comentario interno de la cotización de una licitación', () => {
  it('lleva lo que hay que comprar o subcontratar y los detalles, resumido, y dice hasta dónde lo anota Eventia (decisión 120)', () => {
    // Felipe, 08-11: "el resto como comentario (resumido no tan extenso)".
    expect(BLOQUE).toBe(
      [
        'Postulación a la licitación 4364-13-LE26: Producción de Evento día del Profesor.',
        'Comprar o subcontratar: Pódium, los dos días; Amplificación y micrófonos.',
        'Detalles: Empanadas de cóctel: 2 de queso y 1 de carne por persona.',
        FIN_DEL_BLOQUE,
      ].join('\n'),
    );
  });

  it('lo largo se corta en una palabra y lo que pasa del tope se cuenta (la 2656-97-LE26)', () => {
    const bloque = bloqueDeLaLicitacion({
      codigo: '2656-97-LE26',
      nombre: 'Día del Funcionario Municipal',
      detalles: [
        'Aperitivo: 2 por persona (1 espumante y 1 pisco sour)',
        'Mini ceviche de cóctel: 1 tártaro de atún y mango y 1 ceviche de champiñón por persona',
        'Mini sándwich de cóctel: roast beef a la mostaza',
        'Brocheta de tomate cherry y queso: crostini de hummus y tomate asado',
        'Brocheta pollo verduras asadas: mini brocheta',
        'Mini pie de limón servido en shot',
        'Postre: pannacotta con salsa caramelo de café, servida fría',
        'Mesas redondas de 10 personas, 20 mesas',
      ],
      subcontratar: [
        'Sistema de sonido para recepción al aire libre con operador: 4 parlantes aéreos, 1 amplificador, 1 procesador digital, 2 micrófonos inalámbricos digitales con cobertura mínima de 200 metros y consola, viernes 20 de noviembre de 2026',
        '1 DJ para el baile',
        '2 galvanos para el premio',
      ],
    });
    const [, comprar, detalles] = bloque.split('\n');
    expect(comprar).toBe(
      'Comprar o subcontratar: Sistema de sonido para recepción al aire libre con operador: 4 parlantes…; 1 DJ para el baile; 2 galvanos para el premio.',
    );
    expect(detalles).toMatch(/; y 2 más en la licitación\.$/);
    expect(detalles.split('; ')).toHaveLength(7);
  });

  it('se reemplaza solo el bloque: lo que escribió la persona se queda', () => {
    const conNota = `${BLOQUE}\n\nLlamar a la Sra. Pérez el lunes.`;
    const nuevo = bloqueDeLaLicitacion({
      codigo: '4364-13-LE26',
      nombre: 'Producción de Evento día del Profesor',
      detalles: [],
      subcontratar: ['Generador'],
    });
    expect(comentarioConLaLicitacion(conNota, nuevo, '4364-13-LE26')).toBe(
      `${nuevo}\n\nLlamar a la Sra. Pérez el lunes.`,
    );
  });

  it('la línea sola de antes también se reemplaza; sin bloque, va arriba de lo que había', () => {
    const deAntes =
      'Postulación a la licitación 4364-13-LE26: Producción de Evento día del Profesor.\nOjo con la fecha.';
    expect(comentarioConLaLicitacion(deAntes, BLOQUE, '4364-13-LE26')).toBe(
      `${BLOQUE}\nOjo con la fecha.`,
    );
    expect(
      comentarioConLaLicitacion(
        'Cliente pide factura.',
        BLOQUE,
        '4364-13-LE26',
      ),
    ).toBe(`${BLOQUE}\n\nCliente pide factura.`);
    expect(comentarioConLaLicitacion(null, BLOQUE, '4364-13-LE26')).toBe(
      BLOQUE,
    );
  });
});
