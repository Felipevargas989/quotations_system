import React, { forwardRef, useState, useEffect, useRef } from "react";
import { NumberInputProps } from "./types";

const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  (
    {
      value,
      onChange,
      min,
      max,
      formatThousands = false,
      placeholder,
      name,
      id,
      className = "",
      disabled = false,
      required = false,
      ...props
    },
    ref,
  ) => {
    const [displayValue, setDisplayValue] = useState<string>("");
    const [error, setError] = useState<string | null>(null);
    // Mientras el campo tiene el foco, NUNCA se re-formatea: lo que el
    // usuario escribe es exactamente lo que se parsea. El formato bonito
    // se aplica recién al salir (evita "3.927" + "0" → "3.9270" decimal).
    const isFocusedRef = useRef(false);

    // Norma general: formato chileno (miles con punto, decimal con coma).
    const formatNumberForDisplay = (num: number): string => {
      if (isNaN(num)) return "";
      return num.toLocaleString("es-CL", { maximumFractionDigits: 6 });
    };

    // Acepta coma O punto como decimal: "1,5" y "1.5" valen 1,5;
    // "1.500" (agrupación de a 3) vale mil quinientos.
    const parseDisplayValue = (displayVal: string): number | undefined => {
      const raw = displayVal.trim();
      if (!raw) return undefined;

      let clean = raw;
      if (clean.includes(",")) {
        // Con coma: la coma es el decimal, los puntos son miles.
        clean = clean.replace(/\./g, "").replace(",", ".");
      } else {
        // Sin coma: puntos que agrupan de a 3 son miles; si no, decimal.
        const parts = clean.split(".");
        const isGrouping =
          parts.length > 1 && parts.slice(1).every((p) => p.length === 3);
        if (isGrouping) clean = parts.join("");
      }
      const num = parseFloat(clean);

      return isNaN(num) ? undefined : num;
    };

    // Initialize display value (solo cuando el campo NO está en edición)
    useEffect(() => {
      if (isFocusedRef.current) return;
      if (value !== undefined && value !== null) {
        setDisplayValue(formatNumberForDisplay(value));
      } else {
        setDisplayValue("");
      }
    }, [value, formatThousands]);

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const inputValue = event.target.value;

      // Update display state immediately
      setDisplayValue(inputValue);

      // Parse the value
      const numericValue = parseDisplayValue(inputValue);

      // Clear previous error
      setError(null);

      // Validate min/max constraints and show error
      if (numericValue !== undefined) {
        if (min !== undefined && numericValue < min) {
          setError(`El valor mínimo es ${min}`);
          return; // Don't update if below minimum
        }
        if (max !== undefined && numericValue > max) {
          setError(`El valor máximo es ${max}`);
          return; // Don't update if above maximum
        }
      }

      // Call onChange with the parsed value
      onChange?.(numericValue);
    };

    const handleFocus = (event: React.FocusEvent<HTMLInputElement>) => {
      isFocusedRef.current = true;
      // Seleccionar todo al entrar: escribir reemplaza sin tener que borrar.
      event.target.select();
    };

    const handleBlur = () => {
      isFocusedRef.current = false;
      // Clear error on blur
      setError(null);

      // Format the display value on blur if it's not empty
      if (displayValue.trim() !== "") {
        const numericValue = parseDisplayValue(displayValue);
        if (numericValue !== undefined) {
          setDisplayValue(formatNumberForDisplay(numericValue));
        }
      }
    };

    // Base input classes
    const baseClasses = `
      w-full px-3 py-2 border rounded-lg
      focus:ring-2 focus:ring-blue-500 focus:border-transparent
      transition-colors duration-200
      ${error ? "border-red-500" : "border-gray-300"}
      ${disabled ? "bg-gray-100 cursor-not-allowed opacity-60" : "bg-white"}
    `.trim();

    const inputClasses = `${baseClasses} ${className}`;

    return (
      <div className="w-full">
        <input
          ref={ref}
          type="text"
          id={id}
          name={name}
          value={displayValue}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          className={inputClasses}
          {...props}
        />
        {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
      </div>
    );
  },
);

NumberInput.displayName = "NumberInput";

export default NumberInput;
