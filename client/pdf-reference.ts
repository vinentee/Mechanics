import type { jsPDF } from "jspdf";
import { subtotalCents, type BusinessProfile, type Quote, type QuoteInput } from "../shared/types";
import referenceArtwork from "./assets/quote-reference-artwork.json";
import { formatDate, pdfDrawing, quoteNumber, quoteSummary } from "./pdf-drawing";

const LEFT = 7;
const RIGHT = 203;
const WIDTH = RIGHT - LEFT;
const BOTTOM = 275;
const INK = "#11151a";
const GRAY = "#777d85";
const RULE = "#c5c7ca";
const SHADE = "#e6e7e9";
const QUANTITY = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 });
const DAY_MS = 86_400_000;

type Point = [number, number];

function polygon(pdf: jsPDF, points: Point[], color: string | null) {
  if (color) pdf.setFillColor(color);
  pdf.lines(
    points.slice(1).map(([x, y], index) => [
      x - points[index][0], y - points[index][1],
    ]),
    ...points[0],
    [1, 1], color ? "F" : null, true,
  );
}

// Paint just the requested window of the supplied artwork, without the form labels.
function artworkWindow(
  pdf: jsPDF,
  [sx, sy, sw, sh]: [number, number, number, number],
  [x, y, width, height]: [number, number, number, number],
  mask?: Point[],
) {
  const scaleX = width / sw;
  const scaleY = height / sh;
  pdf.saveGraphicsState();
  if (mask) polygon(pdf, mask, null);
  else pdf.rect(x, y, width, height, null);
  pdf.clip().discardPath();
  pdf.addImage(
    referenceArtwork, "JPEG", x - sx * scaleX, y - sy * scaleY,
    853 * scaleX, 1280 * scaleY, "reference-artwork",
  );
  pdf.restoreGraphicsState();
}

function specialties(pdf: jsPDF, y: number) {
  const { font, text } = pdfDrawing(pdf);
  pdf.setDrawColor(INK);
  pdf.setLineWidth(0.25);
  pdf.line(LEFT, y, RIGHT, y);
  pdf.line(LEFT, y + 9.5, RIGHT, y + 9.5);
  const labels = ["MECÂNICA", "ELÉTRICA", "DIAGNÓSTICO", "MANUTENÇÃO"];
  labels.forEach((label, index) => {
    const start = LEFT + index * (WIDTH / 4);
    const x = start + 9;
    const cy = y + 4.75;
    if (index) {
      pdf.setDrawColor(GRAY);
      pdf.line(start, y + 2.5, start, y + 7);
    }
    pdf.setDrawColor(INK);
    pdf.setFillColor(INK);
    if (index === 0) {
      pdf.setLineWidth(0.4);
      pdf.circle(x, cy, 1.65);
      pdf.circle(x, cy, 0.55, "F");
      for (let step = 0; step < 8; step++) {
        const angle = Math.PI * step / 4;
        pdf.line(x + 1.5 * Math.cos(angle), cy + 1.5 * Math.sin(angle),
          x + 2.35 * Math.cos(angle), cy + 2.35 * Math.sin(angle));
      }
    } else if (index === 1) {
      polygon(pdf, [[x + 1.4, cy - 2.8], [x - 1.8, cy + 0.3], [x - 0.3, cy + 0.3],
        [x - 1.2, cy + 2.8], [x + 2, cy - 0.6], [x + 0.4, cy - 0.6]], INK);
    } else if (index === 2) {
      pdf.setLineWidth(0.4);
      pdf.rect(x - 2.1, cy - 1.6, 4.2, 2.9);
      pdf.line(x, cy + 1.3, x, cy + 2.1);
      pdf.line(x - 1, cy + 2.1, x + 1, cy + 2.1);
    } else {
      pdf.setLineWidth(0.9);
      pdf.line(x - 1.9, cy + 1.9, x + 0.7, cy - 0.7);
      pdf.setLineWidth(0.45);
      pdf.line(x + 0.7, cy - 0.7, x + 0.4, cy - 2.1);
      pdf.line(x + 0.7, cy - 0.7, x + 2.1, cy - 0.4);
    }
    font(7.8, "bold");
    text(label, start + 16, y + 5.75);
  });
}

