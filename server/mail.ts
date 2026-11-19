import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { Config } from "./config.js";

export interface Email {
  to: string;
  subject: string;
  text: string;
}
export type Mailer = (email: Email) => Promise<void>;
export function createMailer(
  config: Config,
  fetcher: typeof fetch = fetch,
): Mailer {
  return async (email) => {
    if (config.resendApiKey && config.emailFrom) {
      const result = await fetcher("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: config.emailFrom,
          to: [email.to],
          subject: email.subject,
          text: email.text,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!result.ok) throw new Error("Não foi possível enviar o e-mail.");
      return;
    }
    if (config.production)
      throw new Error("E-mail transacional não configurado.");
    await mkdir(resolve(".local/outbox"), { recursive: true });
    await writeFile(
      resolve(".local/outbox", `${Date.now()}-${randomUUID()}.json`),
      JSON.stringify(email, null, 2),
      { mode: 0o600 },
    );
  };
}
