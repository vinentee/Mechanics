import "dotenv/config";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase, type Database } from "../server/db.js";

const timezone = "America/Sao_Paulo";
const campaignPattern = /^[A-Za-z0-9_.-]{1,120}$/;
const usage = "Uso: npm run metrics [-- --days=7 --campaign=lancamento]";

interface MetricsRow {
  dia: string;
  campanha: string;
  visitas: number;
  demonstracoes: number;
  checkouts: number;
  compras_confirmadas: number;
  compras_ativas: number;
  reembolsos: number;
  primeiros_pdfs: number;
  acessos_revogados: number;
}

export async function readMetrics(
  db: Database,
  days: number,
  campaign: string | null,
  now = new Date(),
) {
  return db.transaction(async (tx) => {
    await tx.query("SET TRANSACTION READ ONLY");
    return tx.query<MetricsRow>(
      `
      WITH labeled AS (
        SELECT (e.created_at AT TIME ZONE $1::text)::date::text AS dia, e.name, o.status,
          COALESCE(o.utm, e.metadata)->>'utm_campaign' AS utm_campaign
        FROM events e LEFT JOIN orders o ON o.id=e.order_id
        WHERE COALESCE(o.payment_mode, e.payment_mode)='production'
          AND e.created_at >= (((($4::timestamptz AT TIME ZONE $1::text)::date - ($2::int - 1))::timestamp) AT TIME ZONE $1::text)
          AND e.created_at <= $4
      ), scoped AS (
        SELECT dia, name, status,
          CASE WHEN utm_campaign ~ '^[A-Za-z0-9_.-]{1,120}$' THEN utm_campaign ELSE '(sem campanha)' END AS campanha
        FROM labeled
      )
      SELECT dia, campanha,
        COUNT(*) FILTER (WHERE name='page_view')::int AS visitas,
        COUNT(*) FILTER (WHERE name='demo_view')::int AS demonstracoes,
        COUNT(*) FILTER (WHERE name='begin_checkout')::int AS checkouts,
        COUNT(*) FILTER (WHERE name='purchase')::int AS compras_confirmadas,
        COUNT(*) FILTER (WHERE name='purchase' AND status='approved')::int AS compras_ativas,
        COUNT(*) FILTER (WHERE name='refund')::int AS reembolsos,
        COUNT(*) FILTER (WHERE name='first_pdf')::int AS primeiros_pdfs,
        COUNT(*) FILTER (WHERE name='access_revoked')::int AS acessos_revogados
      FROM scoped
      WHERE $3::text IS NULL OR campanha=$3
      GROUP BY dia, campanha ORDER BY dia DESC, campanha
    `,
      [timezone, days, campaign, now],
    );
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(usage);
    return;
  }
  const daysArg = args.find((arg) => arg.startsWith("--days="));
  const days = daysArg ? Number(daysArg.slice(7)) : 7;
  const campaignArg = args.find((arg) => arg.startsWith("--campaign="));
  const campaign = campaignArg?.slice(11) ?? null;
  if (
    !Number.isInteger(days) ||
    days < 1 ||
    days > 90 ||
    (campaign !== null && !campaignPattern.test(campaign)) ||
    args.some((arg) => arg !== daysArg && arg !== campaignArg)
  ) {
    console.error(
      `${usage}\nUse de 1 a 90 dias e um identificador UTM sem espaços.`,
    );
    process.exitCode = 1;
    return;
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("Configure DATABASE_URL para o banco de produção.");
    process.exitCode = 1;
    return;
  }
  const db = await openDatabase(databaseUrl);
  try {
    const { rows } = await readMetrics(db, days, campaign);
    console.log(
      `Métricas de produção dos últimos ${days} dia(s) em horário de Brasília.`,
    );
    if (rows.length) console.table(rows);
    else console.log("Nenhum evento de produção no período selecionado.");
  } finally {
    await db.close();
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch(() => {
    console.error(
      "Não foi possível consultar as métricas. Confira o banco e as migrações da aplicação.",
    );
    process.exitCode = 1;
  });
}
