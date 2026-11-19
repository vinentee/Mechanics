import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildQuotePdf } from "../client/pdf";
import {
  exampleProfile,
  exampleQuote,
  totalCents,
  type Quote,
} from "../shared/types";

const output = resolve(process.argv[2] ?? ".local/orcamento-exemplo.pdf");
const longOutput = process.argv[3] ? resolve(process.argv[3]) : null;
const profile = { ...exampleProfile, name: "Sua Marca - exemplo fictício" };
const quote: Quote = {
  ...exampleQuote(),
  id: "exemplo-ilustrativo",
  number: 1,
  issuedOn: "2026-11-11",
  validUntil: "2026-11-18",
  totalCents: 32000,
  createdAt: "2026-11-11T12:00:00.000Z",
};
await mkdir(resolve(output, ".."), { recursive: true });
await writeFile(
  output,
  Buffer.from(
    await (
      await buildQuotePdf(profile, quote, [], { demo: true })
    ).arrayBuffer(),
  ),
);
console.log(`PDF de exemplo: ${output}`);

if (longOutput) {
  const longQuote: Quote = {
    ...quote,
    customerName: "Marina Oliveira de Albuquerque e Silva",
    customerAddress:
      "Rua do Exemplo, 123, apartamento 456, bloco B, Condomínio Jardim das Oliveiras, Vila Mariana, São Paulo - SP. Dados fictícios para validar o espaço do documento.",
    items: Array.from({ length: 10 }, (_, index) => ({
      name: `Serviço ${index + 1}: ${"Revisão do veículo, com descrição das peças e condições combinadas. ".repeat(3)}`,
      quantity: (index % 3) + 1,
      unitPriceCents: 13599,
    })),
    conditions:
      "Pagamento via Pix ou cartão após o serviço. O horário será combinado com o cliente. O ambiente deve estar acessível no momento do atendimento. ".repeat(
        27,
      ),
    notes:
      "Observação de exemplo: o profissional preenche as condições do próprio atendimento e informa os cuidados pertinentes. ".repeat(
        12,
      ),
  };
  longQuote.totalCents = totalCents(longQuote.items);
  await mkdir(resolve(longOutput, ".."), { recursive: true });
  await writeFile(
    longOutput,
    Buffer.from(
      await (
        await buildQuotePdf(profile, longQuote, [], { demo: true })
      ).arrayBuffer(),
    ),
  );
  console.log(`PDF de verificação com textos longos: ${longOutput}`);
}
