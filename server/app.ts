import express, {
  type ErrorRequestHandler,
  type RequestHandler,
} from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import bcrypt from "bcryptjs";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { z, ZodError } from "zod";
import {
  emptyProfile,
  OFFER,
  totalCents,
  type BusinessProfile,
  type Me,
  type Quote,
  type QuoteInput,
  type User,
} from "../shared/types.js";
import { type Config, missingCheckoutConfig } from "./config.js";
import type { Database, Queryable } from "./db.js";
import { type Mailer, createMailer } from "./mail.js";
import {
  ApiError,
  createPaymentService,
  getAccess,
  iso,
  publicOrder,
  verifyWebhook,
  type OrderRow,
} from "./payments.js";

const shortText = (max: number) => z.string().trim().max(max);
const emailSchema = z.string().trim().toLowerCase().email().max(254);
const passwordSchema = z
  .string()
  .min(10)
  .max(72)
  .refine(
    (value) => Buffer.byteLength(value, "utf8") <= 72,
    "Use uma senha com até 72 bytes.",
  );
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (value) =>
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value,
    "Data inválida.",
  );
const itemSchema = z
  .object({
    name: shortText(160).min(1),
    kind: z.enum(["part", "labor"]).default("labor"),
    quantity: z.number().finite().positive().max(9999).multipleOf(0.001),
    unitPriceCents: z.number().int().min(0).max(100000000),
  })
  .strict();
export const quoteSchema = z
  .object({
    customerName: shortText(160).min(2),
    customerPhone: shortText(40),
    customerAddress: shortText(400),
    vehicle: shortText(160).default(""),
    plate: shortText(20).default(""),
    vehicleYear: shortText(20).default(""),
    mileage: shortText(30).default(""),
    paymentMethod: shortText(250).default(""),
    discountCents: z.number().int().min(0).max(1000000000).default(0),
    issuedOn: dateSchema,
    validUntil: dateSchema,
    items: z.array(itemSchema).min(1).max(OFFER.itemLimit),
    conditions: shortText(2500),
    notes: shortText(2500),
  })
  .strict()
  .refine((value) => value.validUntil >= value.issuedOn, {
    message: "A validade precisa ser igual ou posterior à emissão.",
    path: ["validUntil"],
  })
  .refine((value) => value.discountCents <= totalCents(value.items), { message: "O desconto não pode superar o subtotal.", path: ["discountCents"] })
  .refine((value) => totalCents(value.items) <= 1000000000, {
    message: "O valor total ultrapassa o limite permitido.",
    path: ["items"],
  });

