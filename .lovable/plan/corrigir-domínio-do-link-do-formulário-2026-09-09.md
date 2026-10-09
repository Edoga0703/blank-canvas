# Corrigir domínio do link do formulário

O link dos formulários de captura está usando o endereço de pré-visualização (lovable.app) em vez do domínio oficial.

## Correção

Em `src/components/config/formularios-tab.tsx`, o link é montado com `window.location.origin`, que no preview aponta para o domínio da Lovable.

- Fixar o domínio público como `https://metrixcrm.com.br` na montagem do link (`/f/{slug}`), tanto no texto exibido quanto no botão "Copiar link".
- O botão de pré-visualização (abrir) continua abrindo o caminho relativo `/f/{slug}` normalmente, funcionando em qualquer ambiente.

## Detalhes técnicos

- Substituir a constante `origin` por `https://metrixcrm.com.br` em `formularios-tab.tsx` (funções `copyLink` e exibição do link).
- Sem mudanças de banco, rotas ou lógica de envio — apenas o texto do link exibido/copiado.
