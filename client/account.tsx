import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  CreditCard,
  Eye,
  EyeOff,
  FileText,
  LockKeyhole,
  Mail,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import {
  Brand,
  CheckLine,
  Field,
  Footer,
  Header,
  Notice,
  PageShell,
  Spinner,
} from "./components";
import { useApp } from "./context";
import { api, message, post, safeOrderId } from "./api";
import type { Me, Order } from "../shared/types";

export function AuthPage({
  mode,
}: {
  mode: "login" | "register" | "forgot" | "reset";
}) {
  const { setMe, me, loading } = useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  useEffect(() => {
    setError("");
    setSuccess("");
    setPassword("");
  }, [mode]);
  const register = mode === "register";
  const forgot = mode === "forgot";
  const reset = mode === "reset";
  const title = register
    ? "Seu próximo orçamento começa aqui."
    : forgot
      ? "Vamos recuperar seu acesso."
      : reset
        ? "Uma nova senha, um novo começo."
        : "Bom ter você por aqui.";
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      if (forgot) {
        await post("/auth/forgot-password", { email });
        setSuccess(
          "Se esse e-mail estiver cadastrado, você receberá as instruções para criar uma nova senha. Confira também o spam.",
        );
      } else if (reset) {
        await post("/auth/reset-password", {
          token: params.get("token") || "",
          password,
        });
        setMe({ user: null, access: null, profile: null });
        navigate("/redefinir", { replace: true });
        setSuccess("Senha atualizada. Entre novamente para continuar.");
      } else {
        const result = await post<Me>(
          register ? "/auth/register" : "/auth/login",
          register
            ? { name, email, password, acceptTerms: terms }
            : { email, password },
        );
        setMe(result);
        navigate(register ? "/comprar" : "/app", { replace: true });
      }
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }
  if (!loading && me.user && (register || mode === "login"))
    return <Navigate to={register ? "/comprar" : "/app"} replace />;
  return (
    <div className="auth-layout">
      <div className="auth-story">
        <Brand />
        <div>
          <p className="eyebrow">DO SEU JEITO. COM A SUA MARCA.</p>
          <h2>
            Bom trabalho
            <br />
            merece uma
            <br />
            <em>boa apresentação.</em>
          </h2>
          <p>Orçamentos organizados para quem cuida de veículos.</p>
          <ul className="check-list">
            <CheckLine>Feito para usar pelo celular</CheckLine>
            <CheckLine>Seu documento em PDF</CheckLine>
            <CheckLine>R$97 por 12 meses de acesso</CheckLine>
          </ul>
        </div>
        <span className="auth-story-bottom">Seu serviço, bem apresentado.</span>
      </div>
      <main id="main-content" className="auth-main">
        <Link className="back-link" to="/">
          <ArrowLeft size={16} /> Voltar ao início
        </Link>
        <div className="auth-form-wrap">
          <span className="form-symbol">
            {forgot || reset ? (
              <LockKeyhole size={25} />
            ) : (
              <FileText size={25} />
            )}
          </span>
          <h1>{title}</h1>
          <p>
            {register
              ? "Crie sua conta para contratar o acesso. O pagamento acontece na próxima etapa."
              : forgot
                ? "Informe o e-mail usado no cadastro."
                : reset
                  ? "Escolha uma senha segura para sua conta."
                  : "Entre para acessar seus orçamentos e sua marca."}
          </p>
          {error && <Notice error>{error}</Notice>}
          {success && <Notice>{success}</Notice>}
          {!(reset && success) && (
            <form onSubmit={submit} className="auth-form">
              {register && (
                <Field label="Seu nome">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    minLength={2}
                    maxLength={100}
                    required
                    placeholder="Como podemos chamar você?"
                  />
                </Field>
              )}
              {!reset && (
                <Field label="E-mail">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    maxLength={254}
                    required
                    placeholder="voce@seunegocio.com.br"
                  />
                </Field>
              )}
              {!forgot && (
                <Field
                  label={reset ? "Nova senha" : "Senha"}
                  hint={
                    register || reset
                      ? "Use pelo menos 10 caracteres. Máximo de 72 bytes."
                      : undefined
                  }
                >
                  <span className="password-input">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete={
                        register || reset ? "new-password" : "current-password"
                      }
                      minLength={register || reset ? 10 : undefined}
                      maxLength={72}
                      required
                    />
                    <button
                      type="button"
                      aria-label={
                        showPassword ? "Ocultar senha" : "Mostrar senha"
                      }
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </span>
                </Field>
              )}
              {register && (
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={terms}
                    onChange={(e) => setTerms(e.target.checked)}
                    required
                  />
                  <span>
                    Li e aceito os{" "}
                    <Link to="/termos" target="_blank">
                      termos de uso
                    </Link>{" "}
                    e conheço a{" "}
                    <Link to="/privacidade" target="_blank">
                      política de privacidade
                    </Link>
                    .
                  </span>
                </label>
              )}
              {mode === "login" && (
                <Link className="forgot-link" to="/recuperar">
                  Esqueci minha senha
                </Link>
              )}
              <button className="button full-width" disabled={busy}>
                {busy
                  ? "Aguarde…"
                  : register
                    ? "Criar minha conta"
                    : forgot
                      ? "Enviar instruções"
                      : reset
                        ? "Salvar nova senha"
                        : "Entrar na minha conta"}
                {!busy && <ArrowRight size={18} />}
              </button>
            </form>
          )}
          <p className="auth-switch">
            {register ? (
              <>
                Já tem uma conta? <Link to="/entrar">Entrar</Link>
              </>
            ) : mode === "login" ? (
              <>
                Primeira vez aqui? <Link to="/cadastro">Criar conta</Link>
              </>
            ) : (
              <Link to="/entrar">Voltar para entrar</Link>
            )}
          </p>
        </div>
        <div className="auth-footer">
          <Link to="/termos">Termos</Link>
          <Link to="/privacidade">Privacidade</Link>
        </div>
      </main>
    </div>
  );
}

