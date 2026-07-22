import React, {
  forwardRef,
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import { NumberInputProps } from "./types";

// Campo numérico con la norma es-CL — UN SOLO FORMATO DECIMAL EN TODO
// EL SISTEMA (regla de Felipe, 21-07-2026): la COMA es el único
// decimal; el punto nunca es ambiguo.
//
// - formatThousands (campos de PLATA): el usuario teclea DÍGITOS y el
//   campo pone los puntos de miles EN VIVO; los puntos que escriba el
//   usuario se IGNORAN (el "1.00.000" que se leía como $1 no puede
//   existir). La coma queda reservada para decimales.
// - modo clásico (personas, porcentajes, contenido, cantidades): si el
//   usuario escribe un PUNTO se convierte en COMA al instante
//   ("1.5" → "1,5"); solo vale el primer separador. Estos campos NUNCA
//   agrupan miles, así "1.500" ya no puede significar mil quinientos:
//   es 1,5 (adiós al parseo ambiguo antiguo).
// - La pantalla y el valor interno son SIEMPRE el mismo número: onChange
//   se dispara con cada tecla, incluso si el valor viola min/max.
// - Violación de min/max: el campo vibra + borde rojo + mensaje
//   formateado. NO se ajusta solo ni se congela: el usuario corrige, y
//   es el formulario padre quien bloquea su botón mientras tanto.
// - onCommit: entrega el número final al salir del campo (celdas con
//   autoguardado onBlur, ej. cantidades de recetas).

const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  (
    {
      value,
      onChange,
      min,
      max,
      formatThousands = false,
      currency = false,
      placeholder,
      name,
      id,
      className = "",
      disabled = false,
      required = false,
      onCommit,
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

    // Formato de pantalla: plata con puntos de miles; clásico SIN
    // agrupación (un "1.500" nunca vuelve a ser ambiguo en pantalla).
    const fmtCL = (num: number): string => {
      if (isNaN(num)) return "";
      return num.toLocaleString("es-CL", {
        maximumFractionDigits: 6,
        useGrouping: formatThousands,
      });
    };

    // Mensajes de rango: siempre con miles (son montos legibles).
    const fmtMsg = (num: number): string =>
      isNaN(num)
        ? ""
        : num.toLocaleString("es-CL", { maximumFractionDigits: 6 });

    // ---- formatThousands (plata): normalización en vivo ----
    // Conserva dígitos y la primera coma; agrupa el entero de a 3 con
    // puntos. Los puntos ESCRITOS se ignoran.
    const normalizeLiveMiles = (
      raw: string,
    ): { display: string; clean: string } => {
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

    // ---- modo clásico: normalización en vivo ----
    // Dígitos + el PRIMER separador ('.' o ',') mostrado como coma;
    // separadores posteriores se ignoran. Sin agrupación de miles.
    const normalizeLiveClassic = (
      raw: string,
    ): { display: string; clean: string } => {
      let digitsAndComma = "";
      let sepSeen = false;
      for (const ch of raw) {
        if (/\d/.test(ch)) digitsAndComma += ch;
        else if ((ch === "," || ch === ".") && !sepSeen) {
          digitsAndComma += ",";
          sepSeen = true;
        }
      }
      const [intRaw, decRaw = ""] = digitsAndComma.split(",");
      const intPart = intRaw.replace(/^0+(?=\d)/, "");
      const display = sepSeen ? `${intPart},${decRaw}` : intPart;
      const clean = (intPart || "0") + (sepSeen ? `.${decRaw}` : "");
      return { display, clean: digitsAndComma === "" ? "" : clean };
    };

    const normalizeLive = formatThousands
      ? normalizeLiveMiles
      : normalizeLiveClassic;

    // Caracteres "significativos" para reponer el cursor tras el
    // reformateo. En clásico el punto escrito cuenta (sobrevive como
    // coma); en plata el punto escrito se ignora y no cuenta.
    const sigRe = formatThousands ? /[\d,]/ : /[\d,.]/;
    const countSig = (s: string) => {
      let n = 0;
      let sepSeen = false;
      for (const ch of s) {
        if (/\d/.test(ch)) n++;
        else if (sigRe.test(ch)) {
          // separadores: en clásico solo el PRIMERO sobrevive
          if (formatThousands) {
            if (ch === ",") n++;
          } else if (!sepSeen) {
            n++;
            sepSeen = true;
          }
        }
      }
      return n;
    };
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
      const pref = currency ? "$" : "";
      if (max !== undefined && num > max) {
        setError(`El máximo es ${pref}${fmtMsg(max)}`);
        triggerShake();
        return;
      }
      if (min !== undefined && num < min) {
        setError(`El mínimo es ${pref}${fmtMsg(min)}`);
        triggerShake();
        return;
      }
      setError(null);
    };

    const parseClean = (clean: string): number | undefined => {
      if (clean === "") return undefined;
      const num = parseFloat(clean);
      return isNaN(num) ? undefined : num;
    };

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const raw = event.target.value;
      const caret = event.target.selectionStart ?? raw.length;
      const sig = countSig(raw.slice(0, caret));

      const { display, clean } = normalizeLive(raw);
      setDisplayValue(display);
      pendingCaretRef.current = posAfterSig(display, sig);
      const parsed = parseClean(clean);
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
      let parsed: number | undefined;
      if (displayValue.trim() !== "") {
        parsed = parseClean(normalizeLive(displayValue).clean);
        if (parsed !== undefined) {
          setDisplayValue(fmtCL(parsed));
        }
      }
      onCommit?.(parsed);
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
