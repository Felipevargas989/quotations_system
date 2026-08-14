#!/usr/bin/env bash
#
# EL PORTERO DEL KIT DE LA CASA
#
# Por qué existe (13-08-2026, pedido de Felipe):
# el sistema tiene piezas propias —desplegable con buscador, elección
# múltiple, avisos, confirmaciones, campo numérico— y aun así se seguían
# escribiendo copias a mano al lado de la pieza que ya existía. Cada
# copia vuelve a descubrir los mismos errores de a uno: el buscador con
# los argumentos al revés, el panel que empuja los botones del modal, el
# que no se cierra al pinchar fuera, el que se corta dentro de una
# ventana. Todos ya resueltos adentro de la pieza.
#
# La regla estaba escrita en CLAUDE.md, pero un documento es un cartel,
# no una barrera: quien escribió el filtro del calendario no lo leyó.
# Esto sí es una barrera — corre en el CI y deja el cambio en rojo.
#
# CÓMO FUNCIONA: igual que el techo de avisos de lint del backend. No
# juzga si cada caso de hoy está bien o mal; solo impide que el número
# CREZCA. La deuda puede bajar cuando se migre una pantalla; subirla
# exige tocar este archivo a propósito, y ahí alguien pregunta por qué.
#
# ══════════════════════════════════════════════════════════════════════
# PARA AGREGAR UNA PIEZA NUEVA AL SISTEMA
#
# Este portero es GENÉRICO a propósito: cuando se cree una pieza nueva
# en components/, se le agrega acá su regla —UNA llamada a `revisar`— y
# queda protegida desde el primer día. No se escribe otro portero.
#
# La regla necesita tres cosas:
#   1. cómo se ve la copia a mano (una expresión regular),
#   2. cuántas hay hoy (el techo),
#   3. qué usar en su lugar (el mensaje de ayuda).
#
# Si la copia a mano NO se puede reconocer con una expresión regular
# confiable, es mejor no inventar una regla: un portero con falsas
# alarmas se termina ignorando, y entonces no sirve de nada.
# ══════════════════════════════════════════════════════════════════════
#
# Se corre solo en el CI. A mano:  npm run portero

set -uo pipefail

# ── Anclarse a su propia casa ────────────────────────────────────────
# Corrido desde otra carpeta, el portero no encontraba src/, contaba
# CERO en todo y daba "OK, la deuda bajó" — un portero que aprueba
# cuando no sabe dónde está es peor que no tener portero. Ahora se para
# solo en frontend/, corran el comando desde donde lo corran.
cd "$(dirname "$0")/.." || { echo "ERROR: no encuentro la carpeta frontend/"; exit 1; }

# Y si aun así no ve el código, se detiene en vez de aprobar a ciegas.
[ -d src ] || { echo "ERROR: no existe src/ — el portero no puede revisar nada"; exit 1; }

fallas=0
resumen=""

# ── Buscador que NO se deja engañar por los comentarios ──────────────
# Media docena de comentarios del código dicen cosas como "reemplaza al
# confirm() del navegador". Si el portero los contara, pondría techos
# que dejarían entrar confirms de verdad. Así que antes de contar, a
# cada línea encontrada se le borra la parte comentada y se vuelve a
# preguntar si el patrón sigue ahí.

# El segundo argumento, opcional, son los archivos DONDE LA PIEZA VIVE:
# ahí el patrón tiene que aparecer, es su casa. Las piezas de
# `src/components/` ya quedan fuera por el `-not -path` de abajo, pero
# las que viven en `src/utils/` —los diccionarios— hay que nombrarlas.

