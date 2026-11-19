import { jsPDF } from "jspdf";
import {
  OFFER,
  subtotalCents,
  totalCents,
  type BusinessProfile,
  type PhotoPair,
  type Quote,
  type QuoteInput,
} from "../shared/types";

import { formatDate, pdfDrawing, printable, quoteNumber, quoteSummary } from "./pdf-drawing";

export type QuotePdfTemplate = "current" | "reference";
type PdfOptions = { demo?: boolean; template?: QuotePdfTemplate };
const INK = "#11151a";
const MUTED = "#555b60";
const PAPER = "#ffffff";
const LINE = "#a7abb0";
const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_BYTES = 400 * 1024;
const LEFT = 16;
const RIGHT = 194;
const WIDTH = RIGHT - LEFT;
const BOTTOM = 278;

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function imageBytes(dataUrl: string): number {
  const encoded = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return (
    Math.floor((encoded.length * 3) / 4) -
    (encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0)
  );
}

function validDataUrl(value: string): boolean {
  return /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
}

function validate(
  profile: BusinessProfile,
  quote: QuoteInput,
  photos: PhotoPair[],
): void {
  if (!profile.name.trim())
    throw new Error("Informe o nome da sua marca antes de gerar o PDF.");
  if (!quote.customerName.trim()) throw new Error("Informe o nome do cliente.");
  if (
    !validDate(quote.issuedOn) ||
    !validDate(quote.validUntil) ||
    quote.validUntil < quote.issuedOn
  ) {
    throw new Error("Confira a data de emissão e a validade do orçamento.");
  }
  if (quote.items.length < 1 || quote.items.length > OFFER.itemLimit) {
    throw new Error(
      `O orçamento deve ter entre 1 e ${OFFER.itemLimit} serviços.`,
    );
  }
  for (const item of quote.items) {
    if (!item.name.trim() || item.name.length > 500)
      throw new Error(
        "Informe uma descrição de até 500 caracteres para cada serviço.",
      );
    if (
      !Number.isFinite(item.quantity) ||
      item.quantity <= 0 ||
      item.quantity > 10000
    )
      throw new Error("Informe uma quantidade válida para cada serviço.");
    if (
      !Number.isSafeInteger(item.unitPriceCents) ||
      item.unitPriceCents < 0 ||
      item.unitPriceCents > 100000000
    ) {
      throw new Error("Confira o preço de cada serviço.");
    }
  }
  if (!Number.isSafeInteger(quote.discountCents || 0) || (quote.discountCents || 0) < 0 || (quote.discountCents || 0) > totalCents(quote.items)) throw new Error("O desconto não pode superar o subtotal.");
  if (!Number.isSafeInteger(totalCents(quote.items)))
    throw new Error("O total informado ultrapassa o valor permitido.");
  const textFields: [string, number][] = [
    [profile.name, 160],
    [profile.email, 254],
    [profile.phone, 100],
    [profile.document, 100],
    [profile.city, 200],
    [quote.customerName, 200],
    [quote.customerPhone, 100],
    [quote.customerAddress, 600],
  ];
  if (
    textFields.some(([field, limit]) => field.length > limit) ||
    quote.conditions.length > 10000 ||
    quote.notes.length > 10000
  ) {
    throw new Error(
      "Um dos campos ultrapassa o tamanho permitido para o documento.",
    );
  }
  if (photos.length > OFFER.photoPairs)
    throw new Error(`Inclua no máximo ${OFFER.photoPairs} pares de fotos.`);
  if (
    profile.logoDataUrl &&
    (!validDataUrl(profile.logoDataUrl) ||
      imageBytes(profile.logoDataUrl) > MAX_IMAGE_BYTES)
  ) {
    throw new Error("A logo deve ser uma imagem JPG ou PNG de até 400 KB.");
  }
  for (const pair of photos) {
    if (pair.caption.length > 500)
      throw new Error("A legenda de cada par deve ter até 500 caracteres.");
    for (const photo of [pair.before, pair.after]) {
      if (
        photo &&
        (!validDataUrl(photo) || imageBytes(photo) > MAX_IMAGE_BYTES)
      ) {
        throw new Error(
          "As fotos devem ser imagens JPG ou PNG de até 400 KB. Selecione o arquivo novamente.",
        );
      }
    }
  }
}

