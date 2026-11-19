import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createHmac, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { Duplex } from "node:stream";
import { createApp } from "../server/app.js";
import { readConfig } from "../server/config.js";
import { migrate, openDatabase, type Database } from "../server/db.js";
import { plusMonths, verifyWebhook } from "../server/payments.js";
import { emptyProfile, exampleQuote } from "../shared/types.js";
import type { Email } from "../server/mail.js";
import { readMetrics } from "../scripts/metrics.js";

// Feed raw HTTP to Node's parser over an in-process stream. This exercises the real
// Express middleware and cookie headers without opening a TCP port in restricted CI.
class MemorySocket extends Duplex {
  readonly output: Buffer[] = [];
  readonly remoteAddress = "127.0.0.1";
  _read() {}
  _write(chunk: Buffer, _encoding: BufferEncoding, callback: () => void) {
    this.output.push(Buffer.from(chunk));
    callback();
  }
  setTimeout() {
    return this;
  }
  setNoDelay() {
    return this;
  }
  setKeepAlive() {
    return this;
  }
}
type HttpResult = {
  status: number;
  headers: Record<string, string[]>;
  body: any;
};
class HttpProbe implements PromiseLike<HttpResult> {
  private headers: Record<string, string> = {
    Host: "localhost",
    Connection: "close",
  };
  private payload = "";
  private assertions: Array<(response: HttpResult) => void> = [];
  constructor(
    private app: ReturnType<typeof createApp>,
    private method: string,
    private path: string,
    private jar?: Map<string, string>,
  ) {}
  set(key: string | Record<string, string>, value?: string) {
    if (typeof key === "string") this.headers[key] = value!;
    else Object.assign(this.headers, key);
    return this;
  }
  send(data: unknown) {
    this.payload = JSON.stringify(data);
    this.headers["Content-Type"] = "application/json";
    return this;
  }
  expect(status: number, body?: unknown) {
    this.assertions.push((response) => {
      expect(response.status, JSON.stringify(response.body)).toBe(status);
      if (body !== undefined) expect(response.body).toEqual(body);
    });
    return this;
  }
  then<T = HttpResult, R = never>(
    resolve?: ((value: HttpResult) => T | PromiseLike<T>) | null,
    reject?: ((reason: unknown) => R | PromiseLike<R>) | null,
  ) {
    return this.execute().then(resolve, reject);
  }
  private async execute() {
    const response = await new Promise<HttpResult>((resolve, reject) => {
      const server = createServer(this.app);
      const socket = new MemorySocket();
      socket.on("error", reject);
      socket.on("finish", () => {
        const raw = Buffer.concat(socket.output).toString("utf8");
        const separator = raw.indexOf("\r\n\r\n");
        const [statusLine, ...lines] = raw.slice(0, separator).split("\r\n");
        const headers: Record<string, string[]> = {};
        for (const line of lines) {
          const colon = line.indexOf(":");
          if (colon > 0)
            (headers[line.slice(0, colon).toLowerCase()] ??= []).push(
              line.slice(colon + 1).trim(),
            );
        }
        const bodyText = raw.slice(separator + 4);
        let body: unknown = null;
        if (bodyText)
          try {
            body = JSON.parse(bodyText);
          } catch {
            body = bodyText;
          }
        for (const cookie of headers["set-cookie"] || []) {
          const [key, value] = cookie.split(";")[0].split("=");
          if (value) this.jar?.set(key, value);
          else this.jar?.delete(key);
        }
        resolve({ status: Number(statusLine.split(" ")[1]), headers, body });
      });
      server.emit("connection", socket);
      if (this.jar?.size)
        this.headers.Cookie = Array.from(
          this.jar,
          ([key, value]) => `${key}=${value}`,
        ).join("; ");
      this.headers["Content-Length"] = String(Buffer.byteLength(this.payload));
      socket.push(
        Buffer.from(
          `${this.method} ${this.path} HTTP/1.1\r\n${Object.entries(
            this.headers,
          )
            .map(([key, value]) => `${key}: ${value}`)
            .join("\r\n")}\r\n\r\n${this.payload}`,
        ),
      );
    });
    for (const assertion of this.assertions) assertion(response);
    return response;
  }
}
function client(app: ReturnType<typeof createApp>, jar?: Map<string, string>) {
  return {
    get: (path: string) => new HttpProbe(app, "GET", path, jar),
    post: (path: string) => new HttpProbe(app, "POST", path, jar),
    put: (path: string) => new HttpProbe(app, "PUT", path, jar),
  };
}
const request = Object.assign(client, {
  agent: (app: ReturnType<typeof createApp>) => client(app, new Map()),
});

