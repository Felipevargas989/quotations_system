// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AgregadorDeItems from "./AgregadorDeItems";

afterEach(cleanup);

// CADA PRUEBA DE ACÁ ES UN COMPORTAMIENTO QUE HOY TIENEN LOS CUATRO
// AGREGADORES ESCRITOS A MANO, Y QUE NO SE PUEDE PERDER AL UNIFICARLOS.
//
// Felipe fue explícito: "deben tener todas absolutamente todas las
// características de las del cotizador, no quiero perder nada de ahí".
// Se extrajeron leyendo los 4 bloques línea por línea, incluidos los
// comentarios con fecha que explican una pillada suya.

const CARTA = [
  { value: "p1", label: "Pollo al jugo", hint: "$12.500", group: "Fondos" },
  { value: "p2", label: "Merluza frita", hint: "$11.500", group: "Fondos" },
  { value: "p3", label: "Pastel de choclo", hint: "$13.000", group: "Fondos" },
  { value: "d1", label: "Flan", hint: "$3.500", group: "Postres" },
];

/** Envoltorio que maneja el abierto/cerrado, como haría una pantalla. */
function Caja({
  onAgregar = vi.fn(),
  arranqueAbierto = true,
  ...resto
}: Partial<React.ComponentProps<typeof AgregadorDeItems>> & {
  arranqueAbierto?: boolean;
}) {
  const [abierto, setAbierto] = useState(arranqueAbierto);
  return (
    <AgregadorDeItems
      opciones={CARTA}
      onAgregar={onAgregar}
      abierto={abierto}
      onAbiertoChange={setAbierto}
      placeholder="Seleccionar item"
      {...resto}
    />
  );
}

const buscador = () => screen.getByPlaceholderText("Buscar...");
const lista = () =>
  within(document.querySelector("[data-lista-scroll]") as HTMLElement);
const opcion = (nombre: string | RegExp) =>
  lista().getByRole("button", { name: nombre });

describe("AgregadorDeItems — nunca muestra lo elegido", () => {
  it("tras agregar, el botón sigue diciendo el placeholder en gris", async () => {
    // Orden de Felipe del 04-08: "ensucia la vista".
    const usuario = userEvent.setup();
    render(<Caja />);

    await usuario.click(opcion(/Pollo al jugo/));

    const boton = screen.getAllByRole("button")[0];
    expect(boton).toHaveTextContent("Seleccionar item");
    expect(boton.querySelector("span")?.className).toContain("text-gray-500");
  });

  it("no existe ningún visto de 'elegida': acá no se elige, se suma", async () => {
    render(<Caja />);
    expect(document.querySelector('[aria-label="Elegida"]')).toBeNull();
  });
});

describe("AgregadorDeItems — se queda abierto para seguir sumando", () => {
  it("tras agregar, la lista sigue desplegada", async () => {
    const usuario = userEvent.setup();
    render(<Caja />);

    await usuario.click(opcion(/Pollo al jugo/));

    expect(screen.queryByPlaceholderText("Buscar...")).toBeTruthy();
  });

  it("el cursor NO se suelta: vuelve al buscador", async () => {
    const usuario = userEvent.setup();
    render(<Caja />);

    await usuario.click(opcion(/Merluza frita/));

    expect(buscador()).toHaveFocus();
  });

  it("el buscador se limpia tras agregar", async () => {
    const usuario = userEvent.setup();
    render(<Caja />);
    await usuario.type(buscador(), "pollo");

    await usuario.click(opcion(/Pollo al jugo/));

    expect(buscador()).toHaveValue("");
  });

  it("con limpiarAlAgregar apagado, el filtro se mantiene", async () => {
    // Uno de los dos agregadores de servicios fijos NO limpia: deja la
    // lista filtrada para seguir sumando parecidos.
    const usuario = userEvent.setup();
    render(<Caja limpiarAlAgregar={false} />);
    await usuario.type(buscador(), "pollo");

    await usuario.click(opcion(/Pollo al jugo/));

    expect(buscador()).toHaveValue("pollo");
  });

  it("sumar DOS VECES lo mismo avisa dos veces (así sube la cantidad)", async () => {
    const usuario = userEvent.setup();
    const alAgregar = vi.fn();
    render(<Caja onAgregar={alAgregar} />);

    await usuario.click(opcion(/Pollo al jugo/));
    await usuario.click(opcion(/Pollo al jugo/));

    expect(alAgregar).toHaveBeenCalledTimes(2);
    expect(alAgregar).toHaveBeenNthCalledWith(2, "p1");
  });
});

