import type { jsPDF } from "jspdf";
import { categoryTotalCents, money, totalCents, type Quote, type QuoteInput } from "../shared/types";

/** Helvetica's PDF encoding supports Portuguese accents, but not emoji or arbitrary Unicode. */
export function printable(value: string): string {
  return String(value)
    .normalize("NFC")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/\u2022/g, "-")
    .replace(/\u00a0/g, " ")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/[^\u000a\u000d\u0020-\u007e\u00a1-\u00ff]/gu, "?");
}

export function formatDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export function quoteNumber(quote: QuoteInput | Quote): string | null {
  return "number" in quote ? String(quote.number).padStart(4, "0") : null;
}

export function quoteSummary(quote: QuoteInput) {
  const discount = quote.discountCents ?? 0;
  return [
    ["Peças", categoryTotalCents(quote.items, "part")],
    ["Mão de obra", categoryTotalCents(quote.items, "labor")],
    ["Desconto", discount],
    ["TOTAL DO ORÇAMENTO", totalCents(quote.items, discount)],
  ] as const;
}

export function pdfDrawing(pdf: jsPDF) {
  const currency = (value: number) => printable(money(value));
  const text = (
    value: string,
    x: number,
    y: number,
    align?: "left" | "right" | "center",
  ) => pdf.text(printable(value), x, y, align ? { align } : undefined);
  const split = (value: string, width: number): string[] =>
    pdf.splitTextToSize(printable(value), width) as string[];
  const font = (
    size: number,
    weight: "normal" | "bold" = "normal",
    color = "#11151a",
  ) => {
    pdf.setFont("helvetica", weight);
    pdf.setFontSize(size);
    pdf.setTextColor(color);
  };
  return { currency, text, split, font };
}