const origin = "http://localhost:3000";
const password = "UmaSenhaSegura123!";
const fixedNow = new Date("2026-11-11T12:00:00Z");
const config = readConfig({
  NODE_ENV: "test",
  APP_URL: origin,
  SESSION_SECRET: "a".repeat(48),
  MP_ACCESS_TOKEN: "TEST-token",
  MP_WEBHOOK_SECRET: "webhook-secret",
  MP_COLLECTOR_ID: "12345",
  MP_MODE: "sandbox",
  RESEND_API_KEY: "re_test",
  EMAIL_FROM: "OrçaEstofado <teste@empresa.test>",
  SELLER_LEGAL_NAME: "Empresa de Teste",
  SELLER_DOCUMENT: "12345678901",
  SELLER_EMAIL: "suporte@empresa.test",
  SELLER_ADDRESS: "Endereço de teste",
});
let db: Database;
let mail: Email[];
let providerPayment: Record<string, any>;
let providerError: boolean;
let app: ReturnType<typeof createApp>;
const fetcher = vi.fn<typeof fetch>();

beforeAll(async () => {
  db = await openDatabase(undefined, ":memory:");
  await migrate(db);
});
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await db.query("TRUNCATE users CASCADE");
  await db.query("TRUNCATE events");
  mail = [];
  providerError = false;
  providerPayment = {
    id: 777,
    external_reference: "",
    status: "approved",
    transaction_amount: 97,
    transaction_amount_refunded: 0,
    currency_id: "BRL",
    collector_id: 12345,
    live_mode: false,
    date_approved: fixedNow.toISOString(),
  };
  fetcher.mockReset();
  fetcher.mockImplementation(async (url, options) => {
    const target = String(url);
    if (providerError) return new Response("{}", { status: 503 });
    if (target.endsWith("/checkout/preferences")) {
      const body = JSON.parse(String(options?.body));
      providerPayment.external_reference = body.external_reference;
      return Response.json({
        id: "pref-test",
        sandbox_init_point:
          "https://sandbox.mercadopago.com.br/checkout/v1/redirect?pref_id=test",
        init_point:
          "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=test",
      });
    }
    if (target.endsWith("/refunds")) {
      providerPayment.status = "refunded";
      providerPayment.transaction_amount_refunded = 97;
      return Response.json({ id: "refund-test" });
    }
    if (target.includes("/payments/search"))
      return Response.json({ results: [providerPayment] });
    return Response.json(providerPayment);
  });
  app = createApp({
    db,
    config,
    fetcher,
    mailer: async (email) => {
      mail.push(email);
    },
    now: () => fixedNow,
    disableRateLimits: true,
  });
});

