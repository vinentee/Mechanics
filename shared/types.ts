export const OFFER = {
  priceCents: 9700,
  months: 12,
  documentLimit: 300,
  itemLimit: 10,
  photoPairs: 3,
} as const;
export type ItemKind = "part" | "labor";
export interface Service {
  kind?: ItemKind;
  id: string;
  name: string;
  unitPriceCents: number;
}
export interface BusinessProfile {
  name: string;
  email: string;
  phone: string;
  document: string;
  city: string;
  logoDataUrl: string;
  services: Service[];
}
export interface QuoteItem {
  kind?: ItemKind;
  name: string;
  quantity: number;
  unitPriceCents: number;
}
export interface QuoteInput {
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  vehicle?: string;
  plate?: string;
  vehicleYear?: string;
  mileage?: string;
  paymentMethod?: string;
  discountCents?: number;
  issuedOn: string;
  validUntil: string;
  items: QuoteItem[];
  conditions: string;
  notes: string;
}
export interface Quote extends QuoteInput {
  id: string;
  number: number;
  totalCents: number;
  createdAt: string;
}
export interface PhotoPair {
  before?: string;
  after?: string;
  caption: string;
}
export interface User {
  id: string;
  name: string;
  email: string;
}
export interface Access {
  active: boolean;
  expiresAt: string | null;
  used: number;
  limit: number;
}
export interface Me {
  user: User | null;
  access: Access | null;
  profile: BusinessProfile | null;
}
export interface PublicConfig {
  seller: {
    name: string;
    legalName: string;
    document: string;
    email: string;
    address: string;
  };
  checkoutReady: boolean;
  checkoutSandbox?: boolean;
  pixelId: string | null;
}
export interface Order {
  id: string;
  status: string;
  createdAt: string;
  accessExpiresAt: string | null;
  amountCents: number;
}
export function subtotalCents(item: QuoteItem): number {
  return Math.round(
    (Math.round(item.quantity * 1000) * item.unitPriceCents) / 1000,
  );
}
export function totalCents(items: QuoteItem[], discountCents = 0): number {
  return items.reduce((sum, item) => sum + subtotalCents(item), 0) - discountCents;
}
export function categoryTotalCents(items: QuoteItem[], kind: ItemKind): number {
  return items.filter((item) => (item.kind || "labor") === kind).reduce((sum, item) => sum + subtotalCents(item), 0);
}
export function money(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}
export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function emptyProfile(): BusinessProfile {
  return {
    name: "",
    email: "",
    phone: "",
    document: "",
    city: "",
    logoDataUrl: "",
    services: [],
  };
}
export function exampleQuote(): QuoteInput {
  const issued = new Date();
  const valid = new Date(issued);
  valid.setDate(valid.getDate() + 7);
  return {
    customerName: "Marina Oliveira",
    customerPhone: "(11) 99999-0000",
    customerAddress: "Vila Mariana, São Paulo — SP",
    vehicle: "Honda Civic", plate: "ABC1D23", vehicleYear: "2020", mileage: "65000", paymentMethod: "Pix ou cartão", discountCents: 0,
    issuedOn: localDate(issued),
    validUntil: localDate(valid),
    items: [
      {
        name: "Troca de óleo e filtro",
        quantity: 1,
        unitPriceCents: 18000,
      },
      { kind: "part", name: "Filtro de óleo", quantity: 2, unitPriceCents: 7000 },
    ],
    conditions:
      "Pagamento via Pix ou cartão após a realização do serviço. Atendimento mediante agendamento.",
    notes: "Valores ilustrativos. O profissional define os próprios preços.",
  };
}
export const exampleProfile: BusinessProfile = {
  name: "Sua marca",
  email: "contato@exemplo.com",
  phone: "(11) 99999-0000",
  document: "",
  city: "São Paulo — SP",
  logoDataUrl: "",
  services: [
    {
      id: "sofa",
      name: "Troca de óleo e filtro",
      unitPriceCents: 18000,
    },
    { id: "poltrona", kind: "part", name: "Filtro de óleo", unitPriceCents: 7000 },
    {
      id: "colchao",
      name: "Revisão de freios",
      unitPriceCents: 15000,
    },
  ],
};
