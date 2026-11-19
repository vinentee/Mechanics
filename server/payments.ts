import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { Config } from "./config.js";
import type { Database, Queryable } from "./db.js";
import type { Mailer } from "./mail.js";
import { OFFER, type Access, type Order } from "../shared/types.js";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}
export interface OrderRow {
  id: string;
  user_id: string;
  amount_cents: number;
  status: string;
  created_at: Date | string;
  access_end: Date | string | null;
  access_start: Date | string | null;
  payment_id: string | null;
  approved_at: Date | string | null;
  preference_id: string | null;
  checkout_url: string | null;
  advertising_consent: boolean;
  provider_updated_at: Date | string | null;
  payment_mode: Config["mpMode"] | null;
}
export function iso(value: Date | string | null): string | null {
  return value ? new Date(value).toISOString() : null;
}
export function publicOrder(row: OrderRow): Order {
  return {
    id: row.id,
    status: row.status,
    createdAt: iso(row.created_at)!,
    amountCents: row.amount_cents,
    accessExpiresAt: iso(row.access_end),
  };
}
export function plusMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const last = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, last));
  return result;
}

export async function getAccess(
  db: Queryable,
  userId: string,
  now = new Date(),
): Promise<Access> {
  const { rows } = await db.query<{
    expires_at: Date | string;
    documents_used: number;
    active: boolean;
  }>(
    "SELECT expires_at, documents_used, active FROM entitlements WHERE user_id=$1 ORDER BY CASE WHEN active=true AND expires_at>$2 THEN 0 ELSE 1 END, expires_at DESC LIMIT 1",
    [userId, now],
  );
  const row = rows[0];
  return {
    active: !!row && row.active && new Date(row.expires_at) > now,
    expiresAt: row ? iso(row.expires_at) : null,
    used: row?.documents_used ?? 0,
    limit: OFFER.documentLimit,
  };
}

