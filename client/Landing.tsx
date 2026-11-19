import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Camera,
  Check,
  ChevronRight,
  Download,
  FileCheck2,
  FileText,
  MousePointer2,
  Play,
  ShieldCheck,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Header, Footer, DocumentPreview, CheckLine } from "./components";
import { useApp } from "./context";

const faqs = [
  [
    "Preciso instalar algum aplicativo?",
    "Não. O OrçaMecânica funciona no navegador do celular ou do computador. Você precisa de internet para acessar sua conta e salvar os documentos.",
  ],
  [
    "O sistema decide quanto eu devo cobrar?",
    "Você define os preços dos seus serviços. O sistema calcula quantidades e totais com os valores que você informar. Os exemplos da demonstração são ilustrativos.",
  ],
  [
    "Posso colocar a minha logo?",
    "Sim. Você configura sua marca, logo e dados de contato. Eles aparecem no seu orçamento em PDF.",
  ],
  [
    "Como funcionam as fotos antes e depois?",
    "Você pode adicionar até três pares de fotos ao PDF. As fotos são processadas no seu aparelho e não ficam arquivadas no sistema. Guarde o PDF baixado. Ao reeditar um documento, será necessário adicionar as fotos novamente.",
  ],
  [
    "Existe mensalidade ou renovação automática?",
    "Não. Você paga R$97 uma vez e recebe 12 meses de acesso, com até 300 documentos. O acesso termina após esse período, sem cobrança automática.",
  ],
  [
    "E se a ferramenta não atender ao que preciso?",
    "Você pode solicitar reembolso integral em até sete dias após a compra. O contato do vendedor e as condições estão nos termos de uso.",
  ],
];
export function Landing() {
  const { me, config } = useApp();
  const buy = me.user ? "/comprar" : "/cadastro";
  return (
    <>
      <Header />
      <main id="main-content">
        <section className="hero container">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="eyebrow-line" /> FEITO PARA QUEM CUIDA DE
              VEÍCULOS
            </div>
            <h1>
              Seu serviço,
              <br />
              <em>bem apresentado.</em>
            </h1>
            <p className="hero-description">
              O cuidado que você tem no serviço
              <br className="desktop-break" /> também pode aparecer no
              orçamento.
            </p>
            <p className="hero-explanation">
              Crie um PDF com a sua marca, os serviços e os valores. Pelo
              celular, pronto para enviar ao cliente.
            </p>
            <div className="hero-actions">
              <Link className="button" to={buy}>
                Começar por R$97 <ArrowUpRight size={19} />
              </Link>
              <Link className="text-button" to="/demonstracao">
                <span className="play-circle">
                  <Play size={11} fill="currentColor" />
                </span>{" "}
                Ver funcionando
              </Link>
            </div>
            <div className="hero-fine">
              <span>
                <Check size={14} /> 12 meses de acesso
              </span>
              <span>
                <Check size={14} /> Sem mensalidade
              </span>
            </div>
          </div>
          <div className="hero-visual">
            <div className="visual-caption">
              <span className="live-dot" /> DO SEU CELULAR PARA O SEU CLIENTE{" "}
              <span>01 / PDF</span>
            </div>
            <div className="paper-scene">
              <div className="paper-behind" />
              <DocumentPreview />
              <div className="pdf-file-tag">
                <span className="pdf-tag-icon">
                  <FileCheck2 size={24} />
                </span>
                <div>
                  <strong>Pronto para enviar.</strong>
                  <span>Sua marca em cada detalhe.</span>
                </div>
                <span className="file-check">
                  <Check size={15} />
                </span>
              </div>
            </div>
            <p className="example-caption">
              Exemplo ilustrativo de um orçamento. Você define os preços.
            </p>
          </div>
        </section>
        <div className="benefit-strip">
          <div className="container strip-inner">
            <span>
              <Smartphone size={18} /> Funciona no celular
            </span>
            <span>
              <FileText size={18} /> PDF com sua marca
            </span>
            <span>
              <Camera size={18} /> Fotos antes e depois
            </span>
            <span>
              <ShieldCheck size={18} /> Pagamento único
            </span>
          </div>
        </div>
        <section className="section container story-section" id="como-funciona">
          <div className="section-intro">
            <p className="eyebrow">MENOS REPETIÇÃO. MAIS CLAREZA.</p>
            <h2>
              Você cuida do veículo.
              <br />A gente organiza o orçamento.
            </h2>
            <p>
              Chega um pedido e lá vai você escrever os serviços, os preços e as
              condições de novo. Deixe seus dados preparados e monte cada
              proposta em um só lugar.
            </p>
          </div>
          <div className="steps">
            <article className="step">
              <span className="step-number">01</span>
              <div>
                <h3>Deixe com a sua cara.</h3>
                <p>
                  Adicione sua logo, seus contatos e os serviços que você
                  oferece.
                </p>
              </div>
              <span className="step-icon">
                <Sparkles size={22} />
              </span>
            </article>
            <article className="step">
              <span className="step-number">02</span>
              <div>
                <h3>Monte o orçamento.</h3>
                <p>
                  Informe o cliente, selecione os serviços e confira o valor
                  total.
                </p>
              </div>
              <span className="step-icon">
                <MousePointer2 size={22} />
              </span>
            </article>
            <article className="step">
              <span className="step-number">03</span>
              <div>
                <h3>Baixe. Envie. Pronto.</h3>
                <p>
                  Gere o PDF e compartilhe pelo WhatsApp ou pelo aplicativo que
                  preferir.
                </p>
              </div>
              <span className="step-icon">
                <Download size={22} />
              </span>
            </article>
          </div>
        </section>
        <section className="demo-section" id="demonstracao">
          <div className="container demo-section-grid">
            <div className="demo-mini">
              <div className="mini-toolbar">
                <span />
                <span />
                <span />
                <p>Um orçamento de exemplo</p>
              </div>
              <div className="mini-content">
                <div className="mini-service">
                  <span className="service-icon">
                    <Smartphone size={26} />
                  </span>
                  <div>
                    <strong>Feito para o dia a dia.</strong>
                    <p>Sem instalar. Sem complicar.</p>
                  </div>
                </div>
                <div className="mini-input">
                  <span>Serviço</span>
                  <strong>Troca de óleo e filtro</strong>
                  <ChevronRight size={16} />
                </div>
                <div className="mini-input-row">
                  <div className="mini-input">
                    <span>Quantidade</span>
                    <strong>1</strong>
                  </div>
                  <div className="mini-input">
                    <span>Valor unitário</span>
                    <strong>R$180,00</strong>
                  </div>
                </div>
                <Link className="button full-width" to="/demonstracao">
                  Experimentar com um exemplo <ArrowRight size={17} />
                </Link>
              </div>
              <span className="demo-stamp">DEMONSTRAÇÃO INTERATIVA</span>
            </div>
            <div className="demo-text">
              <p className="eyebrow">VEJA ANTES DE COMPRAR</p>
              <h2>
                Um bom orçamento
                <br />
                começa com clareza.
              </h2>
              <p>
                Abra o exemplo, altere os serviços e baixe um PDF de
                demonstração. Sem cadastro para experimentar.
              </p>
              <Link className="link-arrow" to="/demonstracao">
                Quero ver funcionando <ArrowUpRight size={19} />
              </Link>

            </div>
          </div>
        </section>
        <section className="section container included-section" id="recursos">
          <div className="included-heading">
            <p className="eyebrow">O ESSENCIAL, BEM FEITO</p>
            <h2>
              Da oficina ao cliente.
              <br />
              Do pedido ao PDF.
            </h2>
          </div>
          <div className="included-grid">
            <article>
              <span className="feature-index">01 — SUA IDENTIDADE</span>
              <h3>
                Um documento que leva
                <br />a sua marca.
              </h3>
              <p>
                Logo, nome e contatos do seu negócio em um modelo organizado e
                pronto para usar.
              </p>
            </article>
            <article>
              <span className="feature-index">02 — SEUS SERVIÇOS</span>
              <h3>
                Seus preços.
                <br />
                As contas conferidas.
              </h3>
              <p>
                Cadastre peças e serviços da sua oficina. Informe
                quantidades e confira os totais.
              </p>
            </article>
            <article>
              <span className="feature-index">03 — SEU REGISTRO</span>
              <h3>
                Antes e depois,
                <br />
                no mesmo PDF.
              </h3>
              <p>
                Inclua até três pares de fotos. Elas ficam no PDF baixado, sem
                armazenamento de fotos no sistema.
              </p>
            </article>
          </div>
        </section>
        <section className="pricing-section" id="preco">
          <div className="container pricing-grid">
            <div className="pricing-copy">
              <p className="eyebrow">UMA FERRAMENTA. UM PAGAMENTO.</p>
              <h2>
                Seu próximo orçamento
                <br />
                pode começar aqui.
              </h2>
              <p>
                O essencial para apresentar seu serviço de forma organizada, com
                uma oferta simples de entender.
              </p>
              <div className="pricing-assurance">
                <ShieldCheck size={24} />
                <span>
                  <strong>Sete dias para experimentar.</strong>Se não atender ao
                  que precisa, solicite reembolso integral nesse prazo.
                </span>
              </div>
            </div>
            <div className="price-card">
              <div className="price-card-top">
                <span className="plan-label">PLANO ESSENCIAL</span>
                <span className="year-pill">12 MESES</span>
              </div>
              <div className="price-amount">
                <span>R$</span>
                <strong>97</strong>
                <span>,00</span>
              </div>
              <p className="price-detail">
                Pagamento único. Sem renovação automática.
              </p>
              <ul className="check-list">
                <CheckLine>Uma marca e um usuário</CheckLine>
                <CheckLine>Até 300 documentos em 12 meses</CheckLine>
                <CheckLine>Sua logo e seus serviços</CheckLine>
                <CheckLine>Até 10 itens por documento</CheckLine>
                <CheckLine>Fotos opcionais de antes e depois</CheckLine>
                <CheckLine>Download do PDF pelo celular</CheckLine>
                <CheckLine>Suporte por e-mail em dias úteis</CheckLine>
              </ul>
              <Link className="button full-width" to={buy}>
                Comprar acesso por R$97 <ArrowUpRight size={18} />
              </Link>
              <p className="price-footnote">
                {config?.checkoutReady && !config.checkoutSandbox
                  ? "Pix ou cartão à vista."
                  : "Pix ou cartão à vista após a abertura das vendas."}
                <br />
                Fotos não ficam arquivadas no sistema.
              </p>
            </div>
          </div>
        </section>
        <section className="section container faq-section">
          <div>
            <p className="eyebrow">SEM DÚVIDAS NO CAMINHO</p>
            <h2>Antes de começar.</h2>
            <p className="muted">
              Tudo o que você precisa saber
              <br />
              sobre a ferramenta.
            </p>
          </div>
          <div className="faq-list">
            {faqs.map(([question, answer]) => (
              <details key={question}>
                <summary>
                  {question}
                  <span>+</span>
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="last-cta container">
          <div>
            <span className="eyebrow">ORÇAMECÂNICA</span>
            <h2>Capriche também na apresentação.</h2>
          </div>
          <Link className="button button-light" to="/demonstracao">
            Experimentar agora <ArrowUpRight size={19} />
          </Link>
        </section>
      </main>
      <Footer />
    </>
  );
}