buscar() {
  local patron="$1" casaDeLaPieza="${2:-}"
  local salida
  salida=$(
  find src \( -name "*.tsx" -o -name "*.ts" \) -not -path "src/components/*" 2>/dev/null \
    | sort \
    | xargs awk -v pat="$patron" '
        FNR == 1 { enbloque = 0 }
        {
          original = $0
          linea = $0

          # ¿venimos arrastrando un comentario de varias líneas?
          if (enbloque) {
            p = index(linea, "*/")
            if (p == 0) next            # la línea entera es comentario
            linea = substr(linea, p + 2)
            enbloque = 0
          }

          # comentarios que abren y cierran en la misma línea
          while (match(linea, /\/\*.*\*\//)) {
            linea = substr(linea, 1, RSTART - 1) substr(linea, RSTART + RLENGTH)
          }

          # comentario que abre y queda abierto
          p = index(linea, "/*")
          if (p > 0) { linea = substr(linea, 1, p - 1); enbloque = 1 }

          # comentario de una línea
          sub(/\/\/.*/, "", linea)

          if (linea ~ pat) printf "%s:%d:%s\n", FILENAME, FNR, original
        }'
  )
  if [ -n "$casaDeLaPieza" ]; then
    printf '%s' "$salida" | grep -vE "$casaDeLaPieza" || true
  else
    printf '%s' "$salida"
  fi
}

# ── El verificador ───────────────────────────────────────────────────
#   revisar "<nombre>" <techo> "<qué usar>" "<patrón>" ["<casa de la pieza>"]

revisar() {
  local nombre="$1" techo="$2" remedio="$3" patron="$4" casa="${5:-}"
  local hallazgos cuantos
  hallazgos=$(buscar "$patron" "$casa")
  cuantos=$(printf '%s' "$hallazgos" | grep -c . )

  local marca="ok"
  [ "$cuantos" -gt "$techo" ] && marca="RECHAZADO"
  [ "$cuantos" -lt "$techo" ] && marca="bajó"

  printf '  %-42s %3s / %-3s  %s\n' "$nombre" "$cuantos" "$techo" "$marca"
  resumen="${resumen}${nombre}|${cuantos}|${techo}"$'\n'

  if [ "$cuantos" -gt "$techo" ]; then
    fallas=$((fallas + 1))
    echo ""
    echo "  ── RECHAZADO: $nombre"
    echo "     Usa: $remedio"
    echo "     Encontrado:"
    printf '%s\n' "$hallazgos" | cut -d: -f1,2 | sed 's/^/       /'
    echo ""
  fi
}

echo "Portero del kit de la casa"
echo "  (pieza a reusar)                       hay / techo"
echo ""

# ══ LAS REGLAS ═══════════════════════════════════════════════════════
# Techos medidos el 13-08-2026. Solo se tocan A LA BAJA cuando se migra
# algo, o al alza con la razón escrita en el mensaje del commit.

# ── SelectWithSearch — elegir UNA cosa, con buscador ─────────────────

revisar "lista plegable con buscador a mano" 0 \
  "<SelectWithSearch /> — trae buscador sin tildes, flechas, Enter, Escape, se abre hacia arriba si no cabe, se mide contra el modal y se cierra al pinchar fuera" \
  'sticky top-0 bg-white p-2 border-b'

revisar "lista nativa <select>" 0 \
  "<SelectWithSearch /> — la nativa no busca, no se estiliza y se ve distinta en cada navegador" \
  '<select'

# ── Cualquier panel flotante a mano ──────────────────────────────────
# Más ancho a propósito: atrapa también los que NO tienen buscador —como
# el filtro de estados del calendario, que es un MULTISELECT y se
# escribió a mano teniendo MultiSelect al lado—. Incluye menús de
# acciones legítimos, y está bien: que un panel nuevo obligue a
# detenerse un segundo es justamente la idea.

revisar "panel flotante a mano (cualquiera)" 15 \
  "<SelectWithSearch /> si es elegir UNA, <MultiSelect /> si es elegir VARIAS. Si de verdad es otra cosa (un menú de acciones), sube el techo acá y explica por qué en el commit" \
  'absolute.*z-[0-9]+.*bg-white.*shadow-(lg|md|xl)'

# ── Toast — todos los avisos ─────────────────────────────────────────

revisar "alert() del navegador" 0 \
  "el Toast de la casa — abajo a la derecha, se apila y no bloquea la pantalla" \
  '(^|[^A-Za-z0-9_])alert[(]'

# ── ConfirmInline — todas las confirmaciones ─────────────────────────

revisar "confirm() del navegador" 0 \
  "<ConfirmInline /> — se ancla al botón que la disparó, sin ventana del navegador" \
  '(^|[^A-Za-z0-9_])confirm[(]'

# ── NumberInput — todo campo numérico ────────────────────────────────
# La coma decimal chilena y el punto que se convierte en coma viven
# adentro de la pieza. Un input nativo los pierde.

revisar 'campo numérico nativo (type="number")' 0 \
  "<NumberInput /> — maneja la coma decimal chilena y convierte el punto en coma" \
  'type="number"'

# ══ LAS PIEZAS DEL MÓDULO DE PERSONAS (14-08) ════════════════════════
#
# Estas cuatro reglas se escriben ANTES de que exista la primera copia.
# Es la primera vez que el candado se pone al derecho: en el desplegable
# con buscador llegamos cuando ya había seis copias, y en el estado de la
# cotización cuando "Realizada" ya era cinco verdes distintos.

# ── RutInput — el RUT y su dígito verificador ────────────────────────
# La regla del módulo 11, la K en mayúscula y los RUT reservados que
# pasan la matemática (el 55.555.555-5 del SII) viven adentro de la
# pieza. Una copia a mano los redescubre de a un rechazo del banco.

revisar "dígito verificador del RUT a mano" 0 \
  "<RutInput /> y utils/rut.ts — ahí viven el módulo 11 y los RUT reservados" \
  'digitoVerificador|dígito verificador|modulo 11|módulo 11' \
  'src/utils/rut\.(ts|test\.ts)'

# ── utils/bancos — la lista de bancos ────────────────────────────────
# Circulan por internet listas de códigos que todavía traen Banco
# Security, Scotiabank Azul y Corpbanca como vigentes. Si alguien pega
# una de esas, la transferencia no llega.

revisar "lista de bancos escrita a mano" 0 \
  "utils/bancos.ts — la lista viene de la CMF y ya trae las equivalencias" \
  'BancoEstado.*Santander|Santander.*BancoEstado|Banco Security|Scotiabank Azul|Corpbanca' \
  'src/utils/bancos\.(ts|test\.ts)'

# ── utils/estadoPersona — activa / no disponible / bloqueada ─────────
# "No disponible" NO es una mala nota. Si se escribe suelto en una
# pantalla, en un año nadie sabe a quién se puede volver a llamar.

revisar "estado de persona escrito a mano" 0 \
  "utils/estadoPersona.ts — un solo lugar para el nombre y el color" \
  '"No disponible"|"Bloqueada"|>No disponible<|>Bloqueada<' \
  'src/utils/estadoPersona\.(ts|test\.ts)'

# ── El campo de hora ─────────────────────────────────────────────────
# Techo 1 A PROPÓSITO: hoy existe UNO hecho a mano en la ficha de cocina
# de Post-Venta. Cuando llegue la etapa de horarios se hace la pieza, se
# migra ese, y este techo baja a 0.

revisar 'campo de hora nativo (type="time")' 1 \
  "cuando se haga la pieza de hora, migrar también el de la ficha de cocina" \
  'type="time"'

# ══ VEREDICTO ════════════════════════════════════════════════════════

echo ""

if [ "$fallas" -gt 0 ]; then
  echo "El portero rechazó el cambio ($fallas regla(s) sobrepasada(s))."
  echo ""
  echo "Antes de escribir una copia a mano: si a la pieza de la casa le"
  echo "falta algo, lo correcto es AGRANDARLA —así ganan de una vez"
  echo "todas las pantallas que ya la usan— y no clonarla al lado."
  echo "Ver la sección 'The house kit' en CLAUDE.md."
  exit 1
fi

# Si la deuda bajó hay que bajar el techo: si no, queda espacio libre
# para que vuelva a subir sin que nadie se entere.
bajaron=$(printf '%s' "$resumen" | awk -F'|' 'NF==3 && $2 < $3 {print "  " $1 ": techo " $3 " -> " $2}')
if [ -n "$bajaron" ]; then
  echo "La deuda BAJÓ. Baja también el techo en este archivo, para que el"
  echo "terreno ganado no quede disponible para perderse:"
  printf '%s\n' "$bajaron"
  echo ""
fi

echo "OK"
