import { describe, expect, it } from "vitest";
import { quoteSchema } from "../server/app";
import { buildQuotePdf } from "../client/pdf";
import { categoryTotalCents, exampleProfile, exampleQuote, totalCents } from "../shared/types";

describe("orçamento mecânico", () => {
  const quote = { ...exampleQuote(), vehicle: "Civic", plate: "ABC1D23", vehicleYear: "2020", mileage: "65000", paymentMethod: "Pix", discountCents: 500, items: [
    { kind: "part" as const, name: "Filtro", quantity: 2, unitPriceCents: 1250 },
    { kind: "labor" as const, name: "Troca", quantity: 1, unitPriceCents: 5000 },
  ] };
  it("calcula subtotais, desconto e valida os dados no servidor", () => {
    const parsed = quoteSchema.parse(quote);
    expect(categoryTotalCents(parsed.items, "part")).toBe(2500);
    expect(categoryTotalCents(parsed.items, "labor")).toBe(5000);
    expect(totalCents(parsed.items, parsed.discountCents)).toBe(7000);
    expect(quoteSchema.safeParse({ ...quote, discountCents: 7501 }).success).toBe(false);
    expect(quoteSchema.safeParse({ ...quote, items: [{ ...quote.items[0], kind: "outro" }] }).success).toBe(false);
  });
  it("inclui veículo, subtotais e autorização no PDF e rejeita desconto inválido", async () => {
    const text = Buffer.from(await (await buildQuotePdf(exampleProfile, quote)).arrayBuffer()).toString("latin1");
    for (const value of ["Civic", "ABC1D23", "65000", "Pix", "R$ 25,00", "R$ 50,00", "R$ 70,00", "Autorização do cliente"]) expect(text).toContain(value);
    await expect(buildQuotePdf(exampleProfile, { ...quote, discountCents: 7501 })).rejects.toThrow("desconto");
  });
});