export function verifyWebhook(
  signature: string | undefined,
  requestId: string | undefined,
  paymentId: string,
  secret: string,
  now = new Date(),
): boolean {
  if (
    !secret ||
    !signature ||
    !requestId ||
    requestId.length > 200 ||
    !/^[a-zA-Z0-9]+$/.test(paymentId)
  )
    return false;
  const fields = Object.fromEntries(
    signature.split(",").map((part) =>
      part
        .trim()
        .split("=")
        .map((s) => s.trim()),
    ),
  );
  if (
    !/^\d{10,13}$/.test(fields.ts || "") ||
    !/^[a-fA-F0-9]{64}$/.test(fields.v1 || "")
  )
    return false;
  const time = Number(fields.ts) * (fields.ts.length <= 10 ? 1000 : 1);
  if (Math.abs(now.getTime() - time) > 300000) return false;
  const manifest = `id:${paymentId.toLowerCase()};request-id:${requestId};ts:${fields.ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest();
  const actual = Buffer.from(fields.v1, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

interface Payment {
  id: number | string;
  external_reference: string;
  status: string;
  transaction_amount: number;
  transaction_amount_refunded?: number;
  currency_id: string;
  collector_id: number | string;
  live_mode: boolean;
  date_approved?: string | null;
  date_last_updated?: string | null;
}
export function createPaymentService(
  db: Database,
  config: Config,
  mailer: Mailer,
  fetcher: typeof fetch = fetch,
  now = () => new Date(),
) {
  function checkOrderMode(order: OrderRow) {
    if (order.payment_mode && order.payment_mode !== config.mpMode) {
      throw new ApiError(
        422,
        "O pedido pertence a outro ambiente de pagamento.",
        "PAYMENT_MODE_MISMATCH",
      );
    }
  }

  async function mpRequest(
    path: string,
    options: RequestInit = {},
  ): Promise<Record<string, any>> {
    try {
      const response = await fetcher(`https://api.mercadopago.com${path}`, {
        ...options,
        headers: {
          Authorization: `Bearer ${config.mpAccessToken}`,
          "Content-Type": "application/json",
          ...options.headers,
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return (await response.json()) as Record<string, any>;
    } catch {
      throw new ApiError(
        502,
        "O meio de pagamento está indisponível. Tente novamente em alguns instantes.",
        "PAYMENT_PROVIDER_ERROR",
      );
    }
  }

  async function applyPayment(paymentId: string, expectedOrderId?: string) {
    if (!/^\d{1,30}$/.test(paymentId))
      throw new ApiError(400, "Identificador de pagamento inválido.");
    const payment = (await mpRequest(`/v1/payments/${paymentId}`)) as Payment;
    const liveModeMatches =
      payment.live_mode === (config.mpMode === "production") ||
      (config.mpMode === "sandbox" &&
        config.allowSandboxCheckout &&
        config.sandboxAllowLiveMode &&
        payment.live_mode === true);
    if (
      String(payment.id) !== paymentId ||
      String(payment.collector_id) !== config.mpCollectorId ||
      payment.currency_id !== "BRL" ||
      payment.transaction_amount !== OFFER.priceCents / 100 ||
      !liveModeMatches ||
      typeof payment.external_reference !== "string" ||
      (expectedOrderId && payment.external_reference !== expectedOrderId)
    )
      throw new ApiError(
        422,
        "O pagamento não corresponde à oferta ou à conta recebedora.",
        "PAYMENT_MISMATCH",
      );
    const acceptedStatuses = [
      "pending",
      "in_process",
      "authorized",
      "approved",
      "rejected",
      "cancelled",
      "refunded",
      "charged_back",
      "in_mediation",
    ];
    if (!acceptedStatuses.includes(payment.status))
      throw new ApiError(422, "Status de pagamento desconhecido.");
    const refunded =
      Math.round((payment.transaction_amount_refunded || 0) * 100) >=
      OFFER.priceCents;
    const status = refunded ? "refunded" : payment.status;
    const parsedUpdated = payment.date_last_updated
      ? new Date(payment.date_last_updated)
      : null;
    const providerUpdated =
      parsedUpdated && Number.isFinite(parsedUpdated.getTime())
        ? parsedUpdated
        : null;
    const result = await db.transaction(async (tx) => {
      const { rows } = await tx.query<OrderRow>(
        "SELECT * FROM orders WHERE id=$1 FOR UPDATE",
        [payment.external_reference],
      );
      const order = rows[0];
      if (!order) throw new ApiError(404, "Pedido não encontrado.");
      checkOrderMode(order);
      if (order.amount_cents !== Math.round(payment.transaction_amount * 100))
        throw new ApiError(422, "Valor do pedido divergente.");
      if (order.payment_id && order.payment_id !== paymentId) {
        if (order.approved_at && status === "approved")
          throw new ApiError(
            409,
            "Este pedido já possui outro pagamento aprovado. Entre em contato com o suporte.",
          );
        if (
          order.approved_at ||
          (status !== "approved" &&
            ["pending", "in_process", "authorized"].includes(order.status))
        )
          return { order, activated: false };
      }
      if (order.payment_id === paymentId) {
        if (
          order.provider_updated_at &&
          providerUpdated &&
          providerUpdated < new Date(order.provider_updated_at)
        )
          return { order, activated: false };
        if (
          ["refunded", "charged_back"].includes(order.status) &&
          status === "approved"
        )
          return { order, activated: false };
      }
      let activated = false;
      let approvedAt = order.approved_at;
      let start = order.access_start;
      let end = order.access_end;
      if (status === "approved") {
        if (!start || !end) {
          const paymentDate = payment.date_approved
            ? new Date(payment.date_approved)
            : now();
          if (
            !Number.isFinite(paymentDate.getTime()) ||
            paymentDate.getTime() > now().getTime() + 300000 ||
            paymentDate.getTime() <
              new Date(order.created_at).getTime() - 300000
          )
            throw new ApiError(422, "Data de aprovação inválida.");
          approvedAt = paymentDate;
          start = paymentDate;
          end = plusMonths(paymentDate, OFFER.months);
          await tx.query(
            "INSERT INTO entitlements(id,order_id,user_id,starts_at,expires_at,active) VALUES($1,$2,$3,$4,$5,true) ON CONFLICT(order_id) DO NOTHING",
            [randomUUID(), order.id, order.user_id, start, end],
          );
          await tx.query(
            "INSERT INTO events(id,name,user_id,order_id,metadata,payment_mode) VALUES($1,$2,$3,$4,$5,$6)",
            [
              randomUUID(),
              "purchase",
              order.user_id,
              order.id,
              JSON.stringify({ amountCents: OFFER.priceCents }),
              config.mpMode,
            ],
          );
          activated = true;
        } else
          await tx.query(
            "UPDATE entitlements SET active=true WHERE order_id=$1",
            [order.id],
          );
      } else
        await tx.query(
          "UPDATE entitlements SET active=false WHERE order_id=$1",
          [order.id],
        );
      await tx.query(
        "UPDATE orders SET status=$1,payment_id=$2,approved_at=$3,access_start=$4,access_end=$5,provider_updated_at=$6,payment_mode=$7 WHERE id=$8",
        [
          status,
          paymentId,
          approvedAt,
          start,
          end,
          providerUpdated || order.provider_updated_at,
          config.mpMode,
          order.id,
        ],
      );
      if (
        order.status !== status &&
        ["refunded", "charged_back", "cancelled", "in_mediation"].includes(
          status,
        )
      )
        await tx.query(
          "INSERT INTO events(id,name,user_id,order_id,metadata,payment_mode) VALUES($1,$2,$3,$4,$5,$6)",
          [
            randomUUID(),
            status === "refunded" ? "refund" : "access_revoked",
            order.user_id,
            order.id,
            JSON.stringify({ status }),
            config.mpMode,
          ],
        );
      return {
        order: {
          ...order,
          status,
          payment_id: paymentId,
          approved_at: approvedAt,
          access_start: start,
          access_end: end,
          payment_mode: config.mpMode,
        },
        activated,
      };
    });
    if (result.activated) {
      const { rows } = await db.query<{ email: string; name: string }>(
        "SELECT email,name FROM users WHERE id=$1",
        [result.order.user_id],
      );
      if (rows[0])
        try {
          await mailer({
            to: rows[0].email,
            subject: "Seu acesso ao OrçaMecânica está liberado",
            text: `Olá, ${rows[0].name}!\n\nSeu pagamento foi confirmado. Você tem 12 meses de acesso, até ${new Date(result.order.access_end!).toLocaleDateString("pt-BR")}.\n\nEntre em ${config.appUrl}/app, configure sua marca e monte o primeiro orçamento. As fotos ficam apenas no PDF: guarde o arquivo no aparelho.\n\nSuporte: ${config.sellerEmail}`,
          });
        } catch {
          console.error(
            "Falha no e-mail de boas-vindas; acesso já está disponível.",
          );
        }
    }
    return result.order;
  }

  async function checkout(
    user: { id: string; email: string },
    utm: Record<string, string>,
    consent: boolean,
  ) {
    const id = randomUUID();
    const createdAt = now();
    const cutoff = new Date(createdAt.getTime() - 86400000);
    const reserved = await db.transaction(async (tx) => {
      await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [user.id]);
      if ((await getAccess(tx, user.id, now())).active)
        throw new ApiError(409, "Você já possui acesso ativo.");
      const recent = await tx.query<OrderRow>(
        `
        SELECT * FROM orders
        WHERE user_id=$1 AND (payment_mode=$2 OR payment_mode IS NULL)
          AND (status IN ('created','pending','in_process','authorized','in_mediation')
            OR (status IN ('rejected','cancelled') AND approved_at IS NULL AND created_at>$3))
        ORDER BY created_at DESC LIMIT 1
      `,
        [user.id, config.mpMode, cutoff],
      );
      const pending = recent.rows[0];
      if (pending) return pending;
      await tx.query(
        "INSERT INTO orders(id,user_id,amount_cents,created_at,utm,advertising_consent,payment_mode) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          id,
          user.id,
          OFFER.priceCents,
          createdAt,
          JSON.stringify(utm),
          consent,
          config.mpMode,
        ],
      );
      return null;
    });
    if (reserved) {
      const retryable = ["created", "rejected", "cancelled"];
      if (
        reserved.checkout_url &&
        new Date(reserved.created_at) > cutoff &&
        retryable.includes(reserved.status)
      ) {
        // The webhook may be delayed when a buyer returns to the purchase page.
        const current = await reconcileOrder(reserved);
        if (current.status === "approved")
          throw new ApiError(
            409,
            "Seu pagamento foi confirmado. Abra sua conta para usar o acesso.",
            "ALREADY_ACTIVE",
          );
        if (retryable.includes(current.status) && !current.approved_at)
          return { url: reserved.checkout_url, orderId: reserved.id };
      }
      throw new ApiError(
        409,
        "Há um pedido em processamento. Confira o pagamento na sua conta antes de tentar novamente.",
        "ORDER_PROCESSING",
      );
    }
    try {
      const response = await mpRequest("/checkout/preferences", {
        method: "POST",
        headers: { "X-Idempotency-Key": id },
        body: JSON.stringify({
          items: [
            {
              id: "orcamecanica-12m",
              title: "OrçaMecânica — 12 meses de acesso",
              quantity: 1,
              currency_id: "BRL",
              unit_price: OFFER.priceCents / 100,
            },
          ],
          ...(user.email.length <= 150 ? { payer: { email: user.email } } : {}),
          external_reference: id,
          back_urls: {
            success: `${config.appUrl}/pagamento?order=${id}&result=success`,
            pending: `${config.appUrl}/pagamento?order=${id}&result=pending`,
            failure: `${config.appUrl}/pagamento?order=${id}&result=failure`,
          },
          ...(config.appUrl.startsWith("https://")
            ? { auto_return: "approved" }
            : {}),
          ...(config.appUrl.startsWith("https://")
            ? { notification_url: `${config.appUrl}/api/webhooks/mercadopago` }
            : {}),
          payment_methods: {
            installments: 1,
            excluded_payment_types: [{ id: "ticket" }, { id: "atm" }],
          },
          statement_descriptor: "ORCAMECANICA",
          expires: true,
          expiration_date_from: createdAt.toISOString(),
          expiration_date_to: new Date(
            createdAt.getTime() + 86400000,
          ).toISOString(),
        }),
      });
      const url =
        config.mpMode === "sandbox"
          ? response.sandbox_init_point
          : response.init_point;
      if (
        typeof url !== "string" ||
        !/^https:\/\/(?:[a-z0-9-]+\.)*mercadopago\.(?:com\.br|com)\//i.test(
          url,
        ) ||
        typeof response.id !== "string"
      )
        throw new ApiError(502, "O checkout não retornou um endereço válido.");
      await db.transaction(async (tx) => {
        const saved = await tx.query(
          "UPDATE orders SET preference_id=$1,checkout_url=$2 WHERE id=$3 AND status='created' AND checkout_url IS NULL RETURNING id",
          [response.id, url, id],
        );
        if (!saved.rows.length)
          throw new ApiError(
            409,
            "Confira o pedido na sua conta antes de iniciar outro checkout.",
            "ORDER_PROCESSING",
          );
        await tx.query(
          "INSERT INTO events(id,name,user_id,order_id,metadata,payment_mode) VALUES($1,$2,$3,$4,$5,$6)",
          [
            randomUUID(),
            "begin_checkout",
            user.id,
            id,
            JSON.stringify(utm),
            config.mpMode,
          ],
        );
      });
      return { url, orderId: id };
    } catch (error) {
      // A saved checkout link may have reached the buyer. Keep that order available for reconciliation.
      try {
        await db.query(
          "UPDATE orders SET status='checkout_failed' WHERE id=$1 AND status='created' AND checkout_url IS NULL AND payment_id IS NULL",
          [id],
        );
      } catch {
        console.error("Falha ao registrar a interrupção do checkout.");
      }
      throw error;
    }
  }

  async function reconcileOrder(order: OrderRow) {
    checkOrderMode(order);
    if (order.approved_at && order.payment_id)
      return applyPayment(order.payment_id, order.id);
    const result = await mpRequest(
      `/v1/payments/search?external_reference=${encodeURIComponent(order.id)}&sort=date_created&criteria=desc&limit=10`,
    );
    const candidates = Array.isArray(result.results) ? result.results : [];
    const matching = candidates.filter(
      (p: Payment) => p.external_reference === order.id,
    );
    const payment =
      matching.find((p: Payment) => p.status === "approved") || matching[0];
    if (payment?.id) return applyPayment(String(payment.id), order.id);
    if (order.payment_id) return applyPayment(order.payment_id, order.id);
    const expiry = order.checkout_url ? 86400000 : 5 * 60000;
    if (
      order.status === "created" &&
      new Date(order.created_at).getTime() < now().getTime() - expiry
    ) {
      const { rows } = await db.query<OrderRow>(
        "UPDATE orders SET status='expired' WHERE id=$1 AND payment_id IS NULL AND status='created' RETURNING *",
        [order.id],
      );
      return rows[0] || order;
    }
    return order;
  }

  async function refund(order: OrderRow) {
    checkOrderMode(order);
    if (order.status === "refunded") return order;
    if (order.status !== "approved" || !order.payment_id || !order.approved_at)
      throw new ApiError(
        409,
        "Este pedido não está disponível para reembolso automático.",
      );
    if (now().getTime() - new Date(order.approved_at).getTime() > 7 * 86400000)
      throw new ApiError(
        409,
        `O prazo do reembolso automático terminou. Fale com ${config.sellerEmail}.`,
      );
    const verified = await applyPayment(order.payment_id, order.id);
    if (verified.status === "refunded") return verified;
    if (verified.status !== "approved")
      throw new ApiError(
        409,
        "Este pagamento não está disponível para reembolso automático.",
      );
    await mpRequest(`/v1/payments/${order.payment_id}/refunds`, {
      method: "POST",
      headers: { "X-Idempotency-Key": `refund-${order.id}` },
      body: "{}",
    });
    return applyPayment(order.payment_id, order.id);
  }
  return { checkout, applyPayment, reconcileOrder, refund };
}
