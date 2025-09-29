import React, { forwardRef, useState, useEffect } from "react";
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

    // Format number for display with thousand separators
    const formatNumberForDisplay = (num: number): string => {
      if (isNaN(num)) return "";

      let formatted = num.toString();

      if (formatThousands && num >= 1000) {
        const parts = formatted.split(".");
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
        formatted = parts.join(",");
      }

      return formatted;
    };

    // Parse display value back to number
    const parseDisplayValue = (displayVal: string): number | undefined => {
      if (!displayVal.trim()) return undefined;

      // Remove thousand separators and replace comma with dot for decimal
      const cleanValue = displayVal.replace(/\./g, "").replace(",", ".");
      const num = parseFloat(cleanValue);

      return isNaN(num) ? undefined : num;
    };

    // Initialize display value
    useEffect(() => {
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

    const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
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
