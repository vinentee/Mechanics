import {
  ArrowRight,
  Check,
  LoaderCircle,
  Menu,
  Wrench,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useApp } from "./context";
import { money } from "../shared/types";
import { parsePrice, priceInput } from "./api";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className="brand" to="/" aria-label="OrçaMecânica, início">
      <span className="brand-mark">
        <Wrench size={23} strokeWidth={1.7} />
        <Sparkles className="brand-spark" size={10} />
      </span>
      {!compact && (
        <span>
          Orça<span className="brand-weight">Mecânica</span>
        </span>
      )}
    </Link>
  );
}
export function Header() {
  const [open, setOpen] = useState(false);
  const { me } = useApp();
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname, location.hash]);
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Brand />
        <nav
          className={open ? "site-nav open" : "site-nav"}
          aria-label="Navegação principal"
        >
          <Link to="/#como-funciona">Como funciona</Link>
          <Link to="/#recursos">O que inclui</Link>
          <Link to="/#preco">Preço</Link>
          <Link to={me.user ? "/app" : "/entrar"} className="nav-login">
            {me.user ? "Minha conta" : "Entrar"} <ArrowRight size={15} />
          </Link>
        </nav>
        <button
          className="menu-button"
          aria-expanded={open}
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          onClick={() => setOpen(!open)}
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>
    </header>
  );
}
export function Footer() {
  const { config, openPrivacy } = useApp();
  return (
    <footer className="site-footer">
      <div className="container footer-top">
        <div>
          <Brand />
          <p>Seu serviço, bem apresentado.</p>
        </div>
        <div className="footer-links">
          <Link to="/demonstracao">Experimentar</Link>
          <Link to="/termos">Termos de uso</Link>
          <Link to="/privacidade">Privacidade</Link>
          <button onClick={openPrivacy}>Preferências de cookies</button>
          {config?.seller.email && (
            <a href={`mailto:${config.seller.email}`}>Fale com a gente</a>
          )}
        </div>
      </div>
      <div className="container footer-bottom">
        <span>© {new Date().getFullYear()} OrçaMecânica.</span>
        <span>
          {config?.seller.legalName
            ? `${config.seller.legalName}${config.seller.document ? ` · ${config.seller.document}` : ""}`
            : "Identificação comercial em preparação. Vendas ainda não habilitadas."}
        </span>
      </div>
    </footer>
  );
}
export function Spinner({ label = "Carregando…" }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={23} />
      <span>{label}</span>
    </div>
  );
}
export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={`notice ${error ? "error" : ""}`}
      role={error ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
export function Field({
  label,
  children,
  hint,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  wide?: boolean;
}) {
  return (
    <label className={`field ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function MoneyInput({
  cents,
  onValue,
  label,
}: {
  cents: number;
  onValue: (cents: number) => void;
  label: string;
}) {
  const [text, setText] = useState(priceInput(cents));
  useEffect(() => {
    setText((previous) =>
      parsePrice(previous) === cents ? previous : priceInput(cents),
    );
  }, [cents]);
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      value={text}
      maxLength={16}
      required
      onChange={(event) => {
        const value = event.target.value;
        const clean = value.replace(/^R\$\s?/, "").trim();
        const valid =
          /^\d+(?:[.,]\d{0,2})?$|^\d{1,3}(?:\.\d{3})+[,]\d{0,2}$/.test(clean);
        setText(value);
        event.target.setCustomValidity(
          valid || !clean ? "" : "Informe um preço válido, como 180,00.",
        );
        if (valid) onValue(parsePrice(value));
      }}
      onBlur={(event) => {
        if (event.target.validity.valid) setText(priceInput(cents));
      }}
    />
  );
}
export function CheckLine({ children }: { children: ReactNode }) {
  return (
    <li>
      <span className="check-dot">
        <Check size={14} />
      </span>
      {children}
    </li>
  );
}
export function PageShell({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
}) {
  return (
    <>
      <Header />
      <main id="main-content" className="container content-page">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {children}
      </main>
      <Footer />
    </>
  );
}
export function DocumentPreview({ full = false }: { full?: boolean }) {
  return (
    <div className={`document-preview ${full ? "full" : ""}`}>
      <div className="document-brand">
        <span className="document-icon">
          <Wrench size={23} />
        </span>
        <div>
          <strong>Sua marca</strong>
          <span>Serviços automotivos</span>
        </div>
        <span className="document-type">ORÇAMENTO</span>
      </div>
      <div className="document-body">
        <div className="document-heading">
          <div>
            <span className="tiny-label">PREPARADO PARA</span>
            <strong>Marina Oliveira</strong>
            <span>Vila Mariana, São Paulo — SP</span>
          </div>
          <div className="document-number">
            <span>Nº 001</span>
            <small>Exemplo ilustrativo</small>
          </div>
        </div>
        <div className="document-table">
          <div className="document-tr table-head">
            <span>DESCRIÇÃO DO SERVIÇO</span>
            <span>VALOR</span>
          </div>
          <div className="document-tr">
            <span>
              Troca de óleo<small>mão de obra · 1 unidade</small>
            </span>
            <strong>{money(18000)}</strong>
          </div>
          <div className="document-tr">
            <span>
              Filtro de óleo<small>2 unidades · R$70,00 cada</small>
            </span>
            <strong>{money(14000)}</strong>
          </div>
        </div>
        <div className="document-total">
          <span>Valor total</span>
          <strong>{money(32000)}</strong>
        </div>
        <div className="document-terms">
          <span className="tiny-label">CONDIÇÕES</span>
          <p>
            Pagamento via Pix ou cartão após o serviço.
            <br />
            Atendimento mediante agendamento.
          </p>
        </div>
        <div className="document-divider" />
        <div className="document-contact">
          <span>(11) 99999-0000</span>
          <span>contato@exemplo.com</span>
        </div>
      </div>
      <div className="document-bottom">
        Serviços e valores ilustrativos. Você define os seus preços.
      </div>
    </div>
  );
}
