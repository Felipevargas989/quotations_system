#!/usr/bin/env python3
"""EL GRILLETE DEL ATLAS (19-09-2026, pedido de Felipe).

Corre ANTES de Edit / Write / NotebookEdit **y de los Bash que escriben
código**. Si se va a tocar el código vivo de este repo y en esta sesión
no se leyó el atlas ni se le preguntó al grafo, lo impide y dice qué
hacer.

POR QUÉ EXISTE. La regla estaba escrita en CLAUDE.md desde el 11-09 y el
19-09 quedó en evidencia que la prosa no basta: tres sprints completos se
construyeron sin abrir el grafo ni una vez. Felipe: "dejemos algún
grillete para que siempre leas el atlas o el grafo antes de tocar algo".

POR QUÉ TAMBIÉN VIGILA BASH. La primera versión solo miraba Edit/Write, y
al probarla quedó claro que no habría frenado NI UNO de los cambios de ese
mismo día: casi todos se hicieron con python3 o sed desde la consola. Un
portero con una puerta trasera abierta no es un portero.

QUÉ NO BLOQUEA, a propósito:
  - documentos, migraciones, pruebas y configuración;
  - lectura de cualquier cosa (solo frena la escritura);
  - archivos fuera de este repo;
  - nada, una vez que ya se miró el mapa: basta UNA lectura por sesión.

Se satisface con cualquiera de las dos:
  1. leer un capítulo de docs/arquitectura/mapa/
  2. preguntarle al grafo:  graphify affected "NombreDeLaPieza"
"""

import json
import os
import re
import sys

CARPETA_DE_MARCAS = os.path.join(
    os.environ.get("TMPDIR", "/tmp"), "eventia-mapa-leido"
)

# El código vivo que se cuida. Lo demás del repo pasa libre.
CODIGO_VIVO = ("/api-rest/src/", "/frontend/src/")

# Lo que no cambia el comportamiento del sistema.
LIBRES = (".spec.ts", ".test.ts", ".test.tsx", "/tests/", "/testing/")

# Verbos de escritura en una línea de consola. `>` se mira aparte porque
# también aparece en redirecciones inofensivas a /tmp o /dev/null.
VERBOS = (
    r"\bsed\s+-i\b",
    r"\btee\b",
    r"\bcp\s",
    r"\bmv\s",
    r"\brm\s",
    r"\btruncate\b",
    r"\bpatch\b",
    r"\bgit\s+apply\b",
    r"\bgit\s+checkout\s+--",
    r"open\([^)]*['\"][wa]",   # python: open(..., 'w') / 'a'
    r"write_text\(",
    r"\.writeFileSync\(",
    r"\bdd\s",
)


def permitir():
    sys.exit(0)


def denegar(razon):
    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": razon,
                }
            }
        )
    )
    sys.exit(0)


def toca_codigo_vivo(texto):
    """¿El texto apunta al código vivo de Eventia, fuera de las pruebas?"""
    if not any(zona in texto for zona in CODIGO_VIVO):
        return False
    return True


def escribe_por_consola(orden):
    """¿Esta línea de consola escribe en el código vivo?"""
    if not toca_codigo_vivo(orden):
        return False
    for verbo in VERBOS:
        if re.search(verbo, orden):
            return True
    # Redirección a un archivo de código: `> algo.ts`, `>> algo.tsx`.
    if re.search(r">>?\s*\S*(api-rest|frontend)/src/\S+\.(ts|tsx|js|jsx)", orden):
        return True
    return False


def main():
    try:
        entrada = json.load(sys.stdin)
    except Exception:
        permitir()  # Si no se entiende la entrada, jamás estorbar.

    sesion = entrada.get("session_id") or "sin-sesion"
    herramienta = entrada.get("tool_name") or ""
    datos = entrada.get("tool_input") or {}

    if herramienta == "Bash":
        orden = datos.get("command") or ""
        if not escribe_por_consola(orden):
            permitir()
        objetivo = "un cambio por consola"
        modulo = "sin identificar"
    else:
        archivo = datos.get("file_path") or datos.get("notebook_path") or ""
        if not archivo or not toca_codigo_vivo(archivo):
            permitir()
        if any(libre in archivo for libre in LIBRES):
            permitir()
        objetivo = os.path.basename(archivo)
        hallado = re.search(
            r"/(?:api-rest|frontend)/src/(?:pages/)?([^/]+)/", archivo
        )
        modulo = hallado.group(1) if hallado else "sin identificar"

    # ¿Ya se miró el mapa en esta sesión?
    if os.path.exists(os.path.join(CARPETA_DE_MARCAS, sesion)):
        permitir()

    denegar(
        "GRILLETE DEL ATLAS: en esta sesión todavía no se leyó el mapa ni se "
        f"consultó el grafo, y esto toca código vivo de Eventia ({objetivo}, "
        f"módulo: {modulo}).\n\n"
        "Antes de escribir, haz UNA de las dos (basta una vez por sesión):\n"
        "  1. Leer el capítulo del módulo en docs/arquitectura/mapa/ "
        "(empieza por 00_MAPA_DEL_SISTEMA.md) y su sección Zonas de riesgo.\n"
        '  2. Preguntarle al grafo qué se afecta:  export PATH="$HOME/.local/bin:$PATH"; '
        'graphify affected "NombreDeLaPieza"\n\n'
        "Si el grafo no encuentra piezas recientes está atrasado; rehazlo antes:\n"
        "  PYTHONHASHSEED=0 GRAPHIFY_SKIP_HOOK=1 graphify update .\n\n"
        "Regla de la casa desde el 11-09-2026, con grillete desde el 19-09 "
        "porque la prosa sola no bastó."
    )


if __name__ == "__main__":
    main()
