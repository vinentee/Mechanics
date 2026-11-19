export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(
      body.error || "Não foi possível concluir. Tente novamente.",
      response.status,
      body.code,
    );
  return body as T;
}
export const post = <T>(path: string, body: unknown = {}) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body) });
export const put = <T>(path: string, body: unknown) =>
  api<T>(path, { method: "PUT", body: JSON.stringify(body) });
export function message(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Ocorreu um problema. Tente novamente.";
}
export function parsePrice(value: string): number {
  const clean = value
    .trim()
    .replace(/R\$\s?/, "")
    .replace(/\s/g, "");
  const normalized = clean.includes(",")
    ? clean.replace(/\./g, "").replace(",", ".")
    : clean;
  const number = Number(normalized);
  return Number.isFinite(number) ? Math.round(number * 100) : 0;
}
export function priceInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}
export function safeOrderId(value: string | null): string | null {
  return value?.length === 36 &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
    ? value
    : null;
}
