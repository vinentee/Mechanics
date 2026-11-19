import "dotenv/config";
import { readConfig, type Config } from "../server/config.js";
import { openDatabase } from "../server/db.js";
import { createMailer } from "../server/mail.js";
import {
  ApiError,
  createPaymentService,
  type OrderRow,
} from "../server/payments.js";

const dayMs = 86_400_000;
const batchSize = 100;
const usage = "Uso: npm run reconcile [-- --apply]";

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(usage);
    return;
  }
  if (args.some((arg) => arg !== "--apply")) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }

  const apply = args.includes("--apply");
  const databaseUrl = process.env.DATABASE_URL;
  const mode = process.env.MP_MODE;
  if (!databaseUrl || (mode !== "production" && mode !== "sandbox")) {
    console.error(
      "Configure DATABASE_URL e selecione o ambiente com MP_MODE=production ou MP_MODE=sandbox.",
    );
    process.exitCode = 1;
    return;
  }

  let config: Config | undefined;
  if (apply) {
    try {
      config = readConfig();
    } catch {
      console.error(
        "Confira a configuração da aplicação antes de aplicar a conciliação.",
      );
      process.exitCode = 1;
      return;
    }
    if (!config.mpAccessToken || !/^\d+$/.test(config.mpCollectorId)) {
      console.error(
        "Configure MP_ACCESS_TOKEN e MP_COLLECTOR_ID no mesmo ambiente dos pedidos.",
      );
      process.exitCode = 1;
      return;
    }
  }

  const db = await openDatabase(databaseUrl);
  try {
    const now = Date.now();
    const { rows } = await db.transaction(async (tx) => {
      await tx.query("SET TRANSACTION READ ONLY");
      return tx.query<OrderRow>(
        `
        SELECT * FROM orders
        WHERE (payment_mode=$1 OR payment_mode IS NULL)
          AND ((created_at >= $2 AND status IN ('created','pending','in_process','authorized','in_mediation','rejected','cancelled'))
            OR (approved_at >= $3 AND status IN ('approved','in_mediation')))
        ORDER BY CASE WHEN status='approved' THEN 1 ELSE 0 END, created_at DESC, id
        LIMIT $4
      `,
        [
          mode,
          new Date(now - 7 * dayMs),
          new Date(now - 30 * dayMs),
          batchSize + 1,
        ],
      );
    });
    const batch = rows.slice(0, batchSize);
    const counts = new Map<string, number>();
    for (const order of batch)
      counts.set(order.status, (counts.get(order.status) ?? 0) + 1);
    console.log(
      `${batch.length} pedido(s) selecionado(s) no ambiente ${mode}.`,
    );
    if (counts.size)
      console.table(
        Array.from(counts, ([status, pedidos]) => ({ status, pedidos })),
      );
    if (rows.length > batchSize)
      console.log(
        `A execução considera os primeiros ${batchSize} pedidos da janela.`,
      );

    if (!apply || !config) {
      console.log(
        "Prévia concluída. Use --apply para consultar o Mercado Pago e atualizar os pedidos.",
      );
      return;
    }

    const payments = createPaymentService(db, config, createMailer(config));
    const outcomes = new Map<string, number>();
    let failures = 0;
    for (const order of batch) {
      let result: string;
      try {
        const current = await payments.reconcileOrder(order);
        result =
          current.status === order.status
            ? "sem mudança de estado"
            : `${order.status} → ${current.status}`;
      } catch (error) {
        failures++;
        result =
          error instanceof ApiError
            ? `erro ${error.code || error.status}`
            : "erro interno";
      }
      outcomes.set(result, (outcomes.get(result) ?? 0) + 1);
    }
    if (outcomes.size)
      console.table(
        Array.from(outcomes, ([resultado, pedidos]) => ({
          resultado,
          pedidos,
        })),
      );
    if (failures) {
      console.error(
        `${failures} pedido(s) não foram conciliados. Verifique a conexão e as configurações do ambiente.`,
      );
      process.exitCode = 1;
    }
  } finally {
    await db.close();
  }
}

main().catch(() => {
  console.error(
    "Não foi possível consultar os pedidos. Confira o banco e as migrações da aplicação.",
  );
  process.exitCode = 1;
});