describe("AgregadorDeItems — carga rápida: escribir y apretar Enter", () => {
  it("al abrir ya viene marcada la primera fila", async () => {
    render(<Caja />);
    expect(opcion(/Pollo al jugo/).classList.contains("bg-blue-50")).toBe(true);
  });

  it("escribir tres letras y Enter agrega el primer resultado", async () => {
    const usuario = userEvent.setup();
    const alAgregar = vi.fn();
    render(<Caja onAgregar={alAgregar} />);

    await usuario.type(buscador(), "mer");
    await usuario.keyboard("{Enter}");

    expect(alAgregar).toHaveBeenCalledWith("p2"); // Merluza
  });

  it("al filtrar, la marca vuelve a la primera fila", async () => {
    const usuario = userEvent.setup();
    render(<Caja />);
    await usuario.keyboard("{ArrowDown}{ArrowDown}"); // marca la tercera

    await usuario.type(buscador(), "fl");

    expect(opcion(/Flan/).classList.contains("bg-blue-50")).toBe(true);
  });
});

describe("AgregadorDeItems — el teclado", () => {
  it("las flechas NO dan la vuelta: topan en el último", async () => {
    // En una lista de cientos de platos, volver al principio de golpe
    // desorienta. La lista plegable sí da la vuelta; ésta no.
    const usuario = userEvent.setup();
    const alAgregar = vi.fn();
    render(<Caja onAgregar={alAgregar} />);

    // 4 opciones, ya marcada la 1ª: bajar 10 veces queda en la última.
    await usuario.keyboard("{ArrowDown>10/}{Enter}");

    expect(alAgregar).toHaveBeenCalledWith("d1"); // Flan, la última
  });

  it("la flecha arriba desde la primera se queda en la primera", async () => {
    const usuario = userEvent.setup();
    const alAgregar = vi.fn();
    render(<Caja onAgregar={alAgregar} />);

    await usuario.keyboard("{ArrowUp>3/}{Enter}");

    expect(alAgregar).toHaveBeenCalledWith("p1");
  });

  it("Escape cierra", async () => {
    const usuario = userEvent.setup();
    render(<Caja />);

    await usuario.keyboard("{Escape}");

    expect(screen.queryByPlaceholderText("Buscar...")).toBeNull();
  });
});

describe("AgregadorDeItems — el buscador", () => {
  it("NO busca por el apunte: escribir un precio no trae platos", async () => {
    // El apunte gris es el PRECIO. Buscar "500" traería medio menú.
    const usuario = userEvent.setup();
    render(<Caja />);

    await usuario.type(buscador(), "500");

    expect(screen.getByText("No se encontraron resultados")).toBeTruthy();
  });

  it("el apunte se muestra PEGADO al nombre, no a la derecha", async () => {
    render(<Caja />);
    expect(opcion(/Pollo al jugo - \$12\.500/)).toBeTruthy();
  });

  it("busca sin tildes y por palabras en desorden", async () => {
    const usuario = userEvent.setup();
    render(<Caja />);

    await usuario.type(buscador(), "choclo pastel");

    expect(opcion(/Pastel de choclo/)).toBeTruthy();
    expect(lista().queryByRole("button", { name: /Merluza/ })).toBeNull();
  });

  it("busca por nombre de sección", async () => {
    const usuario = userEvent.setup();
    render(<Caja />);

    await usuario.type(buscador(), "postres");

    expect(opcion(/Flan/)).toBeTruthy();
    expect(lista().queryByRole("button", { name: /Pollo/ })).toBeNull();
  });

  it("al reabrir, el buscador aparece vacío", async () => {
    const usuario = userEvent.setup();
    render(<Caja />);
    await usuario.type(buscador(), "pollo");
    const boton = screen.getAllByRole("button")[0];

    await usuario.click(boton); // cierra
    await usuario.click(boton); // reabre

    expect(buscador()).toHaveValue("");
    expect(opcion(/Merluza frita/)).toBeTruthy();
  });

  it("el aviso de sin resultados va a la IZQUIERDA, como las copias", async () => {
    const usuario = userEvent.setup();
    render(<Caja />);

    await usuario.type(buscador(), "sushi");

    const aviso = screen.getByText("No se encontraron resultados");
    expect(aviso.className).not.toContain("text-center");
  });

  it("no lleva pie de 'N resultados'", async () => {
    render(<Caja />);
    expect(screen.queryByText(/resultados?$/i)).toBeNull();
  });
});

describe("AgregadorDeItems — lo manda la pantalla, no él mismo", () => {
  it("nace cerrado si la pantalla lo dice", () => {
    render(<Caja arranqueAbierto={false} />);
    expect(screen.queryByPlaceholderText("Buscar...")).toBeNull();
  });

  it("avisa cuando quiere cerrarse, para que la pantalla decida", async () => {
    // La pantalla necesita enterarse: en Post-Venta, cerrar el panel NO
    // debe hacer desaparecer la fila del agregador ni su "Cancelar".
    const usuario = userEvent.setup();
    const alCambiar = vi.fn();
    render(
      <AgregadorDeItems
        opciones={CARTA}
        onAgregar={vi.fn()}
        abierto
        onAbiertoChange={alCambiar}
        placeholder="Seleccionar item"
      />,
    );

    await usuario.keyboard("{Escape}");

    expect(alCambiar).toHaveBeenCalledWith(false);
  });

  it("se cierra al pinchar fuera", async () => {
    const usuario = userEvent.setup();
    const alCambiar = vi.fn();
    render(
      <div>
        <button type="button">afuera</button>
        <AgregadorDeItems
          opciones={CARTA}
          onAgregar={vi.fn()}
          abierto
          onAbiertoChange={alCambiar}
          placeholder="Seleccionar item"
        />
      </div>,
    );

    await usuario.click(screen.getByRole("button", { name: "afuera" }));

    expect(alCambiar).toHaveBeenCalledWith(false);
  });

  it("deshabilitado no abre", async () => {
    const usuario = userEvent.setup();
    render(<Caja arranqueAbierto={false} disabled />);

    await usuario.click(screen.getAllByRole("button")[0]);

    expect(screen.queryByPlaceholderText("Buscar...")).toBeNull();
  });
});