async function register(email = `user-${randomUUID()}@empresa.test`) {
  const agent = request.agent(app);
  const response = await agent
    .post("/api/auth/register")
    .set("Origin", origin)
    .send({ name: "Profissional Teste", email, password, acceptTerms: true })
    .expect(201);
  return {
    agent,
    user: response.body.user as { id: string; email: string },
    response,
  };
}
async function grant(userId: string) {
  const orderId = randomUUID();
  const entitlementId = randomUUID();
  await db.query(
    "INSERT INTO orders(id,user_id,amount_cents,status,created_at,approved_at,access_start,access_end) VALUES($1,$2,9700,'approved',$3,$3,$3,$4)",
    [orderId, userId, fixedNow, plusMonths(fixedNow, 12)],
  );
  await db.query(
    "INSERT INTO entitlements(id,order_id,user_id,starts_at,expires_at) VALUES($1,$2,$3,$4,$5)",
    [entitlementId, orderId, userId, fixedNow, plusMonths(fixedNow, 12)],
  );
  return { orderId, entitlementId };
}
function signature(id = "777", date = fixedNow) {
  const ts = String(Math.floor(date.getTime() / 1000));
  const requestId = "request-test";
  const v1 = createHmac("sha256", config.mpWebhookSecret)
    .update(`id:${id};request-id:${requestId};ts:${ts};`)
    .digest("hex");
  return { "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": requestId };
}
async function webhook(id = "777") {
  return request(app)
    .post(`/api/webhooks/mercadopago?data.id=${id}`)
    .set(signature(id))
    .send({ type: "payment", data: { id } });
}
async function orderThroughCheckout(agent: ReturnType<typeof request.agent>) {
  const response = await agent
    .post("/api/checkout")
    .set("Origin", origin)
    .send({
      utm: { utm_source: "meta", utm_campaign: "lancamento" },
      consent: true,
    })
    .expect(200);
  return response.body.orderId as string;
}

describe("autenticação e segurança", () => {
  it("cria sessão segura, exige origem e não libera plano durante cadastro", async () => {
    await request(app)
      .get("/api/auth/me")
      .expect(200, { user: null, access: null, profile: null });
    await request(app)
      .post("/api/auth/register")
      .set("Origin", "https://malicioso.test")
      .send({})
      .expect(403);
    const { response, agent } = await register();
    expect(response.headers["set-cookie"][0]).toMatch(/HttpOnly/);
    expect(response.headers["set-cookie"][0]).toMatch(/SameSite=Lax/);
    expect(response.body.access.active).toBe(false);
    await agent
      .post("/api/quotes")
      .set("Origin", origin)
      .send(exampleQuote())
      .expect(403);
    expect((await agent.get("/api/auth/me")).body.user.id).toBe(
      response.body.user.id,
    );
    await agent.post("/api/auth/logout").set("Origin", origin).expect(204);
    expect((await agent.get("/api/auth/me")).body.user).toBeNull();
  });

  it("recupera senha com token único, mensagem genérica e invalidação de sessões", async () => {
    const { agent, user } = await register();
    const known = await agent
      .post("/api/auth/forgot-password")
      .set("Origin", origin)
      .send({ email: user.email })
      .expect(200);
    const unknown = await request(app)
      .post("/api/auth/forgot-password")
      .set("Origin", origin)
      .send({ email: "naoexiste@empresa.test" })
      .expect(200);
    expect(known.body).toEqual(unknown.body);
    expect(known.body).not.toHaveProperty("token");
    const token = /token=([a-f0-9]+)/.exec(mail[0].text)![1];
    await request(app)
      .post("/api/auth/reset-password")
      .set("Origin", origin)
      .send({ token, password: "OutraSenhaSegura123!" })
      .expect(200);
    expect((await agent.get("/api/auth/me")).body.user).toBeNull();
    await request(app)
      .post("/api/auth/reset-password")
      .set("Origin", origin)
      .send({ token, password })
      .expect(400);
    await request(app)
      .post("/api/auth/login")
      .set("Origin", origin)
      .send({ email: user.email, password })
      .expect(401);
    await request(app)
      .post("/api/auth/login")
      .set("Origin", origin)
      .send({ email: user.email, password: "OutraSenhaSegura123!" })
      .expect(200);
  });

  it("rejeita senhas truncadas por bcrypt e termos não aceitos", async () => {
    await request(app)
      .post("/api/auth/register")
      .set("Origin", origin)
      .send({
        name: "Teste",
        email: "teste@empresa.test",
        password: "á".repeat(40),
        acceptTerms: true,
      })
      .expect(400);
    await request(app)
      .post("/api/auth/register")
      .set("Origin", origin)
      .send({
        name: "Teste",
        email: "teste@empresa.test",
        password,
        acceptTerms: false,
      })
      .expect(400);
  });
});