export function PurchasePage() {
  const { me, loading, config, utm, consent } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (loading)
    return (
      <PageShell title="Seu acesso">
        <Spinner />
      </PageShell>
    );
  if (!me.user) return <Navigate to="/cadastro" replace />;
  if (me.access?.active) return <Navigate to="/app" replace />;
  async function checkout() {
    setBusy(true);
    setError("");
    try {
      const result = await post<{ url: string; orderId: string }>("/checkout", {
        utm,
        consent: consent === "accepted",
      });
      const url = new URL(result.url);
      if (
        !["https:"].includes(url.protocol) ||
        !/(^|\.)mercadopago\.(com|com\.br)$/.test(url.hostname)
      )
        throw new Error(
          "O link de pagamento não está disponível. Tente novamente.",
        );
      window.location.assign(result.url);
    } catch (err) {
      setError(message(err));
      setBusy(false);
    }
  }
  return (
    <>
      <Header />
      <main id="main-content" className="container purchase-page">
        <div>
          <Link className="back-link" to="/app">
            <ArrowLeft size={16} /> Minha conta
          </Link>
          <p className="eyebrow">FALTA POUCO</p>
          <h1>
            Deixe sua marca
            <br />
            no próximo orçamento.
          </h1>
          <p>
            Olá, {me.user.name.split(" ")[0]}. Seu acesso vale por 12 meses a
            partir da confirmação do pagamento.
          </p>
          <ul className="check-list">
            <CheckLine>Uma marca e um usuário</CheckLine>
            <CheckLine>Até 300 documentos com até 10 itens</CheckLine>
            <CheckLine>Fotos opcionais, processadas no seu aparelho</CheckLine>
            <CheckLine>PDF para baixar e guardar</CheckLine>
            <CheckLine>Sem cobrança de renovação automática</CheckLine>
          </ul>
          <div className="purchase-note">
            <ShieldCheck size={23} />
            <p>
              Reembolso integral solicitado em até sete dias da compra. Suporte
              por e-mail, com resposta em até dois dias úteis.
            </p>
          </div>
        </div>
        <section className="checkout-card">
          <p className="eyebrow">RESUMO DO PEDIDO</p>
          {config?.checkoutSandbox && config.checkoutReady && (
            <Notice>
              Ambiente de teste. Use somente as contas e os dados de teste do
              Mercado Pago.
            </Notice>
          )}
          <h2>Plano Essencial</h2>
          <div className="checkout-line">
            <span>Acesso por 12 meses</span>
            <strong>R$97,00</strong>
          </div>
          <div className="checkout-line">
            <span>Mensalidade adicional</span>
            <span>R$0,00</span>
          </div>
          <div className="checkout-total">
            <span>Total à vista</span>
            <strong>R$97,00</strong>
          </div>
          <p className="small-text">
            Sua conta: <strong>{me.user.email}</strong>
          </p>
          {error && <Notice error>{error}</Notice>}
          {!config?.checkoutReady && (
            <Notice>
              Estamos preparando as vendas. Você já pode experimentar a
              ferramenta gratuitamente na demonstração. Nenhum pagamento será
              solicitado agora.
            </Notice>
          )}
          <button
            className="button full-width"
            disabled={busy || !config?.checkoutReady}
            onClick={checkout}
          >
            {busy
              ? "Abrindo pagamento…"
              : config?.checkoutReady
                ? "Ir para o pagamento"
                : "Vendas em preparação"}
            <ArrowUpRight size={18} />
          </button>
          <div className="payment-methods">
            <CreditCard size={17} />
            <span>Pix ou cartão à vista · Mercado Pago</span>
          </div>
          <p className="small-text">
            Ao continuar, você contrata o plano descrito nos{" "}
            <Link to="/termos">termos de uso</Link>. As fotos não ficam
            arquivadas no sistema.
          </p>
          <Link className="link-arrow" to="/demonstracao">
            Experimentar um exemplo <ArrowRight size={15} />
          </Link>
        </section>
      </main>
      <Footer />
    </>
  );
}

