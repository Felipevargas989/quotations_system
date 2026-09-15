#!/usr/bin/env python3
"""EL PORTERO DEL MAPA — que el atlas no se quede viejo sin que nadie se entere.

POR QUÉ EXISTE (Felipe, 14-09-2026). El atlas de docs/arquitectura/mapa vale
mientras diga la verdad. La regla "el mapa se actualiza en el mismo commit que
el código" está escrita en CLAUDE.md, pero un documento es un cartel, no una
barrera: en tres días hubo que ponerlo al día a mano dos veces. Esto sí es una
barrera.

QUÉ REVISA. Cada ruta viva del motor (api-rest/src/**/*.controller.ts) tiene que
aparecer en alguna tabla del atlas. Si alguien agrega una ruta y no la documenta,
el número sube y el portero rechaza el cambio.

CÓMO FUNCIONA. Igual que el portero del kit de la casa: no juzga el pasado, solo
impide que el número CREZCA. Si la deuda baja, hay que bajar el techo acá mismo,
en el mismo commit, para que el terreno ganado no quede libre para perderse.

A mano:  python3 scripts/portero-del-mapa.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

# Rutas vivas del motor que el atlas todavía no documenta. Medido el
# 14-09-2026. Baja este número cuando documentes alguna.
TECHO = 0

RAIZ = Path(__file__).resolve().parent.parent
MOTOR = RAIZ / "api-rest" / "src"
MAPA = RAIZ / "docs" / "arquitectura" / "mapa"
VERBOS = ("Get", "Post", "Patch", "Put", "Delete")


def prefijos_de_rutas() -> dict[str, str]:
    """API_ROUTES.X → '/loquesea', para los @Controller que usan la constante."""
    archivo = MOTOR / "constants" / "api.routes.ts"
    if not archivo.exists():
        return {}
    texto = archivo.read_text(encoding="utf-8")
    return {
        m.group(1): m.group(2).strip("/")
        for m in re.finditer(r"(\w+):\s*['\"]/?([\w/-]+)['\"]", texto)
    }


def normalizar(ruta: str) -> str:
    """Una ruta comparable: sin query, sin barras sobrantes, con los
    parámetros anónimos (:id, :quotationId y :companyId son lo mismo)."""
    # El atlas anota los parámetros opcionales entre corchetes y con
    # interrogación: `/logistics/fixed-cost-items[?fixedServiceId]`. Fuera
    # todo lo que venga después del primer "?" o "[".
    ruta = re.split(r"[?\[]", ruta.strip().strip("`"))[0].rstrip("/")
    ruta = re.sub(r":\w+", ":x", ruta)
    ruta = re.sub(r"/{2,}", "/", ruta)
    if not ruta.startswith("/"):
        ruta = "/" + ruta
    return ruta.lower()


def rutas_del_motor() -> list[tuple[str, str, str]]:
    """(verbo, ruta normalizada, archivo) de cada ruta viva del motor."""
    constantes = prefijos_de_rutas()
    salida: list[tuple[str, str, str]] = []
    for archivo in sorted(MOTOR.rglob("*.controller.ts")):
        texto = archivo.read_text(encoding="utf-8")
        m = re.search(r"@Controller\(\s*([^)]*)\s*\)", texto)
        crudo = (m.group(1).strip() if m else "").strip("'\"")
        if crudo.startswith("API_ROUTES."):
            base = constantes.get(crudo.split(".", 1)[1], "")
        else:
            base = crudo
        for mm in re.finditer(r"@(" + "|".join(VERBOS) + r")\(\s*([^)]*)\s*\)", texto):
            # Las rutas comentadas no cuentan: se mira la línea cruda.
            linea_ini = texto.rfind("\n", 0, mm.start()) + 1
            if texto[linea_ini:mm.start()].lstrip().startswith("//"):
                continue
            sufijo = mm.group(2).strip().strip("'\"")
            salida.append(
                (mm.group(1).upper(), normalizar(f"/{base}/{sufijo}"), str(archivo.relative_to(RAIZ)))
            )
    return salida


def rutas_del_atlas() -> set[tuple[str, str]]:
    """(verbo, ruta normalizada) de todo lo que el atlas menciona."""
    encontradas: set[tuple[str, str]] = set()
    for doc in list(MAPA.glob("*.md")) + list((MAPA / "flujos").glob("*.md")):
        texto = doc.read_text(encoding="utf-8")
        # Formas que usa el atlas: `GET /clients`, `GET/POST/DELETE /x`,
        # `POST /quotations/:id/enviar-correo`, con o sin backticks.
        for m in re.finditer(
            r"\b((?:GET|POST|PATCH|PUT|DELETE)(?:\s*/\s*(?:GET|POST|PATCH|PUT|DELETE))*)\s+(`?/[\w/:.\-{}\[\]?=&]+`?)",
            texto,
        ):
            verbos = re.findall(r"GET|POST|PATCH|PUT|DELETE", m.group(1))
            ruta = normalizar(m.group(2))
            for v in verbos:
                encontradas.add((v, ruta))
    return encontradas


def main() -> int:
    motor = rutas_del_motor()
    atlas = rutas_del_atlas()
    faltan = [(v, r, a) for v, r, a in motor if (v, r) not in atlas]
    # Una ruta puede estar documentada bajo su forma sin parámetro
    # (`GET /payments` cuando el motor tiene `GET /payments/:id`): eso ya
    # lo cubre la normalización. Lo que queda es de verdad ausente.
    faltan.sort(key=lambda x: (x[2], x[1]))
    total, ausentes = len(motor), len(faltan)

    if TECHO is None:  # primera medición: informa y no juzga
        print(f"  rutas del motor: {total} | sin documentar en el atlas: {ausentes}")
        for v, r, a in faltan:
            print(f"    {v:6} {r:48} {a}")
        return 0

    marca = "ok"
    if ausentes > TECHO:
        marca = "RECHAZADO"
    elif ausentes < TECHO:
        marca = f"bajó: nuevo techo {ausentes}"
    print(f"  {'rutas del motor fuera del atlas':<42} {ausentes:3} / {TECHO:<3}  {marca}")

    if ausentes > TECHO:
        print()
        print("  ── RECHAZADO: hay rutas del motor que el atlas no documenta.")
        print("     Agrégalas a la tabla de endpoints de su capítulo, en este")
        print("     mismo commit. La regla está en CLAUDE.md, 'EL MAPA DEL")
        print("     SISTEMA Y EL GRAFO'. Las que faltan:")
        for v, r, a in faltan:
            print(f"       {v:6} {r:48} {a}")
        print()
        return 1
    if ausentes < TECHO:
        print(f"  La deuda del mapa BAJÓ: pon TECHO = {ausentes} en este archivo.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
