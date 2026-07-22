export interface NumberInputProps {
  /** The current value of the input */
  value: number | undefined;
  /** Callback fired when the value changes */
  onChange?: (value: number | undefined) => void;
  /** The minimum value allowed */
  min?: number;
  /** The maximum value allowed */
  max?: number;
  /** Whether to format the number with thousand separators for display */
  formatThousands?: boolean;
  /** Money field: range messages show the $ sign (es-CL) */
  currency?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** The name attribute for the input */
  name?: string;
  /** The id attribute for the input */
  id?: string;
  /** Additional CSS classes */
  className?: string;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Whether the input is required */
  required?: boolean;
  /** Se dispara al salir del campo con el número final ya parseado
   *  (para celdas con autoguardado onBlur, ej. cantidades de recetas) */
  onCommit?: (value: number | undefined) => void;
}
