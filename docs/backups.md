# Respaldos automáticos de la base de datos

La base de datos Supabase ("Cotizador") está en el plan Free, que **no incluye backups
automáticos**. Este repo los resuelve con GitHub Actions:
`.github/workflows/db-backup.yml`.

## Qué hace

- Corre **todos los días a las 07:00 UTC** (03:00 hora de Chile continental) y también se
  puede lanzar a mano desde la pestaña **Actions → Database Backup → Run workflow**.
- Genera dos archivos por corrida y los guarda como *artifacts* del workflow con
  **90 días de retención**:
  - `eventia_<fecha>.dump` — respaldo completo (esquema + datos, formato custom de
    `pg_dump`, comprimido).
  - `schema_<fecha>.sql` — solo el esquema, en SQL legible (útil para comparar cambios
    de estructura entre fechas).
- Verifica que el dump sea restaurable (`pg_restore -l`) y que contenga la cantidad de
  tablas esperada antes de darlo por bueno; si algo falla, el workflow queda en rojo.

## Configuración (una sola vez)

1. En Supabase: **Project Settings → Database → Connection string**, copiar la URI del
   **Session pooler** (host `*.pooler.supabase.com`, puerto 5432). No usar el host
   directo `db.<ref>.supabase.co`: los runners de GitHub son IPv4 y ese host es IPv6.
2. En GitHub: **Settings → Secrets and variables → Actions → New repository secret**,
   crear `SUPABASE_DB_URL` con esa URI (incluida la contraseña de la base).
3. Lanzar una corrida manual desde **Actions** para verificar que quede en verde.

## Cómo restaurar

Descargar el artifact desde la corrida correspondiente en la pestaña Actions y luego:

```bash
# Restaurar TODO en una base (por ejemplo, un proyecto dev):
pg_restore --no-owner --no-privileges -d "$TARGET_DB_URL" eventia_<fecha>.dump

# Restaurar solo una tabla (ejemplo: variable_services):
pg_restore --no-owner --no-privileges -d "$TARGET_DB_URL" -t variable_services eventia_<fecha>.dump
```

## Consideraciones

- Los artifacts viven dentro del repo en GitHub: son privados (mismo acceso que el repo)
  y sobreviven aunque el proyecto Supabase se borre — ese es el punto de tener el
  respaldo *fuera* de Supabase.
- Retención: 90 días corridos. Si se necesita retención más larga (mensual/anual),
  descargar el artifact que se quiera conservar, o extender el workflow para subir a
  otro destino (bucket, repo de respaldos, etc.).
- Si en el futuro se contrata el plan Pro de Supabase (backups diarios oficiales), este
  workflow sigue siendo útil como copia externa e independiente.
