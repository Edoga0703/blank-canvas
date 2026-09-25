# Reorganizar o módulo de Integrações — passo a passo individual por tipo

## Objetivo
Remover o bloco grande de guias (accordion com 9 passos) do topo da aba Integrações e colocar um passo a passo curto **dentro de cada aba** do cartão "Captura de leads no seu site" (Script, Formulário, Meta Ads, API/cURL, Link WhatsApp), logo abaixo do código de cada uma.

## O que muda (apenas `src/components/config/integracoes-tab.tsx`)

1. **Remover `<IntegracaoGuias />` do topo** — o módulo abre direto com Tokens de API + Captura de leads.
   - Nota: a aba "Guias" completa continua existindo no módulo Integrações do menu lateral (`/app/integracoes`), nada é perdido.

2. **Cartão Tokens de API**: adicionar mini passo a passo abaixo da lista de tokens (3-4 passos: nomear, criar, copiar, revogar se vazar).

3. **Aba Script** — abaixo do código: passos numerados
   1. Copie o script e cole antes de `</body>` em todas as páginas do site (WordPress: plugin de scripts no rodapé ou editor de tema).
   2. Marque seu formulário com `data-metrix-form` e campos `nome`, `numero` (opcional `mensagem`).
   3. Publique, envie um teste e confira o lead no CRM → Kanban Comercial.

4. **Aba Formulário** — abaixo do código: passos
   1. Garanta que o Script (aba anterior) está instalado no site.
   2. Use o HTML de exemplo ou adapte o seu formulário mantendo `data-metrix-form` e os names dos campos.
   3. Opcional: `data-metrix-redirect="/obrigado"` para página de agradecimento.
   4. Teste e veja o lead no Kanban.

5. **Aba Meta Ads** — abaixo do código: passos
   1. Em developers.facebook.com, abra/crie um App tipo Empresa e adicione o produto Webhooks (objeto Page).
   2. Callback URL = a URL exibida; Verify Token = `metrix_crm_leads_verify`.
   3. Assine o campo `leadgen` e solicite as permissões `leads_retrieval`, `pages_show_list`, `pages_manage_metadata`.
   4. Teste pelo Lead Ads Testing Tool da Meta.
   - Alternativa: mencionar que dá para fazer sem código via Make (link curto explicativo com o JSON de exemplo).

6. **Aba API (cURL)** — abaixo do código: passos
   1. Crie um Token de API no cartão ao lado.
   2. Faça um POST para a URL com `company_token`, `numero` e `nome` (demais campos opcionais).
   3. Funciona em Zapier (Webhooks → POST), Make (HTTP → Make a request), n8n (HTTP Request) ou backend próprio.
   4. Confirme retorno 200 e o lead no Kanban.

7. **Aba Link WhatsApp** — abaixo do código: passos
   1. Troque `SEUNUMERO` pelo número com DDI (ex.: 5511999999999).
   2. Ajuste a mensagem e as UTMs entre colchetes.
   3. Use o link no anúncio, bio ou botão do site; a origem é registrada na ficha do lead.

## Layout
- Cada passo a passo usa o mesmo estilo numerado do componente `Passos` (bolinha azul com número), em fonte pequena, abaixo do snippet — visual limpo, sem accordion.
- Sem mudanças de backend, banco de dados ou rotas. Risco zero para os demais módulos.

## Arquivo alterado
- `src/components/config/integracoes-tab.tsx` (único). O componente `integracao-guias.tsx` é mantido intacto pois ainda é usado em `/app/integracoes`.
