# Financeiro do Master — auditoria e remodelagem

## O que está errado hoje (verificado no banco)

**1. Aparecem 4 clientes pagantes em vez de 3.**
O sistema conta como pagante qualquer assinatura marcada como "ativa" que não seja cortesia. Hoje existem 4 nessa condição:

- Imobiliária Meireles — vence 10/09 — Kiwify
- Madeireira Nova — vence 14/09 — Kiwify
- Azul Empréstimo — vence 30/09 — Kiwify
- **RB Clinic — venceu 29/08 e nunca foi renovada** — lançada manualmente

RB Clinic é o "quarto cliente". Ela continua marcada como ativa embora o ciclo tenha vencido há 11 dias e não haja pagamento.

**2. "Recebido no mês" e o gráfico de 6 meses ficam zerados / errados.**
Os pagamentos que chegam da Kiwify são gravados com os nomes originais dela (`order_approved`, `order_rejected`, `pix_created`), mas a tela procura por outros nomes (`purchase_approved`, `subscription_renewed`). Resultado: nenhum pagamento real é reconhecido como "pago" — na aba Faturas quase tudo aparece como "outro", e o faturamento do mês fica em zero. Há ainda 10 eventos gravados como "desconhecido".

**3. Dois menus para a mesma coisa.**
Existe "Financeiro" e, ao lado, "Cobranças" — e a tela de Cobranças está vazia (nenhuma cobrança do checkout próprio foi gerada até agora).

**4. Falta o que você pediu: visão por cliente.**
Não existe hoje uma lista de "quem paga, quanto já pagou, qual o próximo vencimento".

## O que vou fazer

### Corrigir os números
- Só entra na receita recorrente quem tem assinatura ativa, não-cortesia **e ciclo válido** (vencimento no futuro ou dentro de uma tolerância de 5 dias). Quem passou disso vira "vencido/em atraso" e sai do MRR — com isso a recorrência passa a mostrar os 3 clientes reais.
- Traduzir corretamente os eventos da Kiwify (aprovado, recusado, reembolso, estorno, atraso, cancelamento, PIX gerado) e do Abacate Pay, para que "Recebido no mês", o gráfico e os status das faturas passem a refletir o dinheiro real.
- Revisar o caso da RB Clinic: ela aparecerá como vencida, aguardando sua decisão (renovar, cobrar ou encerrar).

### Nova aba "Clientes pagantes"
Uma lista com uma linha por cliente pagante mostrando: nome, plano, valor mensal, forma de cobrança, **data do próximo vencimento**, dias até vencer (com alerta de vencido/vence em breve), **total já pago** e data do último pagamento. Com busca, ordenação e exportação em CSV.

### Enxugar e unificar
- Juntar "Cobranças" dentro de Financeiro (vira uma aba), deixando um único menu.
- Abas finais: **Visão geral · Clientes · Faturas · Inadimplência · Conciliação** (a antiga aba de eventos de webhook, agora só para resolver falhas).

### Layout e design
- Topo com 4 indicadores enxutos: Receita recorrente, Recebido no mês, Ticket médio, Em atraso — cada um com variação em relação ao mês anterior.
- Gráfico de faturamento redesenhado, com barras comparando recebido x reembolsos e valores legíveis.
- Painel lateral "Próximos vencimentos (30 dias)" com quem vence e quando.
- Cartões de receita por plano e por upgrade mais compactos, com barra de participação.
- Faturas com filtros mais claros, chips de status coloridos e totais no rodapé.
- Tudo responsivo, no padrão visual atual do Metrix.

## Detalhes técnicos

- `src/lib/finance.functions.ts`: novo critério de assinatura "faturável" (`status = active`, `cortesia = false`, `current_period_end >= hoje − 5 dias`); nova função `listPayingCustomers` (agrega `subscription` + `company` + soma de pagamentos em `billing_event_log`/`billing_charge`); mapa de eventos ampliado cobrindo os tipos reais gravados hoje.
- `src/lib/billing/normalize.ts`: revisar extração de valor e tipo por provedor; eventos não reconhecidos passam a ser marcados para conciliação em vez de silenciosamente virarem "outro".
- `src/routes/master/financeiro.tsx`: nova aba Clientes, absorção da tela de Cobranças, redesign dos cartões/gráfico.
- `src/routes/master/cobrancas.tsx` vira redirecionamento para `/master/financeiro`; item removido de `src/components/master-subtabs.tsx`.
- Sem mudança de schema; nada é alterado na cobrança dos clientes.
