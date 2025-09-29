export enum CalculationType {
  FIJO = "fijo",
  VARIABLE_CON_LIMITES = "variable_con_limites",
  FIJO_VARIABLE = "fijo_variable",
}

export const CALCULATION_TYPES_NAMES = {
  [CalculationType.FIJO]: "Fijo",
  [CalculationType.VARIABLE_CON_LIMITES]: "Variable con límites",
  [CalculationType.FIJO_VARIABLE]: "Fijo variable",
};

export const CALCULATION_TYPES_EXPLANATIONS = {
  [CalculationType.FIJO]: "El precio es fijo",
  [CalculationType.VARIABLE_CON_LIMITES]:
    "El precio es variable por persona pero tiene un precio mínimo y máximo",
  [CalculationType.FIJO_VARIABLE]:
    "El precio se calcula como la suma del precio fijo más el precio variable por persona",
};