export function drawReferenceQuote(
  pdf: jsPDF,
  profile: BusinessProfile,
  quote: QuoteInput | Quote,
  demo = false,
) {
  const { currency, font, split, text } = pdfDrawing(pdf);
  const number = quoteNumber(quote);

  polygon(pdf, [[185, 0], [189, 0], [210, 22], [210, 26]], INK);
  polygon(pdf, [[191, 0], [210, 0], [210, 19]], INK);
  polygon(pdf, [[194, 9], [198, 9], [210, 22], [210, 26]], "#aeb1b5");
  polygon(pdf, [[0, 279], [17, 297], [13, 297], [0, 283]], "#aeb1b5");
  polygon(pdf, [[0, 285], [12, 297], [0, 297]], INK);
  polygon(pdf, [[15, 289], [18, 289], [26, 297], [23, 297]], INK);
  artworkWindow(pdf, [675, 1070, 178, 210], [166, 248, 44, 49], [
    [210, 248], [210, 297], [166, 297], [166, 281],
    [172, 270], [184, 260], [198, 251],
  ]);

  const brandCenter = 52;
  if (profile.logoDataUrl) {
    try {
      const logo = pdf.getImageProperties(profile.logoDataUrl);
      const scale = Math.min(75 / logo.width, 37 / logo.height);
      const w = logo.width * scale;
      const h = logo.height * scale;
      pdf.addImage(profile.logoDataUrl, logo.fileType, brandCenter - w / 2, 6 + (37 - h) / 2, w, h);
    } catch {
      throw new Error("Não foi possível ler a logo. Selecione uma imagem JPG ou PNG válida.");
    }
  } else {
    artworkWindow(pdf, [111, 23, 213, 89], [25, 6, 54, 26]);
  }

  const brandY = profile.logoDataUrl ? 46 : 39;
  font(24, "bold");
  if (pdf.getTextWidth(profile.name) > 83) font(13, "bold");
  const brandLines = split(profile.name, 83);
  brandLines.forEach((line, index) => text(line, brandCenter, brandY + index * 5, "center"));
  const taglineY = brandY + brandLines.length * 5 + 1;
  font(8, "bold");
  text("OFICINA MECÂNICA", brandCenter, taglineY, "center");
  pdf.setDrawColor(GRAY);
  pdf.setLineWidth(0.25);
  pdf.line(17, taglineY - 1, 35, taglineY - 1);
  pdf.line(69, taglineY - 1, 87, taglineY - 1);

  font(27, "bold");
  text("ORÇAMENTO", 108, 24);
  font(11);
  pdf.setCharSpace(0.55);
  text("DOCUMENTO DE SERVIÇOS", 108, 32);
  text("AUTOMOTIVOS", 108, 37.3);
  pdf.setCharSpace(0);
  font(9);
  const contactRows = [
    ["WhatsApp", ""],
    ["Telefone", profile.phone],
    ...(profile.email ? [["E-mail", profile.email]] : []),
    ...([profile.city, profile.document && `CPF/CNPJ: ${profile.document}`]
      .filter(Boolean).map((value) => ["", value])),
  ];
  let contactY = 45;
  for (const [label, value] of contactRows) {
    const line = label ? `${label}: ${value}` : value;
    const isPhone = label === "WhatsApp" || label === "Telefone";
    const contactX = isPhone ? 115 : 108;
    const lines = split(line, RIGHT - contactX - 3);
    if (isPhone) {
      const iconY = contactY + 2.6;
      pdf.setDrawColor(INK);
      pdf.setLineWidth(0.35);
      if (label === "WhatsApp") {
        pdf.circle(110.3, iconY, 2);
        pdf.line(108.2, iconY + 2.1, 109.3, iconY + 1.8);
      }
      pdf.lines([[0.6, 1.4], [1.25, 0.65]], 109.2, iconY - 1, [1, 1], "S");
    }
    for (const part of lines) {
      text(part, contactX, contactY + 4);
      contactY += 4.1;
    }
    if (isPhone) {
      const start = contactX + pdf.getTextWidth(`${label}: `) + 1;
      pdf.setDrawColor(GRAY);
      pdf.line(start, contactY + 0.8, 198, contactY + 0.8);
    }
  }
  let y = Math.max(66, contactY + 3.5, taglineY + 3.5);
  pdf.setDrawColor(INK);
  pdf.line(100, 12.8, 100, y - 5);
  specialties(pdf, y);
  y += 13.4;

  function nextPage() {
    pdf.addPage();
    font(9, "bold");
    text(split(profile.name, 106)[0], LEFT, 12);
    text(number ? `ORÇAMENTO Nº ${number}` : "ORÇAMENTO", RIGHT, 12, "right");
    pdf.setDrawColor(INK);
    pdf.setLineWidth(0.25);
    pdf.line(LEFT, 15, RIGHT, 15);
    return 20;
  }
  const ensure = (height: number) => {
    if (y + height > BOTTOM) y = nextPage();
  };
  const section = (title: string, width: number) => {
    polygon(pdf, [[LEFT, y], [LEFT + width, y], [LEFT + width + 5, y + 6.5], [LEFT, y + 6.5]], INK);
    polygon(pdf, [[LEFT + width + 2, y], [LEFT + width + 4, y], [LEFT + width + 9, y + 6.5], [LEFT + width + 7, y + 6.5]], GRAY);
    font(10.5, "bold", "#ffffff");
    text(title, LEFT + 4, y + 4.9);
    y += 6.5;
  };
  const row = (height: number, columns: number[] = [], fill?: string) => {
    pdf.setDrawColor(GRAY);
    pdf.setLineWidth(0.19);
    if (fill) pdf.setFillColor(fill);
    pdf.rect(LEFT, y, WIDTH, height, fill ? "FD" : "S");
    pdf.setDrawColor(RULE);
    columns.forEach((x) => pdf.line(x, y, x, y + height));
  };

  if (demo) {
    font(7.5, "bold", GRAY);
    text("EXEMPLO ILUSTRATIVO", RIGHT, y - 0.8, "right");
  }
  section("DADOS DO CLIENTE E VEÍCULO", 90);
  const middle = 128;
  const infoRows: [string, string, string, string][] = [
    ["Cliente", quote.customerName, "Data", formatDate(quote.issuedOn)],
    ["Telefone", quote.customerPhone, "Orçamento nº", number ?? ""],
    ["Veículo", quote.vehicle ?? "", "Placa", quote.plate ?? ""],
    ["Ano", quote.vehicleYear ?? "", "KM", quote.mileage ?? ""],
  ];
  if (quote.customerAddress) infoRows.push(["Endereço", quote.customerAddress, "", ""]);
  for (const [label, value, secondLabel, secondValue] of infoRows) {
    font(9);
    const lx = LEFT + 4;
    const rx = middle + 4;
    const firstX = lx + pdf.getTextWidth(`${label}: `) + 1;
    const secondX = rx + pdf.getTextWidth(`${secondLabel}: `) + 1;
    const firstLines = split(value || " ", (secondLabel ? middle : RIGHT) - firstX - 5);
    const secondLines = split(secondValue || " ", RIGHT - secondX - 5);
    const height = Math.max(7.5, 4 + Math.max(firstLines.length, secondLines.length) * 4);
    row(height, secondLabel ? [middle] : []);
    for (const [caption, x, start, end, lines] of [
      [label, lx, firstX, (secondLabel ? middle : RIGHT) - 4, firstLines],
      [secondLabel, rx, secondX, RIGHT - 4, secondLines],
    ] as const) {
      if (!caption) continue;
      text(`${caption}:`, x, y + 4.9);
      lines.forEach((line, index) => {
        const baseline = y + 4.9 + index * 4;
        text(line, start + 1, baseline);
        pdf.setDrawColor(RULE);
        pdf.line(start, baseline + 0.9, end, baseline + 0.9);
      });
    }
    y += height;
  }

  y += 3.5;
  const columns = [114.5, 140.5, 173.2];
  const tableHead = () => {
    section("SERVIÇOS / PEÇAS", 74);
    row(8.2, columns, SHADE);
    font(8.25, "bold");
    text("Descrição do serviço ou peça", LEFT + 4, y + 5.25);
    text("Qtd.", 127.5, y + 5.25, "center");
    text("Unitário", 156.85, y + 5.25, "center");
    text("Total", 188.1, y + 5.25, "center");
    y += 8.2;
  };

  tableHead();
  for (const item of quote.items) {
    font(8.5);
    const lines = split(item.name, columns[0] - LEFT - 8);
    const height = Math.max(6.7, 3.2 + lines.length * 3.5);
    if (y + height > BOTTOM - 2) {
      y = nextPage();
      tableHead();
    }
    row(height, columns);
    font(8.5);
    lines.forEach((line, index) => text(line, LEFT + 4, y + 4.5 + index * 3.5));
    text(QUANTITY.format(item.quantity), 127.5, y + 4.5, "center");
    text(currency(item.unitPriceCents), columns[2] - 4, y + 4.5, "right");
    text(currency(subtotalCents(item)), RIGHT - 4, y + 4.5, "right");
    y += height;
  }

  // Keep the blank ruled rows from the printed form when the quote is short.
  const emptyRows = pdf.getNumberOfPages() === 1 ? Math.max(0, 7 - quote.items.length) : 0;
  for (let index = 0; index < emptyRows && y + 6.7 <= 191; index++) {
    row(6.7, columns);
    y += 6.7;
  }

  y += 3.5;
  ensure(28 + 3.5 + 6.5 + 16);
  quoteSummary(quote).forEach(([label, amount], index) => {
    const total = index === 3;
    row(7, [144], total ? SHADE : undefined);
    font(total ? 10 : 8.5, total ? "bold" : "normal");
    text(label, LEFT + 4, y + 4.7);
    text(currency(amount), RIGHT - 4, y + 4.7, "right");
    y += 7;
  });

  y += 3.5;
  font(8.5);
  const noteLines = [quote.conditions, quote.notes]
    .filter((value) => value.trim())
    .flatMap((value) => split(value, WIDTH - 8));
  while (noteLines.length < 3) noteLines.push("");
  while (noteLines.length) {
    ensure(6.5 + 5);
    section("OBSERVAÇÕES / CONDIÇÕES", 79);
    const lineCount = Math.min(noteLines.length, Math.floor((BOTTOM - y) / 5));
    const lines = noteLines.splice(0, lineCount);
    row(lines.length * 5);
    font(8.5);
    lines.forEach((line, index) => {
      const baseline = y + 3.8 + index * 5;
      text(line, LEFT + 4, baseline);
      pdf.setDrawColor(RULE);
      pdf.line(LEFT + 4, baseline + 0.7, RIGHT - 4, baseline + 0.7);
    });
    y += lines.length * 5;
  }

  font(8.5);
  const days = Math.round((Date.parse(quote.validUntil) - Date.parse(quote.issuedOn)) / DAY_MS);
  const paymentLabel = "Forma de pagamento:";
  const paymentX = 115 + pdf.getTextWidth(paymentLabel) + 2;
  const payment = split(quote.paymentMethod || " ", RIGHT - paymentX - 3);
  ensure(14 + payment.length * 4);
  y += 5;
  font(8.5);
  text(`Validade: ${days} ${days === 1 ? "dia" : "dias"} (até ${formatDate(quote.validUntil)})`, LEFT + 2, y);
  text(paymentLabel, 115, y);
  payment.forEach((line, index) => {
    const baseline = y + index * 4;
    text(line, paymentX + 1, baseline);
    pdf.setDrawColor(RULE);
    pdf.line(paymentX, baseline + 0.8, RIGHT - 4, baseline + 0.8);
  });
  y += payment.length * 4 + 4;
  text("Autorização do cliente:", LEFT + 2, y);
  text("Data: ____ / ____ / ______", 115, y + 1.5);
  pdf.setDrawColor(GRAY);
  pdf.line(LEFT + 2, y + 4.5, 108, y + 4.5);
  return { y: y + 8, bottom: BOTTOM, nextPage };
}

export function drawReferenceFooters(pdf: jsPDF, name: string, demo = false) {
  const { font, split, text } = pdfDrawing(pdf);
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    font(7.5, "bold");
    const caption = `${name.toUpperCase()}  |  SERVIÇOS AUTOMOTIVOS`;
    const lines = split(caption, 126);
    const isLong = lines.length > 1;
    if (isLong) font(6.5, "bold");
    const footerLines = isLong ? split(caption, 142) : lines;
    const lineWidth = Math.max(...footerLines.map((line) => pdf.getTextWidth(line)));
    pdf.setDrawColor(GRAY);
    pdf.setLineWidth(0.2);
    pdf.line(LEFT + 1, 280, 105 - lineWidth / 2 - 4, 280);
    pdf.line(105 + lineWidth / 2 + 4, 280, RIGHT - 1, 280);
    footerLines.forEach((line, index) => text(line, 105, 281 + index * 3, "center"));
    font(7.5, "normal", GRAY);
    if (demo) text("OrçaMecânica - exemplo ilustrativo", LEFT + 1, 290);
    if (pages > 1) text(`${page} / ${pages}`, RIGHT - 1, 290, "right");
  }
}
