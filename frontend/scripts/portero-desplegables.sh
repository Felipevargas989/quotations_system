#!/usr/bin/env bash
#
# EL PORTERO DE LOS DESPLEGABLES
#
# Por qué existe (13-08-2026, pedido de Felipe):
# el sistema tiene una pieza de la casa para desplegables con buscador
# (components/selects/SelectWithSearch) y otra para elección múltiple
# (components/MultiSelect). Aun así, una y otra vez se escribió un
# desplegable a mano al lado de la pieza que ya existía. Cada copia
# vuelve a descubrir los mismos errores de a uno: el buscador con los
# argumentos al revés, el panel que empuja los botones del modal, el
# que no se cierra al pinchar fuera, el que se corta dentro de una
# ventana. Todos ya resueltos adentro de la pieza.
#
# La regla estaba escrita en CLAUDE.md, pero un documento es un cartel,
# no una barrera: quien escribió el filtro del calendario no lo leyó.
# Esto sí es una barrera — corre en el CI y deja el cambio en rojo.
#
# CÓMO FUNCIONA: igual que el techo de avisos de lint del backend. No
# juzga si cada desplegable de hoy está bien o mal; solo impide que el
# número CREZCA. La deuda puede bajar cuando se migre una pantalla;
# subirla exige tocar este archivo a propósito, y ahí alguien pregunta
# por qué.
#
# SI ESTE PORTERO TE FRENÓ, la salida casi siempre es una de dos:
#   · lista de opciones con buscador  →  <SelectWithSearch />
#   · elegir varias con casillas      →  <MultiSelect />
# Si de verdad hiciste falta algo que ninguna de las dos hace, la
# respuesta correcta es AGRANDAR la pieza de la casa (para que las 15
# pantallas que ya la usan se beneficien), no escribir una copia nueva.
#
# Se corre solo en el CI. A mano:  npm run portero

set -uo pipefail

# ── Los techos ───────────────────────────────────────────────────────
# Medidos el 13-08-2026. Solo se tocan A LA BAJA cuando se migra algo,
# o al alza con una razón escrita en el mensaje del commit.

TECHO_CON_BUSCADOR=6   # ServiciosTab ×3, QuotationForm ×3
TECHO_PANELES=22       # incluye menús "⋮" legítimos, que también cuentan

# ── Candado 1: desplegables CON BUSCADOR escritos a mano ─────────────
# Firma: la cabecera de búsqueda pegada arriba del panel. Es la copia
# textual de SelectWithSearch, y este número debería llegar a cero.

con_buscador=$(grep -rn "sticky top-0 bg-white p-2 border-b" src --include="*.tsx" 2>/dev/null \
  | grep -v '^src/components/' | wc -l | tr -d ' ')

# ── Candado 2: cualquier panel flotante escrito a mano ───────────────
# Firma: un panel posicionado a mano (absolute + capa + fondo + sombra).
# Es a propósito más ancho que el candado 1: así atrapa también los que
# NO tienen buscador — como el filtro de estados del calendario, que se
# escribió a mano teniendo MultiSelect al lado y no habría sido pillado
# por el candado 1.

paneles=$(grep -rnE 'absolute' src --include="*.tsx" 2>/dev/null \
  | grep -E 'z-[0-9]+' | grep 'bg-white' | grep -E 'shadow-(lg|md|xl)' \
  | grep -v '^src/components/' | wc -l | tr -d ' ')

# ── Veredicto ────────────────────────────────────────────────────────

echo "Portero de desplegables"
echo "  con buscador a mano : ${con_buscador} (techo ${TECHO_CON_BUSCADOR})"
echo "  paneles flotantes   : ${paneles} (techo ${TECHO_PANELES})"

falla=0

if [ "$con_buscador" -gt "$TECHO_CON_BUSCADOR" ]; then
  falla=1
  echo ""
  echo "RECHAZADO — apareció un desplegable con buscador escrito a mano."
  echo "Usa <SelectWithSearch />: ya trae buscador sin tildes, flechas,"
  echo "Enter, Escape, se abre hacia arriba si no cabe, se mide contra"
  echo "el modal y se cierra al pinchar fuera."
  echo ""
  echo "Los que hay hoy:"
  grep -rn "sticky top-0 bg-white p-2 border-b" src --include="*.tsx" 2>/dev/null \
    | grep -v '^src/components/' | cut -d: -f1,2 | sed 's/^/  /'
fi

if [ "$paneles" -gt "$TECHO_PANELES" ]; then
  falla=1
  echo ""
  echo "RECHAZADO — apareció un panel flotante nuevo escrito a mano."
  echo "Si es para elegir de una lista, usa <SelectWithSearch /> o"
  echo "<MultiSelect />. Si de verdad es otra cosa (un menú de acciones,"
  echo "un aviso), sube el techo en este archivo y explica por qué en el"
  echo "mensaje del commit."
fi

if [ "$falla" -ne 0 ]; then
  echo ""
  echo "Ver la sección 'The house kit' en CLAUDE.md."
  exit 1
fi

# Si la deuda bajó, hay que bajar el techo: si no, se abre espacio para
# que vuelva a subir sin que nadie se entere.
if [ "$con_buscador" -lt "$TECHO_CON_BUSCADOR" ] || [ "$paneles" -lt "$TECHO_PANELES" ]; then
  echo ""
  echo "La deuda bajó — baja también los techos en este archivo"
  echo "(TECHO_CON_BUSCADOR=${con_buscador}, TECHO_PANELES=${paneles})"
  echo "para que el terreno ganado no se pierda."
fi

echo "OK"
