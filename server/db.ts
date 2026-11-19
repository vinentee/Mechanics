import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

export interface Result<T> {
  rows: T[];
  rowCount: number;
}
export interface Queryable {
  query<T = Record<string, unknown>>(
    sql: string,
    values?: unknown[],
  ): Promise<Result<T>>;
}
export interface Database extends Queryable {
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export async function openDatabase(
  url?: string,
  localPath = ".local/database",
): Promise<Database> {
  if (url) {
    const pool = new pg.Pool({
      connectionString: url,
      max: 8,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
    });
    pool.on("error", () =>
      console.error("Uma conexão ociosa do PostgreSQL foi encerrada."),
    );
    const wrap = (client: pg.Pool | pg.PoolClient): Queryable => ({
      async query<T>(sql: string, values: unknown[] = []) {
        const result = await client.query(sql, values);
        return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
      },
    });
    return {
      ...wrap(pool),
      async transaction<T>(fn: (tx: Queryable) => Promise<T>) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const value = await fn(wrap(client));
          await client.query("COMMIT");
          return value;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      },
      async close() {
        await pool.end();
      },
    };
  }
  if (localPath !== ":memory:")
    await mkdir(resolve(localPath), { recursive: true });
  const engine = new PGlite(
    localPath === ":memory:" ? undefined : resolve(localPath),
  );
  await engine.waitReady;
  // PGlite shares one connection: keep complete transactions isolated from other calls.
  let queue = Promise.resolve();
  const exclusive = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(fn, fn);
    queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
  const direct: Queryable = {
    async query<T>(sql: string, values: unknown[] = []) {
      const result = await engine.query<T>(sql, values);
      return {
        rows: result.rows,
        rowCount: result.affectedRows ?? result.rows.length,
      };
    },
  };
  return {
    query: (sql, values) => exclusive(() => direct.query(sql, values)),
    transaction: (fn) =>
      exclusive(async () => {
        await engine.exec("BEGIN");
        try {
          const value = await fn(direct);
          await engine.exec("COMMIT");
          return value;
        } catch (error) {
          await engine.exec("ROLLBACK");
          throw error;
        }
      }),
    close: () => exclusive(() => engine.close()),
  };
}

export const migrations = [
  {
    version: 1,
    sql: `
CREATE TABLE users (
 id text PRIMARY KEY, email text NOT NULL UNIQUE, name text NOT NULL, password_hash text NOT NULL,
 accepted_terms_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(), next_quote_number integer NOT NULL DEFAULT 1
);
CREATE TABLE sessions (token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE reset_tokens (token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at timestamptz NOT NULL, used_at timestamptz);
CREATE TABLE profiles (user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, payload jsonb NOT NULL);
CREATE TABLE orders (
 id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), amount_cents integer NOT NULL CHECK(amount_cents = 9700),
 currency text NOT NULL DEFAULT 'BRL', status text NOT NULL DEFAULT 'created', preference_id text, checkout_url text,
 payment_id text UNIQUE, created_at timestamptz NOT NULL DEFAULT now(), approved_at timestamptz,
 access_start timestamptz, access_end timestamptz, utm jsonb NOT NULL DEFAULT '{}', advertising_consent boolean NOT NULL DEFAULT false
);
CREATE INDEX orders_user ON orders(user_id);
CREATE TABLE entitlements (
 id text PRIMARY KEY, order_id text NOT NULL UNIQUE REFERENCES orders(id), user_id text NOT NULL REFERENCES users(id),
 starts_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, active boolean NOT NULL DEFAULT true,
 documents_used integer NOT NULL DEFAULT 0 CHECK(documents_used >= 0 AND documents_used <= 300)
);
CREATE INDEX entitlements_user ON entitlements(user_id);
CREATE TABLE quotes (
 id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), entitlement_id text NOT NULL REFERENCES entitlements(id),
 number integer NOT NULL, payload jsonb NOT NULL, total_cents integer NOT NULL CHECK(total_cents >= 0),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id, number)
);
CREATE INDEX quotes_user ON quotes(user_id);
CREATE TABLE events (id text PRIMARY KEY, name text NOT NULL, user_id text REFERENCES users(id) ON DELETE SET NULL, order_id text REFERENCES orders(id), metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX events_created ON events(created_at);
`,
  },
  {
    version: 2,
    sql: `ALTER TABLE orders ADD COLUMN provider_updated_at timestamptz`,
  },
  {
    version: 3,
    sql: `
ALTER TABLE orders ADD COLUMN payment_mode text CHECK(payment_mode IN ('sandbox','production'));
ALTER TABLE events ADD COLUMN payment_mode text CHECK(payment_mode IN ('sandbox','production'));
`,
  },
];

export async function migrate(db: Database) {
  await db.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  for (const migration of migrations)
    await db.transaction(async (tx) => {
      // Lock migration table so concurrent Railway deployments cannot apply twice.
      await tx.query("LOCK TABLE schema_migrations IN EXCLUSIVE MODE");
      const exists = await tx.query(
        "SELECT version FROM schema_migrations WHERE version=$1",
        [migration.version],
      );
      if (exists.rows.length) return;
      // Queries containing no parameters can carry the migration's multiple SQL statements.
      for (const statement of migration.sql
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean))
        await tx.query(statement);
      await tx.query("INSERT INTO schema_migrations(version) VALUES($1)", [
        migration.version,
      ]);
    });
}
