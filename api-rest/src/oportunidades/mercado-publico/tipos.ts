// Lo que devuelven las dos APIs de Mercado Público, solo con los campos que
// el radar usa. Todo es opcional a propósito: la API cambia sin aviso y una
// fila a medias no puede botar la corrida. La respuesta completa se guarda
// igual en mp_procesos.detalle.

/** Una fila de `licitaciones.json?estado=activas`: liviana, sin región. */
export type LicitacionListada = {
  CodigoExterno?: string;
  Nombre?: string;
  CodigoEstado?: number;
  FechaCierre?: string | null;
};

/** El detalle de `licitaciones.json?codigo=`. */
export type LicitacionDetalle = {
  CodigoExterno?: string;
  Nombre?: string;
  Descripcion?: string | null;
  Estado?: string | null;
  CodigoEstado?: number;
  MontoEstimado?: number | null;
  Moneda?: string | null;
  Comprador?: {
    CodigoOrganismo?: string | null;
    NombreOrganismo?: string | null;
    NombreUnidad?: string | null;
    ComunaUnidad?: string | null;
    RegionUnidad?: string | null;
  } | null;
  Fechas?: Record<string, string | null> | null;
  Items?: {
    Listado?: Array<{
      NombreProducto?: string | null;
      Descripcion?: string | null;
      Categoria?: string | null;
      Cantidad?: number | null;
      UnidadMedida?: string | null;
      Adjudicacion?: {
        RutProveedor?: string | null;
        NombreProveedor?: string | null;
        Cantidad?: number | null;
        MontoUnitario?: number | null;
      } | null;
    }>;
  } | null;
  Adjudicacion?: {
    Tipo?: number | null;
    Fecha?: string | null;
    Numero?: string | null;
    NumeroOferentes?: number | null;
    UrlActa?: string | null;
  } | null;
};

/** Una fila del listado de Compra Ágil (API v2). */
export type CompraAgilListada = {
  codigo?: string;
  nombre?: string;
  institucion?: {
    nombre_region?: string | null;
    organismo_comprador?: string | null;
    comuna?: string | null;
  } | null;
  montos?: { monto_disponible_clp?: number | null } | null;
  fechas?: Record<string, string | null> | null;
  estado?: { glosa?: string | null } | null;
};

/** El detalle de una Compra Ágil (API v2). */
export type CompraAgilDetalle = {
  descripcion?: string | null;
  entrega?: { direccion_entrega?: string | null } | null;
  productos_solicitados?: Array<{
    codigo_producto?: string | number | null;
    nombre?: string | null;
    descripcion?: string | null;
  }> | null;
};

/** Lo que el radar guarda en mp_procesos. */
export type ProcesoMp = {
  codigo: string;
  tipo: 'licitacion' | 'compra_agil';
  nombre: string;
  descripcion: string | null;
  organismo: string | null;
  organismo_codigo: string | null;
  unidad: string | null;
  region: string | null;
  comuna: string | null;
  monto: number | null;
  moneda: string | null;
  estado: string | null;
  fecha_publicacion: string | null;
  fecha_cierre: string | null;
  fechas: Record<string, string | null>;
  productos: Array<{
    nombre: string;
    descripcion?: string | null;
    cantidad?: number | null;
  }>;
  adjudicacion: Record<string, unknown> | null;
  detalle: unknown;
};
