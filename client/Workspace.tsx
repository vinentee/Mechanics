import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Building2,
  Camera,
  ChevronRight,
  CircleHelp,
  CreditCard,
  FileText,
  ImagePlus,
  LogOut,
  Plus,
  Receipt,
  Search,
  Sofa,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import {
  emptyProfile,
  exampleProfile,
  exampleQuote,
  money,
  OFFER,
  type BusinessProfile,
  type Order,
  type Quote,
} from "../shared/types";
import { api, message, post, put } from "./api";
import {
  Brand,
  Field,
  Footer,
  Header,
  MoneyInput,
  Notice,
  PageShell,
  Spinner,
} from "./components";
import { useApp } from "./context";
import { QuoteEditor } from "./QuoteEditor";

function dateLabel(value: string | null | undefined) {
  return value
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeZone: "America/Sao_Paulo",
      }).format(
        new Date(value.length === 10 ? `${value}T12:00:00-03:00` : value),
      )
    : "—";
}
const statusName: Record<string, string> = {
  approved: "Aprovado",
  pending: "Pendente",
  in_process: "Em análise",
  created: "Iniciado",
  rejected: "Recusado",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
  charged_back: "Contestado",
  expired: "Expirado",
  checkout_failed: "Falha ao abrir checkout",
};

