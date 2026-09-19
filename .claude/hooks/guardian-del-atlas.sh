#!/bin/sh
# EL GRILLETE DEL ATLAS (19-09-2026, pedido de Felipe).
#
# Corre ANTES de cada Edit / Write / NotebookEdit. Si se va a tocar
# CÓDIGO de este repo y en esta sesión no se leyó el atlas ni se le
# preguntó al grafo, lo impide y dice qué hacer.
#
# POR QUÉ EXISTE. La regla estaba escrita en CLAUDE.md desde el 11-09 y
# el 19-09 quedó en evidencia que la prosa no basta: se construyeron tres
# sprints completos sin abrir el grafo ni una vez. Felipe: "dejemos algún
# grillete para que siempre leas el atlas o el grafo antes de tocar algo".
# Mismo principio que el portero del kit de la casa: un cartel es un
# cartel, un portero es un portero.
#
# QUÉ NO BLOQUEA, a propósito:
#   - documentos, migraciones, pruebas y configuración: solo el código
#     vivo de api-rest/src y frontend/src;
#   - archivos fuera de este repo;
#   - nada, una vez que ya se miró el mapa: basta UNA lectura por sesión.
#
# Cómo se satisface (cualquiera de las dos):
#   1. leer el capítulo del módulo en docs/arquitectura/mapa/
#   2. preguntarle al grafo:  graphify affected "NombreDeLaPieza"

MARCAS="${TMPDIR:-/tmp}/eventia-mapa-leido"

ENTRADA=$(cat)
SESION=$(printf '%s' "$ENTRADA" | jq -r '.session_id // "sin-sesion"' 2>/dev/null)
[ -z "$SESION" ] && SESION="sin-sesion"
ARCHIVO=$(printf '%s' "$ENTRADA" | jq -r '.tool_input.file_path // .tool_input.notebook_path // ""' 2>/dev/null)

permitir() { exit 0; }

# Sin archivo no hay nada que cuidar.
[ -z "$ARCHIVO" ] && permitir

# Solo el código vivo de las dos aplicaciones de Eventia.
case "$ARCHIVO" in
  */quotations_system/api-rest/src/*|*/quotations_system/frontend/src/*) ;;
  *) permitir ;;
esac

# Las pruebas no cambian el comportamiento del sistema: pasan libres.
case "$ARCHIVO" in
  *.spec.ts|*.test.ts|*.test.tsx|*/tests/*|*/testing/*) permitir ;;
esac

# ¿Ya se miró el mapa en esta sesión?
[ -f "$MARCAS/$SESION" ] && permitir

# No se miró: se frena y se explica. El texto lo lee Claude, no Felipe.
# El nombre del módulo, solo para que el aviso sea concreto. Ojo con el
# delimitador: la alternancia lleva "|" adentro, así que el sed va con "#".
MODULO=$(printf '%s' "$ARCHIVO" | sed -E 's#.*/(api-rest|frontend)/src/(pages/)?([^/]+)/.*#\3#')
[ "$MODULO" = "$ARCHIVO" ] && MODULO="sin identificar"

jq -n --arg modulo "$MODULO" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: (
      "GRILLETE DEL ATLAS: en esta sesión todavía no se leyó el mapa ni se consultó el grafo, y este archivo es código vivo de Eventia (módulo: " + $modulo + ").\n\n" +
      "Antes de tocarlo, haz UNA de las dos (basta una vez por sesión):\n" +
      "  1. Leer el capítulo del módulo en docs/arquitectura/mapa/ (empieza por 00_MAPA_DEL_SISTEMA.md) y su sección Zonas de riesgo.\n" +
      "  2. Preguntarle al grafo qué se afecta:  export PATH=\"$HOME/.local/bin:$PATH\"; graphify affected \"NombreDeLaPieza\"\n\n" +
      "Si el grafo está atrasado (no encuentra piezas recientes), rehazlo antes:\n" +
      "  PYTHONHASHSEED=0 GRAPHIFY_SKIP_HOOK=1 graphify update .\n\n" +
      "Regla de la casa desde el 11-09-2026, con grillete desde el 19-09 porque la prosa sola no bastó."
    )
  }
}'
exit 0
