import { ArrowUp, ShieldCheck, Wrench } from "lucide-react";
import {
  money,
  subtotalCents,
  type BusinessProfile,
  type PhotoPair,
  type QuoteInput,
} from "../shared/types";
import type { QuotePdfTemplate } from "./pdf";
import { formatDate, quoteSummary } from "./pdf-drawing";

const quantity = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 });

export function LiveQuotePreview({
  profile,
  quote,
  template,
  photos,
}: {
  profile: BusinessProfile;
  quote: QuoteInput;
  template: QuotePdfTemplate;
  photos: PhotoPair[];
}) {
  const reference = template === "reference";
  const fields = [
    ["Cliente", quote.customerName],
    ["Telefone", quote.customerPhone],
    ["Veículo", quote.vehicle],
    ["Placa", quote.plate],
    ["Ano", quote.vehicleYear],
    ["KM", quote.mileage],
    ["Emissão", quote.issuedOn && formatDate(quote.issuedOn)],
    ["Válido até", quote.validUntil && formatDate(quote.validUntil)],
    ["Endereço", quote.customerAddress],
  ];
  const contacts = [profile.phone, profile.email, profile.city, profile.document]
    .filter(Boolean);
  const attachments = photos.filter(({ before, after }) => before || after);

  return (
    <aside className="demo-aside" id="previa-orcamento" aria-labelledby="preview-title">
      <div className="live-quote-heading">
        <h2 id="preview-title">Prévia do orçamento</h2>
        <span className="live-quote-badge"><span className="live-dot" /> Ao vivo</span>
      </div>
      <p className="live-quote-hint">A paginação é aplicada no PDF.</p>
      <div
        className="document-preview full live-quote-document"
        data-template={template}
        aria-label="Documento de demonstração"
        role="region"
        tabIndex={0}
      >
        <div className="document-brand">
          <span className="document-icon">
            {profile.logoDataUrl
              ? <img src={profile.logoDataUrl} alt="" />
              : <Wrench size={18} />}
          </span>
          <div>
            <strong>{profile.name.trim() || "Sua marca"}</strong>
            <span>Serviços automotivos</span>
          </div>
          <span className="document-type">Orçamento</span>
        </div>
        <div className="document-body">
          <div className="live-quote-section">
            <h3>Dados do cliente e veículo</h3>
            <dl className="live-quote-fields">
              {fields.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value?.trim() || "—"}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="live-quote-section">
            <h3>{reference ? "Serviços / peças" : "Serviços e peças"}</h3>
            <table className="live-quote-items">
              <thead>
                <tr>
                  <th scope="col">Descrição</th>
                  <th scope="col">Qtd.</th>
                  <th scope="col">Unitário</th>
                  <th scope="col">Total</th>
                </tr>
              </thead>
              <tbody>
                {quote.items.map((item, index) => (
                  <tr key={index}>
                    <th scope="row">{item.name.trim() || "—"}</th>
                    <td>{quantity.format(item.quantity)}</td>
                    <td>{money(item.unitPriceCents)}</td>
                    <td>{money(subtotalCents(item))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="live-quote-totals">
              {quoteSummary(quote).map(([label, amount]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{money(amount)}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="live-quote-section live-quote-terms">
            <h3>Observações / condições</h3>
            {quote.paymentMethod && <p><strong>Pagamento:</strong> {quote.paymentMethod}</p>}
            {quote.conditions && <p>{quote.conditions}</p>}
            {quote.notes && <p>{quote.notes}</p>}
            <p className="live-quote-signature">Autorização do cliente</p>
          </div>
          {attachments.length > 0 && (
            <div className="live-quote-section">
              <h3>Registro fotográfico</h3>
              {attachments.map((pair, index) => (
                <figure className="live-quote-photos" key={index}>
                  <div>
                    {(["before", "after"] as const).map((side) => (
                      <div key={side}>
                        <span>{side === "before" ? "Antes" : "Depois"}</span>
                        {pair[side] ? (
                          <img
                            src={pair[side]}
                            alt={side === "before" ? "Foto de antes" : "Foto de depois"}
                          />
                        ) : (
                          <small>Sem foto</small>
                        )}
                      </div>
                    ))}
                  </div>
                  {pair.caption && <figcaption>{pair.caption}</figcaption>}
                </figure>
              ))}
            </div>
          )}
          {contacts.length > 0 && (
            <div className="live-quote-contact">{contacts.join(" · ")}</div>
          )}
        </div>
      </div>
      <a className="button button-light small demo-preview-back" href="#editar-orcamento">
        <ArrowUp size={15} /> Voltar ao formulário
      </a>
      <div className="demo-assurance">
        <ShieldCheck size={22} />
        <p>Os dados e as fotos da demonstração ficam no seu aparelho.</p>
      </div>
    </aside>
  );
}
