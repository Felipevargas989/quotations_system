# Despliegue pendiente — anotado el 25-07-2026

Esto quedó **listo y probado, pero sin subir a producción**. El código está
commiteado y está en tu Mac; lo que falta es publicarlo. Son dos pasos y **el
orden no se puede invertir** (más abajo está el porqué, con nombre y apellido).

Mientras esto no se suba, la web sigue funcionando igual que siempre. No hay
nada roto esperando. Lo único que pasa es que el arreglo del descuento todavía
no está en producción, así que el error que le pasó a la 248 podría volver a
pasarle a alguien del equipo hasta que subamos.

---

## Paso 1 — El backend, a Railway. Lo corres tú, desde tu Mac.

Abre la Terminal y escribe esto, tal cual, una línea a la vez:

```
cd ~/Documents/GitHub/quotations_system/api-rest
railway up
```

Eso sube el backend y se queda mostrando el avance. Tarda un par de minutos.
Cuando termine tiene que decir algo con la palabra **success** o **deployed**.
Si termina con **failed**, no toques nada más y me lo cuentas: el despliegue
anterior sigue vivo, así que la web no se cae.

**Si `railway up` te reclama algo antes de empezar:**

- *"Project not linked"* o parecido → escribe `railway link` y te va a preguntar
  tres cosas, una tras otra. Elige: proyecto **eventia-dev**, entorno
  **production**, servicio **api-rest**. Después vuelve a correr `railway up`.
- *"Unauthorized"* o *"Please login"* → escribe `railway login`. Se te abre el
  navegador para que confirmes con tu cuenta, y después vuelves a la Terminal y
  corres `railway up`.

## Paso 2 — El frontend, a Netlify. Lo hago yo.

Cuando el paso 1 haya terminado bien, me avisas y lo dejo arriba en el mismo
rato. Yo compilo la web de nuevo y la publico en el sitio de siempre
(*eventia-dev*, el que responde en www.eventi-app.com).

No necesitas hacer nada en este paso. Lo dejo anotado igual para que sepas que
falta, y para que no des el trabajo por cerrado hasta que los dos pasos estén
hechos.

---

## Por qué primero el backend y no al revés

Esta es la parte importante de la nota, así que va sin adornos.

El frontend nuevo, cada vez que alguien guarda una cotización, manda un dato
que antes no mandaba: el **monto** de la propina (`tip_amount`). El backend que
está hoy en producción es del 23 de julio y todavía no conoce ese dato — la
línea que lo acepta entró en un commit que justamente es de los que no hemos
subido.

Y el backend no es tolerante con lo que no conoce: está configurado para
rechazar de plano cualquier dato que no tenga en su lista
(`forbidNonWhitelisted`). Traducido: si subo el frontend solo, **cada vez que
alguien del equipo apriete Guardar en una cotización, el sistema le va a dar
error**. No algunas. Todas. Por eso no lo subí solo cuando me dijiste "súbelo",
aunque técnicamente podía.

Al revés no pasa nada: el backend nuevo entiende lo viejo y lo nuevo, así que
entre el paso 1 y el paso 2 el sistema queda funcionando igual que hoy.

## Por qué no lo pude hacer yo entero

Railway, en este proyecto, no se despliega solo desde GitHub: se sube a mano
desde el computador con `railway up`. Y para eso hay que estar con la sesión
iniciada. En el ambiente donde yo trabajo esa sesión no existe, y para crearla
haría falta que me pasaras una credencial tuya — que es exactamente la línea
que ya te dije que no cruzo, la misma del token de Netlify. Prefiero que el
comando lo corras tú en treinta segundos antes que quedarme yo con una llave
de tu sistema.

Netlify sí lo puedo hacer yo directamente, y por eso el paso 2 queda de mi lado.

---

## Lo que YA está hecho — no lo repitas

- **La base de datos ya está migrada.** La migración 37 corrió en Supabase el
  25-07: la columna `tip_amount` ya existe y ya está rellenada. No hay que
  correr ningún SQL antes ni después de subir.
