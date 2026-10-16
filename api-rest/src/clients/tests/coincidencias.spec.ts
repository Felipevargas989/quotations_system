import {
  ClienteParaCoincidir,
  buscarCoincidencias,
  correoUtil,
  digitosTelefono,
  nombreParecido,
  normalizarTexto,
  similitud,
} from '../coincidencias';

// Los casos son los duplicados REALES que Felipe vio el 16-10-2026 en
// Valle del Sol (y los parecidos que NO son duplicados, para que el
// aviso no moleste de más).

const cliente = (
  c: Partial<ClienteParaCoincidir> & { id: string; name: string },
): ClienteParaCoincidir => ({
  client_type: 'Club Adulto Mayor',
  email: null,
  phone: null,
  personas: [],
  ultimaCotizacion: null,
  ...c,
});

describe('coincidencias: las piezas', () => {
  it('normaliza tildes, mayúsculas y signos', () => {
    expect(normalizarTexto('Universidad del Bío-Bío')).toBe(
      'universidad del bio bio',
    );
  });

  it('un error de tipeo sigue siendo el mismo nombre', () => {
    expect(
      similitud('Agrupación Nueva Esperanza', 'Agrupación nueva espezanza'),
    ).toBeGreaterThanOrEqual(0.75);
  });

  it('un nombre dentro del otro cuenta como parecido', () => {
    expect(
      nombreParecido('Nueva Esperanza', 'Agrupación Nueva Esperanza'),
    ).toBe(true);
    expect(
      nombreParecido(
        'Universidad del Bío-Bío',
        'Universidad del bio bio Concepción',
      ),
    ).toBe(true);
  });

  it('nombres que se parecen pero son otros clientes NO avisan', () => {
    expect(
      nombreParecido(
        'Universidad de Concepción',
        'Universidad del bio bio Concepción',
      ),
    ).toBe(false);
    expect(nombreParecido('Daniela Bobadilla', 'Daniela Padilla')).toBe(false);
    expect(
      nombreParecido('Club Los Años Plateados', 'Club Sueños Plateados'),
    ).toBe(false);
    expect(
      nombreParecido('Municipalidad de Cabrero', 'Municipalidad de Quillón'),
    ).toBe(false);
  });

  it('el teléfono se compara por sus últimos 9 dígitos, sin rellenos', () => {
    expect(digitosTelefono('+56 9 9164 4870')).toBe('991644870');
    expect(digitosTelefono('991644870')).toBe('991644870');
    expect(digitosTelefono('999999999')).toBe('');
    expect(digitosTelefono('1234')).toBe('');
  });

  it('el correo de relleno no cuenta', () => {
    expect(correoUtil('NoIndica@gmail.com')).toBe('');
    expect(correoUtil(' Alepaubustos@gmail.com ')).toBe(
      'alepaubustos@gmail.com',
    );
  });
});