function validLogo(value: string): boolean {
  if (!value) return true;
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(
    value,
  );
  if (!match || match[2].length % 4 !== 0) return false;
  const bytes = Buffer.from(match[2], "base64");
  return (
    bytes.length <= 400000 &&
    (match[1] === "png"
      ? bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
  );
}
const profileSchema = z
  .object({
    name: shortText(120).min(2),
    email: z.union([emailSchema, z.literal("")]),
    phone: shortText(40),
    document: shortText(30),
    city: shortText(140),
    logoDataUrl: z
      .string()
      .max(550000)
      .refine(validLogo, "A logo precisa ser PNG ou JPEG com até 400 KB."),
    services: z
      .array(
        z
          .object({
            id: shortText(64).min(1),
            kind: z.enum(["part", "labor"]).default("labor"),
            name: shortText(160).min(1),
            unitPriceCents: z.number().int().min(0).max(100000000),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
const utmSchema = z
  .object({
    utm_source: shortText(120).optional(),
    utm_medium: shortText(120).optional(),
    utm_campaign: shortText(120).optional(),
    utm_content: shortText(120).optional(),
    utm_term: shortText(120).optional(),
  })
  .strict();

interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
}
interface QuoteRow {
  id: string;
  number: number;
  payload: QuoteInput;
  total_cents: number;
  created_at: Date | string;
}
function quoteDto(row: QuoteRow): Quote {
  return {
    ...row.payload,
    id: row.id,
    number: row.number,
    totalCents: row.total_cents,
    createdAt: iso(row.created_at)!,
  };
}
function userDto(row: UserRow): User {
  return { id: row.id, name: row.name, email: row.email };
}
export interface AppOptions {
  db: Database;
  config: Config;
  fetcher?: typeof fetch;
  mailer?: Mailer;
  now?: () => Date;
  disableRateLimits?: boolean;
}

export function createApp({
  db,
  config,
  fetcher = fetch,
  mailer = createMailer(config, fetcher),
  now = () => new Date(),
  disableRateLimits = false,
}: AppOptions) {
  const app = express();
  app.disable("x-powered-by");
  if (config.production) app.set("trust proxy", 1);
  if (config.mpMode === "sandbox" && config.allowSandboxCheckout)
    app.use((_req, res, next) => {
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
      next();
    });
  app.use(
    helmet({
      contentSecurityPolicy: config.production
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'", "https://connect.facebook.net"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              fontSrc: ["'self'", "data:"],
              imgSrc: ["'self'", "data:", "blob:", "https://www.facebook.com"],
              connectSrc: [
                "'self'",
                "https://www.facebook.com",
                "https://connect.facebook.net",
              ],
              objectSrc: ["'none'"],
              frameAncestors: ["'none'"],
              baseUri: ["'self'"],
              formAction: [
                "'self'",
                "https://www.mercadopago.com.br",
                "https://sandbox.mercadopago.com.br",
              ],
            },
          }
        : false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(express.json({ limit: "700kb" }));
  app.use(cookieParser());
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use("/api", (req, _res, next) => {
    if (
      ["GET", "HEAD", "OPTIONS"].includes(req.method) ||
      req.path === "/webhooks/mercadopago"
    )
      return next();
    const origin = req.get("origin");
    if (!origin || origin !== new URL(config.appUrl).origin)
      return next(
        new ApiError(
          403,
          "Origem da requisição não autorizada. Atualize a página e tente novamente.",
          "INVALID_ORIGIN",
        ),
      );
    next();
  });
  const generalLimit = rateLimit({
    windowMs: 60 * 1000,
    limit: 180,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Muitas tentativas. Aguarde um minuto." },
    skip: () => disableRateLimits,
  });
  const authLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Muitas tentativas de acesso. Aguarde 15 minutos." },
    skip: () => disableRateLimits,
  });
  const paymentLimit = rateLimit({
    windowMs: 60 * 1000,
    limit: 12,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Aguarde um minuto antes de consultar novamente." },
    skip: () => disableRateLimits,
  });
  app.use("/api", generalLimit);
  app.use("/api/auth", authLimit);
  const hashToken = (token: string) =>
    createHmac("sha256", config.sessionSecret).update(token).digest("hex");
  const payments = createPaymentService(db, config, mailer, fetcher, now);
  const cookieOptions = {
    httpOnly: true,
    secure: config.production || config.appUrl.startsWith("https://"),
    sameSite: "lax" as const,
    path: "/",
  };
  app.use("/api", async (req, res, next) => {
    const token = req.cookies?.oe_session;
    if (typeof token === "string" && /^[a-f0-9]{64}$/.test(token)) {
      const result = await db.query<UserRow>(
        "SELECT u.* FROM users u INNER JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>$2",
        [hashToken(token), now()],
      );
      if (result.rows[0]) res.locals.user = result.rows[0];
    }
    next();
  });
  const authenticated: RequestHandler = (_req, res, next) =>
    res.locals.user
      ? next()
      : next(
          new ApiError(
            401,
            "Entre na sua conta para continuar.",
            "AUTH_REQUIRED",
          ),
        );
  const licensed: RequestHandler = async (_req, res, next) => {
    if (!(await getAccess(db, res.locals.user.id, now())).active)
      return next(
        new ApiError(
          403,
          "Seu plano precisa estar ativo para acessar os orçamentos.",
          "ACCESS_REQUIRED",
        ),
      );
    next();
  };
  const sessionFor = async (res: express.Response, userId: string) => {
    const token = randomBytes(32).toString("hex");
    await db.query(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)",
      [hashToken(token), userId, new Date(now().getTime() + 30 * 86400000)],
    );
    res.cookie("oe_session", token, {
      ...cookieOptions,
      maxAge: 30 * 86400000,
    });
  };
  const me = async (user?: UserRow): Promise<Me> => {
    if (!user) return { user: null, access: null, profile: null };
    const profile = await db.query<{ payload: BusinessProfile }>(
      "SELECT payload FROM profiles WHERE user_id=$1",
      [user.id],
    );
    return {
      user: userDto(user),
      access: await getAccess(db, user.id, now()),
      profile: profile.rows[0]?.payload || {
        ...emptyProfile(),
        name: user.name,
        email: user.email,
      },
    };
  };
  const orderFor = async (id: string, userId: string) => {
    const { rows } = await db.query<OrderRow>(
      "SELECT * FROM orders WHERE id=$1 AND user_id=$2",
      [id, userId],
    );
    if (!rows[0]) throw new ApiError(404, "Pedido não encontrado.");
    return rows[0];
  };

  const health: RequestHandler = async (_req, res) => {
    await db.query("SELECT 1");
    res.json({ status: "ok", service: "orcamecanica" });
  };
  app.get("/health", health);
  app.get("/api/health", health);
  app.get("/api/config", (_req, res) =>
    res.json({
      seller: {
        name: config.sellerName,
        legalName: config.sellerLegalName,
        document: config.sellerDocument,
        email: config.sellerEmail,
        address: config.sellerAddress,
      },
      checkoutReady: missingCheckoutConfig(config).length === 0,
      checkoutSandbox: config.mpMode === "sandbox",
      pixelId:
        config.mpMode === "production" ? config.metaPixelId || null : null,
    }),
  );
  app.get("/api/auth/me", async (_req, res) =>
    res.json(await me(res.locals.user)),
  );
  app.post("/api/auth/register", async (req, res) => {
    const data = z
      .object({
        name: shortText(100).min(2),
        email: emailSchema,
        password: passwordSchema,
        acceptTerms: z.literal(true),
      })
      .strict()
      .parse(req.body);
    const passwordHash = await bcrypt.hash(data.password, 12);
    const id = randomUUID();
    try {
      await db.query(
        "INSERT INTO users(id,name,email,password_hash,accepted_terms_at,created_at) VALUES($1,$2,$3,$4,$5,$5)",
        [id, data.name, data.email, passwordHash, now()],
      );
    } catch (error) {
      if ((error as { code?: string }).code === "23505")
        throw new ApiError(
          409,
          "Já existe uma conta com este e-mail. Entre ou recupere seu acesso.",
        );
      throw error;
    }
    const oldToken = req.cookies?.oe_session;
    if (typeof oldToken === "string")
      await db.query("DELETE FROM sessions WHERE token_hash=$1", [
        hashToken(oldToken),
      ]);
    await sessionFor(res, id);
    res
      .status(201)
      .json(
        await me({
          id,
          name: data.name,
          email: data.email,
          password_hash: passwordHash,
        }),
      );
  });
  app.post("/api/auth/login", async (req, res) => {
    const data = z
      .object({ email: emailSchema, password: z.string().min(1).max(200) })
      .strict()
      .parse(req.body);
    const { rows } = await db.query<UserRow>(
      "SELECT * FROM users WHERE email=$1",
      [data.email],
    );
    const valid = await bcrypt.compare(
      data.password,
      rows[0]?.password_hash ||
        "$2b$12$ZQ3qeKUSAKnfmqxcPCqQxOv95vUfJ5bGX0Smvl0rt3KELkZqN1F6K",
    );
    if (!valid || !rows[0] || Buffer.byteLength(data.password, "utf8") > 72)
      throw new ApiError(401, "E-mail ou senha incorretos.");
    if (typeof req.cookies?.oe_session === "string")
      await db.query("DELETE FROM sessions WHERE token_hash=$1", [
        hashToken(req.cookies.oe_session),
      ]);
    await sessionFor(res, rows[0].id);
    res.json(await me(rows[0]));
  });
  app.post("/api/auth/logout", async (req, res) => {
    if (typeof req.cookies?.oe_session === "string")
      await db.query("DELETE FROM sessions WHERE token_hash=$1", [
        hashToken(req.cookies.oe_session),
      ]);
    res.clearCookie("oe_session", cookieOptions);
    res.status(204).end();
  });
  app.post("/api/auth/forgot-password", async (req, res) => {
    const data = z.object({ email: emailSchema }).strict().parse(req.body);
    const { rows } = await db.query<UserRow>(
      "SELECT * FROM users WHERE email=$1",
      [data.email],
    );
    if (rows[0]) {
      const token = randomBytes(32).toString("hex");
      await db.transaction(async (tx) => {
        await tx.query("DELETE FROM reset_tokens WHERE user_id=$1", [
          rows[0].id,
        ]);
        await tx.query(
          "INSERT INTO reset_tokens(token_hash,user_id,expires_at) VALUES($1,$2,$3)",
          [
            hashToken(token),
            rows[0].id,
            new Date(now().getTime() + 15 * 60000),
          ],
        );
      });
      try {
        await mailer({
          to: rows[0].email,
          subject: "Recupere seu acesso ao OrçaMecânica",
          text: `Use o link abaixo em até 15 minutos para criar uma nova senha:\n\n${config.appUrl}/redefinir?token=${token}\n\nSe você não pediu a alteração, ignore esta mensagem.`,
        });
      } catch {
        console.error("Falha no envio de recuperação de acesso.");
      }
    }
    res.json({
      message:
        "Se o e-mail estiver cadastrado, você receberá as instruções para recuperar o acesso.",
    });
  });
  app.post("/api/auth/reset-password", async (req, res) => {
    const data = z
      .object({
        token: z.string().regex(/^[a-f0-9]{64}$/),
        password: passwordSchema,
      })
      .strict()
      .parse(req.body);
    const passwordHash = await bcrypt.hash(data.password, 12);
    await db.transaction(async (tx) => {
      const { rows } = await tx.query<{ user_id: string }>(
        "SELECT user_id FROM reset_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at>$2 FOR UPDATE",
        [hashToken(data.token), now()],
      );
      if (!rows[0])
        throw new ApiError(
          400,
          "Este link expirou ou já foi utilizado. Solicite outro.",
        );
      await tx.query("UPDATE users SET password_hash=$1 WHERE id=$2", [
        passwordHash,
        rows[0].user_id,
      ]);
      await tx.query("UPDATE reset_tokens SET used_at=$1 WHERE user_id=$2", [
        now(),
        rows[0].user_id,
      ]);
      await tx.query("DELETE FROM sessions WHERE user_id=$1", [
        rows[0].user_id,
      ]);
    });
    res.clearCookie("oe_session", cookieOptions);
    res.json({ message: "Senha alterada. Entre com a nova senha." });
  });

  app.put("/api/profile", authenticated, async (req, res) => {
    const profile = profileSchema.parse(req.body);
    await db.query(
      "INSERT INTO profiles(user_id,payload) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET payload=EXCLUDED.payload",
      [res.locals.user.id, JSON.stringify(profile)],
    );
    res.json({ profile });
  });
  app.get("/api/quotes", authenticated, licensed, async (_req, res) => {
    const { rows } = await db.query<QuoteRow>(
      "SELECT * FROM quotes WHERE user_id=$1 ORDER BY number DESC LIMIT 600",
      [res.locals.user.id],
    );
    res.json({ quotes: rows.map(quoteDto) });
  });
  app.post("/api/quotes", authenticated, licensed, async (req, res) => {
    const data = quoteSchema.parse(req.body);
    const id = randomUUID();
    const row = await db.transaction(async (tx) => {
      const { rows } = await tx.query<{ id: string; documents_used: number }>(
        "SELECT id,documents_used FROM entitlements WHERE user_id=$1 AND active=true AND expires_at>$2 ORDER BY expires_at DESC LIMIT 1 FOR UPDATE",
        [res.locals.user.id, now()],
      );
      if (!rows[0])
        throw new ApiError(
          403,
          "Seu acesso não está ativo.",
          "ACCESS_REQUIRED",
        );
      if (rows[0].documents_used >= OFFER.documentLimit)
        throw new ApiError(
          403,
          "Você atingiu o limite de 300 documentos do plano. Seus documentos existentes continuam disponíveis durante a vigência.",
          "DOCUMENT_LIMIT",
        );
      const sequence = await tx.query<{ next_quote_number: number }>(
        "UPDATE users SET next_quote_number=next_quote_number+1 WHERE id=$1 RETURNING next_quote_number",
        [res.locals.user.id],
      );
      const result = await tx.query<QuoteRow>(
        "INSERT INTO quotes(id,user_id,entitlement_id,number,payload,total_cents,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$7) RETURNING *",
        [
          id,
          res.locals.user.id,
          rows[0].id,
          sequence.rows[0].next_quote_number - 1,
          JSON.stringify(data),
          totalCents(data.items, data.discountCents),
          now(),
        ],
      );
      await tx.query(
        "UPDATE entitlements SET documents_used=documents_used+1 WHERE id=$1",
        [rows[0].id],
      );
      return result.rows[0];
    });
    res.status(201).json({ quote: quoteDto(row) });
  });
  app.put("/api/quotes/:id", authenticated, licensed, async (req, res) => {
    const data = quoteSchema.parse(req.body);
    const { rows } = await db.query<QuoteRow>(
      "UPDATE quotes SET payload=$1,total_cents=$2,updated_at=$3 WHERE id=$4 AND user_id=$5 RETURNING *",
      [
        JSON.stringify(data),
        totalCents(data.items, data.discountCents),
        now(),
        req.params.id,
        res.locals.user.id,
      ],
    );
    if (!rows[0]) throw new ApiError(404, "Orçamento não encontrado.");
    res.json({ quote: quoteDto(rows[0]) });
  });
  app.post(
    "/api/quotes/:id/export",
    authenticated,
    licensed,
    async (req, res) => {
      const userId = res.locals.user.id;
      const { rows } = await db.query<{ order_id: string }>(
        `
      SELECT e.order_id FROM quotes q JOIN entitlements e ON e.id=q.entitlement_id
      WHERE q.id=$1 AND q.user_id=$2
    `,
        [req.params.id, userId],
      );
      const quote = rows[0];
      if (!quote) throw new ApiError(404, "Orçamento não encontrado.");
      await db.transaction(async (tx) => {
        await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [userId]);
        const exists = await tx.query(
          "SELECT id FROM events WHERE user_id=$1 AND name='first_pdf' LIMIT 1",
          [userId],
        );
        if (exists.rows.length) return;
        await tx.query(
          "INSERT INTO events(id,name,user_id,order_id,payment_mode) VALUES($1,$2,$3,$4,$5)",
          [randomUUID(), "first_pdf", userId, quote.order_id, config.mpMode],
        );
      });
      res.status(204).end();
    },
  );

  app.post("/api/checkout", authenticated, paymentLimit, async (req, res) => {
    const body = z
      .object({ utm: utmSchema.optional(), consent: z.boolean().optional() })
      .strict()
      .parse(req.body || {});
    if (missingCheckoutConfig(config).length)
      throw new ApiError(
        503,
        "As vendas ainda não foram abertas. A demonstração continua disponível.",
        "CHECKOUT_NOT_READY",
      );
    res.json(
      await payments.checkout(
        res.locals.user,
        body.utm || {},
        body.consent === true,
      ),
    );
  });
  app.get("/api/orders", authenticated, async (_req, res) => {
    const { rows } = await db.query<OrderRow>(
      "SELECT * FROM orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50",
      [res.locals.user.id],
    );
    res.json({ orders: rows.map(publicOrder) });
  });
  app.get("/api/orders/:id", authenticated, async (req, res) =>
    res.json({
      order: publicOrder(
        await orderFor(String(req.params.id), res.locals.user.id),
      ),
    }),
  );
  app.post(
    "/api/orders/:id/reconcile",
    authenticated,
    paymentLimit,
    async (req, res) => {
      if (!config.mpAccessToken || !config.mpCollectorId)
        throw new ApiError(503, "Consulta de pagamento indisponível.");
      res.json({
        order: publicOrder(
          await payments.reconcileOrder(
            await orderFor(String(req.params.id), res.locals.user.id),
          ),
        ),
      });
    },
  );
  app.post(
    "/api/orders/:id/refund",
    authenticated,
    paymentLimit,
    async (req, res) => {
      z.object({ reason: shortText(1000).optional() })
        .strict()
        .parse(req.body || {});
      res.json({
        order: publicOrder(
          await payments.refund(
            await orderFor(String(req.params.id), res.locals.user.id),
          ),
        ),
      });
    },
  );
  app.post("/api/webhooks/mercadopago", async (req, res) => {
    const queryId = req.query["data.id"];
    const bodyId = req.body?.data?.id;
    const id =
      typeof queryId === "string"
        ? queryId
        : typeof bodyId === "number" || typeof bodyId === "string"
          ? String(bodyId)
          : "";
    if (
      (bodyId !== undefined && String(bodyId) !== id) ||
      !verifyWebhook(
        req.get("x-signature"),
        req.get("x-request-id"),
        id,
        config.mpWebhookSecret,
        now(),
      )
    )
      throw new ApiError(401, "Notificação não autenticada.");
    if (req.body?.type && req.body.type !== "payment") {
      res.status(200).json({ received: true });
      return;
    }
    await payments.applyPayment(id);
    res.status(200).json({ received: true });
  });
  app.post("/api/events", async (req, res) => {
    const event = z
      .object({
        name: z.enum(["page_view", "demo_view"]),
        utm: utmSchema.optional(),
      })
      .strict()
      .parse(req.body);
    await db.query(
      "INSERT INTO events(id,name,metadata,payment_mode) VALUES($1,$2,$3,$4)",
      [
        randomUUID(),
        event.name,
        JSON.stringify(event.utm || {}),
        config.mpMode,
      ],
    );
    res.status(204).end();
  });
  app.use("/api", (_req, _res, next) =>
    next(new ApiError(404, "Recurso não encontrado.")),
  );
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof ApiError) {
      res
        .status(error.status)
        .json({
          error: error.message,
          ...(error.code ? { code: error.code } : {}),
        });
      return;
    }
    if (error instanceof ZodError) {
      res
        .status(400)
        .json({
          error: `Verifique os dados informados${error.issues[0]?.path.length ? `: ${error.issues[0].path.join(".")}` : ""}.`,
          code: "VALIDATION_ERROR",
        });
      return;
    }
    if (error?.type === "entity.too.large") {
      res
        .status(413)
        .json({
          error: "O arquivo ou formulário ultrapassa o tamanho permitido.",
        });
      return;
    }
    if (error instanceof SyntaxError && "body" in error) {
      res.status(400).json({ error: "O conteúdo enviado não é válido." });
      return;
    }
    console.error(
      "Erro interno da aplicação:",
      error instanceof Error ? error.name : "unknown",
    );
    res
      .status(500)
      .json({
        error:
          "Não foi possível concluir. Tente novamente em alguns instantes.",
      });
  };
  app.use(errors);
  return app;
}
