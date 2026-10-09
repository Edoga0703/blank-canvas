# Ajuste do recibo Metrix CRM

## O que será feito
- Preencher o emissor com a razão social já usada no sistema, CNPJ `45.044.275/0001-65` e e-mail `contato@metrixcrm.com.br`.
- Substituir o nome textual do cabeçalho pela logo branca enviada.
- Aplicar a logo azul enviada como marca-d’água clara no centro da página.
- Preservar nos próximos eventos o método de pagamento informado pela Kiwify e exibi-lo no histórico e no recibo.
- Para pagamentos antigos sem esse dado armazenado, mostrar o método conhecido quando houver evidência confiável; caso contrário, não inventar a informação.

## Detalhes técnicos
- Incorporar as imagens no PDF no navegador, com proporção e transparência adequadas.
- Ampliar o evento normalizado de cobrança para guardar o método recebido no webhook.
- Atualizar os dados globais do emissor na base para os próximos recibos.
- Validar a geração visual do PDF e o carregamento da tela de faturas.