function drawCurrentQuote(
  pdf: jsPDF,
  profile: BusinessProfile,
  quote: QuoteInput | Quote,
  options: PdfOptions,
) {
  const number = quoteNumber(quote);
  const { currency, text, split, font } = pdfDrawing(pdf);
  const background = () => {
    pdf.setFillColor(PAPER);
    pdf.rect(0, 0, 210, 297, "F");
  };
  background();

  font(19, "bold");
  const brandLines = split(profile.name, profile.logoDataUrl ? 139 : WIDTH);
  const headerHeight = Math.max(52, 27 + brandLines.length * 8);
  pdf.setFillColor(INK);
  pdf.rect(0, 0, 210, headerHeight, "F");
  font(8, "bold", "#d4d4d8");
  text("ORÇAMENTO DE SERVIÇOS AUTOMOTIVOS", LEFT, 14);
  font(19, "bold", "#ffffff");
  brandLines.forEach((line, index) => text(line, LEFT, 27 + index * 8));
  if (profile.logoDataUrl) {
    pdf.setFillColor("#ffffff");
    pdf.roundedRect(169, 14, 25, 25, 3, 3, "F");
    try {
      const image = pdf.getImageProperties(profile.logoDataUrl);
      const scale = Math.min(21 / image.width, 21 / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      pdf.addImage(
        profile.logoDataUrl,
        image.fileType,
        171 + (21 - width) / 2,
        16 + (21 - height) / 2,
        width,
        height,
      );
    } catch {
      throw new Error(
        "Não foi possível ler a logo. Selecione uma imagem JPG ou PNG válida.",
      );
    }
  }

  let y = headerHeight + 12;
  const nextPage = () => {
    pdf.addPage();
    background();
    font(9, "bold", INK);
    text(
      profile.name.length > 65
        ? `${profile.name.slice(0, 62)}...`
        : profile.name,
      LEFT,
      17,
    );
    font(8, "normal", MUTED);
    text(
      number ? `ORÇAMENTO Nº ${number}` : "ORÇAMENTO DE SERVIÇOS",
      RIGHT,
      17,
      "right",
    );
    pdf.setDrawColor(LINE);
    pdf.line(LEFT, 23, RIGHT, 23);
    y = 33;
    return y;
  };
  const ensure = (height: number): boolean => {
    if (y + height <= BOTTOM) return false;
    nextPage();
    return true;
  };
  const paragraph = (title: string, body: string) => {
    if (!body.trim()) return;
    ensure(20);
    font(9, "bold", INK);
    text(title, LEFT, y);
    y += 7;
    font(10, "normal");
    const lines = split(body, WIDTH);
    for (const line of lines) {
      ensure(6);
      font(10, "normal");
      text(line, LEFT, y);
      y += 5;
    }
    y += 8;
  };

  font(9, "bold", INK);
  text(number ? `PROPOSTA Nº ${number}` : "PROPOSTA DE SERVIÇO", LEFT, y);
  font(9, "normal", MUTED);
  text(
    `Emissão: ${formatDate(quote.issuedOn)}   |   Validade: ${formatDate(quote.validUntil)}`,
    RIGHT,
    y,
    "right",
  );
  y += 9;
  if (options.demo) {
    pdf.setFillColor("#f4f4f5");
    pdf.roundedRect(LEFT, y - 4, WIDTH, 10, 2, 2, "F");
    font(8, "bold", "#52525b");
    text(
      "EXEMPLO ILUSTRATIVO - dados e valores de demonstração",
      LEFT + 4,
      y + 2,
    );
    y += 15;
  }

  font(9, "normal", MUTED);
  const issuerLines = [
    [profile.phone, profile.email].filter(Boolean).join("  |  "),
    [profile.city, profile.document ? `CPF/CNPJ: ${profile.document}` : ""]
      .filter(Boolean)
      .join("  |  "),
  ]
    .filter(Boolean)
    .flatMap((line) => split(line, WIDTH));
  for (const line of issuerLines) {
    ensure(5);
    font(9, "normal", MUTED);
    text(line, LEFT, y);
    y += 4.5;
  }
  y += issuerLines.length ? 7 : 0;

  font(13, "bold");
  const customerLines = split(quote.customerName, WIDTH - 10);
  font(9);
  const customerDetailLines = [quote.customerPhone && `Telefone: ${quote.customerPhone}`, quote.customerAddress, quote.vehicle && `Veículo: ${quote.vehicle}`, [quote.plate && `Placa: ${quote.plate}`, quote.vehicleYear && `Ano: ${quote.vehicleYear}`, quote.mileage && `KM: ${quote.mileage}`].filter(Boolean).join("   |   ")]
    .filter((line): line is string => Boolean(line))
    .flatMap((line) => split(line, WIDTH - 10));
  const customerHeight =
    16 + customerLines.length * 6 + customerDetailLines.length * 4.5;
  ensure(customerHeight + 8);
  pdf.setDrawColor(LINE);
  pdf.setFillColor("#ffffff");
  pdf.roundedRect(LEFT, y, WIDTH, customerHeight, 3, 3, "FD");
  font(8, "bold", MUTED);
  text("DADOS DO CLIENTE E VEÍCULO", LEFT + 5, y + 7);
  font(13, "bold");
  let cy = y + 14;
  for (const line of customerLines) {
    text(line, LEFT + 5, cy);
    cy += 6;
  }
  font(9, "normal", MUTED);
  cy += 1;
  for (const line of customerDetailLines) {
    text(line, LEFT + 5, cy);
    cy += 4.5;
  }
  y += customerHeight + 12;

  const tableHead = () => {
    pdf.setFillColor(INK);
    pdf.roundedRect(LEFT, y, WIDTH, 10, 1, 1, "F");
    font(8, "bold", "#ffffff");
    text("SERVIÇOS / PEÇAS", LEFT + 3, y + 6.5);
    text("QTD.", 120, y + 6.5, "right");
    text("UNITÁRIO", 155, y + 6.5, "right");
    text("SUBTOTAL", RIGHT - 3, y + 6.5, "right");
    y += 10;
  };
  font(9.5);
  const firstRowHeight = Math.max(
    15,
    split(quote.items[0].name, 88).length * 4.6 + 8,
  );
  ensure(12 + firstRowHeight);
  tableHead();
  quote.items.forEach((item, index) => {
    font(9.5);
    const lines = split(item.name, 88);
    const height = Math.max(15, lines.length * 4.6 + 8);
    if (ensure(height + 2)) tableHead();
    pdf.setFillColor(index % 2 === 0 ? "#ffffff" : "#f4f4f5");
    pdf.rect(LEFT, y, WIDTH, height, "F");
    font(9.5);
    lines.forEach((line, lineIndex) =>
      text(line, LEFT + 3, y + 7 + lineIndex * 4.6),
    );
    const quantity = new Intl.NumberFormat("pt-BR", {
      maximumFractionDigits: 4,
    }).format(item.quantity);
    text(quantity, 120, y + 7, "right");
    text(currency(item.unitPriceCents), 155, y + 7, "right");
    font(9.5, "bold");
    text(currency(subtotalCents(item)), RIGHT - 3, y + 7, "right");
    pdf.setDrawColor(LINE);
    pdf.line(LEFT, y + height, RIGHT, y + height);
    y += height;
  });

  y += 8;
  ensure(48);
  quoteSummary(quote).forEach(([label, value], index) => {
    pdf.setFillColor(index === 3 ? "#e4e5e6" : "#ffffff");
    pdf.setDrawColor(LINE);
    pdf.rect(LEFT, y, WIDTH, 8, "FD");
    font(9, index === 3 ? "bold" : "normal");
    text(label, LEFT + 4, y + 5.5);
    text(currency(value), RIGHT - 4, y + 5.5, "right");
    y += 8;
  });
  y += 10;
  paragraph("FORMA DE PAGAMENTO", quote.paymentMethod || "");
  paragraph("CONDIÇÕES DO SERVIÇO", quote.conditions);
  paragraph("OBSERVAÇÕES / CONDIÇÕES", quote.notes);
  ensure(25);
  font(9, "normal");
  text("Autorização do cliente:", LEFT, y);
  y += 12;
  pdf.setDrawColor(LINE);
  pdf.line(LEFT, y, 115, y);
  text("Data: ____ / ____ / ______", 130, y);
  y += 10;

  return { y, bottom: BOTTOM, nextPage };
}

/** Creates the entire document locally. No image or document contents leave the browser. */
export async function buildQuotePdf(
  profile: BusinessProfile,
  quote: QuoteInput | Quote,
  photos: PhotoPair[] = [],
  options: PdfOptions = {},
): Promise<Blob> {
  validate(profile, quote, photos);
  const pdf = new jsPDF({
    unit: "mm",
    format: "a4",
    compress: false,
    putOnlyUsedFonts: true,
  });
  const number = quoteNumber(quote);
  const { text, split, font } = pdfDrawing(pdf);
  const reference = options.template === "reference"
    ? await import("./pdf-reference")
    : null;
  const layout = reference
    ? reference.drawReferenceQuote(pdf, profile, quote, options.demo)
    : drawCurrentQuote(pdf, profile, quote, options);
  let y = layout.y;
  const ensure = (height: number) => {
    if (y + height > layout.bottom) y = layout.nextPage();
  };

  const includedPhotos = photos.filter((pair) => pair.before || pair.after);
  if (includedPhotos.length) {
    font(9);
    const firstCaptionLines = includedPhotos[0].caption
      ? split(includedPhotos[0].caption, WIDTH).length
      : 0;
    ensure(96 + firstCaptionLines * 4.5);
    font(10, "bold", INK);
    text("REGISTRO FOTOGRÁFICO", LEFT, y);
    y += 7;
    font(8, "normal", MUTED);
    text(
      "Imagens anexadas pelo profissional para acompanhar este orçamento.",
      LEFT,
      y,
    );
    y += 10;
    for (const pair of includedPhotos) {
      font(9);
      const captionLines = pair.caption ? split(pair.caption, WIDTH) : [];
      const pairHeight = 79 + captionLines.length * 4.5;
      ensure(pairHeight);
      for (const [index, source] of [pair.before, pair.after].entries()) {
        const x = LEFT + index * 92;
        font(8, "bold", INK);
        text(index === 0 ? "ANTES" : "DEPOIS", x, y);
        pdf.setDrawColor(LINE);
        pdf.setFillColor("#ffffff");
        pdf.roundedRect(x, y + 4, 86, 63, 2, 2, "FD");
        if (source) {
          try {
            const image = pdf.getImageProperties(source);
            const scale = Math.min(80 / image.width, 57 / image.height);
            const width = image.width * scale;
            const height = image.height * scale;
            pdf.addImage(
              source,
              image.fileType,
              x + 3 + (80 - width) / 2,
              y + 7 + (57 - height) / 2,
              width,
              height,
            );
          } catch {
            throw new Error(
              "Uma das fotos não pôde ser lida. Selecione uma imagem JPG ou PNG válida.",
            );
          }
        } else {
          font(9, "normal", MUTED);
          text("Sem foto anexada", x + 43, y + 37, "center");
        }
      }
      y += 73;
      font(9, "normal");
      for (const line of captionLines) {
        text(line, LEFT, y);
        y += 4.5;
      }
      y += 6;
    }
  }

  if (reference) {
    reference.drawReferenceFooters(pdf, profile.name, options.demo);
  } else {
    const pages = pdf.getNumberOfPages();
    for (let page = 1; page <= pages; page++) {
      pdf.setPage(page);
      pdf.setDrawColor(LINE);
      pdf.line(LEFT, 283, RIGHT, 283);
      font(7.5, "normal", MUTED);
      text(
        options.demo
          ? "OrçaMecânica - exemplo ilustrativo"
          : "Documento preparado pelo profissional no OrçaMecânica",
        LEFT,
        289,
      );
      text(`${page} / ${pages}`, RIGHT, 289, "right");
    }
  }
  pdf.setProperties({
    title: `Orçamento${number ? ` ${number}` : ""} - ${printable(quote.customerName)}`,
    subject: options.demo
      ? "Exemplo ilustrativo de orçamento de serviços automotivos"
      : "Orçamento de serviços automotivos",
    author: printable(profile.name),
    creator: "OrçaMecânica",
  });
  return pdf.output("blob");
}

function filename(quote: QuoteInput | Quote, options: PdfOptions): string {
  const customer =
    quote.customerName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "cliente";
  const number =
    "number" in quote ? `${String(quote.number).padStart(4, "0")}-` : "";
  return `orcamento-${number}${customer}${options.demo ? "-exemplo" : ""}.pdf`;
}

function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadQuotePdf(
  profile: BusinessProfile,
  quote: QuoteInput | Quote,
  photos: PhotoPair[] = [],
  options: PdfOptions = {},
): Promise<void> {
  downloadBlob(
    await buildQuotePdf(profile, quote, photos, options),
    filename(quote, options),
  );
}

export async function shareQuotePdf(
  profile: BusinessProfile,
  quote: QuoteInput | Quote,
  photos: PhotoPair[] = [],
  options: PdfOptions = {},
): Promise<void> {
  const blob = await buildQuotePdf(profile, quote, photos, options);
  const name = filename(quote, options);
  const file = new File([blob], name, { type: "application/pdf" });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: `Orçamento - ${quote.customerName}`,
      });
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      // Desktop browsers and some in-app browsers advertise sharing but reject PDF files.
    }
  }
  downloadBlob(blob, name);
}

