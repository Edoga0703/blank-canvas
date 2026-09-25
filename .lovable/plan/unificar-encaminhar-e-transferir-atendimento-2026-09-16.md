# Unificar Encaminhar e Transferir atendimento

## Decisão
Faz sentido manter somente **Encaminhar atendimento**, desde que ele absorva tudo o que o botão Transferir faz hoje. Assim, não haverá perda de comportamento para empresas com distribuição manual ou automática.

## Alterações
1. **Um único botão “Encaminhar”**
   - Remover o botão e a lista separados de “Transferir” da tela de Conversas.
   - Manter “Encaminhar” disponível tanto na conversa quanto na ficha do lead.

2. **Responsável manual ou automático**
   - No campo Responsável, oferecer:
     - **Distribuir automaticamente**, usando a fila do setor e o rodízio já configurado;
     - **Sem responsável**;
     - escolha manual de um atendente do setor.
   - Empresas com distribuição 100% manual continuam podendo escolher atendente ou deixar sem responsável.

3. **Preservar todos os efeitos atuais**
   - Ao escolher distribuição automática, aplicar exatamente a fila/rodízio atual do setor.
   - Ao escolher um atendente manualmente, atribuir diretamente a ele.
   - Pausar a IA sempre que o atendimento passar para uma pessoa, mantendo o comportamento seguro da transferência atual.
   - Atualizar setor, funil, etapa e responsável em uma única confirmação.
   - Registrar a ação no histórico com o destino e o responsável definido.

4. **Permissões**
   - Aplicar ao botão unificado a permissão já existente de transferir atendimento, evitando que usuários sem autorização façam encaminhamentos.

## Validação
- Testar encaminhamento manual para outro atendente.
- Testar encaminhamento automático pela fila.
- Testar empresa com distribuição manual, como a SEVCON.
- Confirmar mudança de setor, funil e etapa, pausa da IA e registro no histórico.
- Confirmar que somente o botão Encaminhar aparece nas duas telas.
