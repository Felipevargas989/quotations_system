// EL ENLACE QUE DESCARGA (06-11-2026, doc 19 §9.22): Supabase baja el
// archivo en vez de mostrarlo con `download=`, y con un valor, con ese
// nombre. Lo usan el visor de la casa (`FileViewLink`, su «Descargar») y la
// descarga directa de la lista de Facturación (`descargarArchivo`).

export const conDescarga = (enlace: string, nombre = ""): string =>
  `${enlace}${enlace.includes("?") ? "&" : "?"}download=${encodeURIComponent(nombre)}`;