describe("orçamentos, dados e limites", () => {
  it("isola usuários, calcula centavos e permite reedição sem consumir outro documento", async () => {
    const one = await register();
    const two = await register();
    await grant(one.user.id);
    await grant(two.user.id);
    const data = {
      ...exampleQuote(),
      issuedOn: "2026-11-11",
      validUntil: "2026-11-18",
      items: [{ name: "Serviço", quantity: 1.5, unitPriceCents: 101 }],
    };
    const response = await one.agent
      .post("/api/quotes")
      .set("Origin", origin)
      .send(data)
      .expect(201);
    expect(response.body.quote.totalCents).toBe(152);
    await two.agent
      .put(`/api/quotes/${response.body.quote.id}`)
      .set("Origin", origin)
      .send(data)
      .expect(404);
    expect((await two.agent.get("/api/quotes")).body.quotes).toHaveLength(0);
    await one.agent
      .put(`/api/quotes/${response.body.quote.id}`)
      .set("Origin", origin)
      .send({ ...data, notes: "Atualizado" })
      .expect(200);
    expect((await one.agent.get("/api/auth/me")).body.access.used).toBe(1);
    await one.agent
      .post(`/api/quotes/${response.body.quote.id}/export`)
      .set("Origin", origin)
      .expect(204);
    await one.agent
      .post(`/api/quotes/${response.body.quote.id}/export`)
      .set("Origin", origin)
      .expect(204);
    expect(
      (await db.query("SELECT id FROM events WHERE name='first_pdf'")).rows,
    ).toHaveLength(1);
  });

  it("mantém o teto de 300 mesmo com requisições concorrentes", async () => {
    const { agent, user } = await register();
    const { entitlementId } = await grant(user.id);
    await db.query("UPDATE entitlements SET documents_used=299 WHERE id=$1", [
      entitlementId,
    ]);
    const outcomes = await Promise.all([
      agent.post("/api/quotes").set("Origin", origin).send(exampleQuote()),
      agent.post("/api/quotes").set("Origin", origin).send(exampleQuote()),
    ]);
    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual([
      201, 403,
    ]);
    expect((await agent.get("/api/auth/me")).body.access.used).toBe(300);
    const created = outcomes.find((outcome) => outcome.status === 201)!.body
      .quote;
    await agent
      .put(`/api/quotes/${created.id}`)
      .set("Origin", origin)
      .send(exampleQuote())
      .expect(200);
  });

  it("rejeita fotos enviadas ao servidor, logos inseguras e datas inválidas", async () => {
    const { agent, user } = await register();
    await grant(user.id);
    await agent
      .post("/api/quotes")
      .set("Origin", origin)
      .send({ ...exampleQuote(), photos: ["data:image/png;bas64,fake"] })
      .expect(400);
    await agent
      .post("/api/quotes")
      .set("Origin", origin)
      .send({ ...exampleQuote(), issuedOn: "2026-02-30" })
      .expect(400);
    await agent
      .post("/api/quotes")
      .set("Origin", origin)
      .send({
        ...exampleQuote(),
        issuedOn: "2026-11-12",
        validUntil: "2026-11-11",
      })
      .expect(400);
    await agent
      .put("/api/profile")
      .set("Origin", origin)
      .send({
        ...emptyProfile(),
        name: "Minha marca",
        logoDataUrl: "data:image/svg+xml;base64,PHN2Zz4=",
      })
      .expect(400);
    await agent
      .put("/api/profile")
      .set("Origin", origin)
      .send({ ...emptyProfile(), name: "Minha marca", email: user.email })
      .expect(200);
    expect((await agent.get("/api/auth/me")).body.profile.name).toBe(
      "Minha marca",
    );
    await db.query("UPDATE entitlements SET expires_at=$1 WHERE user_id=$2", [
      new Date(fixedNow.getTime() - 1000),
      user.id,
    ]);
    await agent.get("/api/quotes").expect(403);
  });
});

