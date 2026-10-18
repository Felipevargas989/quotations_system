// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import BotonSeguimientoIA from "./BotonSeguimientoIA";
import ResultadosDeSeguimiento from "./ResultadosDeSeguimiento";

// «✉ Generar seguimiento» (17-10-2026, doc 18): el botón chico de la
// tarjeta y de la ficha, y el panel de lo que salió. Nada se envía: el
// borrador se abre en Outlook. Datos de prueba.

afterEach(cleanup);

const borrador = {
  id: "q607",
  numero: 607,
  accion: "borrador" as const,
  detalle: "borrador listo en contacto@: pregunta si sigue en pie la fecha",
  enlace: "https://outlook.office365.com/owa/?ItemID=abc",
};

describe("BotonSeguimientoIA", () => {
  it("apretarlo pide el seguimiento sin abrir la ficha que lo contiene", () => {
    const onGenerar = vi.fn();
    const alAbrirFicha = vi.fn();
    render(
      <div onClick={alAbrirFicha}>
        <BotonSeguimientoIA
          trabajando={false}
          ocupado={false}
          resultado={null}
          onGenerar={onGenerar}
        />
      </div>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Generar seguimiento/ }),
    );
    expect(onGenerar).toHaveBeenCalledTimes(1);
    expect(alAbrirFicha).not.toHaveBeenCalled();
  });

  it("mientras la IA escribe otro, no se puede apretar", () => {
    render(
      <BotonSeguimientoIA
        trabajando={false}
        ocupado
        resultado={null}
        onGenerar={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: /Generar seguimiento/ }),
    ).toBeDisabled();
  });

  it("con el borrador listo, se vuelve el enlace a Outlook", () => {
    render(
      <BotonSeguimientoIA
        trabajando={false}
        ocupado={false}
        resultado={borrador}
        onGenerar={vi.fn()}
      />,
    );
    const enlace = screen.getByRole("link", { name: /Borrador listo · Abrir/ });
    expect(enlace).toHaveAttribute("href", borrador.enlace);
    expect(enlace).toHaveAttribute("target", "_blank");
  });

  it("con un borrador de antes esperando en Outlook, en vez del botón va el enlace para abrirlo", () => {
    const alAbrirFicha = vi.fn();
    render(
      <div onClick={alAbrirFicha}>
        <BotonSeguimientoIA
          trabajando={false}
          ocupado={false}
          resultado={null}
          enEspera={{
            buzon: "contacto@valledelsolquillon.cl",
            enlace: "https://outlook.office365.com/owa/?ItemID=espera",
            creado: "2026-10-17T20:52:00Z",
          }}
          onGenerar={vi.fn()}
        />
      </div>,
    );
    expect(
      screen.queryByRole("button", { name: /Generar seguimiento/ }),
    ).not.toBeInTheDocument();
    const enlace = screen.getByRole("link", {
      name: /Borrador en Outlook · Abrir/,
    });
    expect(enlace).toHaveAttribute(
      "href",
      "https://outlook.office365.com/owa/?ItemID=espera",
    );
    expect(enlace.getAttribute("title")).toContain("contacto@");
    fireEvent.click(enlace);
    expect(alAbrirFicha).not.toHaveBeenCalled();
  });

  it("lo que se escribió en esta visita manda sobre el borrador de antes", () => {
    render(
      <BotonSeguimientoIA
        trabajando={false}
        ocupado={false}
        resultado={borrador}
        enEspera={{
          buzon: "contacto@valledelsolquillon.cl",
          enlace: "https://outlook.office365.com/owa/?ItemID=espera",
          creado: "2026-10-17T20:52:00Z",
        }}
        onGenerar={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("link", { name: /Borrador listo · Abrir/ }),
    ).toHaveAttribute("href", borrador.enlace);
  });

  it("si se saltó, dice por qué al pasar el mouse", () => {
    render(
      <BotonSeguimientoIA
        trabajando={false}
        ocupado={false}
        resultado={{
          ...borrador,
          accion: "saltada",
          detalle: "ya hay un borrador en el hilo de contacto@.",
          enlace: null,
        }}
        onGenerar={vi.fn()}
      />,
    );
    expect(screen.getByText("No se escribió").parentElement).toHaveAttribute(
      "title",
      "No se escribió: ya hay un borrador en el hilo de contacto@.",
    );
  });
});

describe("ResultadosDeSeguimiento", () => {
  it("sin resultados no ocupa espacio; con ellos, cada borrador lleva a Outlook", () => {
    const { container, rerender } = render(
      <MemoryRouter>
        <ResultadosDeSeguimiento resultados={[]} onCerrar={vi.fn()} />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();

    rerender(
      <MemoryRouter>
        <ResultadosDeSeguimiento
          resultados={[
            borrador,
            {
              id: "q592",
              numero: 592,
              accion: "saltada",
              detalle: "toca llamar: la nota dice llamar la próxima semana",
              enlace: null,
            },
          ]}
          onCerrar={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("link", { name: /Abrir en Outlook/ }),
    ).toHaveAttribute("href", borrador.enlace);
    expect(screen.getByText(/toca llamar/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "N° 592" })).toHaveAttribute(
      "href",
      "/negocio/q592",
    );
  });
});