/** Decode and compress a selected image locally; never upload the source or resulting photo. */
export async function imageToDataUrl(
  file: File,
  options: { maxWidth?: number; maxBytes?: number } = {},
): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error(
      "Escolha uma imagem JPG, PNG ou WebP. Converta arquivos HEIC para JPG antes de enviar.",
    );
  }
  if (!file.size || file.size > MAX_SOURCE_BYTES)
    throw new Error("Escolha uma imagem de até 5 MB.");
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every(
    (value, index) => bytes[index] === value,
  );
  const webp =
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!(
    (file.type === "image/jpeg" && jpeg) ||
    (file.type === "image/png" && png) ||
    (file.type === "image/webp" && webp)
  )) {
    throw new Error(
      "O arquivo não parece ser uma imagem válida. Escolha outro JPG, PNG ou WebP.",
    );
  }
  const maxWidth = Math.min(2000, Math.max(128, options.maxWidth ?? 1400));
  const maxBytes = Math.min(
    MAX_IMAGE_BYTES,
    Math.max(10000, options.maxBytes ?? MAX_IMAGE_BYTES),
  );
  const image = new Image();
  const url = URL.createObjectURL(file);
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(
          new Error(
            "Não foi possível abrir esta imagem. Escolha outro arquivo.",
          ),
        );
      image.src = url;
    });
    if (
      !image.naturalWidth ||
      !image.naturalHeight ||
      image.naturalWidth * image.naturalHeight > 40000000
    ) {
      throw new Error(
        "A imagem é grande demais. Reduza suas dimensões antes de selecionar.",
      );
    }
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error(
        "Este navegador não conseguiu processar a imagem. Tente outro navegador atualizado.",
      );
    let scale = Math.min(
      1,
      maxWidth / Math.max(image.naturalWidth, image.naturalHeight),
    );
    for (let attempt = 0; attempt < 8; attempt++) {
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.86, 0.74, 0.62, 0.5, 0.4]) {
        const result = canvas.toDataURL("image/jpeg", quality);
        if (imageBytes(result) <= maxBytes) return result;
      }
      scale *= 0.72;
    }
    throw new Error(
      "Não foi possível reduzir a imagem. Escolha um arquivo menor.",
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