describe("AgregadorDeItems — las diferencias entre las cuatro copias", () => {
  it("acepta texto chico, para calzar con la columna de al lado", () => {
    render(<Caja arranqueAbierto={false} tamano="sm" />);
    expect(screen.getAllByRole("button")[0].className).toContain("text-sm");
  });

  it("puede ir SIN fondo blanco, para fundirse con la caja ámbar", () => {
    render(<Caja arranqueAbierto={false} fondoBlanco={false} />);
    expect(screen.getAllByRole("button")[0].className).not.toContain("bg-white");
  });

  it("acepta clases del contenedor, para vivir en una fila flex", () => {
    const { container } = render(
      <Caja arranqueAbierto={false} className="flex-1 min-w-0" />,
    );
    expect(container.firstElementChild?.className).toContain("flex-1");
  });

  it("el placeholder es de la pantalla: cambia por caja", () => {
    render(
      <Caja arranqueAbierto={false} placeholder="Seleccionar servicio de Cena…" />,
    );
    expect(screen.getAllByRole("button")[0]).toHaveTextContent(
      "Seleccionar servicio de Cena…",
    );
  });
});

describe("AgregadorDeItems — secciones", () => {
  it("pone un encabezado por grupo, no uno por fila", async () => {
    render(<Caja />);
    expect(screen.getAllByText("Fondos")).toHaveLength(1);
    expect(screen.getAllByText("Postres")).toHaveLength(1);
  });

  it("sin grupos no dibuja ningún encabezado", () => {
    render(
      <Caja
        opciones={[
          { value: "a", label: "Silla" },
          { value: "b", label: "Mesa" },
        ]}
      />,
    );
    const l = document.querySelector("[data-lista-scroll]") as HTMLElement;
    expect(l.querySelectorAll(".uppercase")).toHaveLength(0);
  });
});

describe("AgregadorDeItems — lo que encontró la verificación adversarial", () => {
  it("la marca de scroll va en el elemento que DE VERDAD scrollea", async () => {
    // Estuvo en un div interior sin overflow: verEnLista no encontraba
    // dónde desplazar, y ese div —al estar posicionado— se pintaba
    // ENCIMA de la cabecera del buscador, dejando las opciones montadas
    // sobre el texto (pillada de Felipe con pantallazo, 14-08).
    render(<Caja />);
    const marcado = document.querySelector("[data-lista-scroll]")!;
    expect(marcado.className).toContain("overflow-y-auto");
    expect(marcado.className).toContain("max-h-");
  });

  it("la cabecera del buscador se pinta SOBRE las opciones", () => {
    render(<Caja />);
    const cabecera = document.querySelector(".sticky")!;
    expect(cabecera.className).toContain("z-10");
    expect(cabecera.className).toContain("bg-white");
  });

  it("el hover es AZUL, no gris: no le puede ganar a la marca", () => {
    // `hover:bg-gray-100` le ganaba en especificidad a `bg-blue-50`, así
    // que la fila bajo el mouse se veía gris en vez de marcada.
    render(<Caja />);
    const fila = opcion(/Pollo al jugo/);
    expect(fila.className).toContain("hover:bg-blue-50");
    expect(fila.className).not.toContain("hover:bg-gray-100");
  });

  it("las filas NO llevan tamaño chico impuesto", () => {
    // Las copias escritas a mano no lo llevaban: heredaban el base.
    render(<Caja />);
    expect(opcion(/Pollo al jugo/).className).not.toContain("text-sm");
  });

  it("con buscarPorSeccion apagado, el nombre de la sección NO trae nada", async () => {
    // En los buscadores de servicios FIJOS nunca se buscó por sección, y
    // el rótulo literal "Sin sección" haría que escribir "sin" trajera
    // todos los fijos sin sección.
    const usuario = userEvent.setup();
    render(<Caja buscarPorSeccion={false} />);

    await usuario.type(buscador(), "postres");

    expect(screen.getByText("No se encontraron resultados")).toBeTruthy();
  });

  it("encendido (por omisión) sí trae la sección completa", async () => {
    const usuario = userEvent.setup();
    render(<Caja />);

    await usuario.type(buscador(), "postres");

    expect(opcion(/Flan/)).toBeTruthy();
  });
});
