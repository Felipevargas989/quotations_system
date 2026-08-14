// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SelectWithSearch from "./SelectWithSearch";

// La limpieza automática de testing-library solo se engancha sola cuando
// vitest corre con `globals: true`, y este proyecto no lo usa. Sin esto,
// cada prueba deja su componente pegado en la pantalla y la siguiente
// encuentra todo duplicado.
afterEach(cleanup);

// EL TECLADO, CON CANDADO
//
// Estas pruebas existen por un bug que estuvo MESES escondido: el
// manejador de teclas colgaba del botón que abre, pero al abrir el foco
// salta al buscador, que es HERMANO del botón. Las teclas nunca
// llegaban. Con la lista abierta, flechas, Enter y Escape no hacían
// nada en las 15 pantallas que usan esta pieza.
//
// Pasó por tipos, construcción, pruebas, CI y validación visual. Ninguna
// compuerta lo vio, porque ninguna aprieta una tecla. Estas sí.
//
// (13-08-2026)

const PLATOS = [
  { value: "1", label: "Pollo al jugo" },
  { value: "2", label: "Merluza frita" },
  { value: "3", label: "Pastel de choclo" },
  { value: "4", label: "Cazuela de vacuno" },
];

// El botón que abre es siempre el primero del componente. Se busca así
// —y no por su texto— porque su texto cambia según lo elegido.
const botonPrincipal = () => screen.getAllByRole("button")[0];

const abrir = async (usuario: ReturnType<typeof userEvent.setup>) => {
  await usuario.click(botonPrincipal());
};

// Las opciones se buscan DENTRO de la lista: el botón principal también
// muestra el nombre de lo elegido, así que buscar en toda la pantalla
// encontraría el mismo nombre dos veces.
const lista = () =>
  within(document.querySelector("[data-lista-scroll]") as HTMLElement);

describe("SelectWithSearch — el teclado con la lista ABIERTA", () => {
  it("la flecha abajo marca la primera opción", async () => {
    const usuario = userEvent.setup();
    render(<SelectWithSearch options={PLATOS} onChange={vi.fn()} />);
    await abrir(usuario);

    await usuario.keyboard("{ArrowDown}");

    // La marcada es la única con fondo azul. Se compara la clase EXACTA
    // y no el texto: `hover:bg-blue-50` contiene "bg-blue-50" y daría un
    // falso positivo en cualquier fila.
    const marcada = lista().getByRole("button", { name: "Pollo al jugo" });
    expect(marcada.classList.contains("bg-blue-50")).toBe(true);
  });

  it("Enter elige lo marcado — es el flujo escribir y agregar", async () => {
    const usuario = userEvent.setup();
    const alElegir = vi.fn();
    render(<SelectWithSearch options={PLATOS} onChange={alElegir} />);
    await abrir(usuario);

    await usuario.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    expect(alElegir).toHaveBeenCalledWith("2"); // Merluza frita
  });

  it("Escape cierra la lista", async () => {
    const usuario = userEvent.setup();
    render(<SelectWithSearch options={PLATOS} onChange={vi.fn()} />);
    await abrir(usuario);
    expect(screen.getByPlaceholderText("Buscar...")).toBeTruthy();

    await usuario.keyboard("{Escape}");

    expect(screen.queryByPlaceholderText("Buscar...")).toBeNull();
  });

  it("las flechas dan la vuelta al llegar al final", async () => {
    const usuario = userEvent.setup();
    const alElegir = vi.fn();
    render(<SelectWithSearch options={PLATOS} onChange={alElegir} />);
    await abrir(usuario);

    // 4 opciones: bajar 5 veces vuelve a la primera.
    await usuario.keyboard("{ArrowDown>5/}{Enter}");

    expect(alElegir).toHaveBeenCalledWith("1");
  });

  it("la flecha arriba desde el principio salta a la última", async () => {
    const usuario = userEvent.setup();
    const alElegir = vi.fn();
    render(<SelectWithSearch options={PLATOS} onChange={alElegir} />);
    await abrir(usuario);

    await usuario.keyboard("{ArrowUp}{Enter}");

    expect(alElegir).toHaveBeenCalledWith("4"); // Cazuela, la última
  });

  it("Backspace con el buscador vacío NO cierra la lista", async () => {
    // La versión anterior lo hacía. Como el manejador estaba muerto,
    // nunca llegó a pasar — y encenderlo habría agregado un
    // comportamiento que ninguna pantalla pidió.
    const usuario = userEvent.setup();
    render(<SelectWithSearch options={PLATOS} onChange={vi.fn()} />);
    await abrir(usuario);

    await usuario.keyboard("{Backspace}");

    expect(screen.queryByPlaceholderText("Buscar...")).toBeTruthy();
  });
});

describe("SelectWithSearch — una sola fila azul a la vez", () => {
  it("lo ya elegido NO se pinta de azul: eso es solo para la marca", async () => {
    // Pillada de Felipe en el laboratorio: al bajar con las flechas
    // quedaban DOS filas azules y no se sabía cuál iba a elegir Enter.
    const usuario = userEvent.setup();
    render(<SelectWithSearch options={PLATOS} value="1" onChange={vi.fn()} />);
    await abrir(usuario);

    await usuario.keyboard("{ArrowDown}{ArrowDown}");

    const elegida = lista().getByRole("button", { name: /Pollo al jugo/ });
    const marcada = lista().getByRole("button", { name: "Merluza frita" });

    expect(marcada.classList.contains("bg-blue-50")).toBe(true);
    expect(elegida.classList.contains("bg-blue-50")).toBe(false);
  });

  it("lo ya elegido se reconoce por el visto, no por el color", async () => {
    const usuario = userEvent.setup();
    render(<SelectWithSearch options={PLATOS} value="3" onChange={vi.fn()} />);
    await abrir(usuario);

    expect(document.querySelector('[aria-label="Elegida"]')).toBeTruthy();
  });
});

