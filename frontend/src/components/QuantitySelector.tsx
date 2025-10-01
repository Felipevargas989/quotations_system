import { useState, useEffect } from "react";
import { Minus, Plus } from "lucide-react";

interface QuantitySelectorProps {
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly min?: number;
  readonly max?: number;
  readonly disabled?: boolean;
  readonly className?: string;
}

export default function QuantitySelector({
  value,
  onChange,
  min,
  max,
  disabled = false,
  className = "",
}: QuantitySelectorProps) {
  const [inputValue, setInputValue] = useState(value.toString());
  const [isEditing, setIsEditing] = useState(false);

  // Update input value when prop value changes
  useEffect(() => {
    if (!isEditing) {
      setInputValue(value.toString());
    }
  }, [value, isEditing]);

  const handleDecrease = () => {
    const minValue = min ?? 0;
    const newValue = Math.max(minValue, value - 1);
    if (newValue !== value) {
      onChange(newValue);
    }
  };

  const handleIncrease = () => {
    const maxValue = max ?? Number.MAX_SAFE_INTEGER;
    const newValue = Math.min(maxValue, value + 1);
    if (newValue !== value) {
      onChange(newValue);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);

    // Allow empty input for editing
    if (newValue === "") {
      return;
    }

    // Parse the number
    const numValue = parseInt(newValue, 10);

    // Only update if it's a valid number within bounds
    const minValue = min ?? 0;
    const maxValue = max ?? Number.MAX_SAFE_INTEGER;
    if (!isNaN(numValue) && numValue >= minValue && numValue <= maxValue) {
      onChange(numValue);
    }
  };

  const handleInputBlur = () => {
    setIsEditing(false);

    // If input is empty or invalid, reset to current value
    if (inputValue === "" || isNaN(parseInt(inputValue, 10))) {
      setInputValue(value.toString());
    } else {
      // Ensure the value is within bounds
      const minValue = min ?? 0;
      const maxValue = max ?? Number.MAX_SAFE_INTEGER;
      const numValue = Math.max(
        minValue,
        Math.min(maxValue, parseInt(inputValue, 10)),
      );
      setInputValue(numValue.toString());
      if (numValue !== value) {
        onChange(numValue);
      }
    }
  };

  const handleInputFocus = () => {
    setIsEditing(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleInputBlur();
    } else if (e.key === "Escape") {
      setInputValue(value.toString());
      setIsEditing(false);
    }
  };

  const minValue = min ?? 0;
  const maxValue = max ?? Number.MAX_SAFE_INTEGER;
  const isDecreaseDisabled = disabled || value <= minValue;
  const isIncreaseDisabled = disabled || value >= maxValue;

  return (
    <div className={`flex items-center space-x-1 ${className}`}>
      {/* Decrease button */}
      <button
        type="button"
        onClick={handleDecrease}
        disabled={isDecreaseDisabled}
        className={`
          w-6 h-6 rounded text-xs flex items-center justify-center transition-colors
          ${
            isDecreaseDisabled
              ? "bg-gray-300 text-gray-500 cursor-not-allowed"
              : "bg-gray-200 hover:bg-gray-300 text-gray-700"
          }
        `}
        title="Disminuir cantidad"
      >
        <Minus size={12} />
      </button>

      {/* Quantity input */}
      <input
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onBlur={handleInputBlur}
        onFocus={handleInputFocus}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={`
          w-8 text-center text-sm border-0 bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white rounded px-1
          ${disabled ? "text-gray-500" : "text-gray-900"}
        `}
        min={min}
        max={max}
        title="Cantidad"
      />

      {/* Increase button */}
      <button
        type="button"
        onClick={handleIncrease}
        disabled={isIncreaseDisabled}
        className={`
          w-6 h-6 rounded text-xs flex items-center justify-center transition-colors
          ${
            isIncreaseDisabled
              ? "bg-gray-300 text-gray-500 cursor-not-allowed"
              : "bg-gray-200 hover:bg-gray-300 text-gray-700"
          }
        `}
        title="Aumentar cantidad"
      >
        <Plus size={12} />
      </button>
    </div>
  );
}
