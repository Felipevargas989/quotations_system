// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { textoDelConvenio } from "../../utils/textoDelConvenio";
import EdificioConvenio from "./EdificioConvenio";

const firmado = {
  estado: "firmado" as const,
  enviado_at: "2026-11-01T12:00:00Z",
  firmado_at: "2026-11-02T12:00:00Z",
  vence_at: "2029-11-02",
};
const enviado = {
  estado: "enviado" as const,
  enviado_at: "2026-11-18T15:00:00Z",
  firmado_at: null,
  vence_at: null,
};

describe("EdificioConvenio (doc 24 §7)", () => {
  it("el detalle en una línea, fechas dd-mm-aaaa en hora de Chile", () => {
    expect(textoDelConvenio(firmado)).toBe(
      "Convenio firmado · vence 02-11-2029",
    );
    expect(textoDelConvenio(enviado)).toBe("Convenio enviado · 18-11-2026");
    expect(textoDelConvenio(undefined)).toBeNull();
  });

  it("en la lista: verde, ámbar o el gris de siempre", () => {
    const v = render(<EdificioConvenio convenio={firmado} variante="lista" />);
    expect(v.container.querySelector("svg")?.getAttribute("class")).toContain(
      "text-emerald-600",
    );
    const a = render(<EdificioConvenio convenio={enviado} variante="lista" />);
    expect(a.container.querySelector("svg")?.getAttribute("class")).toContain(
      "text-amber-500",
    );
    const g = render(<EdificioConvenio variante="lista" />);
    expect(g.container.querySelector("svg")?.getAttribute("class")).toContain(
      "text-gray-400",
    );
    expect(g.container.querySelector("[title]")).toBeNull();
  });

  it("junto al nombre: sin convenio no se dibuja nada; nunca rojo", () => {
    expect(render(<EdificioConvenio />).container.innerHTML).toBe("");
    const f = render(<EdificioConvenio convenio={firmado} />);
    expect(f.container.querySelector("[title]")?.getAttribute("title")).toBe(
      "Convenio firmado · vence 02-11-2029",
    );
    expect(f.container.innerHTML).not.toMatch(/red-/);
  });
});
