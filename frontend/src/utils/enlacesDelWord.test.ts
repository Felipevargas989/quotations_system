// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { controlarEnlaces, esEnlaceSeguro } from "./enlacesDelWord";

// Un Word que viene de afuera puede traer un enlace `javascript:`; en el
// visor de Eventia (decisión 46) solo abren http(s) y correo.

describe("Los enlaces de un Word en el visor", () => {
  it("solo http(s), correo y anclas internas son seguros", () => {
    expect(esEnlaceSeguro("https://www.mercadopublico.cl")).toBe(true);
    expect(esEnlaceSeguro("mailto:contacto@valledelsol.cl")).toBe(true);
    expect(esEnlaceSeguro("#_Toc123")).toBe(true);
    expect(esEnlaceSeguro("javascript:robar()")).toBe(false);
    expect(esEnlaceSeguro(" JavaScript:robar()")).toBe(false);
    expect(esEnlaceSeguro("file:///C:/x")).toBe(false);
    expect(esEnlaceSeguro("data:text/html,<b>x</b>")).toBe(false);
  });

  it("desactiva los peligrosos y abre los buenos en otra pestaña", () => {
    const raiz = document.createElement("div");
    raiz.innerHTML = [
      '<a href="https://www.chilecompra.cl">bien</a>',
      '<a href="javascript:robar()">mal</a>',
      '<a href="#_Toc1">índice</a>',
      '<a href="vbscript:x">mal 2</a>',
    ].join("");
    expect(controlarEnlaces(raiz)).toBe(2);
    const [bien, mal, indice, mal2] = Array.from(raiz.querySelectorAll("a"));
    expect(bien.getAttribute("target")).toBe("_blank");
    expect(bien.getAttribute("rel")).toBe("noopener noreferrer");
    expect(mal.hasAttribute("href")).toBe(false);
    expect(indice.getAttribute("href")).toBe("#_Toc1");
    expect(indice.hasAttribute("target")).toBe(false);
    expect(mal2.hasAttribute("href")).toBe(false);
  });
});
