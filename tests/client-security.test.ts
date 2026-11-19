import { describe, expect, it } from "vitest";
import { safeOrderId } from "../client/api";
describe("pedido retornado pelo checkout", () => {
  it("não permite que um parâmetro de navegação escolha outra rota de escrita", () => {
    const id = "cda5bf07-964e-41d9-9b86-b212f4d77f0a";
    expect(safeOrderId(id)).toBe(id);
    for (const value of [
      null,
      "",
      "../auth/logout#",
      `${id}/refund#`,
      "%2e%2e%2fauth%2flogout",
      `${id}?x=`,
      `${id}\n`,
      `/${id}`,
      "fake",
    ])
      expect(safeOrderId(value)).toBeNull();
  });
});