describe("pagamentos verificados e acesso", () => {
  it("não abre checkout sem identificação e credenciais completas", async () => {
    const incomplete = createApp({
      db,
      config: { ...config, mpAccessToken: "" },
      mailer: async () => {},
      disableRateLimits: true,
    });
    const client = request.agent(incomplete);
    await client
      .post("/api/auth/register")
      .set("Origin", origin)
      .send({
        name: "Teste",
        email: "teste@empresa.test",
        password,
        acceptTerms: true,
      })
      .expect(201);
    expect((await client.get("/api/config")).body.checkoutReady).toBe(false);
    await client
      .post("/api/checkout")
      .set("Origin", origin)
      .send({})
      .expect(503);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("aprova só após consulta autenticada e trata notificações repetidas sem estender acesso", async () => {
    const { agent, user } = await register();
    const orderId = await orderThroughCheckout(agent);
    expect((await agent.get("/api/auth/me")).body.access.active).toBe(false);
    await request(app)
      .post("/api/webhooks/mercadopago?data.id=777")
      .send({ type: "payment", data: { id: "777" } })
      .expect(401);
    providerPayment.status = "pending";
    await webhook().then((response) => expect(response.status).toBe(200));
    expect((await agent.get("/api/auth/me")).body.access.active).toBe(false);
    providerPayment.status = "approved";
    await webhook().then((response) => expect(response.status).toBe(200));
    const before = (await agent.get("/api/auth/me")).body.access;
    expect(before.active).toBe(true);
    expect(before.expiresAt).toBe("2027-11-11T12:00:00.000Z");
    await agent
      .post("/api/quotes")
      .set("Origin", origin)
      .send(exampleQuote())
      .expect(201);
    await webhook().then((response) => expect(response.status).toBe(200));
    const after = (await agent.get("/api/auth/me")).body.access;
    expect(after.expiresAt).toBe(before.expiresAt);
    expect(after.used).toBe(1);
    expect(
      (
        await db.query("SELECT id FROM entitlements WHERE user_id=$1", [
          user.id,
        ])
      ).rows,
    ).toHaveLength(1);
    expect(
      (await db.query("SELECT id FROM events WHERE name='purchase'")).rows,
    ).toHaveLength(1);
    expect(mail).toHaveLength(1);
    await agent
      .post("/api/checkout")
      .set("Origin", origin)
      .send({})
      .expect(409);
    const other = await register();
    await other.agent.get(`/api/orders/${orderId}`).expect(404);
  });

  it("reserva apenas um pedido ao abrir dois checkouts ao mesmo tempo", async () => {
    const { agent, user } = await register();
    const results = await Promise.all([
      agent.post("/api/checkout").set("Origin", origin).send({}),
      agent.post("/api/checkout").set("Origin", origin).send({}),
    ]);
    expect(results.some((result) => result.status === 200)).toBe(true);
    expect(
      results.every((result) => result.status === 200 || result.status === 409),
    ).toBe(true);
    expect(
      (await db.query("SELECT id FROM orders WHERE user_id=$1", [user.id]))
        .rows,
    ).toHaveLength(1);
    expect(
      fetcher.mock.calls.filter(([url]) =>
        String(url).endsWith("/checkout/preferences"),
      ),
    ).toHaveLength(1);
  });

  it("permite nova tentativa após falha sem link e preserva o pedido com pagamento pendente", async () => {
    const { agent, user } = await register();
    providerError = true;
    await agent
      .post("/api/checkout")
      .set("Origin", origin)
      .send({})
      .expect(502);
    providerError = false;
    const orderId = await orderThroughCheckout(agent);
    providerPayment.status = "pending";
    await agent
      .post("/api/checkout")
      .set("Origin", origin)
      .send({})
      .expect(409);
    const { rows } = await db.query<{
      id: string;
      status: string;
      checkout_url: string | null;
    }>("SELECT id,status,checkout_url FROM orders WHERE user_id=$1", [user.id]);
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.id === orderId)?.status).toBe("pending");
    expect(
      rows.find((row) => row.status === "checkout_failed")?.checkout_url,
    ).toBeNull();
    expect(
      fetcher.mock.calls.filter(([url]) =>
        String(url).endsWith("/checkout/preferences"),
      ),
    ).toHaveLength(2);
  });

  it("aceita uma nova tentativa aprovada após recusa e ignora estado antigo após reembolso", async () => {
    const { agent } = await register();
    await orderThroughCheckout(agent);
    providerPayment.status = "rejected";
    expect((await webhook()).status).toBe(200);
    expect((await agent.get("/api/auth/me")).body.access.active).toBe(false);
    Object.assign(providerPayment, {
      id: 778,
      status: "approved",
      date_last_updated: fixedNow.toISOString(),
    });
    expect((await webhook("778")).status).toBe(200);
    expect((await agent.get("/api/auth/me")).body.access.active).toBe(true);
    Object.assign(providerPayment, {
      status: "refunded",
      date_last_updated: new Date(fixedNow.getTime() + 1000).toISOString(),
    });
    expect((await webhook("778")).status).toBe(200);
    Object.assign(providerPayment, {
      status: "approved",
      date_last_updated: fixedNow.toISOString(),
    });
    expect((await webhook("778")).status).toBe(200);
    expect((await agent.get("/api/auth/me")).body.access.active).toBe(false);
  });

  it.each([
    { transaction_amount: 96 },
    { collector_id: 99999 },
    { currency_id: "USD" },
    { live_mode: true },
    { id: 888 },
  ])("rejeita pagamento divergente %o", async (mismatch) => {
    const { agent } = await register();
    await orderThroughCheckout(agent);
    Object.assign(providerPayment, mismatch);
    await webhook().then((response) => expect(response.status).toBe(422));
    expect((await agent.get("/api/auth/me")).body.access.active).toBe(false);
  });

  it.each([
    { mode: "sandbox", allow: true, enabled: true, live: true, code: 200 },
    { mode: "sandbox", allow: false, enabled: true, live: true, code: 422 },
    { mode: "sandbox", allow: true, enabled: true, live: true, code: 422, wrongCollector: true },
    { mode: "production", allow: true, enabled: true, live: false, code: 422 },
    { mode: "production", allow: true, enabled: true, live: true, code: 200 },
  ] as const)("mantém a validação do modo do pagamento %o", async (scenario) => {
    const { agent } = await register();
    const orderId = await orderThroughCheckout(agent);
    await db.query("UPDATE orders SET payment_mode=$1 WHERE id=$2", [
      scenario.mode,
      orderId,
    ]);
    app = createApp({
      db,
      config: {
        ...config,
        mpMode: scenario.mode,
        allowSandboxCheckout: scenario.allow,
        sandboxAllowLiveMode: scenario.enabled,
      },
      fetcher,
      mailer: async () => {},
      now: () => fixedNow,
      disableRateLimits: true,
    });
    providerPayment.live_mode = scenario.live;
    if ("wrongCollector" in scenario) providerPayment.collector_id = 99999;
    expect((await webhook()).status).toBe(scenario.code);
    const { rows } = await db.query("SELECT status FROM orders WHERE id=$1", [orderId]);
    expect(rows[0].status).toBe(scenario.code === 200 ? "approved" : "created");
  });

  it("reconcilia retorno sem confiar na URL e confirma reembolso antes de revogar", async () => {
    const { agent } = await register();
    const orderId = await orderThroughCheckout(agent);
    const reconciled = await agent
      .post(`/api/orders/${orderId}/reconcile`)
      .set("Origin", origin)
      .send({})
      .expect(200);
    expect(reconciled.body.order.status).toBe("approved");
    providerError = true;
    await agent
      .post(`/api/orders/${orderId}/refund`)
      .set("Origin", origin)
      .send({ reason: "Teste" })
      .expect(502);
    expect((await agent.get("/api/auth/me")).body.access.active).toBe(true);
    providerError = false;
    await agent
      .post(`/api/orders/${orderId}/refund`)
      .set("Origin", origin)
      .send({ reason: "Não atendeu" })
      .expect(200);
    expect((await agent.get("/api/auth/me")).body.access.active).toBe(false);
    await agent
      .post(`/api/orders/${orderId}/refund`)
      .set("Origin", origin)
      .send({})
      .expect(200);
    expect(
      (await db.query("SELECT id FROM events WHERE name='refund'")).rows,
    ).toHaveLength(1);
  });

  it("revoga acesso em contestação e rejeita assinatura vencida", async () => {
    const { agent } = await register();
    await orderThroughCheckout(agent);
    await webhook();
    providerPayment.status = "charged_back";
    await webhook();
    expect((await agent.get("/api/auth/me")).body.access.active).toBe(false);
    const old = new Date(fixedNow.getTime() - 301000);
    await request(app)
      .post("/api/webhooks/mercadopago?data.id=777")
      .set(signature("777", old))
      .send({ type: "payment", data: { id: "777" } })
      .expect(401);
    expect(
      verifyWebhook(
        signature()["x-signature"],
        "different-request",
        "777",
        config.mpWebhookSecret,
        fixedNow,
      ),
    ).toBe(false);
  });

  it("limita renovação de ano bissexto ao último dia do mês", () => {
    expect(plusMonths(new Date("2024-02-29T12:00:00Z"), 12).toISOString()).toBe(
      "2025-02-28T12:00:00.000Z",
    );
  });
});