export function PaymentPage() {
  const { me, loading, refresh, consent, config } = useApp();
  const [params] = useSearchParams();
  const validatedOrderId = safeOrderId(params.get("order"));
  const orderId = validatedOrderId
    ? encodeURIComponent(validatedOrderId)
    : null;
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const tracked = useRef(false);
  const approved = order?.status === "approved";
  const expired =
    approved &&
    !!order?.accessExpiresAt &&
    new Date(order.accessExpiresAt).getTime() <= Date.now();
  const reversed = [
    "refunded",
    "charged_back",
    "cancelled",
    "rejected",
    "expired",
    "checkout_failed",
  ].includes(order?.status || "");
  async function update(reconcile = false) {
    if (!orderId) return;
    setError("");
    setBusy(true);
    try {
      const result = reconcile
        ? await post<{ order: Order }>(`/orders/${orderId}/reconcile`)
        : await api<{ order: Order }>(`/orders/${orderId}`);
      setOrder(result.order);
      if (result.order.status === "approved") await refresh();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (me.user && orderId) void update(true);
  }, [me.user?.id, orderId]);
  useEffect(() => {
    if (!me.user || !orderId || approved || reversed || attempts >= 20) return;
    const timer = setTimeout(() => {
      setAttempts((v) => v + 1);
      void update(false);
    }, 5000);
    return () => clearTimeout(timer);
  }, [orderId, me.user?.id, approved, reversed, attempts]);
  useEffect(() => {
    if (
      !approved ||
      expired ||
      !orderId ||
      consent !== "accepted" ||
      !config?.pixelId ||
      tracked.current ||
      !window.fbq
    )
      return;
    const key = `oe-purchase-${orderId}`;
    try {
      if (localStorage.getItem(key)) return;
      window.fbq(
        "track",
        "Purchase",
        { value: 97, currency: "BRL" },
        { eventID: orderId },
      );
      localStorage.setItem(key, "1");
      tracked.current = true;
    } catch {}
  }, [approved, expired, orderId, consent, config?.pixelId]);
  if (loading)
    return (
      <PageShell title="Seu pagamento">
        <Spinner />
      </PageShell>
    );
  if (!me.user) return <Navigate to="/entrar" replace />;
  return (
    <>
      <Header />
      <main id="main-content" className="payment-page container">
        <div className={`payment-status-icon ${approved ? "success" : ""}`}>
          {approved ? <CheckCircle2 size={34} /> : <CreditCard size={34} />}
        </div>
        <p className="eyebrow">
          {config?.checkoutSandbox && config.checkoutReady
            ? "PAGAMENTO DE TESTE"
            : approved
              ? "TUDO CERTO"
              : "SEU PEDIDO"}
        </p>
        <h1>
          {expired
            ? "Este período de acesso terminou."
            : approved
              ? "Pronto para o próximo orçamento."
              : reversed
                ? "O pagamento não foi concluído."
                : "Conferindo seu pagamento."}
        </h1>
        <p>
          {expired
            ? "Você pode contratar um novo período na sua conta."
            : approved
              ? "Seu acesso está ativo. Configure sua marca e monte seu primeiro documento."
              : reversed
                ? "Confira o pedido na sua conta. Se precisar, você pode iniciar uma nova compra."
                : "A liberação acontece após a confirmação do pagamento. No Pix, conclua o pagamento com os dados fornecidos pelo Mercado Pago."}
        </p>
        {!orderId && (
          <Notice error>
            O pedido não foi informado. Você pode consultar seu plano na sua
            conta.
          </Notice>
        )}
        {error && <Notice error>{error}</Notice>}
        {order && (
          <div className="payment-reference">
            <span>Pedido {order.id.slice(0, 8).toUpperCase()}</span>
            <strong>R$97,00</strong>
            <span>
              {approved
                ? "Pagamento aprovado"
                : reversed
                  ? "Não concluído ou estornado"
                  : "Aguardando confirmação"}
            </span>
          </div>
        )}
        <div className="payment-actions">
          <Link className="button" to="/app">
            {approved && !expired
              ? "Criar meu primeiro orçamento"
              : "Ir para minha conta"}
            <ArrowRight size={18} />
          </Link>
          {!approved && !reversed && orderId && (
            <button
              className="button button-light"
              onClick={() => update(true)}
              disabled={busy}
            >
              <RefreshCw size={17} className={busy ? "spin" : ""} /> Conferir
              novamente
            </button>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
