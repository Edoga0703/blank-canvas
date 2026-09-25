# Arquivos do Google Drive dentro do Metrix

Sim, é possível — e é exatamente o caminho certo para não pesar no seu armazenamento.

Cada empresa conecta a **própria conta do Google Drive**. Os arquivos ficam no Drive dela (espaço e custo dela); o Metrix só mostra, organiza e envia. Você não guarda nada.

## Como fica para o usuário

Dentro do detalhe do lead, na aba **Mídia**, passa a haver duas seções:

- **Da conversa** — o que já existe hoje (fotos, áudios, documentos trocados no WhatsApp).
- **Drive** — a pasta daquele contato no Google Drive da empresa.

Na seção Drive:

- Primeiro acesso: botão "Conectar Google Drive". A pessoa faz login no Google e autoriza.
- Depois de conectado: lista de arquivos e pastas do contato, com ações de **enviar arquivo**, **criar pasta**, **renomear**, **excluir**, **baixar** e **abrir no Drive**.
- Cada contato ganha automaticamente sua pasta, dentro de uma pasta raiz da empresa:

```text
Metrix CRM/
  Maria Silva - 5585999990000/
    Contrato.pdf
    Exames/
```

- Um botão "Enviar no WhatsApp" pega o arquivo do Drive e manda direto na conversa, sem precisar baixar e subir de novo.

## Limites honestos

- Funciona só com Google Drive nesta primeira versão (OneDrive é possível depois, mesma lógica).
- Quem não conectar o Drive vê apenas a mensagem de conectar; nada quebra.
- A conexão é por usuário do Metrix, então cada atendente conecta a conta Google dele (normalmente a conta da empresa compartilhada, ou uma pasta compartilhada entre eles).
- Arquivos muito grandes: o envio pelo WhatsApp continua respeitando o limite do próprio WhatsApp.

## Etapas

1. Configurar o conector Google Drive por usuário (cliente OAuth da Lovable + autorização de cada usuário).
2. Guardar, no banco, a chave de conexão de cada usuário de forma criptografada.
3. Criar as funções de servidor: listar, criar pasta, upload, renomear, excluir, link de download; e o mapeamento contato → pasta.
4. Montar a seção Drive dentro da aba Mídia do detalhe do lead (Conversas e CRM Kanban usam o mesmo componente).
5. Adicionar a ação "Enviar no WhatsApp" a partir de um arquivo do Drive.
6. Testar ponta a ponta com uma conta real.

## Detalhes técnicos

- App User Connector `google_drive` (per-user OAuth via connector gateway), escopo `https://www.googleapis.com/auth/drive.file` — o app só enxerga o que ele mesmo criou, o que reduz o risco e facilita a aprovação do Google.
- Nova tabela `app_user_connections` (user_id, connector_id, chave cifrada com `APP_USER_CONNECTION_KEY_SECRET`), acesso só via service_role.
- Nova coluna `drive_folder_id` em `crm_card` (ou tabela de mapeamento contato→pasta) para não recriar pastas.
- Novo `src/lib/drive.functions.ts` com `requireSupabaseAuth`, chamando o gateway em `https://connector-gateway.lovable.dev/google_drive/drive/v3/...` (list, files.create multipart, patch, delete, alt=media).
- UI: nova subseção em `conversation-media-panel.tsx` / aba Mídia do `lead-drawer.tsx`, com abas internas "Da conversa" e "Drive".
- Envio ao WhatsApp: baixar o conteúdo no servidor e reaproveitar o fluxo de upload de mídia já existente em Conversas.

Pré-requisito: no primeiro passo você (ou eu, com sua aprovação no card) cria o cliente OAuth do Google. É gratuito.
