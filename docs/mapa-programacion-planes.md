# Eventia — Mapa de programación: Planes y cobro automático

_Roadmap técnico. Última actualización: 24-07-2026._
_Diseño de negocio de los planes: ver `Eventia_Planes.md`._

---

## 0. Objetivo en una frase

Vender Eventia por 3 planes, donde **cada empresa ve y usa SOLO los módulos
del plan que pagó**. Al registrarse queda en prueba (o bloqueada), al pagar se
abre sola, y si deja de pagar se bloquea sola. Cero intervención manual.

---

## 1. La regla central (lo que pidió Felipe)

Los planes son **ACUMULATIVOS**. "Ver solo lo de mi plan" significa **mi plan
y los de abajo, NO los de arriba**:

- Paga **Cotiza** ($20) → ve Cotiza.
- Paga **Gestiona y Cobra** ($50) → ve Cotiza + Gestiona. **NO** ve el
  Dashboard/inteligencia (eso es Crece).
- Paga **Crece** ($120) → ve todo.

> Frase textual de Felipe: _"cuando alguien pague el plan gestiona y cobra
> solo vea lo del plan gestiona y cobra"_.

---

## 2. Estado actual (qué hay y qué falta)

- `companies.is_active` existe, pero **hoy no gatea nada** — nadie la mira como
  candado.
- **Ya existe un patrón de permisos por ROL**: `canAccessSection(rol, seccion)`
  en `frontend/src/constants/permissions`. El candado por plan será una **capa
  gemela**: `canAccessByPlan(plan, seccion)`. El acceso real = _el rol lo
  permite Y el plan lo permite_.
- La página **Planes** (`/plans`) hoy linkea a **un** plan viejo de Mercado
  Pago (≈$10 USD). No refleja los 3 planes.
- **No existe** columna de plan ni de suscripción en `companies`. No hay
  webhook de cobro. No hay lógica de expiración.

---

## 3. Decisiones pendientes (bloquean el arranque)

- [ ] **Proveedor de pago:** Mercado Pago (recomendado — funciona en Chile,
  deposita en CLP, ya está conectado) vs Stripe (requiere entidad en
  EE.UU./extranjero para recibir fondos; con RUT chileno no se puede retirar
  bien).
- [ ] **Al registrarse:** prueba gratis 7 días → luego bloquea (coincide con la
  landing), o bloqueada de inmediato.
- [ ] **¿Límite por uso además del candado?** (ej. 15 cotizaciones/mes en
  Cotiza; ilimitadas arriba). Opcional; convierte mejor el tier de entrada.

---

## 4. Modelo de datos

**Agregar a `companies`:**

| Campo | Tipo | Para qué |
|---|---|---|
| `plan` | text | `'cotiza'` \| `'gestiona'` \| `'crece'` \| null |
| `subscription_status` | text | `'trialing'` \| `'active'` \| `'past_due'` \| `'locked'` \| `'canceled'` |
| `trial_ends_at` | timestamptz | fin de la prueba gratis |
| `current_period_end` | timestamptz | hasta cuándo está pagado |
| `provider` | text | `'mercadopago'` \| `'stripe'` |
| `provider_customer_id` | text | id del cliente en el proveedor |
| `provider_subscription_id` | text | `preapproval_id` (MP) / `subscription_id` (Stripe) |

`is_active` se puede derivar de `subscription_status` (active/trialing = activa);
se mantiene por compatibilidad.

**Nueva tabla `subscription_events`** (auditoría de cada aviso del proveedor):
`id, company_id, provider, event_type, raw jsonb, created_at`. Sirve para
depurar y para no procesar dos veces el mismo webhook (idempotencia).

---

## 5. El candado por plan — mapa módulo → plan

Usa las **mismas llaves de sección** que ya existen en el código
(`Sidebar.tsx` / `permissions`):

| Sección (llave en código) | Menú | Cotiza $20 | Gestiona $50 | Crece $120 |
|---|---|:--:|:--:|:--:|
| `requests` | Requerimientos | ✅ | ✅ | ✅ |
| `quotations` | Cotizaciones | ✅ | ✅ | ✅ |
| `services` (catálogo) | Servicios | ✅ | ✅ | ✅ |
| `clients` (básico) | Clientes | ✅ | ✅ | ✅ |
| `payments` | Post‑Venta | — | ✅ | ✅ |
| `logistics` | Logística | — | ✅ | ✅ |
| `calendar` | Calendario | — | ✅ | ✅ |
| `dashboard` | Dashboard | — | — | ✅ |
| `customer_satisfaction_survey` | Encuestas | — | — | ✅ |

**Sub-candados DENTRO de un módulo compartido** (no basta con ocultar el menú):

- **Servicios:** catálogo y precios = Cotiza; pestañas **"Receta"** y
  **"Costos"** = Gestiona.
- **Clientes:** ficha básica = Cotiza; **multi-contacto, ficha 360°, tipos
  gestionables, filtro de segmentos** = Gestiona.
- **Cotizador:** **eventos multi-día** = Gestiona.
- **Dashboard:** el módulo completo (KPIs, márgenes, pipeline, análisis) =
  Crece.
