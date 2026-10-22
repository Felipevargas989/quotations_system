import type { Catalogo } from '../../../generar/catalogo';

// Un pedazo del catálogo REAL de Valle del Sol (medido el 17-10-2026), con
// sus ids y precios: Cena Nivel 1, alojamiento por temporada, desayuno
// Estándar, la sección fija de cada comida y dos salones.
export const catalogoDePrueba = (): Catalogo => {
  const servicios = new Map(
    [
      { id: 2054, nombre: 'Pan acompañado de pebre', precio: 600 },
      { id: 2205, nombre: 'Bebida libre consumo', precio: 1300 },
      { id: 2033, nombre: 'Té twinings, café, leche', precio: 3000 },
      { id: 3001, nombre: 'Pollo arvejado', precio: 6000 },
      { id: 3002, nombre: 'Arroz primavera', precio: 1500 },
      { id: 3003, nombre: 'Mousse de chocolate', precio: 1500 },
      { id: 3004, nombre: 'Plateada', precio: 9000 },
      { id: 3005, nombre: 'Puré rústico', precio: 2000 },
      { id: 3006, nombre: 'Tiramisú', precio: 4000 },
      { id: 3101, nombre: 'Huevos revueltos', precio: 2500 },
      { id: 3102, nombre: 'Pan amasado y mermelada', precio: 3200 },
      { id: 2154, nombre: 'Alojamiento temporada baja', precio: 18000 },
      { id: 2244, nombre: 'Alojamiento temporada media', precio: 22000 },
      { id: 2155, nombre: 'Alojamiento temporada alta', precio: 28000 },
      { id: 4001, nombre: 'Nuggets con papas', precio: 5000 },
      { id: 5001, nombre: 'Almuerzo Sernatur', precio: 7000 },
    ].map((s) => [s.id, s]),
  );
  return {
    categorias: [
      {
        id: 10,
        nombre: 'Desayuno',
        orden: 1,
        sueltos: [2033, 3101, 3102],
        seccionFija: [2033],
        secciones: [
          { nombre: 'Salado', servicios: [3101] },
          { nombre: 'Dulces', servicios: [3102] },
        ],
      },
      {
        id: 30,
        nombre: 'Cena',
        orden: 6,
        sueltos: [2054, 2205, 3001, 3002, 3003, 3004, 3005, 3006],
        seccionFija: [2054, 2205],
        secciones: [
          { nombre: 'Entradas', servicios: [] },
          { nombre: 'Principales', servicios: [3001, 3004] },
          { nombre: 'Guarniciones', servicios: [3002, 3005] },
          { nombre: 'Postres', servicios: [3003, 3006] },
        ],
      },
      {
        id: 31,
        nombre: 'Cena niños',
        orden: 7,
        sueltos: [2054, 2205, 4001],
        seccionFija: [2054, 2205],
        secciones: [{ nombre: 'Principales', servicios: [4001] }],
      },
      {
        id: 90,
        nombre: 'Servicios de Ingreso',
        orden: 13,
        sueltos: [2154, 2244, 2155],
        seccionFija: [],
        secciones: [{ nombre: 'Alojamiento', servicios: [2154, 2244, 2155] }],
      },
      {
        id: 99,
        nombre: 'Sernatur - almuerzo',
        orden: 17,
        sueltos: [5001],
        seccionFija: [],
        secciones: [],
      },
    ],
    menus: [
      {
        id: 94,
        nombre: 'Pollo arvejado - arroz',
        categoria: 'Cena',
        nivel: 'Nivel 1',
        ordenNivel: 1,
        // Sin la sección fija: el armado la repone (como el cotizador).
        items: [
          { id: 3001, nombre: 'Pollo arvejado', precio: 6000, cantidad: 1 },
          { id: 3002, nombre: 'Arroz primavera', precio: 1500, cantidad: 1 },
          {
            id: 3003,
            nombre: 'Mousse de chocolate',
            precio: 1500,
            cantidad: 1,
          },
        ],
      },
      {
        id: 120,
        nombre: 'Plateada - puré',
        categoria: 'Cena',
        nivel: 'Nivel 2',
        ordenNivel: 2,
        items: [
          { id: 3004, nombre: 'Plateada', precio: 9000, cantidad: 1 },
          { id: 3005, nombre: 'Puré rústico', precio: 2000, cantidad: 1 },
          { id: 3006, nombre: 'Tiramisú', precio: 4000, cantidad: 1 },
          {
            id: 2054,
            nombre: 'Pan acompañado de pebre',
            precio: 600,
            cantidad: 1,
          },
          {
            id: 2205,
            nombre: 'Bebida libre consumo',
            precio: 1300,
            cantidad: 1,
          },
        ],
      },
      {
        id: 47,
        nombre: 'Huevos - pan amasado',
        categoria: 'Desayuno',
        nivel: 'Estandar',
        ordenNivel: 1,
        items: [
          { id: 3101, nombre: 'Huevos revueltos', precio: 2500, cantidad: 1 },
          {
            id: 3102,
            nombre: 'Pan amasado y mermelada',
            precio: 3200,
            cantidad: 1,
          },
          {
            id: 2033,
            nombre: 'Té twinings, café, leche',
            precio: 3000,
            cantidad: 1,
          },
        ],
      },
    ],
    servicios,
    fijos: new Map([
      [39, { id: 39, nombre: 'Salón auditorio día completo', precio: 250000 }],
      [40, { id: 40, nombre: 'Salón cúpula día completo', precio: 400000 }],
    ]),
    paquetes: [
      {
        id: 12,
        nombre: 'Salón día completo',
        grupo: 'Salones',
        ordenGrupo: 3,
        menus: [47],
        sueltos: [],
        fijos: [{ id: 39, cantidad: 1 }],
      },
    ],
  };
};