describe("SelectWithSearch — el buscador", () => {
  it("filtra sin tildes y por palabras en cualquier orden", async () => {
    const usuario = userEvent.setup();
    render(<SelectWithSearch options={PLATOS} onChange={vi.fn()} />);
    await abrir(usuario);

    // "choclo past" en desorden, y "Pastel" lleva tilde en ningún lado
    // pero "Cazuela de vacuno" sí prueba el orden invertido.
    await usuario.type(screen.getByPlaceholderText("Buscar..."), "choclo past");

    expect(lista().getByRole("button", { name: "Pastel de choclo" })).toBeTruthy();
    expect(lista().queryByRole("button", { name: "Merluza frita" })).toBeNull();
  });

  it("al reabrir, el buscador aparece VACÍO", async () => {
    // Antes se limpiaba al cerrar por clic afuera pero no al cerrar con
    // el botón: al reabrir la lista salía filtrada por un texto viejo y
    // parecía que faltaran opciones.
    const usuario = userEvent.setup();
    render(<SelectWithSearch options={PLATOS} onChange={vi.fn()} />);
    await abrir(usuario);
    await usuario.type(screen.getByPlaceholderText("Buscar..."), "pollo");

    await abrir(usuario); // cierra
    await abrir(usuario); // reabre

    expect(screen.getByPlaceholderText("Buscar...")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Merluza frita" })).toBeTruthy();
  });

  it("sin resultados avisa, y no deja una caja vacía", async () => {
    const usuario = userEvent.setup();
    render(<SelectWithSearch options={PLATOS} onChange={vi.fn()} />);
    await abrir(usuario);

    await usuario.type(screen.getByPlaceholderText("Buscar..."), "sushi");

    expect(screen.getByText("No se encontraron resultados")).toBeTruthy();
  });
});

describe("SelectWithSearch — los selectores que AGREGAN", () => {
  it("con keepOpenOnSelect la lista queda abierta y el buscador limpio", async () => {
    // "El cursor NO se suelta: se sigue escribiendo el próximo servicio
    // sin volver a pinchar la barra." Es el comportamiento de los cuatro
    // agregadores del cotizador y de Post-Venta.
    const usuario = userEvent.setup();
    const alElegir = vi.fn();
    render(
      <SelectWithSearch options={PLATOS} onChange={alElegir} keepOpenOnSelect />,
    );
    await abrir(usuario);
    await usuario.type(screen.getByPlaceholderText("Buscar..."), "pollo");
    await usuario.keyboard("{ArrowDown}{Enter}");

    expect(alElegir).toHaveBeenCalledWith("1");
    const buscador = screen.getByPlaceholderText("Buscar...");
    expect(buscador).toHaveValue("");
    expect(buscador).toHaveFocus();
  });

  it("sin keepOpenOnSelect, elegir cierra la lista", async () => {
    const usuario = userEvent.setup();
    render(<SelectWithSearch options={PLATOS} onChange={vi.fn()} />);
    await abrir(usuario);

    await usuario.keyboard("{ArrowDown}{Enter}");

    expect(screen.queryByPlaceholderText("Buscar...")).toBeNull();
  });

  it("avisa aunque se elija DOS VECES lo mismo (sirve para sumar cantidad)", async () => {
    const usuario = userEvent.setup();
    const alElegir = vi.fn();
    render(
      <SelectWithSearch options={PLATOS} onChange={alElegir} keepOpenOnSelect />,
    );
    await abrir(usuario);

    await usuario.click(screen.getByRole("button", { name: "Pollo al jugo" }));
    await usuario.click(screen.getByRole("button", { name: "Pollo al jugo" }));

    expect(alElegir).toHaveBeenCalledTimes(2);
  });
});

describe("SelectWithSearch — secciones y apuntes", () => {
  it("pone encabezado cuando cambia el grupo, y no antes", async () => {
    const usuario = userEvent.setup();
    render(
      <SelectWithSearch
        options={[
          { value: "1", label: "Pollo al jugo", group: "Fondos" },
          { value: "2", label: "Merluza frita", group: "Fondos" },
          { value: "3", label: "Flan", group: "Postres" },
        ]}
        onChange={vi.fn()}
      />,
    );
    await abrir(usuario);

    expect(screen.getByText("Fondos")).toBeTruthy();
    expect(screen.getByText("Postres")).toBeTruthy();
    // Un solo encabezado por grupo, aunque el grupo tenga dos platos.
    expect(screen.getAllByText("Fondos")).toHaveLength(1);
  });

  it("buscar por el nombre de la sección trae sus platos", async () => {
    const usuario = userEvent.setup();
    render(
      <SelectWithSearch
        options={[
          { value: "1", label: "Pollo al jugo", group: "Fondos" },
          { value: "3", label: "Flan", group: "Postres" },
        ]}
        onChange={vi.fn()}
      />,
    );
    await abrir(usuario);

    await usuario.type(screen.getByPlaceholderText("Buscar..."), "postres");

    expect(screen.getByRole("button", { name: /Flan/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Pollo/ })).toBeNull();
  });
});

describe("SelectWithSearch — deshabilitado", () => {
  it("no abre", async () => {
    const usuario = userEvent.setup();
    render(<SelectWithSearch options={PLATOS} onChange={vi.fn()} disabled />);

    await usuario.click(screen.getByRole("button", { name: /seleccionar/i }));

    expect(screen.queryByPlaceholderText("Buscar...")).toBeNull();
  });
});
