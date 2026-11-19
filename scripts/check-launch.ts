import "dotenv/config";
import { missingCheckoutConfig, readConfig } from "../server/config.js";

const args = process.argv.slice(2);
const usage = "Uso: npm run check:launch [-- --without-media]";
if (args.includes("--help")) {
  console.log(usage);
} else if (args.some((arg) => arg !== "--without-media")) {
  console.error(usage);
  process.exitCode = 1;
} else {
  function validUrl(
    value: string | undefined,
    protocols: string[],
    originOnly = false,
  ) {
    if (!value) return false;
    try {
      const url = new URL(value);
      if (!protocols.includes(url.protocol) || !url.hostname) return false;
      if (!originOnly) return true;
      return (
        !url.username &&
        !url.password &&
        url.pathname === "/" &&
        !url.search &&
        !url.hash
      );
    } catch {
      return false;
    }
  }

  const env = process.env;
  const application = [] as string[];
  if (env.NODE_ENV !== "production") application.push("NODE_ENV=production");
  if (!validUrl(env.APP_URL, ["https:"], true))
    application.push("APP_URL com a origem HTTPS do site");
  if (!validUrl(env.DATABASE_URL, ["postgres:", "postgresql:"]))
    application.push("DATABASE_URL PostgreSQL");
  const secret = env.SESSION_SECRET?.trim() || "";
  if (
    secret.length < 32 ||
    /^(preencher|exemplo|changeme|your[_ -]|seu[_ -])/i.test(secret)
  )
    application.push("SESSION_SECRET com pelo menos 32 caracteres");

  // Parse the seller and integration settings independently of the app startup checks.
  const config = readConfig({
    ...env,
    APP_URL: "http://localhost:3000",
    NODE_ENV: "development",
    PORT: "3000",
  });
  const required = missingCheckoutConfig(config).filter(
    (key) => key !== "APP_URL HTTPS",
  );
  const seller = required.filter((key) => key.startsWith("SELLER_"));
  const payments = required.filter((key) => key.startsWith("MP_"));
  const email = required.filter(
    (key) => key === "RESEND_API_KEY" || key === "EMAIL_FROM",
  );
  if (env.MP_MODE !== "production") payments.push("MP_MODE=production");
  if (env.ALLOW_SANDBOX_CHECKOUT && env.ALLOW_SANDBOX_CHECKOUT !== "false")
    payments.push("ALLOW_SANDBOX_CHECKOUT=false");
  if (
    config.mpAccessToken.startsWith("TEST-") &&
    !payments.includes("MP_ACCESS_TOKEN")
  )
    payments.push("MP_ACCESS_TOKEN de produção");

  const media =
    args.includes("--without-media") || config.metaPixelId
      ? []
      : ["META_PIXEL_ID"];
  const groups: Array<[string, string[]]> = [
    ["Aplicação e banco", application],
    ["Identificação do vendedor", seller],
    ["Mercado Pago", payments],
    ["E-mail transacional", email],
    ["Mídia", media],
  ];
  for (const [label, issues] of groups) {
    if (label === "Mídia" && args.includes("--without-media")) continue;
    console.log(
      `${label} — ${issues.length ? issues.join(", ") : "configurado"}`,
    );
  }
  if (groups.some(([, issues]) => issues.length)) {
    console.error(
      "Preencha ou corrija as variáveis indicadas no ambiente de produção.",
    );
    process.exitCode = 1;
  } else {
    console.log(
      "A configuração está preenchida. Confira os fluxos no domínio final antes de liberar a mídia.",
    );
  }
}
