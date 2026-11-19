import { describe, expect, it } from "vitest";
import { buildQuotePdf, imageToDataUrl } from "../client/pdf";
import {
  exampleProfile,
  exampleQuote,
  totalCents,
  type PhotoPair,
} from "../shared/types";

async function pdfText(blob: Blob): Promise<string> {
  return Buffer.from(await blob.arrayBuffer()).toString("latin1");
}

describe("PDF do orçamento", () => {
  it("gera um PDF válido com marca, dados, datas brasileiras, exemplo e total calculado", async () => {
    const quote = exampleQuote();
    const blob = await buildQuotePdf(exampleProfile, quote, [], { demo: true });
    expect(blob.type).toBe("application/pdf");
    const contents = await pdfText(blob);
    expect(contents.startsWith("%PDF-")).toBe(true);
    expect(contents).toContain("Sua marca");
    expect(contents).toContain("Marina Oliveira");
    expect(contents).toContain("EXEMPLO ILUSTRATIVO");
    expect(contents).toContain("R$ 320,00");
    expect(contents).toContain(quote.issuedOn.split("-").reverse().join("/"));
    expect(contents).toContain("%%EOF");
  });

  it("arredonda cada linha em centavos e ignora um total enviado pelo cliente", async () => {
    const quote = {
      ...exampleQuote(),
      id: "quote-id",
      number: 7,
      createdAt: new Date().toISOString(),
      totalCents: 999999,
      items: [
        {
          name: "Primeira quantidade fracionada",
          quantity: 1.5,
          unitPriceCents: 1999,
        },
        { name: "Segundo item", quantity: 1, unitPriceCents: 100 },
        {
          name: "Segunda quantidade fracionada",
          quantity: 1.15,
          unitPriceCents: 50,
        },
      ],
    };
    expect(totalCents(quote.items)).toBe(3157);
    const contents = await pdfText(await buildQuotePdf(exampleProfile, quote));
    expect(contents).toContain("R$ 0,58");
    expect(contents).toContain("R$ 31,57");
    expect(contents).toContain("0007");
    expect(contents).not.toContain("R$ 9.999,99");
    expect(contents).not.toContain("EXEMPLO ILUSTRATIVO");
  });

  it("quebra condições longas em páginas e numera todas elas", async () => {
    const quote = {
      ...exampleQuote(),
      items: Array.from({ length: 10 }, (_, index) => ({
        name: `Serviço ${index + 1}: ${"Descrição detalhada do atendimento. ".repeat(6)}`,
        quantity: 1,
        unitPriceCents: 10000,
      })),
      conditions: "Condições de pagamento e execução. ".repeat(170),
      notes: "Observação importante sobre o atendimento. ".repeat(80),
    };
    const contents = await pdfText(await buildQuotePdf(exampleProfile, quote));
    const pageCount = [...contents.matchAll(/\/Type \/Page\b/g)].length;
    expect(pageCount).toBeGreaterThan(1);
    expect(contents).toContain("R$ 1.000,00");
    expect(contents).toContain(`1 / ${pageCount}`);
    expect(contents).toContain(`${pageCount} / ${pageCount}`);
    expect(contents).toContain("Observação importante");
  });

  it("rejeita quantidades inválidas, datas impossíveis e excesso de itens", async () => {
    await expect(
      buildQuotePdf(exampleProfile, {
        ...exampleQuote(),
        items: [{ name: "Sofá", quantity: 0, unitPriceCents: 100 }],
      }),
    ).rejects.toThrow("quantidade");
    await expect(
      buildQuotePdf(exampleProfile, {
        ...exampleQuote(),
        issuedOn: "2026-02-31",
      }),
    ).rejects.toThrow("data");
    await expect(
      buildQuotePdf(exampleProfile, {
        ...exampleQuote(),
        validUntil: "2000-01-01",
      }),
    ).rejects.toThrow("data");
    await expect(
      buildQuotePdf(exampleProfile, {
        ...exampleQuote(),
        items: Array.from({ length: 11 }, () => ({
          name: "Sofá",
          quantity: 1,
          unitPriceCents: 100,
        })),
      }),
    ).rejects.toThrow("10");
  });

  it("não aceita imagens remotas, SVG ou mais de três pares", async () => {
    const invalid: PhotoPair[] = [
      { caption: "Exemplo", before: "https://example.com/foto.jpg" },
    ];
    await expect(
      buildQuotePdf(exampleProfile, exampleQuote(), invalid),
    ).rejects.toThrow("fotos");
    await expect(
      buildQuotePdf(
        {
          ...exampleProfile,
          logoDataUrl: "data:image/svg+xml;base64,PHN2Zz4=",
        },
        exampleQuote(),
      ),
    ).rejects.toThrow("logo");
    await expect(
      buildQuotePdf(
        exampleProfile,
        exampleQuote(),
        Array.from({ length: 4 }, () => ({ caption: "" })),
      ),
    ).rejects.toThrow("3");
  });

  it("inclui imagens locais no próprio PDF e identifica uma foto faltante", async () => {
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGMMaMpjYGBgYgADAA8MAURJAC4vAAAAAElFTkSuQmCC";
    const contents = await pdfText(
      await buildQuotePdf(
        { ...exampleProfile, logoDataUrl: png },
        exampleQuote(),
        [{ before: png, caption: "Sofá da sala" }],
      ),
    );
    expect(contents).toContain("/Subtype /Image");
    expect(contents).toContain("REGISTRO FOTOGRÁFICO");
    expect(contents).toContain("Sem foto anexada");
    expect(contents).toContain("Sofá da sala");
  });

  it("exporta os mesmos dados e fotos no modelo da referência", async () => {
    const quote = {
      ...exampleQuote(),
      id: "quote-reference",
      number: 42,
      createdAt: "2026-11-19",
      totalCents: 0,
      discountCents: 1250,
    };
    const profile = { ...exampleProfile, document: "12.345.678/0001-90" };
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGMMaMpjYGBgYgADAA8MAURJAC4vAAAAAElFTkSuQmCC";
    const photos = [{ before: png, caption: "Vista do veículo" }];
    const current = await pdfText(await buildQuotePdf(profile, quote, photos, { demo: true }));
    const reference = await pdfText(await buildQuotePdf(profile, quote, photos, {
      demo: true, template: "reference",
    }));

    for (const contents of [current, reference]) {
      for (const value of [
        profile.name, profile.email, profile.document, quote.customerAddress.split(" — ")[0],
        quote.customerName, "99999-0000", quote.vehicle!, quote.plate!,
        quote.vehicleYear!, quote.mileage!, quote.paymentMethod!, quote.notes,
        "0042", "R$ 140,00", "R$ 180,00", "R$ 12,50", "R$ 307,50",
        "Autorização do cliente", "EXEMPLO ILUSTRATIVO",
        "REGISTRO FOTOGRÁFICO", "Vista do veículo", "/Subtype /Image",
      ]) expect(contents).toContain(value);
    }
    expect(reference).toContain("Descrição do serviço ou peça");
    expect(current).not.toContain("Descrição do serviço ou peça");
  });

  it("repete a tabela no modelo da referência e mantém o total e a autorização", async () => {
    const quote = {
      ...exampleQuote(),
      items: Array.from({ length: 10 }, (_, index) => ({
        name: `Item ${index + 1} - ${"Descrição detalhada do serviço de revisão. ".repeat(8)}`,
        quantity: 1,
        unitPriceCents: 10000,
      })),
      notes: `${"Observação sobre o serviço e o prazo de manutenção. ".repeat(100)}Última condição.`,
    };
    const contents = await pdfText(await buildQuotePdf(exampleProfile, quote, [], {
      template: "reference",
    }));
    expect(contents.match(/Descrição do serviço ou peça/g)?.length).toBeGreaterThan(1);
    expect(contents).toContain("Item 10");
    expect(contents).toContain("R$ 1.000,00");
    expect(contents).toContain("Última condição.");
    expect(contents).toContain("Autorização do cliente");
  });

  it("valida tipo, tamanho e assinatura do arquivo antes de decodificar imagens", async () => {
    await expect(
      imageToDataUrl(
        new File(["<svg></svg>"], "logo.svg", { type: "image/svg+xml" }),
      ),
    ).rejects.toThrow("JPG, PNG ou WebP");
    await expect(
      imageToDataUrl(
        new File(["isto não é uma imagem"], "foto.jpg", { type: "image/jpeg" }),
      ),
    ).rejects.toThrow("não parece");
    await expect(
      imageToDataUrl(
        new File([new Uint8Array(5 * 1024 * 1024 + 1)], "foto.png", {
          type: "image/png",
        }),
      ),
    ).rejects.toThrow("5 MB");
  });
});