- **Gestión de usuarios:** 1 usuario (Cotiza) / hasta 5 (Gestiona) / ilimitados
  (Crece) — candado por **cantidad**, no por ocultar el módulo.
- **Email automático** (confirmación de pago, encuestas, cobranza) = Crece.
- **Configuración de empresa** y **Planes** (`/plans`): visibles en **todos**
  los planes (la de Planes es donde se paga/mejora).

---

## 6. Cómo se implementa el candado (2 capas)

**Capa 1 — Frontend (lo visible):**
- `Sidebar`: ocultar, o mejor **mostrar con candado 🔒**, los ítems fuera del
  plan.
- **Route guard:** si entra por URL a un módulo fuera de su plan → **pantalla
  de upsell** ("Mejora a Crece para ver tu Dashboard y tus márgenes") en vez de
  la app.
- Nueva función `canAccessByPlan(plan, seccion)`, gemela de
  `canAccessSection(rol, seccion)`.

> **Recomendación de venta:** mostrar el módulo bloqueado con un teaser
> ("esto es lo que te estás perdiendo") **convierte mejor** que esconderlo. Es
> la palanca de subida: Cotizar engancha → Cobrar vale el salto → saber si
> ganas justifica el tope.

**Capa 2 — Backend (la seguridad de verdad):**
- Esconder UI **no es seguridad**. El `api-rest` debe **rechazar** las llamadas
  a endpoints fuera del plan (guard por `company.plan`). Si no, cualquiera con
  la URL de la API entra igual.

---

## 7. Flujo de pago automático (máquina de estados)

1. **Registro** → `subscription_status` inicial (`trialing` 7 días, o
   `locked`).
2. Botón **"Activar / Mejorar plan"** en `/plans` → checkout del proveedor
   (**un plan de suscripción por tier**).
3. **Webhook** (endpoint nuevo, ej. `POST /webhooks/mercadopago`):
   - pago aprobado / suscripción autorizada → `plan` = tier pagado,
     `status = active`, `current_period_end = +1 mes`.
   - pago recurrente OK → extiende `current_period_end`.
   - pago falla → `past_due` (aviso + gracia corta).
   - cancela / no paga → `locked`.
4. **Cron diario** (ya hay infra de cron en el backend) → baja a `locked` las
   empresas que pasaron `current_period_end` o el fin de la prueba.

---

## 8. Reparto de trabajo

**De Felipe:**
- Cuenta de Mercado Pago (ya la tiene).
- Crear **3 planes de suscripción** (preapproval) $20 / $50 / $120 y pasar los
  IDs.
- Llaves en Railway (access token MP + secreto de webhook) — igual que Resend.

**Mío (Claude):**
- Migración de base (campos nuevos + `subscription_events`).
- `canAccessByPlan` + candados de Sidebar + route guards + pantallas de upsell.
- Guard de plan en el backend (enforcement real).
- Endpoint de webhook + máquina de estados + cron de expiración.
- Reconstruir `/plans` con los 3 tiers y el botón de cada uno.

---

## 9. Orden sugerido de construcción (fases)

1. **Base + grandfather:** agregar campos; poner a las empresas actuales
   (Valle del Sol y la demo Vivo Corriendo) en `plan='crece'`, `status='active'`
   para que **nada** les cambie.
2. **Candado de lectura:** `canAccessByPlan` + Sidebar + guards + upsell (con
   los planes puestos a mano). Ya se puede "ver por plan" **sin cobro todavía**.
3. **Enforcement en backend.**
4. **Página `/plans`** con los 3 tiers.
5. **Checkout + webhook + máquina de estados** (el cobro automático real).
6. **Prueba 7 días + cron de expiración.**
7. **(Opción) límite por uso.**

Las fases 1–2 ya dejan visible y demostrable "cada quien ve lo de su plan",
que es exactamente lo que pediste, sin depender aún del proveedor de pago.

---

## 10. Riesgos y notas

- **Grandfather obligatorio:** las empresas vivas deben quedar en Crece/active
  **antes** de encender el candado, o pierden módulos de golpe.
- **Downgrade:** definir qué pasa con los datos de un módulo cuando alguien baja
  de plan — **no borrar**; bloquear lectura/edición y conservar todo.
- **Email (Crece)** sigue esperando la clave de **Resend**; al vender Crece hay
  que tenerla encendida (confirmaciones, encuestas, cobranza automática).
- **Demo Vivo Corriendo** conviene dejarla en **Crece** para que muestre TODO
  en las demostraciones a prospectos.
- **Stripe más adelante:** si algún día facturas en USD desde una entidad en el
  extranjero, este mismo diseño sirve — solo cambia el proveedor del paso 7.
- **Idempotencia del webhook:** procesar cada evento una sola vez (por eso la
  tabla `subscription_events`).

---

## 11. Pendiente de confirmar por Felipe (antes de programar)

1. Proveedor: **Mercado Pago** o Stripe.
2. Registro: **prueba 7 días** o bloqueo inmediato.
3. ¿Límite por uso en Cotiza? (sí/no).
4. ¿Empezamos por las **fases 1–2** (ver por plan, sin cobro) para tenerlo
   visible ya, y dejamos el cobro para después?
