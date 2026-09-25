# Implantação SEVCON Serviços Contábeis

Configuração inicial da conta da SEVCON em três frentes: funis, departamentos e usuários.

## 1. Funis

Os três funis atuais (Comercial, Follow-up, Pós-venda) serão excluídos com todas as suas etapas — nenhum deles possui cards.

Serão criados seis funis novos, nesta ordem, com as etapas exatamente como enviadas (todas neutras, sem marcação de ganho ou perda):

1. **Gestão** — Nova Demanda, Em Triagem, Aguardando Documentos, Documentação recebida, Em execução, Aguardando retorno/Validação, Concluído, Arquivado
2. **Fiscal** — Nova Demanda, Em Triagem, Aguardando Documentos, Documentação recebida, Em apuração, Em conferência, Em execução, Aguardando cliente, Transmitido/processado, Cliente comunicado, Concluído
3. **Pessoal** — Nova Demanda, Em Triagem, Aguardando Documentos, Documentação recebida, Em processamento, Em conferência, Aguardando cliente, Enviado/Transmitido, Cliente comunicado, Concluído
4. **Contábil** — Nova Demanda, Em Triagem, Aguardando Documentos, Documentação recebida, Em lançamento, Em conciliação, Em análise, Em conferência, Aguardando cliente, Finalizado, Cliente comunicado
5. **Legalização** — Nova Demanda, Em Triagem, Orçamento/Proposta, Aguardando Documentos, Documentação Conferida, Em preparação, Protocolado, Em exigência, Aguardando órgão, Deferido, Cliente comunicado, Concluído
6. **Financeiro** — Nova Demanda, Em Triagem, Aguardando Documentos, Em processamento, Em conferência, Aguardando cliente, Processado, Cliente comunicado, Concluído

Cada funil recebe uma cor própria para diferenciação visual no Kanban. Sem automações configuradas nas etapas neste momento.

## 2. Departamentos

Criação dos departamentos: **Pessoal**, **Fiscal**, **Contábil**, **Legalização**, **Financeiro** e **Gestão**.

## 3. Usuários

Todos criados com a senha padrão `sevcon2026` e vínculo com os departamentos indicados:

| Nome | E-mail | Departamento | Função |
|---|---|---|---|
| Brena | pessoal@sevcon.com.br | Pessoal | Atendente |
| Mara | marahcostha10@gmail.com | Pessoal | Administrador |
| Vianey | vianeyramos@hotmail.com | Fiscal + Contábil | Administrador |
| Antônio | fiscal@sevcon.com.br | Fiscal + Contábil | Atendente |
| Celso | celsoprofissional88@gmail.com | Contábil | Atendente |
| Bernardo | fquintobernardo@gmail.com | Fiscal | Atendente |
| Matheus | matheussilvestre.cf@gmail.com | Fiscal | Atendente |
| Natália | natalliapeixoto@icloud.com | Fiscal | Atendente |
| Patrícia Matos | patriciammatos2411@gmail.com | Legalização | Atendente |
| Patrícia Soares | legalizacao@sevcon.com.br | Legalização | Atendente |

Observação: nenhum usuário foi indicado para os departamentos **Financeiro** e **Gestão** — eles ficam criados e vazios até você indicar quem entra.

## Detalhes técnicos

- Empresa alvo: SEVCON SERVICOS CONTABEIS LTDA (`0b2e15e9-3be9-4923-a6ff-67b1ce4c53e1`).
- Funis e etapas: remoção das linhas atuais em `crm_pipeline`/`crm_stage` e inserção das novas com `ordem` sequencial e `tipo = 'normal'` em todas as etapas.
- Como os funis atuais estão marcados como `sistema = true`, a exclusão é feita diretamente na base (sem cards vinculados, sem perda de dados).
- Departamentos em `department`; vínculos em `department_member`.
- Usuários criados no sistema de autenticação com senha definida e e-mail já confirmado, com registro em `company_user` (papel `admin` para Mara e Vianey, `atendente` para os demais) e vínculo de departamento.
- Recomendação: pedir troca de senha no primeiro acesso de cada usuário.
