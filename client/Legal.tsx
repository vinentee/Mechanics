import { Link } from "react-router-dom";
import { PageShell } from "./components";
import { useApp } from "./context";

export function LegalPage({ kind }: { kind: "terms" | "privacy" }) {
  const { config, openPrivacy } = useApp();
  const seller = config?.seller;
  const contact = seller?.email ? (
    <a href={`mailto:${seller.email}`}>{seller.email}</a>
  ) : (
    "canal de suporte a ser publicado antes da abertura das vendas"
  );
  return (
    <PageShell
      eyebrow="ORÇAMECÂNICA"
      title={kind === "terms" ? "Termos de uso" : "Política de privacidade"}
    >
      <div className="legal-copy">
        <p className="legal-intro">
          {kind === "terms"
            ? "Condições para usar e contratar o OrçaMecânica."
            : "Como os dados são usados para oferecer o serviço e cuidar da sua conta."}
        </p>
        <h2>Responsável pelo serviço</h2>
        {seller?.legalName ? (
          <p>
            {seller.legalName} · CPF/CNPJ: {seller.document}. Endereço:{" "}
            {seller.address}. Contato: {contact}.
          </p>
        ) : (
          <p>
            A identificação do vendedor e o canal de contato serão publicados
            antes da abertura das vendas. A demonstração está disponível.
          </p>
        )}
        {kind === "terms" ? (
          <>
            <h2>Acesso e oferta</h2>
            <p>
              O Plano Essencial custa R$97, em pagamento único. O acesso começa
              após a confirmação do pagamento e dura 12 meses. Não há renovação
              ou cobrança automática. A compra inclui um usuário, uma marca, um
              modelo de PDF, até 300 documentos durante o período e até dez
              itens por documento. Você pode adicionar até três pares de fotos
              por PDF.
            </p>
            <h2>Dados dos orçamentos e fotos</h2>
            <p>
              Você define os serviços, preços, condições e conteúdo enviados ao
              cliente. As fotos são processadas no seu navegador, entram no PDF
              e não são arquivadas no sistema. Baixe e guarde seus PDFs antes do
              fim do acesso. As fotos devem ser selecionadas novamente se você
              reeditar um orçamento.
            </p>
            <h2>Pagamento, cancelamento e reembolso</h2>
            <p>
              O Mercado Pago processa o pagamento. Você pode solicitar reembolso
              integral em até sete dias após a compra pela área “Meu plano” ou
              pelo contato {contact}. Após o reembolso confirmado, o acesso ao
              plano é encerrado. As condições não limitam direitos previstos na
              legislação aplicável.
            </p>
            <h2>Suporte</h2>
            <p>
              Envie dúvidas ou pedidos de ajuda para {contact}. O prazo de
              resposta é de até dois dias úteis. Evite anexar documentos
              pessoais ou fotos de clientes sem necessidade.
            </p>
            <h2>Privacidade</h2>
            <p>
              Confira como cuidamos da sua conta e dos dados de orçamentos na{" "}
              <Link to="/privacidade">política de privacidade</Link>.
            </p>
          </>
        ) : (
          <>
            <h2>Dados que usamos</h2>
            <p>
              Usamos nome, e-mail, credenciais protegidas e dados de sessão para
              gerenciar sua conta. Guardamos os dados da sua marca, serviços,
              preços e conteúdo textual dos orçamentos que você salvar. Você
              decide quais dados do seu cliente são necessários para cada
              orçamento.
            </p>
            <h2>Fotos e demonstração</h2>
            <p>
              As fotos dos serviços são processadas no seu navegador e incluídas
              no PDF. Elas não são transmitidas nem armazenadas pelo
              OrçaMecânica. A logo salva no perfil faz parte da configuração da
              sua marca. Os campos que você edita na demonstração não são
              enviados ao servidor.
            </p>
            <h2>Pagamento, hospedagem e e-mails</h2>
            <p>
              O Mercado Pago recebe os dados de pagamento necessários no
              checkout e nos informa o estado do pedido. Não armazenamos dados
              do seu cartão. A Railway hospeda a aplicação e os registros, e o
              Resend pode enviar e-mails sobre sua conta e recuperação de
              acesso.
            </p>
            <h2>Cookies e medição</h2>
            <p>
              Usamos um cookie essencial para manter sua sessão e uma
              preferência local para lembrar sua escolha de privacidade. A
              aplicação registra eventos operacionais como visitas,
              demonstrações, pedidos e primeira exportação para acompanhar o
              funcionamento. Com sua autorização, o Meta Pixel pode medir
              publicidade. Você pode mudar sua escolha a qualquer momento.
            </p>
            <button
              className="button button-light small"
              type="button"
              onClick={openPrivacy}
            >
              Preferências de cookies
            </button>
            <h2>Retenção e seus direitos</h2>
            <p>
              Mantemos os dados de conta e documentos para prestar o serviço e
              os registros comerciais pelo tempo necessário para cumprir
              obrigações aplicáveis. Para consultar, corrigir ou solicitar
              exclusão de dados, use o contato {contact}.
            </p>
          </>
        )}
      </div>
    </PageShell>
  );
}
