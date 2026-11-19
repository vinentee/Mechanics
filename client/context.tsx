import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";
import type { Me, PublicConfig } from "../shared/types";
import { api, post, safeOrderId } from "./api";

type Consent = "accepted" | "rejected" | null;
type Context = {
  me: Me;
  config: PublicConfig | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setMe: (value: Me) => void;
  consent: Consent;
  chooseConsent: (value: Exclude<Consent, null>) => void;
  openPrivacy: () => void;
  track: (name: string) => void;
  utm: Record<string, string>;
};
const AppContext = createContext<Context>(null!);
declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & {
      queue?: unknown[][];
      callMethod?: (...args: unknown[]) => void;
      push?: unknown;
      loaded?: boolean;
      version?: string;
    };
    _fbq?: Window["fbq"];
  }
}
const anonymous: Me = { user: null, profile: null, access: null };
function initialConsent(): Consent {
  try {
    const value = localStorage.getItem("oe-privacy");
    return value === "accepted" || value === "rejected" ? value : null;
  } catch {
    return null;
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me>(anonymous);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [consent, setConsent] = useState<Consent>(initialConsent);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [utm] = useState(() =>
    Object.fromEntries(
      [...new URLSearchParams(window.location.search)]
        .filter(([key]) =>
          /^utm_(source|medium|campaign|content|term)$/.test(key),
        )
        .map(([key, value]) => [key, value.slice(0, 120)]),
    ),
  );
  const location = useLocation();
  const trackedView = useRef<string | null>(null);
  const trackedPixel = useRef<string | null>(null);
  const publicRoute = ["/", "/demonstracao", "/comprar", "/pagamento"].includes(
    location.pathname,
  );
  async function refresh() {
    const result = await api<Me>("/auth/me");
    setMe(result);
  }
  useEffect(() => {
    Promise.allSettled([
      refresh(),
      api<PublicConfig>("/config").then(setConfig),
    ]).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (consent !== "accepted" || !config?.pixelId || !publicRoute) {
      window.fbq?.("consent", "revoke");
      return;
    }
    if (location.pathname === "/pagamento") {
      const order = safeOrderId(
        new URLSearchParams(window.location.search).get("order"),
      );
      const clean = order ? `/pagamento?order=${order}` : "/pagamento";
      if (`${window.location.pathname}${window.location.search}` !== clean)
        window.history.replaceState(window.history.state, "", clean);
    }
    if (!window.fbq) {
      const fbq: NonNullable<Window["fbq"]> = (...args: unknown[]) => {
        if (fbq.callMethod) fbq.callMethod(...args);
        else fbq.queue!.push(args);
      };
      fbq.queue = [];
      fbq.loaded = true;
      fbq.version = "2.0";
      fbq.push = fbq;
      window.fbq = window._fbq = fbq;
      const script = document.createElement("script");
      script.async = true;
      script.src = "https://connect.facebook.net/en_US/fbevents.js";
      script.id = "oe-meta";
      document.head.appendChild(script);
      fbq("consent", "grant");
      fbq("set", "autoConfig", false, config.pixelId);
      fbq("init", config.pixelId);
    } else window.fbq("consent", "grant");
  }, [consent, config?.pixelId, publicRoute, location.pathname]);
  useEffect(() => {
    if (
      location.pathname !== "/" ||
      location.hash ||
      trackedView.current === location.key
    )
      return;
    trackedView.current = location.key;
    post("/events", { name: "page_view", utm }).catch(() => {});
  }, [location.key, location.pathname, location.hash, utm]);
  useEffect(() => {
    if (
      !publicRoute ||
      location.hash ||
      consent !== "accepted" ||
      !config?.pixelId ||
      trackedPixel.current === location.key
    )
      return;
    trackedPixel.current = location.key;
    window.fbq?.("track", "PageView");
  }, [location.key, location.hash, consent, config?.pixelId, publicRoute]);
  function chooseConsent(value: Exclude<Consent, null>) {
    setConsent(value);
    setPrivacyOpen(false);
    try {
      localStorage.setItem("oe-privacy", value);
    } catch {}
    if (value === "rejected") {
      window.fbq?.("consent", "revoke");
      for (const name of ["_fbp", "_fbc"]) {
        document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
        document.cookie = `${name}=; Max-Age=0; path=/; domain=.${locationHost()}; SameSite=Lax`;
      }
    }
  }
  function track(name: string) {
    post("/events", { name, utm }).catch(() => {});
  }
  return (
    <AppContext.Provider
      value={{
        me,
        setMe,
        config,
        loading,
        refresh,
        consent,
        chooseConsent,
        openPrivacy: () => setPrivacyOpen(true),
        track,
        utm,
      }}
    >
      {children}
      {(privacyOpen || consent === null) && (
        <aside
          className="cookie-panel"
          aria-label="Preferências de privacidade"
        >
          <div>
            <strong>Sua privacidade, sua escolha.</strong>
            <p>
              Usamos recursos essenciais para sua conta. Com sua permissão,
              usamos cookies de publicidade para medir os anúncios.{" "}
              <a href="/privacidade">Saiba mais</a>.
            </p>
          </div>
          <div className="cookie-actions">
            <button
              className="button button-light small"
              onClick={() => chooseConsent("rejected")}
            >
              Apenas essenciais
            </button>
            <button
              className="button small"
              onClick={() => chooseConsent("accepted")}
            >
              Aceitar publicidade
            </button>
          </div>
        </aside>
      )}
    </AppContext.Provider>
  );
}
function locationHost() {
  return window.location.hostname;
}
export const useApp = () => useContext(AppContext);
