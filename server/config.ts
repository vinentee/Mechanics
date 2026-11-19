import { randomBytes } from "node:crypto";

export interface Config {
  production: boolean;
  appUrl: string;
  sessionSecret: string;
  databaseUrl?: string;
  localDbPath: string;
  mpAccessToken: string;
  mpWebhookSecret: string;
  mpCollectorId: string;
  mpMode: "sandbox" | "production";
  allowSandboxCheckout: boolean;
  sandboxAllowLiveMode: boolean;
  resendApiKey: string;
  emailFrom: string;
  sellerName: string;
  sellerLegalName: string;
  sellerDocument: string;
  sellerEmail: string;
  sellerAddress: string;
  metaPixelId: string;
  port: number;
}
export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const production = env.NODE_ENV === "production";
  const parsedUrl = new URL(
    env.APP_URL || `http://localhost:${env.PORT || 3000}`,
  );
  if (
    !["http:", "https:"].includes(parsedUrl.protocol) ||
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.pathname !== "/" ||
    parsedUrl.search ||
    parsedUrl.hash
  )
    throw new Error("APP_URL deve conter apenas a origem HTTP(S) do site.");
  const appUrl = parsedUrl.origin;
  if (
    production &&
    (!env.DATABASE_URL ||
      !env.SESSION_SECRET ||
      env.SESSION_SECRET.length < 32 ||
      !appUrl.startsWith("https://"))
  )
    throw new Error(
      "Produção exige DATABASE_URL, SESSION_SECRET com 32 caracteres e APP_URL HTTPS.",
    );
  return {
    production,
    appUrl,
    sessionSecret: env.SESSION_SECRET || randomBytes(48).toString("hex"),
    databaseUrl: env.DATABASE_URL,
    localDbPath: env.LOCAL_DB_PATH || ".local/database",
    mpAccessToken: env.MP_ACCESS_TOKEN || "",
    mpWebhookSecret: env.MP_WEBHOOK_SECRET || "",
    mpCollectorId: env.MP_COLLECTOR_ID || "",
    mpMode: env.MP_MODE === "production" ? "production" : "sandbox",
    allowSandboxCheckout: env.ALLOW_SANDBOX_CHECKOUT === "true",
    sandboxAllowLiveMode: env.MP_SANDBOX_ALLOW_LIVE_MODE === "true",
    resendApiKey: env.RESEND_API_KEY || "",
    emailFrom: env.EMAIL_FROM || "",
    sellerName: env.SELLER_NAME || "OrçaMecânica",
    sellerLegalName: env.SELLER_LEGAL_NAME || "",
    sellerDocument: env.SELLER_DOCUMENT || "",
    sellerEmail: env.SELLER_EMAIL || "",
    sellerAddress: env.SELLER_ADDRESS || "",
    metaPixelId: /^\d{5,30}$/.test(env.META_PIXEL_ID || "")
      ? env.META_PIXEL_ID!
      : "",
    port: Number(env.PORT || 3000),
  };
}

export function missingCheckoutConfig(config: Config): string[] {
  const fields: Array<[string, string]> = [
    ["MP_ACCESS_TOKEN", config.mpAccessToken],
    ["MP_WEBHOOK_SECRET", config.mpWebhookSecret],
    ["MP_COLLECTOR_ID", config.mpCollectorId],
    ["RESEND_API_KEY", config.resendApiKey],
    ["EMAIL_FROM", config.emailFrom],
    ["SELLER_LEGAL_NAME", config.sellerLegalName],
    ["SELLER_DOCUMENT", config.sellerDocument],
    ["SELLER_EMAIL", config.sellerEmail],
    ["SELLER_ADDRESS", config.sellerAddress],
  ];
  const missing = fields
    .filter(
      ([, value]) =>
        !value.trim() ||
        /^(preencher|seu[_ -]|your[_ -]|exemplo|changeme)/i.test(value.trim()),
    )
    .map(([key]) => key);
  if (
    !/^\d+$/.test(config.mpCollectorId) &&
    !missing.includes("MP_COLLECTOR_ID")
  )
    missing.push("MP_COLLECTOR_ID");
  if (
    !/^\S+@\S+\.\S+$/.test(config.sellerEmail) &&
    !missing.includes("SELLER_EMAIL")
  )
    missing.push("SELLER_EMAIL");
  if (
    !/^\d{11}(?:\d{3})?$/.test(config.sellerDocument.replace(/\D/g, "")) &&
    !missing.includes("SELLER_DOCUMENT")
  )
    missing.push("SELLER_DOCUMENT");
  if (config.mpMode === "production" && !config.appUrl.startsWith("https://"))
    missing.push("APP_URL HTTPS");
  if (
    config.production &&
    config.mpMode !== "production" &&
    !config.allowSandboxCheckout
  )
    missing.push("MP_MODE=production");
  return missing;
}