export function DemoPage() {
  const { me, track } = useApp();
  const [profile, setProfile] = useState<BusinessProfile>(exampleProfile);
  const [error, setError] = useState("");
  const trackedDemo = useRef(false);
  useEffect(() => {
    if (!trackedDemo.current) {
      trackedDemo.current = true;
      track("demo_view");
    }
  }, []);
  async function logo(file: File | undefined) {
    if (!file) return;
    setError("");
    try {
      const { imageToDataUrl } = await import("./pdf");
      const logoDataUrl = await imageToDataUrl(file, {
        maxWidth: 480,
        maxBytes: 320_000,
      });
      setProfile((current) => ({ ...current, logoDataUrl }));
    } catch (err) {
      setError(message(err));
    }
  }
  return (
    <>
      <Header />
      <main id="main-content" className="container demo-page">
        <Link to="/" className="back-link">
          <ArrowLeft size={16} /> Voltar ao início
        </Link>
        <div className="demo-page-heading">
          <div>
            <p className="eyebrow">
              <span className="live-dot" /> DEMONSTRAÇÃO INTERATIVA
            </p>
            <h1>
              Veja o seu serviço
              <br />
              <em>virar um orçamento.</em>
            </h1>
            <p>
              Edite os dados de exemplo e baixe o seu primeiro PDF de
              demonstração.
            </p>
          </div>
          <Link className="button" to={me.user ? "/comprar" : "/cadastro"}>
            Comprar acesso por R$97 <ArrowUpRight size={18} />
          </Link>
        </div>
        <QuoteEditor
          profile={profile}
          initial={exampleQuote()}
          demo
          beforeForm={
            <section className="form-card demo-brand-card">
              <div className="form-section-heading">
                <span className="section-badge">
                  <Sofa size={19} />
                </span>
                <div>
                  <h2>Sua marca de exemplo</h2>
                  <p>Altere o nome e, se quiser, adicione uma logo.</p>
                </div>
              </div>
              <div className="demo-brand-fields">
                <Field label="Nome no documento">
                  <input
                    value={profile.name}
                    onChange={(e) =>
                      setProfile((current) => ({
                        ...current,
                        name: e.target.value,
                      }))
                    }
                    maxLength={120}
                    placeholder="Sua marca"
                  />
                </Field>
                <label className="button button-light upload-inline">
                  {profile.logoDataUrl ? (
                    <img src={profile.logoDataUrl} alt="Sua logo" />
                  ) : (
                    <ImagePlus size={19} />
                  )}
                  <span>
                    {profile.logoDataUrl ? "Trocar logo" : "Adicionar logo"}
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => {
                      void logo(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
              {error && <Notice error>{error}</Notice>}
            </section>
          }
        />
      </main>
      <Footer />
    </>
  );
}

function ProfileForm({
  profile,
  email,
  onSave,
}: {
  profile: BusinessProfile | null;
  email: string;
  onSave: (value: BusinessProfile) => void;
}) {
  const [draft, setDraft] = useState<BusinessProfile>(
    profile || { ...emptyProfile(), email },
  );
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const set = <K extends keyof BusinessProfile>(
    key: K,
    value: BusinessProfile[K],
  ) => setDraft((current) => ({ ...current, [key]: value }));
  async function logo(file?: File) {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const { imageToDataUrl } = await import("./pdf");
      set(
        "logoDataUrl",
        await imageToDataUrl(file, { maxWidth: 480, maxBytes: 320_000 }),
      );
    } catch (err) {
      setError(message(err));
    } finally {
      setUploading(false);
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      const response = await put<{ profile: BusinessProfile }>(
        "/profile",
        draft,
      );
      setDraft(response.profile);
      onSave(response.profile);
      setSuccess("Sua marca foi salva. Esses dados aparecerão no próximo PDF.");
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="profile-form">
      <section className="form-card">
        <div className="form-section-heading">
          <span className="section-badge">
            <Building2 size={19} />
          </span>
          <div>
            <h2>Dados que aparecem no PDF</h2>
            <p>Prepare uma vez. Use nos próximos documentos.</p>
          </div>
        </div>
        <div className="logo-row">
          <div className="logo-preview">
            {draft.logoDataUrl ? (
              <img src={draft.logoDataUrl} alt="Logo do seu negócio" />
            ) : (
              <Sofa size={31} />
            )}
          </div>
          <div>
            <label className="button button-light small upload-inline">
              <ImagePlus size={17} />
              {uploading ? "Preparando…" : "Enviar logo"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={uploading}
                onChange={(e) => {
                  void logo(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            {draft.logoDataUrl && (
              <button
                className="text-button remove-logo"
                type="button"
                onClick={() => set("logoDataUrl", "")}
              >
                Remover
              </button>
            )}
            <p className="small-text">JPG, PNG ou WebP. Até 5 MB.</p>
          </div>
        </div>
        <div className="form-grid">
          <Field label="Nome do negócio" wide>
            <input
              required
              maxLength={120}
              value={draft.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Como sua marca aparece no orçamento?"
            />
          </Field>
          <Field label="E-mail de contato">
            <input
              type="email"
              maxLength={254}
              value={draft.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="contato@seunegocio.com.br"
            />
          </Field>
          <Field label="Telefone ou WhatsApp">
            <input
              inputMode="tel"
              maxLength={40}
              value={draft.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="(11) 99999-0000"
            />
          </Field>
          <Field label="Cidade e estado">
            <input
              maxLength={120}
              value={draft.city}
              onChange={(e) => set("city", e.target.value)}
              placeholder="Cidade — UF"
            />
          </Field>
          <Field label="CPF ou CNPJ (opcional)">
            <input
              inputMode="numeric"
              maxLength={30}
              value={draft.document}
              onChange={(e) => set("document", e.target.value)}
              placeholder="Documento para exibir no PDF"
            />
          </Field>
        </div>
      </section>
      <section className="form-card">
        <div className="form-section-heading">
          <span className="section-badge">
            <FileText size={19} />
          </span>
          <div>
            <h2>Seus serviços e preços</h2>
            <p>Salve os serviços que você oferece com frequência.</p>
          </div>
        </div>
        {draft.services.length === 0 && (
          <p className="muted">
            Nenhum serviço cadastrado. Você também pode informar os serviços
            diretamente no orçamento.
          </p>
        )}
        <div className="services-list">
          {draft.services.map((service, index) => (
            <div key={service.id} className="service-row">
              <Field label={`Serviço ${index + 1}`}>
                <input
                  value={service.name}
                  onChange={(e) =>
                    set(
                      "services",
                      draft.services.map((item) =>
                        item.id === service.id
                          ? { ...item, name: e.target.value }
                          : item,
                      ),
                    )
                  }
                  maxLength={160}
                  required
                  placeholder="Ex.: Troca de óleo"
                />
              </Field>
              <Field label="Tipo"><select value={service.kind || "labor"} onChange={(e) => set("services", draft.services.map((item) => item.id === service.id ? { ...item, kind: e.target.value as "part" | "labor" } : item))}><option value="labor">Mão de obra</option><option value="part">Peça</option></select></Field>
              <Field label="Preço unitário">
                <MoneyInput
                  cents={service.unitPriceCents}
                  onValue={(unitPriceCents) =>
                    set(
                      "services",
                      draft.services.map((item) =>
                        item.id === service.id
                          ? { ...item, unitPriceCents }
                          : item,
                      ),
                    )
                  }
                  label={`Preço do serviço ${index + 1}`}
                />
              </Field>
              <button
                type="button"
                className="icon-button"
                aria-label={`Remover serviço cadastrado ${index + 1}`}
                onClick={() =>
                  set(
                    "services",
                    draft.services.filter((item) => item.id !== service.id),
                  )
                }
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>
        <button
          className="button button-light small"
          type="button"
          disabled={draft.services.length >= 50}
          onClick={() =>
            set("services", [
              ...draft.services,
              { id: crypto.randomUUID(), kind: "labor", name: "", unitPriceCents: 0 },
            ])
          }
        >
          <Plus size={17} /> Adicionar serviço
        </button>
      </section>
      {error && <Notice error>{error}</Notice>}
      {success && <Notice>{success}</Notice>}
      <button className="button" disabled={busy || uploading}>
        {busy ? "Salvando…" : "Salvar minha marca"}
        <ArrowRight size={17} />
      </button>
    </form>
  );
}

function PlanPanel() {
  const { me, config, refresh } = useApp();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refund, setRefund] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  useEffect(() => {
    api<{ orders: Order[] }>("/orders")
      .then((result) => setOrders(result.orders))
      .catch((err) => setError(message(err)))
      .finally(() => setLoading(false));
  }, []);
  async function requestRefund() {
    if (!refund) return;
    setError("");
    setBusy(true);
    try {
      const { order } = await post<{ order: Order }>(
        `/orders/${refund.id}/refund`,
      );
      setOrders((current) =>
        current.map((item) => (item.id === order.id ? order : item)),
      );
      setRefund(null);
      setFeedback(
        order.status === "refunded"
          ? "O reembolso foi confirmado. Seu acesso foi encerrado."
          : "O pedido foi atualizado. Acompanhe a confirmação nesta página.",
      );
      await refresh();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }
  const percent = Math.min(
    100,
    ((me.access?.used || 0) / OFFER.documentLimit) * 100,
  );
  return (
    <div className="plan-panel">
      <section className="form-card">
        <div className="form-section-heading">
          <span className="section-badge">
            <CreditCard size={20} />
          </span>
          <div>
            <h2>Plano Essencial</h2>
            <p>12 meses de acesso. Pagamento único.</p>
          </div>
          <span className={`pill ${me.access?.active ? "active" : ""}`}>
            {me.access?.active ? "Ativo" : "Sem acesso ativo"}
          </span>
        </div>
        {me.access?.active ? (
          <>
            <div className="plan-usage">
              <span>Documentos deste período</span>
              <strong>
                {me.access.used} / {me.access.limit}
              </strong>
            </div>
            <div
              className="progress-bar"
              role="progressbar"
              aria-label="Documentos usados"
              aria-valuemin={0}
              aria-valuemax={me.access.limit}
              aria-valuenow={me.access.used}
            >
              <span style={{ width: `${percent}%` }} />
            </div>
            <p className="small-text">
              Acesso até {dateLabel(me.access.expiresAt)}. Sem renovação
              automática.
            </p>
          </>
        ) : (
          <Link className="button" to="/comprar">
            Ativar acesso por R$97 <ArrowUpRight size={17} />
          </Link>
        )}
      </section>
      <section className="form-card">
        <div className="form-section-heading">
          <span className="section-badge">
            <Receipt size={20} />
          </span>
          <div>
            <h2>Seus pagamentos</h2>
            <p>Consulte pedidos e acompanhe a confirmação.</p>
          </div>
        </div>
        {loading ? (
          <Spinner />
        ) : !orders.length ? (
          <p className="muted">Ainda não há pedidos nesta conta.</p>
        ) : (
          <div className="order-list">
            {orders.map((order) => (
              <article key={order.id}>
                <div>
                  <strong>Pedido {order.id.slice(0, 8).toUpperCase()}</strong>
                  <p>
                    {dateLabel(order.createdAt)} · {money(order.amountCents)}
                  </p>
                </div>
                <span
                  className={`pill ${order.status === "approved" ? "active" : ""}`}
                >
                  {statusName[order.status] || "Em processamento"}
                </span>
                {order.status === "approved" ? (
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => {
                      setError("");
                      setRefund(order);
                    }}
                  >
                    Solicitar reembolso
                  </button>
                ) : (
                  <Link
                    className="link-arrow"
                    to={`/pagamento?order=${order.id}`}
                  >
                    Ver pedido <ChevronRight size={15} />
                  </Link>
                )}
              </article>
            ))}
          </div>
        )}
        {refund && (
          <div className="refund-confirm">
            <strong>Solicitar reembolso deste pedido?</strong>
            <p>
              Solicitações dentro de sete dias são elegíveis. A confirmação do
              estorno encerra o acesso ao plano.
            </p>
            <div className="editor-actions">
              <button
                className="button button-light small"
                disabled={busy}
                onClick={() => setRefund(null)}
              >
                Voltar
              </button>
              <button
                className="button small"
                disabled={busy}
                onClick={requestRefund}
              >
                {busy ? "Solicitando…" : "Confirmar solicitação"}
              </button>
            </div>
          </div>
        )}
        {error && <Notice error>{error}</Notice>}
        {feedback && <Notice>{feedback}</Notice>}
      </section>
      {config?.seller.email && (
        <p className="support-line">
          <CircleHelp size={18} /> Precisa de ajuda?{" "}
          <a href={`mailto:${config.seller.email}`}>{config.seller.email}</a>
        </p>
      )}
    </div>
  );
}

export function Workspace() {
  const { me, loading, setMe, refresh, config } = useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"quotes" | "brand" | "plan">("quotes");
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<Quote | "new" | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  useEffect(() => {
    if (!me.access?.active) return;
    setLoadingQuotes(true);
    setError("");
    api<{ quotes: Quote[] }>("/quotes")
      .then((result) => setQuotes(result.quotes))
      .catch((err) => setError(message(err)))
      .finally(() => setLoadingQuotes(false));
  }, [me.user?.id, me.access?.active]);
  if (loading)
    return (
      <PageShell title="Minha conta">
        <Spinner />
      </PageShell>
    );
  if (!me.user) return <Navigate to="/entrar" replace />;
  const access = me.access;
  const used = access?.used || 0;
  const search = filter.toLocaleLowerCase("pt-BR").trim();
  const shown = quotes.filter(
    (quote) =>
      !search ||
      quote.customerName.toLocaleLowerCase("pt-BR").includes(search) ||
      String(quote.number).includes(search),
  );
  async function logout() {
    setError("");
    try {
      await post("/auth/logout");
      setMe({ user: null, access: null, profile: null });
      navigate("/");
    } catch (err) {
      setError(message(err));
    }
  }
  function newQuote() {
    if (!me.profile?.name) {
      setTab("brand");
      return;
    }
    setEditorKey((current) => current + 1);
    setEditing("new");
  }
  function updateQuote(quote: Quote) {
    setQuotes((current) => [
      quote,
      ...current.filter((item) => item.id !== quote.id),
    ]);
    setEditing(quote);
    void refresh().catch(() => {});
  }
  return (
    <div className="workspace">
      <header className="workspace-header">
        <div className="container workspace-header-inner">
          <Brand />
          <div>
            <span className={`pill ${access?.active ? "active" : ""}`}>
              {access?.active ? "Plano ativo" : "Conta criada"}
            </span>
            <button
              className="text-button logout-button"
              aria-label="Sair"
              onClick={logout}
            >
              <LogOut size={17} /> <span>Sair</span>
            </button>
          </div>
        </div>
      </header>
      <div className="container workspace-layout">
        <aside className="workspace-sidebar">
          <p className="eyebrow">SEU ESPAÇO</p>
          <nav aria-label="Área do cliente">
            <button
              className={tab === "quotes" ? "selected" : ""}
              onClick={() => {
                setTab("quotes");
                setEditing(null);
              }}
            >
              <FileText size={19} /> Orçamentos
            </button>
            <button
              className={tab === "brand" ? "selected" : ""}
              onClick={() => {
                setTab("brand");
                setEditing(null);
              }}
            >
              <Building2 size={19} /> Minha marca
            </button>
            <button
              className={tab === "plan" ? "selected" : ""}
              onClick={() => {
                setTab("plan");
                setEditing(null);
              }}
            >
              <CreditCard size={19} /> Meu plano
            </button>
          </nav>
          <div className="sidebar-help">
            <CircleHelp size={21} />
            <strong>Precisa de ajuda?</strong>
            <p>
              {config?.seller.email ? (
                <a href={`mailto:${config.seller.email}`}>Fale com o suporte</a>
              ) : (
                <Link to="/demonstracao">Explore a demonstração</Link>
              )}
            </p>
          </div>
        </aside>
        <main id="main-content" className="workspace-main">
          {error && <Notice error>{error}</Notice>}
          {tab === "brand" ? (
            <>
              <div className="workspace-heading">
                <div>
                  <p className="eyebrow">SEUS DADOS</p>
                  <h1>Minha marca</h1>
                  <p>Personalize o documento que seu cliente vai receber.</p>
                </div>
              </div>
              <ProfileForm
                profile={me.profile}
                email={me.user.email}
                onSave={(profile) => setMe({ ...me, profile })}
              />
            </>
          ) : tab === "plan" ? (
            <>
              <div className="workspace-heading">
                <div>
                  <p className="eyebrow">SUA CONTA</p>
                  <h1>Meu plano</h1>
                  <p>Pagamento, prazo de acesso e documentos disponíveis.</p>
                </div>
              </div>
              <PlanPanel />
            </>
          ) : editing ? (
            <>
              <button className="back-link" onClick={() => setEditing(null)}>
                <ArrowLeft size={17} /> Todos os orçamentos
              </button>
              <div className="workspace-heading">
                <div>
                  <p className="eyebrow">
                    {editing === "new"
                      ? "NOVO DOCUMENTO"
                      : `ORÇAMENTO Nº ${String(editing.number).padStart(3, "0")}`}
                  </p>
                  <h1>
                    {editing === "new" ? "Novo orçamento" : "Editar orçamento"}
                  </h1>
                  <p>Deixe claros os serviços, os valores e as condições.</p>
                </div>
              </div>
              <QuoteEditor
                key={editorKey}
                profile={me.profile || emptyProfile()}
                initial={editing === "new" ? undefined : editing}
                onSaved={updateQuote}
                onCancel={() => setEditing(null)}
              />
            </>
          ) : (
            <>
              <div className="workspace-heading">
                <div>
                  <p className="eyebrow">
                    OLÁ, {me.user.name.split(" ")[0].toLocaleUpperCase("pt-BR")}
                  </p>
                  <h1>Seus orçamentos</h1>
                  <p>Crie e acompanhe os documentos do seu negócio.</p>
                </div>
                {access?.active && (
                  <button
                    className="button"
                    disabled={used >= OFFER.documentLimit}
                    onClick={newQuote}
                  >
                    <Plus size={19} /> Novo orçamento
                  </button>
                )}
              </div>
              {!access?.active ? (
                <section className="onboarding-card">
                  <div className="onboarding-icon">
                    <Sofa size={31} />
                  </div>
                  <div>
                    <p className="eyebrow">BEM-VINDO AO ORÇAMECÂNICA</p>
                    <h2>Sua conta está pronta.</h2>
                    <p>
                      Ative o plano para criar seus próprios orçamentos ou veja
                      como fica um PDF de exemplo.
                    </p>
                    <div className="editor-actions">
                      <Link className="button" to="/comprar">
                        Ativar por R$97 <ArrowUpRight size={17} />
                      </Link>
                      <Link className="button button-light" to="/demonstracao">
                        Ver exemplo
                      </Link>
                    </div>
                  </div>
                </section>
              ) : (
                <>
                  <div className="workspace-stats">
                    <div>
                      <span>DOCUMENTOS NESTE PLANO</span>
                      <strong>
                        {used} <small>/ {access.limit}</small>
                      </strong>
                    </div>
                    <div>
                      <span>ACESSO ATÉ</span>
                      <strong>{dateLabel(access.expiresAt)}</strong>
                    </div>
                  </div>
                  {!me.profile?.name && (
                    <div className="notice profile-reminder">
                      <span>
                        Adicione o nome do seu negócio antes de criar o primeiro
                        orçamento.
                      </span>
                      <button
                        className="text-button"
                        onClick={() => setTab("brand")}
                      >
                        Configurar marca <ArrowRight size={16} />
                      </button>
                    </div>
                  )}
                  {used >= OFFER.documentLimit && (
                    <Notice>
                      Você usou os 300 documentos deste período. Ainda pode
                      consultar e baixar os orçamentos salvos.
                    </Notice>
                  )}
                  <section className="form-card quote-list-card">
                    <div className="list-header">
                      <h2>Documentos</h2>
                      {quotes.length > 0 && (
                        <label className="search">
                          <Search size={17} />
                          <input
                            aria-label="Buscar orçamento"
                            placeholder="Buscar por cliente ou número"
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                          />
                        </label>
                      )}
                    </div>
                    {loadingQuotes ? (
                      <Spinner />
                    ) : !shown.length ? (
                      <div className="empty-state">
                        <FileText size={36} />
                        <h3>
                          {search
                            ? "Nenhum resultado encontrado."
                            : "Seu primeiro documento está por vir."}
                        </h3>
                        <p>
                          {search
                            ? "Experimente outro nome ou número."
                            : "Monte seu orçamento e baixe o PDF para enviar ao cliente."}
                        </p>
                        {!search && (
                          <button
                            className="button button-light small"
                            onClick={newQuote}
                          >
                            <Plus size={16} /> Criar orçamento
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="saved-quotes">
                        {shown.map((quote) => (
                          <button
                            key={quote.id}
                            className="saved-quote"
                            onClick={() => {
                              setEditorKey((current) => current + 1);
                              setEditing(quote);
                            }}
                          >
                            <span className="saved-quote-icon">
                              <FileText size={20} />
                            </span>
                            <span>
                              <strong>{quote.customerName}</strong>
                              <small>
                                Nº {String(quote.number).padStart(3, "0")} ·{" "}
                                {dateLabel(quote.issuedOn)}
                              </small>
                            </span>
                            <strong>{money(quote.totalCents)}</strong>
                            <ChevronRight size={17} />
                          </button>
                        ))}
                      </div>
                    )}
                  </section>
                </>
              )}
            </>
          )}
        </main>
      </div>
      <footer className="workspace-footer">
        <div className="container">
          <span>OrçaMecânica</span>
          <Link to="/termos">Termos</Link>
          <Link to="/privacidade">Privacidade</Link>
        </div>
      </footer>
    </div>
  );
}
