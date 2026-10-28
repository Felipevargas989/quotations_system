import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { filasDelCsv, registrosDelCsv } from '../datos-abiertos/csv';
import { entradasDelZip, leerEntrada } from '../datos-abiertos/zip';
import { zipDePrueba } from './datos-abiertos-de-prueba';

let carpeta: string;
beforeAll(async () => {
  carpeta = await mkdtemp(join(tmpdir(), 'zip-de-prueba-'));
});
afterAll(async () => {
  await rm(carpeta, { recursive: true, force: true });
});

const contenido = async (flujo: Readable): Promise<string> => {
  const partes: Buffer[] = [];
  for await (const p of flujo) partes.push(p as Buffer);
  return Buffer.concat(partes).toString('latin1');
};

const todas = async <T>(fuente: AsyncIterable<T>): Promise<T[]> => {
  const r: T[] = [];
  for await (const x of fuente) r.push(x);
  return r;
};

/** El mismo contenido, entregado de a `n` bytes. */
const deAPedazos = (b: Buffer, n: number) =>
  Readable.from(
    Array.from({ length: Math.ceil(b.length / n) }, (_, i) =>
      b.subarray(i * n, (i + 1) * n),
    ),
  );

describe('Leer un ZIP de ChileCompra por partes (decisión 101)', () => {
  it('lista lo que trae y descomprime cada entrada', async () => {
    const ruta = join(carpeta, 'normal.zip');
    const csv = 'a;b\n1;2\n'.repeat(5000);
    await writeFile(
      ruta,
      zipDePrueba([
        { nombre: 'COT1_2025-10.csv', contenido: Buffer.from(csv) },
        { nombre: 'leeme.txt', contenido: Buffer.from('hola'), guardado: true },
      ]),
    );
    const entradas = await entradasDelZip(ruta);
    expect(entradas.map((e) => [e.nombre, e.metodo, e.tamano])).toEqual([
      ['COT1_2025-10.csv', 8, csv.length],
      ['leeme.txt', 0, 4],
    ]);
    expect(await contenido(await leerEntrada(ruta, entradas[0]))).toBe(csv);
    expect(await contenido(await leerEntrada(ruta, entradas[1]))).toBe('hola');
  });

  it('también lee el formato ZIP64, por si un mes pasa los 4 GB', async () => {
    const ruta = join(carpeta, 'zip64.zip');
    await writeFile(
      ruta,
      zipDePrueba(
        [
          { nombre: 'uno.csv', contenido: Buffer.from('x;y\n') },
          { nombre: 'dos.csv', contenido: Buffer.from('z;w\n') },
        ],
        { zip64: true },
      ),
    );
    const entradas = await entradasDelZip(ruta);
    expect(entradas.map((e) => e.nombre)).toEqual(['uno.csv', 'dos.csv']);
    expect(await contenido(await leerEntrada(ruta, entradas[1]))).toBe('z;w\n');
  });

  it('un archivo que no es ZIP se rechaza con un mensaje claro', async () => {
    const ruta = join(carpeta, 'no-es-zip.zip');
    await writeFile(ruta, Buffer.from('<Error>BlobNotFound</Error>'));
    await expect(entradasDelZip(ruta)).rejects.toThrow('no es un ZIP');
  });
});

describe('Leer los CSV de ChileCompra (decisión 101)', () => {
  const CSV = Buffer.from(
    '"Nombre";"Descripcion";"Monto"\r\n' +
      '"Cena ""de gala""";"línea 1\r\nlínea 2";"1,5e+06"\r\n' +
      'sin comillas;;3\r\n',
    'latin1',
  );
  const ESPERADO = [
    ['Nombre', 'Descripcion', 'Monto'],
    ['Cena "de gala"', 'línea 1\r\nlínea 2', '1,5e+06'],
    ['sin comillas', '', '3'],
  ];

  it('separa por punto y coma y respeta comillas, comillas dobladas y saltos de línea', async () => {
    expect(await todas(filasDelCsv(deAPedazos(CSV, CSV.length)))).toEqual(
      ESPERADO,
    );
  });

  it('da lo mismo leído entero que de a un byte o de a siete', async () => {
    expect(await todas(filasDelCsv(deAPedazos(CSV, 1)))).toEqual(ESPERADO);
    expect(await todas(filasDelCsv(deAPedazos(CSV, 7)))).toEqual(ESPERADO);
  });

  it('lee Windows-1252: tildes, eñes y comillas tipográficas', async () => {
    const bytes = Buffer.from([
      ...Buffer.from('"Nombre"\n"', 'latin1'),
      0x93,
      ...Buffer.from('Cena Día del Funcionario, Ñuble', 'latin1'),
      0x94,
      ...Buffer.from('"\n', 'latin1'),
    ]);
    const [, [nombre]] = await todas(filasDelCsv(deAPedazos(bytes, 3)));
    expect(nombre).toBe('“Cena Día del Funcionario, Ñuble”');
  });

  it('arma cada fila con el nombre de su columna, y la última sin salto también cuenta', async () => {
    const csv = Buffer.from(
      '"Codigo";"Region"\n"A-1";"Región del Biobío "\n"A-2";',
      'latin1',
    );
    expect(await todas(registrosDelCsv(deAPedazos(csv, 5)))).toEqual([
      { Codigo: 'A-1', Region: 'Región del Biobío ' },
      { Codigo: 'A-2', Region: '' },
    ]);
  });
});
