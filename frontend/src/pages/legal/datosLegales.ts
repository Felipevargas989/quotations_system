// LOS DATOS DE LAS PÁGINAS LEGALES (18-09-2026). Van en su propio archivo
// (sin componentes) para que PaginaLegal exporte solo componentes y el
// recargado en caliente de Vite siga funcionando (react-refresh).
// Decisiones de Felipe del 18-09: RUT y razón social, domicilio en
// Quillón, hola@ como contacto, 90 días de conservación, tribunales de
// Quillón.

export const EMPRESA = {
  razonSocial: "EVENTIA SpA",
  rut: "78.269.115-5",
  domicilio: "Quillón, Región de Ñuble, Chile",
  correo: "hola@eventi-app.com",
  ciudadTribunales: "Quillón",
};

export const ULTIMA_ACTUALIZACION = "18 de septiembre de 2026";

/** Cuánto se conservan los datos de una cuenta pausada o cancelada
 *  antes de poder eliminarse (decisión de Felipe, 18-09). */
export const DIAS_DE_CONSERVACION = 90;
