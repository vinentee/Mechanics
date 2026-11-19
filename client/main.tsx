import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { AppProvider } from "./context";
import { Landing } from "./Landing";
import { AuthPage, PurchasePage, PaymentPage } from "./account";
import { Workspace, DemoPage } from "./Workspace";
import { LegalPage } from "./Legal";
import { PageShell } from "./components";
import "./styles.css";
function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0);
    else
      requestAnimationFrame(() =>
        document.getElementById(hash.slice(1))?.scrollIntoView(),
      );
  }, [pathname, hash]);
  return null;
}
function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <ScrollToTop />
        <a className="skip-link" href="#main-content">
          Pular para o conteúdo
        </a>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/demonstracao" element={<DemoPage />} />
          <Route path="/entrar" element={<AuthPage mode="login" />} />
          <Route path="/cadastro" element={<AuthPage mode="register" />} />
          <Route path="/recuperar" element={<AuthPage mode="forgot" />} />
          <Route path="/redefinir" element={<AuthPage mode="reset" />} />
          <Route path="/comprar" element={<PurchasePage />} />
          <Route path="/pagamento" element={<PaymentPage />} />
          <Route path="/app" element={<Workspace />} />
          <Route path="/termos" element={<LegalPage kind="terms" />} />
          <Route path="/privacidade" element={<LegalPage kind="privacy" />} />
          <Route
            path="*"
            element={
              <PageShell title="Essa página não está por aqui.">
                <p>Volte ao início para encontrar o que precisa.</p>
                <a className="button" href="/">
                  Ir para o início
                </a>
              </PageShell>
            }
          />
        </Routes>
      </AppProvider>
    </BrowserRouter>
  );
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
