import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

test("demonstração recalcula e gera PDF sem enviar dados do orçamento", async ({
  page,
}) => {
  const quotePosts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/quotes"))
      quotePosts.push(request.url());
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Seu serviço, bem apresentado." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Apenas essenciais" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page
    .getByRole("link", { name: "Ver funcionando", exact: true })
    .click();
  const preview = page.getByRole("region", { name: "Documento de demonstração" });
  await page.getByLabel("Nome no documento").fill("Oficina do teste");
  await page.getByLabel("Nome do cliente").fill("Pessoa de exemplo");
  await page.getByLabel("Placa", { exact: true }).fill("abc1d23");
  await expect(preview).toContainText("Oficina do teste");
  await expect(preview).toContainText("Pessoa de exemplo");
  await expect(preview).toContainText("ABC1D23");
  await page.getByRole("spinbutton", { name: "Quantidade 2" }).fill("3");
  await expect(page.locator(".quote-grand-total")).toContainText("390,00");
  await page.getByRole("textbox", { name: "Valor unitário 2" }).fill("80,50");
  await expect(page.locator(".quote-grand-total")).toContainText("421,50");
  await expect(preview.locator(".live-quote-totals")).toContainText("421,50");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Baixar PDF", exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toContain("exemplo.pdf");
  expect((await readFile((await file.path())!)).subarray(0, 5).toString()).toBe(
    "%PDF-",
  );
  const current = page.getByRole("radio", { name: "Modelo atual", exact: true });
  const referenceModel = page.getByRole("radio", { name: "Modelo da referência" });
  await expect(current).toBeChecked();
  await current.focus();
  await page.keyboard.press("ArrowRight");
  await expect(referenceModel).toBeChecked();
  await page.getByText("Modelo atual", { exact: true }).click();
  await expect(current).toBeChecked();
  await page.getByText("Modelo da referência", { exact: true }).click();
  await expect(referenceModel).toBeChecked();
  await expect(preview).toHaveAttribute("data-template", "reference");
  await expect(preview).toContainText("Pessoa de exemplo");
  const referenceDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Baixar PDF", exact: true }).click();
  const referenceFile = await referenceDownload;
  const reference = (await readFile((await referenceFile.path())!)).toString("latin1");
  expect(reference).toContain("Descrição do serviço ou peça");
  expect(reference).toContain("R$ 421,50");
  expect(quotePosts).toEqual([]);
});

test("cadastro, configuração da marca e reentrada sem compra habilitada", async ({
  page,
}) => {
  const email = `teste-${randomUUID()}@example.test`;
  const password = "Orcamento-teste-2026!";
  await page.goto("/cadastro");
  await page.getByRole("button", { name: "Apenas essenciais" }).click();
  await page.getByLabel("Seu nome").fill("Conta de Teste");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Criar minha conta" }).click();
  await expect(
    page.getByRole("button", { name: "Vendas em preparação" }),
  ).toBeDisabled();
  await page
    .getByRole("link", { name: "Minha conta", exact: true })
    .last()
    .click();
  await page.getByRole("button", { name: "Minha marca" }).click();
  await page.getByLabel("Nome do negócio").fill("Limpeza Exemplo");
  await page
    .getByRole("button", { name: "Adicionar serviço", exact: true })
    .click();
  await page.getByLabel("Serviço 1", { exact: true }).fill("Limpeza de sofá");
  await page.getByLabel("Preço do serviço 1").fill("190,00");
  await page.getByRole("button", { name: "Salvar minha marca" }).click();
  await expect(page.getByRole("status")).toContainText("Sua marca foi salva.");
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await page.goto("/entrar");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar na minha conta" }).click();
  await page.getByRole("button", { name: "Minha marca" }).click();
  await expect(page.getByLabel("Nome do negócio")).toHaveValue(
    "Limpeza Exemplo",
  );
  await expect(page.getByLabel("Preço do serviço 1")).toHaveValue("190,00");
});
