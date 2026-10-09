# Funis por usuário no cadastro

No cadastro/edição do usuário, junto de Conexões e Departamentos, entra também **Funis**. O usuário passa a ver no CRM apenas os funis marcados ali.

## Como funciona

- Campo "Funis com acesso" (múltipla escolha) no formulário do usuário, ao lado de Conexões e Departamentos.
- Nenhum funil marcado = vê todos (é o comportamento atual). Assim nenhum cliente existente é afetado, e só quem marcar passa a ter restrição.
- Dono, administrador e super-admin sempre veem todos os funis, para conseguir fazer a triagem na Gestão.
- Ao selecionar um departamento, o funil vinculado a ele é sugerido automaticamente — dá para ajustar à mão.
- Se o usuário tiver funis marcados, o seletor de funis do CRM mostra só esses; ele não consegue abrir os demais nem mover cards para lá.
- Dentro do funil liberado, o atendente vê os cards do setor dele além dos próprios, para assumir o que foi encaminhado.

## Exemplo SEVCON

- Brena e Mara: Pessoal.
- Antônio e Vianey: Fiscal + Contábil.
- Patrícias: Legalização.
- Mara e Vianey, como administradoras, continuam vendo Gestão e todos os funis.

## Detalhes técnicos

- Nova tabela `company_user_pipeline (company_id, user_id, pipeline_id)` com RLS por empresa e grants; sem linhas = acesso total (compatível com o estado atual).
- `src/lib/team.functions.ts`: `inviteMember`/`updateMember` passam a receber e gravar `pipeline_ids`; leitura da equipe devolve os vínculos.
- `src/components/config/equipe-tab.tsx`: multiselect "Funis com acesso", carregando `crm_pipeline` da empresa; ao marcar departamento, pré-seleciona `department.pipeline_id`.
- `src/routes/app/crm.tsx`: filtra `pipelines` pelos IDs liberados (quando houver e o papel não for owner/admin/super-admin); ajusta o filtro de cards para `owner_id === userId || sem dono || department_id ∈ setores do usuário`.
- Reforço no servidor: checagem dos funis liberados nas escritas de card (mover/criar) para que a restrição não dependa só da tela.
- Sem migração de dados; quem não marcar nada continua exatamente como hoje.

## Ordem de execução

1. Tabela de vínculo + gravação no cadastro do usuário.
2. Multiselect de funis na aba Usuários, com sugestão pelo departamento.
3. Filtro de funis e de cards no CRM.
4. Reforço no servidor e configuração dos usuários da SEVCON.
