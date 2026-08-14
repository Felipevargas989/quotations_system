// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import RutInput from "./RutInput";

// La limpieza automática de testing-library solo se engancha sola con
// `globals: true`, y este proyecto no lo usa.
afterEach(cleanup);

/** Un envoltorio con estado, como lo usa el formulario de verdad. */
function Campo({
  onCambio,
  errorExterno = null,
  inicial = "",
}: {
  onCambio?: (rut: string, valido: boolean) => void;
  errorExterno?: string | null;
  inicial?: string;
}) {
  const [rut, setRut] = useState(inicial);
  return (
    <RutInput
      value={rut}
      errorExterno={errorExterno}
      onChange={(v, ok) => {
        setRut(v);
        onCambio?.(v, ok);
      }}
    />
  );
}

describe("Los puntos se ponen solos", () => {
  it("se teclean números y aparece el RUT armado", async () => {
    const user = userEvent.setup();
    render(<Campo />);
    const campo = screen.getByRole("textbox");
    await user.type(campo, "70939908");
    expect(campo).toHaveValue("7.093.990-8");
  });

  it("pegar un RUT con puntos funciona igual", async () => {
    const user = userEvent.setup();
    render(<Campo />);
    const campo = screen.getByRole("textbox");
    await user.click(campo);
    await user.paste("17.938.019-6");
    expect(campo).toHaveValue("17.938.019-6");
  });

  it("la k minúscula sube a mayúscula sola", async () => {
    const user = userEvent.setup();
    render(<Campo />);
    const campo = screen.getByRole("textbox");
    await user.type(campo, "19221047k");
    expect(campo).toHaveValue("19.221.047-K");
  });
});

describe("EL CAMPO NUNCA SE COME UN CARÁCTER", () => {
  // Es el defecto clásico de los campos que formatean solos: escribes el
  // último número y desaparece. Se prueba tecla por tecla.
  it("después de cada tecla está todo lo que se escribió", async () => {
    const user = userEvent.setup();
    render(<Campo />);
    const campo = screen.getByRole("textbox") as HTMLInputElement;

    const tecleado = "70939908";
    for (let i = 0; i < tecleado.length; i += 1) {
      await user.type(campo, tecleado[i]);
      const soloSignificativos = campo.value.replace(/[^0-9kK]/g, "");
      expect(soloSignificativos).toBe(tecleado.slice(0, i + 1));
    }
  });

  it("borrar hacia atrás tampoco pierde nada", async () => {
    const user = userEvent.setup();
    render(<Campo />);
    const campo = screen.getByRole("textbox") as HTMLInputElement;
    await user.type(campo, "70939908");
    await user.type(campo, "{backspace}{backspace}");
    expect(campo.value.replace(/[^0-9kK]/g, "")).toBe("709399");
  });
});

describe("Lo que entrega al formulario", () => {
  it("es la forma limpia, no la de la pantalla", async () => {
    const user = userEvent.setup();
    const onCambio = vi.fn();
    render(<Campo onCambio={onCambio} />);
    await user.type(screen.getByRole("textbox"), "70939908");
    // Lo que se ve tiene puntos; lo que viaja, no.
    expect(onCambio).toHaveBeenLastCalledWith("7093990-8", true);
  });

  it("avisa que está malo cuando el dígito no corresponde", async () => {
    const user = userEvent.setup();
    const onCambio = vi.fn();
    render(<Campo onCambio={onCambio} />);
    await user.type(screen.getByRole("textbox"), "70939901");
    expect(onCambio).toHaveBeenLastCalledWith("7093990-1", false);
  });
});

describe("No reta antes de tiempo", () => {
  it("con un solo dígito no dice nada", async () => {
    const user = userEvent.setup();
    render(<Campo />);
    await user.type(screen.getByRole("textbox"), "7");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("pero cuando ya hay suficiente y está malo, avisa", async () => {
    const user = userEvent.setup();
    render(<Campo />);
    await user.type(screen.getByRole("textbox"), "70939901");
    expect(screen.getByRole("alert")).toHaveTextContent(
      /último dígito no corresponde/i,
    );
  });

  it("un RUT bueno no muestra ningún aviso", async () => {
    const user = userEvent.setup();
    render(<Campo />);
    await user.type(screen.getByRole("textbox"), "70939908");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("vacío no reclama: a veces se carga a la persona antes de tener el RUT", async () => {
    const user = userEvent.setup();
    render(<Campo />);
    await user.click(screen.getByRole("textbox"));
    await user.tab();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("El 55.555.555-5", () => {
  it("se rechaza aunque el cálculo dé bien — es el reservado del SII", async () => {
    const user = userEvent.setup();
    render(<Campo />);
    await user.type(screen.getByRole("textbox"), "555555555");
    expect(screen.getByRole("alert")).toHaveTextContent(
      /no es de una persona real/i,
    );
  });
});

describe("El aviso que manda el servidor", () => {
  it("se muestra tal cual, con el nombre de quien ya tiene ese RUT", () => {
    render(
      <Campo
        inicial="17938019-6"
        errorExterno="Ese RUT ya está cargado en Camila Carvajal"
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Ese RUT ya está cargado en Camila Carvajal",
    );
  });

  it("manda sobre el aviso propio: el servidor sabe más", () => {
    render(<Campo inicial="7093990-8" errorExterno="Ese RUT ya existe" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Ese RUT ya existe");
  });
});