describe("métricas operacionais", () => {
  it("agrupa por dia de Brasília e campanha sem incluir eventos de sandbox", async () => {
    const { user } = await register();
    const { orderId } = await grant(user.id);
    await db.query("UPDATE orders SET payment_mode=$1,utm=$2 WHERE id=$3", [
      "production",
      JSON.stringify({ utm_campaign: "lancamento" }),
      orderId,
    ]);
    const seed = async (
      name: string,
      date: string,
      mode: string,
      metadata: Record<string, string>,
      linkedOrderId?: string,
    ) => {
      await db.query(
        "INSERT INTO events(id,name,created_at,payment_mode,metadata,order_id) VALUES($1,$2,$3,$4,$5,$6)",
        [
          randomUUID(),
          name,
          new Date(date),
          mode,
          JSON.stringify(metadata),
          linkedOrderId ?? null,
        ],
      );
    };
    await seed("page_view", "2026-11-11T02:59:00Z", "production", {
      utm_campaign: "lancamento",
    });
    await seed("purchase", "2026-11-11T03:01:00Z", "production", {}, orderId);
    await seed("first_pdf", "2026-11-11T03:05:00Z", "production", {}, orderId);
    await seed("page_view", "2026-11-11T03:06:00Z", "sandbox", {
      utm_campaign: "lancamento",
    });
    const { rows } = await readMetrics(db, 2, "lancamento", fixedNow);
    expect(rows).toEqual([
      expect.objectContaining({
        dia: "2026-11-11",
        campanha: "lancamento",
        visitas: 0,
        compras_ativas: 1,
        primeiros_pdfs: 1,
      }),
      expect.objectContaining({
        dia: "2026-11-10",
        campanha: "lancamento",
        visitas: 1,
        compras_ativas: 0,
        primeiros_pdfs: 0,
      }),
    ]);
  });
});
