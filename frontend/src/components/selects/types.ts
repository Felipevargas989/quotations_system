export interface SelectOption {
  value: string;
  label: string;
  // Rótulo de sección: las opciones con el mismo `group` salen juntas
  // bajo un encabezado (13-08). Sin esto, el buscador de ítems del
  // cotizador —que agrupa por secciones de la carta— no podía usar la
  // pieza de la casa y quedó escrito a mano.
  group?: string;
  // Apunte gris a la derecha: precio, categoría, unidad…
  hint?: string;
  // Punto de color a la izquierda (estados, semáforos).
  dotClass?: string;
}

export interface SelectWithSearchProps {
  readonly options: SelectOption[];
  readonly value?: string;
  readonly onChange: (value: string) => void;
  readonly placeholder?: string;
  readonly searchPlaceholder?: string;
  readonly noResultsText?: string;
  readonly disabled?: boolean;
  readonly required?: boolean;
  // Deja la lista abierta tras elegir: para los selectores que AGREGAN
  // (ítems, insumos) en vez de fijar un valor. Por omisión se cierra.
  readonly keepOpenOnSelect?: boolean;
}