describe('coincidencias: los casos de Valle del Sol', () => {
  it('René Neira: el club nuevo con el mismo teléfono que su ficha', () => {
    const r = buscarCoincidencias(
      {
        nombre: 'Rejuveneciendo a la vida',
        correos: [],
        telefonos: ['+56991644870'],
      },
      [
        cliente({
          id: 'rene',
          name: 'Rene Neira',
          personas: [
            {
              id: 436,
              name: 'Rene Neira',
              email: 'rneirapalma@gmail.com',
              phone: '+56991644870',
            },
          ],
          ultimaCotizacion: 590,
        }),
      ],
    );
    expect(r).toEqual([
      {
        cliente_id: 'rene',
        nombre: 'Rene Neira',
        tipo: 'Club Adulto Mayor',
        motivos: ['telefono'],
        persona: { id: 436, nombre: 'Rene Neira' },
        cotizacion: 590,
      },
    ]);
  });

  it('Nueva Esperanza: mismo correo y mismo teléfono (el nombre con tipeo no alcanza solo)', () => {
    const r = buscarCoincidencias(
      {
        nombre: 'Agrupación nueva espezanza',
        correos: ['Alepaubustos@gmail.com'],
        telefonos: ['+56976214012'],
      },
      [
        cliente({
          id: 'ne',
          name: 'Nueva Esperanza',
          personas: [
            { id: 459, name: 'Sara Acuña', email: null, phone: '+56993985597' },
            {
              id: 456,
              name: 'Nubia Acuña salazar',
              email: 'Alepaubustos@gmail.com',
              phone: '+56976214012',
            },
          ],
          ultimaCotizacion: 614,
        }),
      ],
    );
    expect(r).toHaveLength(1);
    expect(r[0].motivos).toEqual(['correo', 'telefono']);
    expect(r[0].persona).toEqual({ id: 456, nombre: 'Nubia Acuña salazar' });
  });

  it('Universidad del Bío-Bío: otra persona, mismo correo de institución', () => {
    const r = buscarCoincidencias(
      {
        nombre: 'Universidad del Bío-Bío',
        correos: ['cmanriquez@ubiobio.cl'],
        telefonos: ['+56994027004'],
      },
      [
        cliente({
          id: 'ubb',
          name: 'Universidad del bio bio Concepción',
          client_type: 'Colegios & Universidades',
          personas: [
            {
              id: 179,
              name: 'Karen Troncoso',
              email: 'ktroncos@ubiobio.cl',
              phone: '+56931111362',
            },
          ],
          ultimaCotizacion: 322,
        }),
      ],
    );
    expect(r).toHaveLength(1);
    expect(r[0].motivos).toEqual(['nombre', 'dominio']);
    expect(r[0].persona).toBeNull();
  });

  it('un correo gratuito no junta a dos personas por el dominio', () => {
    const r = buscarCoincidencias(
      { nombre: 'Fulano de Tal', correos: ['fulano@gmail.com'], telefonos: [] },
      [
        cliente({
          id: 'otro',
          name: 'Mengana Pérez',
          personas: [
            {
              id: 1,
              name: 'Mengana Pérez',
              email: 'mengana@gmail.com',
              phone: null,
            },
          ],
        }),
      ],
    );
    expect(r).toEqual([]);
  });

  it('los correos del propio equipo (relleno de Recepción) no cuentan', () => {
    const r = buscarCoincidencias(
      {
        nombre: 'Cliente Nuevo',
        correos: ['reservas@valledelsolquillon.cl'],
        telefonos: [],
      },
      [
        cliente({
          id: 'x',
          name: 'Otro Cliente',
          email: 'reservas@valledelsolquillon.cl',
        }),
      ],
      ['valledelsolquillon.cl'],
    );
    expect(r).toEqual([]);
  });

  it('otra universidad, otro dominio: sin aviso', () => {
    const r = buscarCoincidencias(
      {
        nombre: 'Universidad de Concepción',
        correos: ['alguien@udec.cl'],
        telefonos: [],
      },
      [
        cliente({
          id: 'ubb',
          name: 'Universidad del bio bio Concepción',
          personas: [
            {
              id: 179,
              name: 'Karen Troncoso',
              email: 'ktroncos@ubiobio.cl',
              phone: null,
            },
          ],
        }),
      ],
    );
    expect(r).toEqual([]);
  });

  it('primero lo que calza por correo; como máximo tres', () => {
    const clientes = [
      cliente({ id: 'n1', name: 'Club Nueva Esperanza Sur' }),
      cliente({
        id: 'c1',
        name: 'Otra Cosa',
        personas: [
          { id: 9, name: 'Ana', email: 'ana@ejemplo.cl', phone: null },
        ],
      }),
      cliente({ id: 'n2', name: 'Nueva Esperanza Norte' }),
      cliente({ id: 'n3', name: 'Agrupación Nueva Esperanza' }),
    ];
    const r = buscarCoincidencias(
      { nombre: 'Nueva Esperanza', correos: ['ana@ejemplo.cl'], telefonos: [] },
      clientes,
    );
    expect(r).toHaveLength(3);
    expect(r[0].cliente_id).toBe('c1');
  });
});
