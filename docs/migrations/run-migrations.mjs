#!/usr/bin/env node
// Migration runner for the shared Supabase/Postgres database.
//
// Applies the numbered .sql files in THIS folder, in order, exactly once each,
// tracking what has already run in a `public.schema_migrations` table. It is the
// automated equivalent of "paste the SQL into the Supabase SQL editor" — used by
// the release pipeline (.github/workflows/release.yml) so a PR merge applies the
// DB changes before the backend/frontend deploy.
//
// Usage:
//   SUPABASE_DB_URL=postgres://... node run-migrations.mjs            # apply pending
//   SUPABASE_DB_URL=postgres://... node run-migrations.mjs --baseline # mark all
//        current files as already-applied WITHOUT running them (one-time, for a DB
//        whose migrations were applied by hand before this runner existed).
//   SUPABASE_DB_URL=postgres://... node run-migrations.mjs --dry-run  # list pending
//
// Ordering rules:
//   - Files are ordered by their numeric prefix (1_, 2_, ... , 10_, 11_).
//   - Within the same number, the migration runs BEFORE its `.backfill.sql`.
//   - `0_initial_models.sql` is a context-only schema snapshot and is skipped.
//
// Each file runs inside its own transaction: if it throws, that file is rolled
// back and the process exits non-zero, so the release pipeline stops before any
// code is deployed. Files use IF NOT EXISTS / ON CONFLICT where possible, but the
// tracking table is the real guard against double-application.

import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const MIGRATIONS_DIR = dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));
const BASELINE = args.has('--baseline');
const DRY_RUN = args.has('--dry-run');

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error(
    'ERROR: SUPABASE_DB_URL is not set. Provide the Supabase Postgres connection ' +
      'string (Project Settings → Database → Connection string → URI).',
  );
  process.exit(1);
}

// Parse "<n>_name.sql" / "<n>_name.backfill.sql". Returns null for files we ignore.
function parseMigration(filename) {
  const match = /^(\d+)_.*\.sql$/.exec(filename);
  if (!match) return null;
  const number = Number(match[1]);
  if (number === 0) return null; // 0_initial_models.sql is a snapshot, never executed.
  const isBackfill = filename.endsWith('.backfill.sql');
  return { filename, number, isBackfill };
}

function orderMigrations(a, b) {
  if (a.number !== b.number) return a.number - b.number;
  // Same number: run the schema migration before its backfill.
  if (a.isBackfill !== b.isBackfill) return a.isBackfill ? 1 : -1;
  return a.filename.localeCompare(b.filename);
}

async function main() {
  const entries = await readdir(MIGRATIONS_DIR);
  const migrations = entries
    .map(parseMigration)
    .filter(Boolean)
    .sort(orderMigrations);

  const client = new pg.Client({
    connectionString,
    // Supabase requires TLS; the pooler cert isn't in the CI trust store.
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        filename   text PRIMARY KEY,
        checksum   text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    const { rows } = await client.query(
      'SELECT filename, checksum FROM public.schema_migrations',
    );
    const applied = new Map(rows.map((r) => [r.filename, r.checksum]));

    const pending = [];
    for (const m of migrations) {
      const sql = await readFile(join(MIGRATIONS_DIR, m.filename), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      if (applied.has(m.filename)) {
        // Guard against editing a migration after it has been applied.
        if (applied.get(m.filename) !== checksum) {
          throw new Error(
            `${m.filename} was already applied but its contents changed ` +
              `(checksum mismatch). Never edit an applied migration — add a new one.`,
          );
        }
        continue;
      }
      pending.push({ ...m, sql, checksum });
    }

    if (pending.length === 0) {
      console.log('No pending migrations. Database is up to date.');
      return;
    }

    if (BASELINE) {
      // Record everything as applied without running any SQL.
      for (const m of pending) {
        await client.query(
          'INSERT INTO public.schema_migrations (filename, checksum) VALUES ($1, $2) ' +
            'ON CONFLICT (filename) DO NOTHING',
          [m.filename, m.checksum],
        );
        console.log(`baselined  ${m.filename}`);
      }
      console.log(`\nBaselined ${pending.length} migration(s). Nothing was executed.`);
      return;
    }

    console.log(`Pending migrations (${pending.length}):`);
    for (const m of pending) console.log(`  - ${m.filename}`);
    if (DRY_RUN) {
      console.log('\n--dry-run: nothing was executed.');
      return;
    }

    for (const m of pending) {
      process.stdout.write(`applying   ${m.filename} ... `);
      try {
        await client.query('BEGIN');
        await client.query(m.sql);
        await client.query(
          'INSERT INTO public.schema_migrations (filename, checksum) VALUES ($1, $2)',
          [m.filename, m.checksum],
        );
        await client.query('COMMIT');
        console.log('ok');
      } catch (err) {
        await client.query('ROLLBACK');
        console.log('FAILED');
        throw new Error(`Migration ${m.filename} failed: ${err.message}`);
      }
    }

    console.log(`\nApplied ${pending.length} migration(s) successfully.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`\n${err.message}`);
  process.exit(1);
});