- **Los datos ya están limpios.** La cotización 248 quedó sin el descuento
  fantasma (su total no se tocó: sigue en $3.225.950), y las nueve de Vivo
  Corriendo quedaron sin el porcentaje de propina que nunca se cobró. Revisé
  las 371 cotizaciones de la base y no queda ninguna descuadrada.
- **Ninguna cotización cambió de monto.** Ni una. La suma de todos los totales
  antes y después es la misma.
- **El código está commiteado** (`9c2b771`) y está en tu Mac.

Lo que falta son **cinco commits** que existen en tu Mac pero no en producción:

```
13a61f6  Propina: mismo criterio en todo el sistema
7a86421  Guardar el MONTO de la propina (migración 37)
9c2b771  El total se calcula al guardar, no se lee de la pantalla
9c9c3b4  Decir POR QUÉ no se puede eliminar una cotización
b40ca2d  Teléfonos con formato chileno y fijos habilitados (26-07)
```

El tercero es el que arregla el bug del descuento — el que hacía que se guardara
"5% de descuento" con el total sin descontar.

El cuarto salió de lo que te pasó el 26-07 tratando de eliminar una cotización.
El sistema te lo impedía con razón (tenía plan de pagos, y la base no deja
borrar una cotización con plata amarrada), pero te lo decía con un *"intenta de
nuevo"* que nunca iba a funcionar. Ahora te dice el motivo real y la salida:
si tiene pagos registrados, anularla desde Post-Venta; si solo tiene el plan,
devolverla a un estado de pre-venta y ahí sí se puede eliminar. La regla no
cambió — cambió lo que la pantalla te cuenta.

El quinto es el de los teléfonos, del 26-07. Es **solo frontend**: no agrega
nada al paso 1, viaja entero en el paso 2. Por eso, mientras no subamos, en la
web vas a seguir viendo `+56932084213` de corrido en vez de `+56 9 3208 4213`,
y los fijos van a seguir sin poder anotarse. No está roto: está escrito y
esperando turno. Lo único de ese trabajo que ya está surtiendo efecto es lo que
va por el lado de la base y no del código — los 299 teléfonos guardados quedaron
todos en la misma forma.

## Sobre la compilación del frontend

Yo tenía la web ya compilada y lista para publicar, pero eso vivía en una
carpeta temporal que se borra sola. **No se pierde nada**: la vuelvo a compilar
en un minuto cuando llegue el momento. Solo lo anoto para que si mañana me ves
compilando de nuevo, sepas que es normal y no que algo salió mal.

Un detalle mío para acordarme: al compilar hay que dejar a mano el archivo
`_redirects` con `/*  /index.html  200`, porque no está en `frontend/public/` y
sin él los enlaces directos a una cotización dan 404. Te lo he ofrecido arreglar
de raíz tres veces; sigue pendiente y sigue sin ser urgente.

---

## Dos cosas que quedaron esperando respuesta tuya

**1. La cotización 157.** Tiene subtotal $669.900 y total $602.910. La plata del
descuento *sí* está adentro del total (es un 10% exacto), pero en la ficha el
descuento figura en cero. El documento que ve el cliente se muestra bien. El
problema es el otro lado: si alguien abre la 157 y la guarda, el total se le
sube de vuelta a $669.900, porque el editor no ve descuento alguno que aplicar.

Se arregla anotándole el 10%, y eso **no mueve ni un peso**. No lo hice por mi
cuenta porque anotar "10% de descuento" es afirmar algo sobre cómo se cerró ese
trato, y capaz que fue un precio conversado y no un descuento. ¿Te acuerdas de
esa cotización?

**2. Los 234 commits que no están en GitHub.** Todo el trabajo del último tiempo
existe en dos lugares: tu Mac y el ambiente temporal donde trabajo yo (que se
borra). En GitHub la última versión es de hace rato. Si tu Mac falla, se pierde.
Es la única cosa de esta lista que me tiene realmente inquieto. Cuando quieras
lo subimos, o te dejo un archivo de respaldo — cualquiera de las dos toma poco.
