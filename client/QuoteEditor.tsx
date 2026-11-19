import {
  ArrowDownToLine,
  Camera,
  Check,
  Download,
  Eye,
  ImagePlus,
  Plus,
  Save,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import type {
  BusinessProfile,
  PhotoPair,
  Quote,
  QuoteInput,
} from "../shared/types";
import {
  categoryTotalCents,
  localDate,
  money,
  OFFER,
  subtotalCents,
  totalCents,
} from "../shared/types";
import { message, post, put } from "./api";
import currentTemplatePreview from "./assets/quote-template-current.jpg";
import referenceTemplatePreview from "./assets/quote-template-reference.jpg";
import { Field, MoneyInput, Notice } from "./components";
import { LiveQuotePreview } from "./LiveQuotePreview";
import type { QuotePdfTemplate } from "./pdf";

const quoteTemplates = [
  {
    id: "current",
    title: "Modelo atual",
    detail: "Cabeçalho escuro e tabela com linhas alternadas.",
    image: currentTemplatePreview,
  },
  {
    id: "reference",
    title: "Modelo da referência",
    detail: "Faixas diagonais, tabela pautada e marca d’água.",
    image: referenceTemplatePreview,
  },
] as const;

export function blankQuote(): QuoteInput {
  const valid = new Date();
  valid.setDate(valid.getDate() + 7);
  return {
    customerName: "",
    customerPhone: "",
    customerAddress: "",
    vehicle: "", plate: "", vehicleYear: "", mileage: "", paymentMethod: "", discountCents: 0,
    issuedOn: localDate(),
    validUntil: localDate(valid),
    items: [{ name: "", quantity: 1, unitPriceCents: 0 }],
    conditions:
      "Pagamento via Pix ou cartão após a realização do serviço. Atendimento mediante agendamento.",
    notes: "",
  };
}
export function QuoteEditor({
  initial,
  profile,
  demo = false,
  beforeForm,
  onSaved,
  onCancel,
}: {
  initial?: QuoteInput | Quote;
  profile: BusinessProfile;
  demo?: boolean;
  beforeForm?: ReactNode;
  onSaved?: (quote: Quote) => void;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState<QuoteInput | Quote>(
    initial || blankQuote(),
  );
  const [template, setTemplate] = useState<QuotePdfTemplate>("current");
  const templateGroupId = useId();
  const [photos, setPhotos] = useState<PhotoPair[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const photoPending = useRef(false);
  const set = <K extends keyof QuoteInput>(key: K, value: QuoteInput[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  function updateItem(
    index: number,
    key: "name" | "quantity" | "unitPriceCents" | "kind",
    value: string | number,
  ) {
    set(
      "items",
      draft.items.map((item, i) =>
        i === index ? { ...item, [key]: value } : item,
      ),
    );
  }
  function addService(id: string) {
    const service = profile.services.find((item) => item.id === id);
    if (!service || draft.items.length >= OFFER.itemLimit) return;
    const empty = draft.items.findIndex(
      (item) => !item.name && !item.unitPriceCents,
    );
    if (empty >= 0)
      set(
        "items",
        draft.items.map((item, i) =>
          i === empty
            ? {
                kind: service.kind || "labor",
                name: service.name,
                quantity: 1,
                unitPriceCents: service.unitPriceCents,
              }
            : item,
        ),
      );
    else
      set("items", [
        ...draft.items,
        {
          kind: service.kind || "labor",
          name: service.name,
          quantity: 1,
          unitPriceCents: service.unitPriceCents,
        },
      ]);
  }
  async function photo(
    file: File | undefined,
    index: number,
    side: "before" | "after",
  ) {
    if (!file || photoPending.current) return;
    photoPending.current = true;
    setError("");
    setUploading(true);
    try {
      const { imageToDataUrl } = await import("./pdf");
      const image = await imageToDataUrl(file, {
        maxWidth: 1200,
        maxBytes: 400_000,
      });
      setPhotos((current) =>
        current.map((pair, i) =>
          i === index ? { ...pair, [side]: image } : pair,
        ),
      );
    } catch (err) {
      setError(message(err));
    } finally {
      photoPending.current = false;
      setUploading(false);
    }
  }
  function rawDraft(): QuoteInput {
    return {
      customerName: draft.customerName,
      customerPhone: draft.customerPhone,
      customerAddress: draft.customerAddress,
      vehicle: draft.vehicle || "", plate: draft.plate || "", vehicleYear: draft.vehicleYear || "", mileage: draft.mileage || "", paymentMethod: draft.paymentMethod || "", discountCents: draft.discountCents || 0,
      issuedOn: draft.issuedOn,
      validUntil: draft.validUntil,
      items: draft.items,
      conditions: draft.conditions,
      notes: draft.notes,
    };
  }
  async function persist(): Promise<QuoteInput | Quote> {
    if (demo) return draft;
    const id = "id" in draft ? draft.id : null;
    const result = id
      ? await put<{ quote: Quote }>(`/quotes/${id}`, rawDraft())
      : await post<{ quote: Quote }>("/quotes", rawDraft());
    setDraft(result.quote);
    onSaved?.(result.quote);
    return result.quote;
  }
  async function action(
    event: FormEvent,
    mode: "save" | "download" | "share" = "download",
  ) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      const { buildQuotePdf, downloadQuotePdf, shareQuotePdf } =
        await import("./pdf");
      const pdfOptions = { demo, template };
      await buildQuotePdf(profile, draft, photos, pdfOptions);
      const saved = await persist();
      if (mode === "save")
        setSuccess(
          "Orçamento salvo. As fotos precisam ser adicionadas novamente ao reeditar.",
        );
      else {
        if (mode === "share")
          await shareQuotePdf(profile, saved, photos, pdfOptions);
        else await downloadQuotePdf(profile, saved, photos, pdfOptions);
        if (!demo && "id" in saved)
          post(`/quotes/${saved.id}/export`).catch(() => {});
        setSuccess(
          demo
            ? "PDF de demonstração gerado. Os dados deste exemplo não foram enviados ao servidor."
            : "PDF gerado. Guarde o arquivo: as fotos não ficam arquivadas no sistema.",
        );
      }
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }
  const form = (
    <form className="quote-editor" onSubmit={(event) => action(event)}>
      <section className="form-card">
        <div className="form-section-heading">
          <span className="section-badge">01</span>
          <div>
            <h2>Para quem é o orçamento?</h2>
            <p>Preencha os dados do seu cliente.</p>
          </div>
        </div>
        <div className="form-grid">
          <Field label="Nome do cliente" wide>
            <input
              value={draft.customerName}
              onChange={(e) => set("customerName", e.target.value)}
              maxLength={120}
              placeholder="Nome completo"
              required
            />
          </Field>
          <Field label="Telefone do cliente">
            <input
              value={draft.customerPhone}
              onChange={(e) => set("customerPhone", e.target.value)}
              maxLength={40}
              placeholder="(11) 99999-0000"
              inputMode="tel"
            />
          </Field>
          <Field label="Endereço ou região">
            <input
              value={draft.customerAddress}
              onChange={(e) => set("customerAddress", e.target.value)}
              maxLength={250}
              placeholder="Bairro, cidade e estado"
            />
          </Field>
          <Field label="Veículo"><input value={draft.vehicle || ""} onChange={(e) => set("vehicle", e.target.value)} maxLength={160} placeholder="Marca e modelo" /></Field>
          <Field label="Placa"><input value={draft.plate || ""} onChange={(e) => set("plate", e.target.value.toUpperCase())} maxLength={20} /></Field>
          <Field label="Ano"><input value={draft.vehicleYear || ""} onChange={(e) => set("vehicleYear", e.target.value)} maxLength={20} /></Field>
          <Field label="Quilometragem"><input value={draft.mileage || ""} onChange={(e) => set("mileage", e.target.value)} maxLength={30} inputMode="numeric" /></Field>
          <Field label="Data de emissão">
            <input
              type="date"
              value={draft.issuedOn}
              onChange={(e) => set("issuedOn", e.target.value)}
              required
            />
          </Field>
          <Field label="Válido até">
            <input
              type="date"
              min={draft.issuedOn}
              value={draft.validUntil}
              onChange={(e) => set("validUntil", e.target.value)}
              required
            />
          </Field>
        </div>
      </section>
      <section className="form-card">
        <div className="form-section-heading">
          <span className="section-badge">02</span>
          <div>
            <h2>Serviços e valores</h2>
            <p>Você define os preços. Nós somamos o orçamento.</p>
          </div>
          <span className="count-pill">{draft.items.length} / 10</span>
        </div>
        {profile.services.length > 0 && (
          <Field label="Adicionar um serviço cadastrado">
            <select
              value=""
              onChange={(e) => addService(e.target.value)}
              disabled={draft.items.length >= OFFER.itemLimit}
            >
              <option value="">Selecione um serviço…</option>
              {profile.services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name} — {money(service.unitPriceCents)}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="items-labels">
          <span>DESCRIÇÃO DO SERVIÇO</span>
          <span>QTD.</span>
          <span>VALOR UNITÁRIO</span>
          <span>TOTAL</span>
          <span />
        </div>
        <div className="quote-items">
          {draft.items.map((item, index) => (
            <div className="quote-item" key={index}>
              <label className="item-name">
                <select aria-label={`Tipo do item ${index + 1}`} value={item.kind || "labor"} onChange={(e) => updateItem(index, "kind", e.target.value)}><option value="labor">Mão de obra</option><option value="part">Peça</option></select>
                <span className="mobile-label">Serviço {index + 1}</span>
                <input
                  aria-label={`Serviço ${index + 1}`}
                  value={item.name}
                  onChange={(e) => updateItem(index, "name", e.target.value)}
                  maxLength={160}
                  placeholder="Ex.: Troca de óleo e filtro"
                  required
                />
              </label>
              <label>
                <span className="mobile-label">Quantidade</span>
                <input
                  type="number"
                  aria-label={`Quantidade ${index + 1}`}
                  value={item.quantity}
                  onChange={(e) =>
                    updateItem(index, "quantity", Number(e.target.value))
                  }
                  min="0.01"
                  max="999"
                  step="0.01"
                  required
                />
              </label>
              <label>
                <span className="mobile-label">Valor unitário</span>
                <MoneyInput
                  label={`Valor unitário ${index + 1}`}
                  cents={item.unitPriceCents}
                  onValue={(value) =>
                    updateItem(index, "unitPriceCents", value)
                  }
                />
              </label>
              <span className="item-total">{money(subtotalCents(item))}</span>
              <button
                type="button"
                className="icon-button delete-item"
                aria-label={`Remover serviço ${index + 1}`}
                disabled={draft.items.length === 1}
                onClick={() =>
                  set(
                    "items",
                    draft.items.filter((_, i) => i !== index),
                  )
                }
              >
                <Trash2 size={17} />
              </button>
            </div>
          ))}
        </div>
        <button
          className="text-button add-item"
          type="button"
          disabled={draft.items.length >= OFFER.itemLimit}
          onClick={() =>
            set("items", [
              ...draft.items,
              { name: "", quantity: 1, unitPriceCents: 0 },
            ])
          }
        >
          <Plus size={16} /> Adicionar serviço
        </button>
        <div className="form-grid"><Field label="Desconto"><MoneyInput label="Desconto" cents={draft.discountCents || 0} onValue={(value) => set("discountCents", value)} /></Field><div><p>Peças: {money(categoryTotalCents(draft.items, "part"))}</p><p>Mão de obra: {money(categoryTotalCents(draft.items, "labor"))}</p></div></div>
        <div className="quote-grand-total">
          <span>Valor total do orçamento</span>
          <strong>{money(totalCents(draft.items, draft.discountCents || 0))}</strong>
        </div>
      </section>
      <section className="form-card">
        <div className="form-section-heading">
          <span className="section-badge">03</span>
          <div>
            <h2>Os detalhes também importam.</h2>
            <p>Deixe as condições claras para seu cliente.</p>
          </div>
        </div>
        <div className="form-grid">
          <Field label="Forma de pagamento" wide><input value={draft.paymentMethod || ""} onChange={(e) => set("paymentMethod", e.target.value)} maxLength={250} placeholder="Pix, cartão ou dinheiro" /></Field>
          <Field label="Condições de pagamento e atendimento" wide>
            <textarea
              rows={3}
              value={draft.conditions}
              onChange={(e) => set("conditions", e.target.value)}
              maxLength={2000}
              placeholder="Formas de pagamento, agendamento e outras condições."
            />
          </Field>
          <Field label="Observações" wide>
            <textarea
              rows={2}
              value={draft.notes}
              onChange={(e) => set("notes", e.target.value)}
              maxLength={2000}
              placeholder="Informações adicionais sobre o serviço."
            />
          </Field>
        </div>
      </section>
      <section className="form-card photo-card">
        <div className="form-section-heading">
          <span className="section-badge">
            <Camera size={17} />
          </span>
          <div>
            <h2>
              Antes e depois <span className="optional">opcional</span>
            </h2>
            <p>Inclua até três pares de fotos no documento.</p>
          </div>
        </div>
        <p className="photo-notice">
          As fotos ficam no seu aparelho. Baixe o PDF para guardá-las com o
          orçamento.
        </p>
        {photos.map((pair, index) => (
          <div className="photo-pair" key={index}>
            <div className="photo-pair-top">
              <Field label={`Legenda do par ${index + 1}`}>
                <input
                  value={pair.caption}
                  onChange={(e) =>
                    setPhotos((current) =>
                      current.map((value, i) =>
                        i === index
                          ? { ...value, caption: e.target.value }
                          : value,
                      ),
                    )
                  }
                  maxLength={120}
                  placeholder="Ex.: Motor do veículo"
                />
              </Field>
              <button
                className="icon-button"
                type="button"
                aria-label={`Remover par ${index + 1}`}
                disabled={uploading}
                onClick={() =>
                  setPhotos((current) => current.filter((_, i) => i !== index))
                }
              >
                <Trash2 size={17} />
              </button>
            </div>
            <div className="photo-pair-grid">
              {(["before", "after"] as const).map((side) => (
                <label className="photo-upload" key={side}>
                  {pair[side] ? (
                    <img
                      src={pair[side]}
                      alt={`${side === "before" ? "Antes" : "Depois"} — par ${index + 1}`}
                    />
                  ) : (
                    <>
                      <ImagePlus size={24} />
                      <span>Selecionar foto</span>
                    </>
                  )}
                  <strong>{side === "before" ? "ANTES" : "DEPOIS"}</strong>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={uploading}
                    aria-label={`Foto ${side === "before" ? "antes" : "depois"} ${index + 1}`}
                    onChange={(e) => {
                      void photo(e.target.files?.[0], index, side);
                      e.target.value = "";
                    }}
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
        <button
          className="button button-light small"
          type="button"
          onClick={() => setPhotos((current) => [...current, { caption: "" }])}
          disabled={photos.length >= OFFER.photoPairs || uploading}
        >
          <Plus size={16} />
          {uploading ? "Preparando foto…" : "Adicionar par de fotos"}
        </button>
        <p className="small-text">JPG, PNG ou WebP. Até 5 MB por foto.</p>
      </section>
      <section className="form-card">
        <fieldset className="quote-template-picker" disabled={busy}>
          <legend>Modelo do orçamento</legend>
          <div className="quote-template-grid">
            {quoteTemplates.map(({ id, title, detail, image }) => {
              const titleId = `${templateGroupId}-${id}-title`;
              const detailId = `${templateGroupId}-${id}-detail`;
              return (
                <label className="quote-template-option" key={id}>
                  <input
                    type="radio"
                    name={templateGroupId}
                    value={id}
                    checked={template === id}
                    onChange={() => setTemplate(id)}
                    aria-labelledby={titleId}
                    aria-describedby={detailId}
                  />
                  <span className="quote-template-card">
                    <span className="quote-template-thumbnail">
                      <img
                        src={image}
                        alt=""
                        width={424}
                        height={600}
                        loading="lazy"
                      />
                    </span>
                    <span className="quote-template-copy">
                      <strong id={titleId}>{title}</strong>
                      <span className="quote-template-detail" id={detailId}>
                        {detail}
                      </span>
                    </span>
                    <span className="quote-template-indicator" aria-hidden="true">
                      <Check size={14} strokeWidth={3} />
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </section>
      {error && <Notice error>{error}</Notice>}
      {success && <Notice>{success}</Notice>}
      <div className="editor-bottom">
        <div>
          <strong>
            {demo ? "Exemplo gratuito" : "Confira antes de enviar."}
          </strong>
          <p>
            {demo
              ? "Experimente os recursos. O PDF será identificado como demonstração."
              : "As fotos serão incluídas somente no PDF baixado."}
          </p>
        </div>
        <div className="editor-actions">
          {onCancel && (
            <button
              className="button button-light small"
              type="button"
              onClick={onCancel}
            >
              Voltar
            </button>
          )}
          {!demo && (
            <button
              className="button button-light"
              type="button"
              disabled={busy || uploading}
              onClick={(event) => {
                const form = event.currentTarget.form!;
                if (form.reportValidity()) void action(event, "save");
              }}
            >
              <Save size={17} /> Salvar
            </button>
          )}
          <button className="button" disabled={busy || uploading} type="submit">
            <Download size={18} />
            {busy ? "Preparando…" : "Baixar PDF"}
          </button>
          <button
            className="button button-light share-button"
            title="Compartilhar PDF"
            aria-label="Compartilhar PDF"
            disabled={busy || uploading}
            type="button"
            onClick={(event) => {
              if (event.currentTarget.form!.reportValidity())
                void action(event, "share");
            }}
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </form>
  );

  if (!demo) return form;

  return (
    <div className="demo-workbench">
      <div id="editar-orcamento" className="demo-editor-column">
        {beforeForm}
        <a className="button button-light small demo-preview-link" href="#previa-orcamento">
          <Eye size={16} /> Ver prévia do orçamento
        </a>
        {form}
      </div>
      <LiveQuotePreview profile={profile} quote={draft} template={template} photos={photos} />
    </div>
  );
}
