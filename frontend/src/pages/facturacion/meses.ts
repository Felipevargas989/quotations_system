// LOS MESES DE FACTURACIÓN: los comparten «Documentos» y el que elige el
// documento de una nota (doc 19 §9.21).

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** Los últimos 12 meses, del más nuevo al más viejo (AAAA-MM). */
export const ultimosMeses = (hoy = new Date()) =>
  Array.from({ length: 12 }, (_, i) => {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    const valor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return { value: valor, label: `${MESES[d.getMonth()]} ${d.getFullYear()}` };
  });
