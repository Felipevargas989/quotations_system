#!/bin/sh
# ANOTAR QUE SE LEYÓ EL MAPA (19-09-2026, el grillete de Felipe).
#
# Corre DESPUÉS de cada Read / Grep / Glob / Bash. Su único trabajo es
# dejar una marca cuando en esta sesión ya se miró el atlas o se le
# preguntó al grafo. El guardián de Edit/Write (guardian-del-atlas.sh)
# exige esa marca antes de dejar tocar código.
#
# Nunca estorba: pase lo que pase sale con éxito.

MARCAS="${TMPDIR:-/tmp}/eventia-mapa-leido"
mkdir -p "$MARCAS" 2>/dev/null

ENTRADA=$(cat)
SESION=$(printf '%s' "$ENTRADA" | jq -r '.session_id // "sin-sesion"' 2>/dev/null)
[ -z "$SESION" ] && SESION="sin-sesion"

marcar() {
  printf '%s\n' "$1" > "$MARCAS/$SESION" 2>/dev/null
  exit 0
}

HERRAMIENTA=$(printf '%s' "$ENTRADA" | jq -r '.tool_name // ""' 2>/dev/null)

case "$HERRAMIENTA" in
  Read|Grep|Glob|NotebookRead)
    # Cualquier camino que apunte al atlas o a los documentos de
    # arquitectura cuenta como haber leído el mapa.
    RUTAS=$(printf '%s' "$ENTRADA" | jq -r '[.tool_input.file_path?, .tool_input.path?, .tool_input.pattern?, .tool_input.notebook_path?] | map(select(. != null)) | join(" ")' 2>/dev/null)
    case "$RUTAS" in
      *docs/arquitectura*) marcar "atlas: $RUTAS" ;;
    esac
    ;;
  Bash)
    ORDEN=$(printf '%s' "$ENTRADA" | jq -r '.tool_input.command // ""' 2>/dev/null)
    case "$ORDEN" in
      # Preguntarle al grafo cuenta.
      *graphify*) marcar "grafo: consultado" ;;
      # Leer el atlas con cat/sed/grep/head también cuenta: es lo mismo
      # que hacerlo con la herramienta de lectura.
      *docs/arquitectura*) marcar "atlas por consola" ;;
    esac
    ;;
esac

exit 0
