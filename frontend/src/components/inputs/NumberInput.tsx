import React, {
  forwardRef,
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import { NumberInputProps } from "./types";

// Campo numérico con la norma es-CL (rediseño 21-07-2026, definido con
// Felipe tras el bug del "$1"):
//
// - formatThousands: el usuario teclea DÍGITOS y el campo pone los puntos
//   de miles EN VIVO; los puntos que escriba el usuario se ignoran (el
//   "1.00.000" que se leía como $1 ya no puede existir). La coma queda
//   reservada para decimales.
// - La pantalla y el valor interno son SIEMPRE el mismo número: onChange
//   se dispara con cada tecla, incluso si el valor viola min/max.
// - Violación de min/max: el campo vibra + borde rojo + mensaje
//   formateado. NO se ajusta solo ni se congela: el usuario corrige, y
//   es el formulario padre quien bloquea su botón mientras tanto.
// - Sin formatThousands (campos chicos: contenido 1,5, porcentajes) se
//   mantiene el parseo clásico: coma o punto decimal, "1.500" = miles.

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
    const [shaking, setShaking] = useState(false);
    const isFocusedRef = useRef(false);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const pendingCaretRef = useRef<number | null>(null);

    const setRefs = (el: HTMLInputElement | null) => {
      inputRef.current = el;
      if (typeof ref === "function") ref(el);
      else if (ref) ref.current = el;
    };

    const fmtCL = (num: number): string => {
      if (isNaN(num)) return "";
      return num.toLocaleString("es-CL", { maximumFractionDigits: 6 });
    };

    // ---- formatThousands: normalización en vivo ----
    // Conserva dígitos y la primera coma; agrupa el entero de a 3 con
    // puntos. Devuelve el texto a mostrar y el número limpio a parsear.
    const normalizeLive = (raw: string): { display: string; clean: string } => {
      let digitsAndComma = "";
      let commaSeen = false;
      for (const ch of raw) {
        if (/\d/.test(ch)) digitsAndComma += ch;
        else if (ch === "," && !commaSeen) {
          digitsAndComma += ",";
          commaSeen = true;
        }
      }
      const [intRaw, decRaw = ""] = digitsAndComma.split(",");
      const intPart = intRaw.replace(/^0+(?=\d)/, "");
      const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
      const display = commaSeen ? `${grouped},${decRaw}` : grouped;
      const clean = (intPart || "0") + (commaSeen ? `.${decRaw}` : "");
      return { display, clean: digitsAndComma === "" ? "" : clean };
    };

    const countSig = (s: string) => (s.match(/[\d,]/g) || []).length;
    const posAfterSig = (s: string, n: number) => {
      if (n <= 0) return 0;
      let seen = 0;
      for (let i = 0; i < s.length; i++) {
        if (/[\d,]/.test(s[i])) {
          seen++;
          if (seen === n) return i + 1;
        }
      }
      return s.length;
    };

    // ---- parseo clásico (campos sin formatThousands) ----
    const parseClassic = (displayVal: string): number | undefined => {
      const raw = displayVal.trim();
      if (!raw) return undefined;
      let clean = raw;
      if (clean.includes(",")) {
        clean = clean.replace(/\./g, "").replace(",", ".");
      } else {
        const parts = clean.split(".");
        const isGrouping =
          parts.length > 1 && parts.slice(1).every((p) => p.length === 3);
        if (isGrouping) clean = parts.join("");
      }
      const num = parseFloat(clean);
      return isNaN(num) ? undefined : num;
    };

    // Sincronizar desde el valor externo (solo sin foco)
    useEffect(() => {
      if (isFocusedRef.current) return;
      if (value !== undefined && value !== null) {
        setDisplayValue(fmtCL(value));
      } else {
        setDisplayValue("");
      }
    }, [value, formatThousands]);

    // Reponer el cursor tras el reformateo en vivo
    useLayoutEffect(() => {
      if (
        pendingCaretRef.current !== null &&
        inputRef.current &&
        isFocusedRef.current
      ) {
        inputRef.current.setSelectionRange(
          pendingCaretRef.current,
          pendingCaretRef.current,
        );
        pendingCaretRef.current = null;
      }
    }, [displayValue]);

    const triggerShake = () => {
      setShaking(false);
      requestAnimationFrame(() => setShaking(true));
    };

    // Chequeo de rango: avisa (vibración + mensaje formateado) pero NUNCA
    // altera ni congela el valor — el padre decide bloquear su botón.
    const rangeCheck = (num: number | undefined) => {
      if (num === undefined) {
        setError(null);
        return;
      }
      if (max !== undefined && num > max) {
        setError(`El máximo es ${fmtCL(max)}`);
        triggerShake();
        return;
      }
      if (min !== undefined && num < min) {
        setError(`El mínimo es ${fmtCL(min)}`);
        triggerShake();
        return;
      }
      setError(null);
    };

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const raw = event.target.value;

      if (formatThousands) {
        const caret = event.target.selectionStart ?? raw.length;
        const sig = countSig(raw.slice(0, caret));
        const { display, clean } = normalizeLive(raw);
        setDisplayValue(display);
        pendingCaretRef.current = posAfterSig(display, sig);
        const num = clean === "" ? undefined : parseFloat(clean);
        const parsed = num !== undefined && isNaN(num) ? undefined : num;
        rangeCheck(parsed);
        onChange?.(parsed);
        return;
      }

      setDisplayValue(raw);
      const parsed = parseClassic(raw);
      rangeCheck(parsed);
      onChange?.(parsed);
    };

    const handleFocus = (event: React.FocusEvent<HTMLInputElement>) => {
      isFocusedRef.current = true;
      // Seleccionar todo al entrar: escribir reemplaza sin tener que borrar.
      event.target.select();
    };

    const handleBlur = () => {
      isFocusedRef.current = false;
      // Al salir, la pantalla muestra el número real formateado (el mismo
      // que viajó por onChange). El aviso de rango se conserva visible.
      if (displayValue.trim() !== "") {
        const parsed = formatThousands
          ? parseFloat(normalizeLive(displayValue).clean || "NaN")
          : parseClassic(displayValue);
        if (parsed !== undefined && !isNaN(parsed)) {
          setDisplayValue(fmtCL(parsed));
        }
      }
    };

    const baseClasses = `
      w-full px-3 py-2 border rounded-lg
      focus:ring-2 focus:ring-blue-500 focus:border-transparent
      transition-colors duration-200
      ${error ? "border-red-500" : "border-gray-300"}
      ${disabled ? "bg-gray-100 cursor-not-allowed opacity-60" : "bg-white"}
    `.trim();

    const inputClasses = `${baseClasses} ${className} ${
      shaking ? "ni-shake" : ""
    }`;

    return (
      <div className="w-full">
        <input
          ref={setRefs}
          type="text"
          inputMode="decimal"
          id={id}
          name={name}
          value={displayValue}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onAnimationEnd={() => setShaking(false)}
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
