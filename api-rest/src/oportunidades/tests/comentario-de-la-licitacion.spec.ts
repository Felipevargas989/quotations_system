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
  it('lleva los detalles de lo postulado y el pedido al proveedor, y dice hasta dónde lo anota Eventia', () => {
    expect(BLOQUE).toBe(
      [
        'Postulación a la licitación 4364-13-LE26: Producción de Evento día del Profesor.',
        '',
        'Detalles de lo postulado:',
        '- Empanadas de cóctel: 2 de queso y 1 de carne por persona',
        '',
        'Subcontratar (pedir al proveedor):',
        '- Pódium, los dos días',
        '- Amplificación y micrófonos',
        '',
        FIN_DEL_BLOQUE,
      ].join('\n'),
    );
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
