export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      addon_product: {
        Row: {
          ativo: boolean
          checkout_url: string | null
          concede_conexoes: number
          concede_usuarios: number
          created_at: string
          descricao: string | null
          external_product_id: string | null
          id: string
          intervalo: string
          moeda: string
          nome: string
          ordem: number
          preco_cents: number
          provider: string | null
          slug: string
          tipo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          checkout_url?: string | null
          concede_conexoes?: number
          concede_usuarios?: number
          created_at?: string
          descricao?: string | null
          external_product_id?: string | null
          id?: string
          intervalo?: string
          moeda?: string
          nome: string
          ordem?: number
          preco_cents?: number
          provider?: string | null
          slug: string
          tipo: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          checkout_url?: string | null
          concede_conexoes?: number
          concede_usuarios?: number
          created_at?: string
          descricao?: string | null
          external_product_id?: string | null
          id?: string
          intervalo?: string
          moeda?: string
          nome?: string
          ordem?: number
          preco_cents?: number
          provider?: string | null
          slug?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      admin_automation: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string | null
          id: string
          nome: string
          offset_dias: number
          ordem: number
          template: string
          trigger_key: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          offset_dias?: number
          ordem?: number
          template?: string
          trigger_key: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          offset_dias?: number
          ordem?: number
          template?: string
          trigger_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      admin_automation_log: {
        Row: {
          enviado_em: string
          erro: string | null
          id: string
          mensagem: string | null
          numero: string | null
          status: string
          target_company_id: string | null
          trigger_key: string
        }
        Insert: {
          enviado_em?: string
          erro?: string | null
          id?: string
          mensagem?: string | null
          numero?: string | null
          status?: string
          target_company_id?: string | null
          trigger_key: string
        }
        Update: {
          enviado_em?: string
          erro?: string | null
          id?: string
          mensagem?: string | null
          numero?: string | null
          status?: string
          target_company_id?: string | null
          trigger_key?: string
        }
        Relationships: []
      }
      admin_broadcast: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          link: string | null
          mensagem: string
          target_type: string
          target_value: string | null
          titulo: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          link?: string | null
          mensagem: string
          target_type?: string
          target_value?: string | null
          titulo: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          link?: string | null
          mensagem?: string
          target_type?: string
          target_value?: string | null
          titulo?: string
        }
        Relationships: []
      }
      admin_broadcast_read: {
        Row: {
          broadcast_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          broadcast_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          broadcast_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_broadcast_read_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "admin_broadcast"
            referencedColumns: ["id"]
          },
        ]
      }
      agenda_bloqueio: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          fim: string
          id: string
          inicio: string
          motivo: string | null
          recorrencia_id: string | null
          tipo: string
          user_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          fim: string
          id?: string
          inicio: string
          motivo?: string | null
          recorrencia_id?: string | null
          tipo?: string
          user_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          fim?: string
          id?: string
          inicio?: string
          motivo?: string | null
          recorrencia_id?: string | null
          tipo?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agenda_bloqueio_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agenda_bloqueio_recorrencia_id_fkey"
            columns: ["recorrencia_id"]
            isOneToOne: false
            referencedRelation: "agenda_recorrencia"
            referencedColumns: ["id"]
          },
        ]
      }
      agenda_disponibilidade: {
        Row: {
          antecedencia_max_dias: number
          antecedencia_min_min: number
          ativo: boolean
          company_id: string
          created_at: string
          duracao_padrao_min: number
          end_time: string
          folga_min: number
          id: string
          interval_end: string | null
          interval_start: string | null
          start_time: string
          timezone: string
          updated_at: string
          user_id: string | null
          weekday: number
        }
        Insert: {
          antecedencia_max_dias?: number
          antecedencia_min_min?: number
          ativo?: boolean
          company_id: string
          created_at?: string
          duracao_padrao_min?: number
          end_time?: string
          folga_min?: number
          id?: string
          interval_end?: string | null
          interval_start?: string | null
          start_time?: string
          timezone?: string
          updated_at?: string
          user_id?: string | null
          weekday: number
        }
        Update: {
          antecedencia_max_dias?: number
          antecedencia_min_min?: number
          ativo?: boolean
          company_id?: string
          created_at?: string
          duracao_padrao_min?: number
          end_time?: string
          folga_min?: number
          id?: string
          interval_end?: string | null
          interval_start?: string | null
          start_time?: string
          timezone?: string
          updated_at?: string
          user_id?: string | null
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "agenda_disponibilidade_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      agenda_historico: {
        Row: {
          acao: string
          company_id: string
          created_at: string
          dados_anteriores: Json | null
          dados_novos: Json | null
          entity_id: string
          entity_type: string
          id: string
          user_id: string | null
        }
        Insert: {
          acao: string
          company_id: string
          created_at?: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          entity_id: string
          entity_type: string
          id?: string
          user_id?: string | null
        }
        Update: {
          acao?: string
          company_id?: string
          created_at?: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          entity_id?: string
          entity_type?: string
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agenda_historico_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      agenda_local: {
        Row: {
          company_id: string
          created_at: string
          endereco: string
          id: string
          nome: string
          padrao: boolean
        }
        Insert: {
          company_id: string
          created_at?: string
          endereco: string
          id?: string
          nome: string
          padrao?: boolean
        }
        Update: {
          company_id?: string
          created_at?: string
          endereco?: string
          id?: string
          nome?: string
          padrao?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "agenda_local_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      agenda_participante: {
        Row: {
          appointment_id: string
          card_id: string | null
          company_id: string
          confirmacao: string
          created_at: string
          id: string
          nome: string | null
          tipo: string
          user_id: string | null
        }
        Insert: {
          appointment_id: string
          card_id?: string | null
          company_id: string
          confirmacao?: string
          created_at?: string
          id?: string
          nome?: string | null
          tipo?: string
          user_id?: string | null
        }
        Update: {
          appointment_id?: string
          card_id?: string | null
          company_id?: string
          confirmacao?: string
          created_at?: string
          id?: string
          nome?: string | null
          tipo?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agenda_participante_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "mensagem_agendada"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agenda_participante_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      agenda_recorrencia: {
        Row: {
          ate_data: string | null
          company_id: string
          created_at: string
          dias_semana: number[] | null
          frequencia: string
          id: string
          intervalo: number
          ocorrencias: number | null
        }
        Insert: {
          ate_data?: string | null
          company_id: string
          created_at?: string
          dias_semana?: number[] | null
          frequencia?: string
          id?: string
          intervalo?: number
          ocorrencias?: number | null
        }
        Update: {
          ate_data?: string | null
          company_id?: string
          created_at?: string
          dias_semana?: number[] | null
          frequencia?: string
          id?: string
          intervalo?: number
          ocorrencias?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "agenda_recorrencia_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      agenda_tipo: {
        Row: {
          ativo: boolean
          company_id: string
          cor: string
          created_at: string
          duracao_padrao_min: number
          icone: string | null
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          company_id: string
          cor?: string
          created_at?: string
          duracao_padrao_min?: number
          icone?: string | null
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          company_id?: string
          cor?: string
          created_at?: string
          duracao_padrao_min?: number
          icone?: string | null
          id?: string
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "agenda_tipo_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      agendamento: {
        Row: {
          card_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          fim: string
          google_event_id: string | null
          id: string
          inicio: string
          status: string
          titulo: string
        }
        Insert: {
          card_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          fim: string
          google_event_id?: string | null
          id?: string
          inicio: string
          status?: string
          titulo: string
        }
        Update: {
          card_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          fim?: string
          google_event_id?: string | null
          id?: string
          inicio?: string
          status?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "agendamento_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "crm_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamento_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_config: {
        Row: {
          agendamento_ativo: boolean
          ai_model: string
          ai_provider: string
          antecedencia_min: string
          apresentacao: string
          assinar_mensagens: boolean | null
          avatar_prompt: string | null
          avatar_traits: Json | null
          avatar_url: string | null
          chamar_por_nome: boolean | null
          como_vender: string
          company_id: string
          cupom: string
          descricao_negocio: string
          diferenciais: string
          duracao_padrao: string
          emoji_intensidade: string | null
          estilo_comunicacao: string
          evitar_palavras: string | null
          exemplos_few_shot: Json
          faq: string
          foco_atendimento: string | null
          formalidade: number
          formas_pagamento: string
          handoff_mode: string
          handoff_rr_index: number
          handoff_user_ids: string[]
          horarios_atendimento: Json
          horarios_disponiveis: string
          id: string
          idioma: string | null
          is_default: boolean
          knowledge_files: Json | null
          mensagem_fora_horario: string
          menu_setores_ativo: boolean
          menu_setores_opcoes: Json
          menu_setores_texto: string
          nao_pode_fazer: string
          nome: string
          nome_agente: string
          nome_empresa: string
          objecoes: string
          ofertas: string
          olist_catalogo: boolean
          olist_pedido_auto: boolean
          palavra_despausar: string
          palavra_pausar: string
          papel_objetivo: string
          pedir_avaliacao: boolean
          perguntar_uma_por_vez: boolean | null
          personalidade: string | null
          pode_brincar: boolean | null
          pode_fazer: string
          politicas: string
          posvenda_msg: string
          proatividade: number | null
          produtos_servicos: string
          publico_alvo: string
          reativar_cliente: boolean
          regiao_horario: string
          regras_rigidas: string | null
          responder_em_partes: boolean
          segmento: string
          segundos_buffer: number
          servicos_agendaveis: string
          sistema: boolean
          sobre_empresa: string
          tamanho_resposta: string
          telefone_transferencia: string
          ticket_medio: string
          tipo: string
          tom: number
          updated_at: string
          usar_emojis: boolean
          usar_girias: boolean | null
          user_id: string
          velocidade_resposta: string | null
        }
        Insert: {
          agendamento_ativo?: boolean
          ai_model?: string
          ai_provider?: string
          antecedencia_min?: string
          apresentacao?: string
          assinar_mensagens?: boolean | null
          avatar_prompt?: string | null
          avatar_traits?: Json | null
          avatar_url?: string | null
          chamar_por_nome?: boolean | null
          como_vender?: string
          company_id: string
          cupom?: string
          descricao_negocio?: string
          diferenciais?: string
          duracao_padrao?: string
          emoji_intensidade?: string | null
          estilo_comunicacao?: string
          evitar_palavras?: string | null
          exemplos_few_shot?: Json
          faq?: string
          foco_atendimento?: string | null
          formalidade?: number
          formas_pagamento?: string
          handoff_mode?: string
          handoff_rr_index?: number
          handoff_user_ids?: string[]
          horarios_atendimento?: Json
          horarios_disponiveis?: string
          id?: string
          idioma?: string | null
          is_default?: boolean
          knowledge_files?: Json | null
          mensagem_fora_horario?: string
          menu_setores_ativo?: boolean
          menu_setores_opcoes?: Json
          menu_setores_texto?: string
          nao_pode_fazer?: string
          nome?: string
          nome_agente?: string
          nome_empresa?: string
          objecoes?: string
          ofertas?: string
          olist_catalogo?: boolean
          olist_pedido_auto?: boolean
          palavra_despausar?: string
          palavra_pausar?: string
          papel_objetivo?: string
          pedir_avaliacao?: boolean
          perguntar_uma_por_vez?: boolean | null
          personalidade?: string | null
          pode_brincar?: boolean | null
          pode_fazer?: string
          politicas?: string
          posvenda_msg?: string
          proatividade?: number | null
          produtos_servicos?: string
          publico_alvo?: string
          reativar_cliente?: boolean
          regiao_horario?: string
          regras_rigidas?: string | null
          responder_em_partes?: boolean
          segmento?: string
          segundos_buffer?: number
          servicos_agendaveis?: string
          sistema?: boolean
          sobre_empresa?: string
          tamanho_resposta?: string
          telefone_transferencia?: string
          ticket_medio?: string
          tipo?: string
          tom?: number
          updated_at?: string
          usar_emojis?: boolean
          usar_girias?: boolean | null
          user_id: string
          velocidade_resposta?: string | null
        }
        Update: {
          agendamento_ativo?: boolean
          ai_model?: string
          ai_provider?: string
          antecedencia_min?: string
          apresentacao?: string
          assinar_mensagens?: boolean | null
          avatar_prompt?: string | null
          avatar_traits?: Json | null
          avatar_url?: string | null
          chamar_por_nome?: boolean | null
          como_vender?: string
          company_id?: string
          cupom?: string
          descricao_negocio?: string
          diferenciais?: string
          duracao_padrao?: string
          emoji_intensidade?: string | null
          estilo_comunicacao?: string
          evitar_palavras?: string | null
          exemplos_few_shot?: Json
          faq?: string
          foco_atendimento?: string | null
          formalidade?: number
          formas_pagamento?: string
          handoff_mode?: string
          handoff_rr_index?: number
          handoff_user_ids?: string[]
          horarios_atendimento?: Json
          horarios_disponiveis?: string
          id?: string
          idioma?: string | null
          is_default?: boolean
          knowledge_files?: Json | null
          mensagem_fora_horario?: string
          menu_setores_ativo?: boolean
          menu_setores_opcoes?: Json
          menu_setores_texto?: string
          nao_pode_fazer?: string
          nome?: string
          nome_agente?: string
          nome_empresa?: string
          objecoes?: string
          ofertas?: string
          olist_catalogo?: boolean
          olist_pedido_auto?: boolean
          palavra_despausar?: string
          palavra_pausar?: string
          papel_objetivo?: string
          pedir_avaliacao?: boolean
          perguntar_uma_por_vez?: boolean | null
          personalidade?: string | null
          pode_brincar?: boolean | null
          pode_fazer?: string
          politicas?: string
          posvenda_msg?: string
          proatividade?: number | null
          produtos_servicos?: string
          publico_alvo?: string
          reativar_cliente?: boolean
          regiao_horario?: string
          regras_rigidas?: string | null
          responder_em_partes?: boolean
          segmento?: string
          segundos_buffer?: number
          servicos_agendaveis?: string
          sistema?: boolean
          sobre_empresa?: string
          tamanho_resposta?: string
          telefone_transferencia?: string
          ticket_medio?: string
          tipo?: string
          tom?: number
          updated_at?: string
          usar_emojis?: boolean
          usar_girias?: boolean | null
          user_id?: string
          velocidade_resposta?: string | null
        }
        Relationships: []
      }
      agent_feedback: {
        Row: {
          agent_id: string | null
          agent_tipo: string | null
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          mensagem_id: string | null
          mensagem_texto: string | null
          nota: string | null
          numero: string | null
          rating: string
        }
        Insert: {
          agent_id?: string | null
          agent_tipo?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          mensagem_id?: string | null
          mensagem_texto?: string | null
          nota?: string | null
          numero?: string | null
          rating: string
        }
        Update: {
          agent_id?: string | null
          agent_tipo?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          mensagem_id?: string | null
          mensagem_texto?: string | null
          nota?: string | null
          numero?: string | null
          rating?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_feedback_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_feedback_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_feedback_mensagem_id_fkey"
            columns: ["mensagem_id"]
            isOneToOne: false
            referencedRelation: "mensagens"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_message_processing: {
        Row: {
          company_id: string
          created_at: string
          error_message: string | null
          id: string
          inbound_message_id: string
          numero: string
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          inbound_message_id: string
          numero: string
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          inbound_message_id?: string
          numero?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_message_processing_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          button_link: string | null
          button_text: string | null
          content: string | null
          created_at: string
          display_time_seconds: number | null
          expires_at: string | null
          id: string
          image_url: string | null
          is_active: boolean
          show_frequency: string | null
          size: string | null
          title: string
          updated_at: string
        }
        Insert: {
          button_link?: string | null
          button_text?: string | null
          content?: string | null
          created_at?: string
          display_time_seconds?: number | null
          expires_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          show_frequency?: string | null
          size?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          button_link?: string | null
          button_text?: string | null
          content?: string | null
          created_at?: string
          display_time_seconds?: number | null
          expires_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          show_frequency?: string | null
          size?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      api_token: {
        Row: {
          company_id: string
          created_at: string
          criado_por: string | null
          id: string
          label: string
          revogado: boolean
          token: string
          ultimo_uso_em: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          criado_por?: string | null
          id?: string
          label: string
          revogado?: boolean
          token?: string
          ultimo_uso_em?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          criado_por?: string | null
          id?: string
          label?: string
          revogado?: boolean
          token?: string
          ultimo_uso_em?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_token_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      app_config: {
        Row: {
          emissor: Json
          gateway_padrao: string
          gateway_portal_url: string | null
          id: boolean
          provider_capacity: Json
          super_admin_emails: string[]
          updated_at: string
        }
        Insert: {
          emissor?: Json
          gateway_padrao?: string
          gateway_portal_url?: string | null
          id?: boolean
          provider_capacity?: Json
          super_admin_emails?: string[]
          updated_at?: string
        }
        Update: {
          emissor?: Json
          gateway_padrao?: string
          gateway_portal_url?: string | null
          id?: boolean
          provider_capacity?: Json
          super_admin_emails?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      app_user_connections: {
        Row: {
          connection_key_ciphertext: string
          connector_id: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          connection_key_ciphertext: string
          connector_id: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          connection_key_ciphertext?: string
          connector_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      atendimento_live_analise: {
        Row: {
          analisado_em: string
          andamento: string
          company_id: string
          contato_nome: string | null
          id: string
          numero: string
          situacao: string
          solicitacao: string
          ultima_em_analisada: string | null
        }
        Insert: {
          analisado_em?: string
          andamento?: string
          company_id: string
          contato_nome?: string | null
          id?: string
          numero: string
          situacao?: string
          solicitacao?: string
          ultima_em_analisada?: string | null
        }
        Update: {
          analisado_em?: string
          andamento?: string
          company_id?: string
          contato_nome?: string | null
          id?: string
          numero?: string
          situacao?: string
          solicitacao?: string
          ultima_em_analisada?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "atendimento_live_analise_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      atendimento_relatorio: {
        Row: {
          ai_sugerido: boolean
          atendente_id: string | null
          card_id: string | null
          company_id: string
          contato_nome: string | null
          created_at: string
          criado_por: string
          finalizado_em: string
          id: string
          iniciado_em: string | null
          numero: string
          pendente_com: string | null
          resolucao: string
          resolvido_por: string | null
          revisado_em: string | null
          revisado_por: string | null
          setor_id: string | null
          situacao: string
          solicitacao: string
          updated_at: string
        }
        Insert: {
          ai_sugerido?: boolean
          atendente_id?: string | null
          card_id?: string | null
          company_id: string
          contato_nome?: string | null
          created_at?: string
          criado_por: string
          finalizado_em?: string
          id?: string
          iniciado_em?: string | null
          numero: string
          pendente_com?: string | null
          resolucao?: string
          resolvido_por?: string | null
          revisado_em?: string | null
          revisado_por?: string | null
          setor_id?: string | null
          situacao?: string
          solicitacao?: string
          updated_at?: string
        }
        Update: {
          ai_sugerido?: boolean
          atendente_id?: string | null
          card_id?: string | null
          company_id?: string
          contato_nome?: string | null
          created_at?: string
          criado_por?: string
          finalizado_em?: string
          id?: string
          iniciado_em?: string | null
          numero?: string
          pendente_com?: string | null
          resolucao?: string
          resolvido_por?: string | null
          revisado_em?: string | null
          revisado_por?: string | null
          setor_id?: string | null
          situacao?: string
          solicitacao?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "atendimento_relatorio_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "crm_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimento_relatorio_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimento_relatorio_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "department"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          acao: string
          actor_email: string | null
          company_id: string
          created_at: string
          detalhes: Json | null
          id: string
          ip: string | null
          recurso: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          acao: string
          actor_email?: string | null
          company_id: string
          created_at?: string
          detalhes?: Json | null
          id?: string
          ip?: string | null
          recurso?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          acao?: string
          actor_email?: string | null
          company_id?: string
          created_at?: string
          detalhes?: Json | null
          id?: string
          ip?: string | null
          recurso?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      auth_log: {
        Row: {
          company_id: string
          created_at: string
          event: string
          id: string
          ip: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          event?: string
          id?: string
          ip?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          event?: string
          id?: string
          ip?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "auth_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_charge: {
        Row: {
          canceled_at: string | null
          ciclo_ref: string | null
          company_id: string
          created_at: string
          descricao: string | null
          erro: string | null
          external_id: string | null
          id: string
          metadata: Json
          metodo: string
          moeda: string
          origem: string
          paid_at: string | null
          payment_url: string | null
          pix_copia_cola: string | null
          pix_qrcode: string | null
          provider: string
          status: string
          total_cents: number
          updated_at: string
          vencimento: string | null
        }
        Insert: {
          canceled_at?: string | null
          ciclo_ref?: string | null
          company_id: string
          created_at?: string
          descricao?: string | null
          erro?: string | null
          external_id?: string | null
          id?: string
          metadata?: Json
          metodo?: string
          moeda?: string
          origem?: string
          paid_at?: string | null
          payment_url?: string | null
          pix_copia_cola?: string | null
          pix_qrcode?: string | null
          provider?: string
          status?: string
          total_cents?: number
          updated_at?: string
          vencimento?: string | null
        }
        Update: {
          canceled_at?: string | null
          ciclo_ref?: string | null
          company_id?: string
          created_at?: string
          descricao?: string | null
          erro?: string | null
          external_id?: string | null
          id?: string
          metadata?: Json
          metodo?: string
          moeda?: string
          origem?: string
          paid_at?: string | null
          payment_url?: string | null
          pix_copia_cola?: string | null
          pix_qrcode?: string | null
          provider?: string
          status?: string
          total_cents?: number
          updated_at?: string
          vencimento?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_charge_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_charge_item: {
        Row: {
          charge_id: string
          created_at: string
          id: string
          nome: string
          preco_unit_cents: number
          quantidade: number
          ref_id: string | null
          ref_slug: string | null
          tipo: string
          total_cents: number
        }
        Insert: {
          charge_id: string
          created_at?: string
          id?: string
          nome: string
          preco_unit_cents?: number
          quantidade?: number
          ref_id?: string | null
          ref_slug?: string | null
          tipo?: string
          total_cents?: number
        }
        Update: {
          charge_id?: string
          created_at?: string
          id?: string
          nome?: string
          preco_unit_cents?: number
          quantidade?: number
          ref_id?: string | null
          ref_slug?: string | null
          tipo?: string
          total_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "billing_charge_item_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "billing_charge"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_event_log: {
        Row: {
          buyer_email: string | null
          created_at: string
          error: string | null
          event_type: string | null
          external_id: string | null
          id: string
          matched_company_id: string | null
          payload: Json
          processed: boolean
          provider: string
        }
        Insert: {
          buyer_email?: string | null
          created_at?: string
          error?: string | null
          event_type?: string | null
          external_id?: string | null
          id?: string
          matched_company_id?: string | null
          payload?: Json
          processed?: boolean
          provider: string
        }
        Update: {
          buyer_email?: string | null
          created_at?: string
          error?: string | null
          event_type?: string | null
          external_id?: string | null
          id?: string
          matched_company_id?: string | null
          payload?: Json
          processed?: boolean
          provider?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_event_log_matched_company_id_fkey"
            columns: ["matched_company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign: {
        Row: {
          agendado_para: string | null
          aquecimento_ativo: boolean
          aquecimento_dia_inicio: string | null
          checar_numero: boolean
          company_id: string
          concluido_em: string | null
          created_at: string
          created_by: string | null
          custom_targets: Json
          descricao: string | null
          enviados_hoje: number
          enviados_hoje_data: string | null
          filtro_tags: string[] | null
          id: string
          iniciado_em: string | null
          intervalo_max_seg: number
          intervalo_min_seg: number
          janela_dias: number[]
          janela_hora_fim: string
          janela_hora_ini: string
          limite_diario: number
          media_url: string | null
          mensagem: string
          midia_nome: string | null
          midia_tipo: string | null
          midia_url_v2: string | null
          nome: string
          origem_destinatarios: string
          pausa_apos_envios: number
          pausa_duracao_min: number
          provider: string
          proximo_envio_em: string | null
          pular_ativos_dias: number
          simular_digitacao: boolean
          status: Database["public"]["Enums"]["campaign_status"]
          timezone: string
          total_destinatarios: number
          total_entregues: number
          total_enviados: number
          total_falhas: number
          total_lidas: number
          updated_at: string
          velocidade_msg_seg: number
          whatsapp_instance_id: string | null
        }
        Insert: {
          agendado_para?: string | null
          aquecimento_ativo?: boolean
          aquecimento_dia_inicio?: string | null
          checar_numero?: boolean
          company_id: string
          concluido_em?: string | null
          created_at?: string
          created_by?: string | null
          custom_targets?: Json
          descricao?: string | null
          enviados_hoje?: number
          enviados_hoje_data?: string | null
          filtro_tags?: string[] | null
          id?: string
          iniciado_em?: string | null
          intervalo_max_seg?: number
          intervalo_min_seg?: number
          janela_dias?: number[]
          janela_hora_fim?: string
          janela_hora_ini?: string
          limite_diario?: number
          media_url?: string | null
          mensagem: string
          midia_nome?: string | null
          midia_tipo?: string | null
          midia_url_v2?: string | null
          nome: string
          origem_destinatarios?: string
          pausa_apos_envios?: number
          pausa_duracao_min?: number
          provider?: string
          proximo_envio_em?: string | null
          pular_ativos_dias?: number
          simular_digitacao?: boolean
          status?: Database["public"]["Enums"]["campaign_status"]
          timezone?: string
          total_destinatarios?: number
          total_entregues?: number
          total_enviados?: number
          total_falhas?: number
          total_lidas?: number
          updated_at?: string
          velocidade_msg_seg?: number
          whatsapp_instance_id?: string | null
        }
        Update: {
          agendado_para?: string | null
          aquecimento_ativo?: boolean
          aquecimento_dia_inicio?: string | null
          checar_numero?: boolean
          company_id?: string
          concluido_em?: string | null
          created_at?: string
          created_by?: string | null
          custom_targets?: Json
          descricao?: string | null
          enviados_hoje?: number
          enviados_hoje_data?: string | null
          filtro_tags?: string[] | null
          id?: string
          iniciado_em?: string | null
          intervalo_max_seg?: number
          intervalo_min_seg?: number
          janela_dias?: number[]
          janela_hora_fim?: string
          janela_hora_ini?: string
          limite_diario?: number
          media_url?: string | null
          mensagem?: string
          midia_nome?: string | null
          midia_tipo?: string | null
          midia_url_v2?: string | null
          nome?: string
          origem_destinatarios?: string
          pausa_apos_envios?: number
          pausa_duracao_min?: number
          provider?: string
          proximo_envio_em?: string | null
          pular_ativos_dias?: number
          simular_digitacao?: boolean
          status?: Database["public"]["Enums"]["campaign_status"]
          timezone?: string
          total_destinatarios?: number
          total_entregues?: number
          total_enviados?: number
          total_falhas?: number
          total_lidas?: number
          updated_at?: string
          velocidade_msg_seg?: number
          whatsapp_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_whatsapp_instance_id_fkey"
            columns: ["whatsapp_instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_blocklist: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          motivo: string | null
          numero: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          motivo?: string | null
          numero: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          motivo?: string | null
          numero?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_blocklist_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_optout: {
        Row: {
          company_id: string
          created_at: string
          id: string
          motivo: string | null
          numero: string
          origem: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          motivo?: string | null
          numero: string
          origem?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          motivo?: string | null
          numero?: string
          origem?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_optout_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_target: {
        Row: {
          campaign_id: string
          company_id: string
          contato_nome: string | null
          contato_numero: string
          created_at: string
          enviado_em: string | null
          erro: string | null
          id: string
          max_tentativas: number
          proxima_em: string | null
          status: Database["public"]["Enums"]["campaign_target_status"]
          tentativas: number
        }
        Insert: {
          campaign_id: string
          company_id: string
          contato_nome?: string | null
          contato_numero: string
          created_at?: string
          enviado_em?: string | null
          erro?: string | null
          id?: string
          max_tentativas?: number
          proxima_em?: string | null
          status?: Database["public"]["Enums"]["campaign_target_status"]
          tentativas?: number
        }
        Update: {
          campaign_id?: string
          company_id?: string
          contato_nome?: string | null
          contato_numero?: string
          created_at?: string
          enviado_em?: string | null
          erro?: string | null
          id?: string
          max_tentativas?: number
          proxima_em?: string | null
          status?: Database["public"]["Enums"]["campaign_target_status"]
          tentativas?: number
        }
        Relationships: [
          {
            foreignKeyName: "campaign_target_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_target_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      company: {
        Row: {
          admin_bloqueado: boolean
          admin_bloqueado_motivo: string | null
          atendimento_operacional: boolean
          bairro: string | null
          cep: string | null
          cidade: string | null
          cnpj_cpf: string | null
          complemento: string | null
          created_at: string
          created_by: string | null
          creditos_origem: string
          creditos_resetam_em: string | null
          creditos_saldo: number
          csat_ativo: boolean | null
          csat_auto_ganho: boolean
          csat_destino_pipeline_id: string | null
          csat_destino_stage_id: string | null
          csat_enviar_ao_finalizar: boolean
          csat_formato: string
          csat_move_para_posvenda: boolean | null
          csat_pedir_comentario: boolean
          csat_pergunta: string | null
          csat_texto_agradecimento: string | null
          csat_texto_comentario: string | null
          dashboard_individual: boolean
          distribuicao_manual: boolean
          email_corporativo: string | null
          estado: string | null
          financeiro_ativo: boolean
          financeiro_dias_vencimento_padrao: number
          funcoes_individuais: boolean
          grupos_ativos: boolean
          id: string
          inscricao_estadual: string | null
          is_internal: boolean
          logo_url: string | null
          nome: string
          nome_fantasia: string | null
          numero: string | null
          onboarding_completed: boolean
          onboarding_step: number
          pais: string | null
          porte: string | null
          primary_color: string
          razao_social: string | null
          rua: string | null
          segmento: string | null
          selected_plan_slug: string | null
          site: string | null
          slug: string
          status_cobranca: string
          telefone: string | null
          tipo_pessoa: string
          trial_ate: string
          updated_at: string
          wa_provider: string
        }
        Insert: {
          admin_bloqueado?: boolean
          admin_bloqueado_motivo?: string | null
          atendimento_operacional?: boolean
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          cnpj_cpf?: string | null
          complemento?: string | null
          created_at?: string
          created_by?: string | null
          creditos_origem?: string
          creditos_resetam_em?: string | null
          creditos_saldo?: number
          csat_ativo?: boolean | null
          csat_auto_ganho?: boolean
          csat_destino_pipeline_id?: string | null
          csat_destino_stage_id?: string | null
          csat_enviar_ao_finalizar?: boolean
          csat_formato?: string
          csat_move_para_posvenda?: boolean | null
          csat_pedir_comentario?: boolean
          csat_pergunta?: string | null
          csat_texto_agradecimento?: string | null
          csat_texto_comentario?: string | null
          dashboard_individual?: boolean
          distribuicao_manual?: boolean
          email_corporativo?: string | null
          estado?: string | null
          financeiro_ativo?: boolean
          financeiro_dias_vencimento_padrao?: number
          funcoes_individuais?: boolean
          grupos_ativos?: boolean
          id?: string
          inscricao_estadual?: string | null
          is_internal?: boolean
          logo_url?: string | null
          nome: string
          nome_fantasia?: string | null
          numero?: string | null
          onboarding_completed?: boolean
          onboarding_step?: number
          pais?: string | null
          porte?: string | null
          primary_color?: string
          razao_social?: string | null
          rua?: string | null
          segmento?: string | null
          selected_plan_slug?: string | null
          site?: string | null
          slug: string
          status_cobranca?: string
          telefone?: string | null
          tipo_pessoa?: string
          trial_ate?: string
          updated_at?: string
          wa_provider?: string
        }
        Update: {
          admin_bloqueado?: boolean
          admin_bloqueado_motivo?: string | null
          atendimento_operacional?: boolean
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          cnpj_cpf?: string | null
          complemento?: string | null
          created_at?: string
          created_by?: string | null
          creditos_origem?: string
          creditos_resetam_em?: string | null
          creditos_saldo?: number
          csat_ativo?: boolean | null
          csat_auto_ganho?: boolean
          csat_destino_pipeline_id?: string | null
          csat_destino_stage_id?: string | null
          csat_enviar_ao_finalizar?: boolean
          csat_formato?: string
          csat_move_para_posvenda?: boolean | null
          csat_pedir_comentario?: boolean
          csat_pergunta?: string | null
          csat_texto_agradecimento?: string | null
          csat_texto_comentario?: string | null
          dashboard_individual?: boolean
          distribuicao_manual?: boolean
          email_corporativo?: string | null
          estado?: string | null
          financeiro_ativo?: boolean
          financeiro_dias_vencimento_padrao?: number
          funcoes_individuais?: boolean
          grupos_ativos?: boolean
          id?: string
          inscricao_estadual?: string | null
          is_internal?: boolean
          logo_url?: string | null
          nome?: string
          nome_fantasia?: string | null
          numero?: string | null
          onboarding_completed?: boolean
          onboarding_step?: number
          pais?: string | null
          porte?: string | null
          primary_color?: string
          razao_social?: string | null
          rua?: string | null
          segmento?: string | null
          selected_plan_slug?: string | null
          site?: string | null
          slug?: string
          status_cobranca?: string
          telefone?: string | null
          tipo_pessoa?: string
          trial_ate?: string
          updated_at?: string
          wa_provider?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_csat_destino_pipeline_id_fkey"
            columns: ["csat_destino_pipeline_id"]
            isOneToOne: false
            referencedRelation: "crm_pipeline"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_csat_destino_stage_id_fkey"
            columns: ["csat_destino_stage_id"]
            isOneToOne: false
            referencedRelation: "crm_stage"
            referencedColumns: ["id"]
          },
        ]
      }
      company_addon: {
        Row: {
          addon_product_id: string
          buyer_email: string | null
          canceled_at: string | null
          company_id: string
          created_at: string
          current_period_end: string | null
          external_subscription_id: string | null
          id: string
          provider: string | null
          quantidade: number
          status: string
          updated_at: string
        }
        Insert: {
          addon_product_id: string
          buyer_email?: string | null
          canceled_at?: string | null
          company_id: string
          created_at?: string
          current_period_end?: string | null
          external_subscription_id?: string | null
          id?: string
          provider?: string | null
          quantidade?: number
          status?: string
          updated_at?: string
        }
        Update: {
          addon_product_id?: string
          buyer_email?: string | null
          canceled_at?: string | null
          company_id?: string
          created_at?: string
          current_period_end?: string | null
          external_subscription_id?: string | null
          id?: string
          provider?: string | null
          quantidade?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_addon_addon_product_id_fkey"
            columns: ["addon_product_id"]
            isOneToOne: false
            referencedRelation: "addon_product"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_addon_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      company_billing: {
        Row: {
          bairro: string | null
          cep: string | null
          cidade: string | null
          cnpj_cpf: string | null
          company_id: string
          complemento: string | null
          created_at: string
          email_cobranca: string | null
          estado: string | null
          id: string
          inscricao_estadual: string | null
          nome_responsavel: string | null
          numero: string | null
          pais: string | null
          razao_social: string | null
          rua: string | null
          telefone: string | null
          tipo_pessoa: string
          updated_at: string
        }
        Insert: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          cnpj_cpf?: string | null
          company_id: string
          complemento?: string | null
          created_at?: string
          email_cobranca?: string | null
          estado?: string | null
          id?: string
          inscricao_estadual?: string | null
          nome_responsavel?: string | null
          numero?: string | null
          pais?: string | null
          razao_social?: string | null
          rua?: string | null
          telefone?: string | null
          tipo_pessoa?: string
          updated_at?: string
        }
        Update: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          cnpj_cpf?: string | null
          company_id?: string
          complemento?: string | null
          created_at?: string
          email_cobranca?: string | null
          estado?: string | null
          id?: string
          inscricao_estadual?: string | null
          nome_responsavel?: string | null
          numero?: string | null
          pais?: string | null
          razao_social?: string | null
          rua?: string | null
          telefone?: string | null
          tipo_pessoa?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_billing_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      company_plugin: {
        Row: {
          assinatura_status: string
          ativo: boolean
          canceled_at: string | null
          company_id: string
          config: Json
          created_at: string
          current_period_end: string | null
          id: string
          instalado: boolean
          plugin_id: string
          preco_cents: number
          status: string
          trial_ends_at: string | null
          ultimo_erro: string | null
          updated_at: string
        }
        Insert: {
          assinatura_status?: string
          ativo?: boolean
          canceled_at?: string | null
          company_id: string
          config?: Json
          created_at?: string
          current_period_end?: string | null
          id?: string
          instalado?: boolean
          plugin_id: string
          preco_cents?: number
          status?: string
          trial_ends_at?: string | null
          ultimo_erro?: string | null
          updated_at?: string
        }
        Update: {
          assinatura_status?: string
          ativo?: boolean
          canceled_at?: string | null
          company_id?: string
          config?: Json
          created_at?: string
          current_period_end?: string | null
          id?: string
          instalado?: boolean
          plugin_id?: string
          preco_cents?: number
          status?: string
          trial_ends_at?: string | null
          ultimo_erro?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_plugin_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_plugin_plugin_id_fkey"
            columns: ["plugin_id"]
            isOneToOne: false
            referencedRelation: "plugin"
            referencedColumns: ["id"]
          },
        ]
      }
      company_role: {
        Row: {
          ativo: boolean
          base_role: Database["public"]["Enums"]["tenant_role"]
          company_id: string
          cor: string
          created_at: string
          descricao: string | null
          id: string
          nome: string
          permissions: Json
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          base_role?: Database["public"]["Enums"]["tenant_role"]
          company_id: string
          cor?: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          permissions?: Json
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          base_role?: Database["public"]["Enums"]["tenant_role"]
          company_id?: string
          cor?: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          permissions?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_role_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      company_tag: {
        Row: {
          company_id: string
          cor: string | null
          created_at: string
          id: string
          nome: string
        }
        Insert: {
          company_id: string
          cor?: string | null
          created_at?: string
          id?: string
          nome: string
        }
        Update: {
          company_id?: string
          cor?: string | null
          created_at?: string
          id?: string
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_tag_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      company_user: {
        Row: {
          ativo: boolean
          company_id: string
          convite_token: string | null
          created_at: string
          custom_role_id: string | null
          distribution_order: number | null
          forcar_troca_senha: boolean
          horarios: Json | null
          id: string
          is_in_distribution: boolean | null
          last_assigned_at: string | null
          last_login_at: string | null
          last_login_ip: string | null
          max_chats: number
          role: Database["public"]["Enums"]["tenant_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          company_id: string
          convite_token?: string | null
          created_at?: string
          custom_role_id?: string | null
          distribution_order?: number | null
          forcar_troca_senha?: boolean
          horarios?: Json | null
          id?: string
          is_in_distribution?: boolean | null
          last_assigned_at?: string | null
          last_login_at?: string | null
          last_login_ip?: string | null
          max_chats?: number
          role?: Database["public"]["Enums"]["tenant_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          company_id?: string
          convite_token?: string | null
          created_at?: string
          custom_role_id?: string | null
          distribution_order?: number | null
          forcar_troca_senha?: boolean
          horarios?: Json | null
          id?: string
          is_in_distribution?: boolean | null
          last_assigned_at?: string | null
          last_login_at?: string | null
          last_login_ip?: string | null
          max_chats?: number
          role?: Database["public"]["Enums"]["tenant_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_user_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_user_custom_role_fk"
            columns: ["custom_role_id"]
            isOneToOne: false
            referencedRelation: "company_role"
            referencedColumns: ["id"]
          },
        ]
      }
      company_user_instance: {
        Row: {
          company_id: string
          created_at: string
          instance_id: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          instance_id: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          instance_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_user_instance_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_user_instance_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      company_user_pipeline: {
        Row: {
          company_id: string
          created_at: string
          id: string
          pipeline_id: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          pipeline_id: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          pipeline_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_user_pipeline_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_user_pipeline_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "crm_pipeline"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_pause: {
        Row: {
          company_id: string
          numero: string
          pausado: boolean
          pausado_em: string | null
          pausado_por: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          numero: string
          pausado?: boolean
          pausado_em?: string | null
          pausado_por?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          numero?: string
          pausado?: boolean
          pausado_em?: string | null
          pausado_por?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      credit_ledger: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          delta: number
          id: string
          motivo: string
          ref: string | null
          saldo_apos: number
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          delta: number
          id?: string
          motivo: string
          ref?: string | null
          saldo_apos: number
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          delta?: number
          id?: string
          motivo?: string
          ref?: string | null
          saldo_apos?: number
        }
        Relationships: [
          {
            foreignKeyName: "credit_ledger_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_card_stage_history: {
        Row: {
          card_id: string
          company_id: string
          created_at: string
          id: string
          moved_by: string | null
          pipeline_id: string | null
          stage_from: string | null
          stage_from_nome: string | null
          stage_to: string | null
          stage_to_nome: string | null
          tempo_na_etapa_seg: number | null
        }
        Insert: {
          card_id: string
          company_id: string
          created_at?: string
          id?: string
          moved_by?: string | null
          pipeline_id?: string | null
          stage_from?: string | null
          stage_from_nome?: string | null
          stage_to?: string | null
          stage_to_nome?: string | null
          tempo_na_etapa_seg?: number | null
        }
        Update: {
          card_id?: string
          company_id?: string
          created_at?: string
          id?: string
          moved_by?: string | null
          pipeline_id?: string | null
          stage_from?: string | null
          stage_from_nome?: string | null
          stage_to?: string | null
          stage_to_nome?: string | null
          tempo_na_etapa_seg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_card_stage_history_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "crm_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_cards: {
        Row: {
          campos_extras: Json
          canal_chat: string | null
          canal_custom: string | null
          canal_entrada: string | null
          company_id: string
          cpf_cnpj: string | null
          ctwa_clid: string | null
          department_id: string | null
          drive_folder_id: string | null
          email: string | null
          empresa: string | null
          endereco: string | null
          entrou_stage_em: string
          fbclid: string | null
          first_page: string | null
          foto_atualizada_em: string | null
          foto_url: string | null
          gclid: string | null
          id: string
          item_id: string | null
          item_nome: string | null
          item_tipo: string | null
          meta_form_id: string | null
          meta_lead_id: string | null
          nome: string | null
          numero: string
          observacao: string | null
          origem: string | null
          owner_id: string | null
          perdido_em: string | null
          pipeline_id: string | null
          primeiro_contato_em: string | null
          proxima_acao: string | null
          reativado_em: string | null
          referrer: string | null
          regua_status: string
          regua_ultimo_disparo_em: string | null
          retorno_stage_id: string | null
          stage_entrou_em: string | null
          stage_id: string | null
          status: string
          tags: string[]
          tipo_contato: string | null
          transfer_de_user_id: string | null
          transfer_em: string | null
          transfer_para_user_id: string | null
          transfer_status: string | null
          ultima_direcao: string
          ultima_em: string
          ultima_mensagem: string | null
          updated_at: string
          user_id: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          valor: number
        }
        Insert: {
          campos_extras?: Json
          canal_chat?: string | null
          canal_custom?: string | null
          canal_entrada?: string | null
          company_id: string
          cpf_cnpj?: string | null
          ctwa_clid?: string | null
          department_id?: string | null
          drive_folder_id?: string | null
          email?: string | null
          empresa?: string | null
          endereco?: string | null
          entrou_stage_em?: string
          fbclid?: string | null
          first_page?: string | null
          foto_atualizada_em?: string | null
          foto_url?: string | null
          gclid?: string | null
          id?: string
          item_id?: string | null
          item_nome?: string | null
          item_tipo?: string | null
          meta_form_id?: string | null
          meta_lead_id?: string | null
          nome?: string | null
          numero: string
          observacao?: string | null
          origem?: string | null
          owner_id?: string | null
          perdido_em?: string | null
          pipeline_id?: string | null
          primeiro_contato_em?: string | null
          proxima_acao?: string | null
          reativado_em?: string | null
          referrer?: string | null
          regua_status?: string
          regua_ultimo_disparo_em?: string | null
          retorno_stage_id?: string | null
          stage_entrou_em?: string | null
          stage_id?: string | null
          status?: string
          tags?: string[]
          tipo_contato?: string | null
          transfer_de_user_id?: string | null
          transfer_em?: string | null
          transfer_para_user_id?: string | null
          transfer_status?: string | null
          ultima_direcao?: string
          ultima_em?: string
          ultima_mensagem?: string | null
          updated_at?: string
          user_id: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          valor?: number
        }
        Update: {
          campos_extras?: Json
          canal_chat?: string | null
          canal_custom?: string | null
          canal_entrada?: string | null
          company_id?: string
          cpf_cnpj?: string | null
          ctwa_clid?: string | null
          department_id?: string | null
          drive_folder_id?: string | null
          email?: string | null
          empresa?: string | null
          endereco?: string | null
          entrou_stage_em?: string
          fbclid?: string | null
          first_page?: string | null
          foto_atualizada_em?: string | null
          foto_url?: string | null
          gclid?: string | null
          id?: string
          item_id?: string | null
          item_nome?: string | null
          item_tipo?: string | null
          meta_form_id?: string | null
          meta_lead_id?: string | null
          nome?: string | null
          numero?: string
          observacao?: string | null
          origem?: string | null
          owner_id?: string | null
          perdido_em?: string | null
          pipeline_id?: string | null
          primeiro_contato_em?: string | null
          proxima_acao?: string | null
          reativado_em?: string | null
          referrer?: string | null
          regua_status?: string
          regua_ultimo_disparo_em?: string | null
          retorno_stage_id?: string | null
          stage_entrou_em?: string | null
          stage_id?: string | null
          status?: string
          tags?: string[]
          tipo_contato?: string | null
          transfer_de_user_id?: string | null
          transfer_em?: string | null
          transfer_para_user_id?: string | null
          transfer_status?: string | null
          ultima_direcao?: string
          ultima_em?: string
          ultima_mensagem?: string | null
          updated_at?: string
          user_id?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "crm_cards_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "department"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_cards_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "crm_pipeline"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_cards_retorno_stage_id_fkey"
            columns: ["retorno_stage_id"]
            isOneToOne: false
            referencedRelation: "crm_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_cards_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "crm_stage"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_distribution_queues: {
        Row: {
          ativo: boolean
          company_id: string
          created_at: string
          department_id: string | null
          id: string
          nome: string
          strategy: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          company_id: string
          created_at?: string
          department_id?: string | null
          id?: string
          nome: string
          strategy?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          company_id?: string
          created_at?: string
          department_id?: string | null
          id?: string
          nome?: string
          strategy?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_distribution_queues_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_distribution_queues_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "department"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_goals: {
        Row: {
          company_id: string
          created_at: string
          id: string
          updated_at: string
          user_id: string | null
          value_cents: number
          year_month: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string | null
          value_cents?: number
          year_month: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string | null
          value_cents?: number
          year_month?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_goals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_pipeline: {
        Row: {
          agent_id: string | null
          ativo: boolean
          company_id: string
          created_at: string
          distribution_queue_id: string | null
          entrada: boolean
          id: string
          nome: string
          oculto: boolean
          ordem: number
          sistema: boolean
          tipo: string
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          ativo?: boolean
          company_id: string
          created_at?: string
          distribution_queue_id?: string | null
          entrada?: boolean
          id?: string
          nome: string
          oculto?: boolean
          ordem?: number
          sistema?: boolean
          tipo?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          ativo?: boolean
          company_id?: string
          created_at?: string
          distribution_queue_id?: string | null
          entrada?: boolean
          id?: string
          nome?: string
          oculto?: boolean
          ordem?: number
          sistema?: boolean
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_pipeline_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_pipeline_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_pipeline_distribution_queue_id_fkey"
            columns: ["distribution_queue_id"]
            isOneToOne: false
            referencedRelation: "crm_distribution_queues"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_queue_members: {
        Row: {
          ativo: boolean
          company_id: string
          id: string
          last_assigned_at: string | null
          leads_count: number
          ordem: number
          queue_id: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          company_id: string
          id?: string
          last_assigned_at?: string | null
          leads_count?: number
          ordem?: number
          queue_id: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          company_id?: string
          id?: string
          last_assigned_at?: string | null
          leads_count?: number
          ordem?: number
          queue_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_queue_members_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "crm_distribution_queues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_queue_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "crm_queue_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "team_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      crm_stage: {
        Row: {
          agent_id: string | null
          arquivar_perdidos_dias: number | null
          company_id: string
          cor: string
          created_at: string
          delay_unidade: string
          delay_valor: number
          department_id: string | null
          distribution_queue_id: string | null
          distribution_user_id: string | null
          entrada_formulario: boolean
          hora_do_dia: string | null
          ia_handoff_stage_id: string | null
          id: string
          intent_handling_enabled: boolean | null
          mensagem_midia_mime: string | null
          mensagem_midia_nome: string | null
          mensagem_midia_tipo: string | null
          mensagem_midia_url: string | null
          mensagem_prompt: string | null
          mensagem_texto: string | null
          mensagem_tipo: string
          modo_atendimento: string
          mostrar_valor: boolean
          move_apos_qualificar_para: string | null
          move_se_negativo_para: string | null
          move_se_positivo_para: string | null
          move_se_respondeu_para: string | null
          move_se_sem_resposta_dias: number | null
          move_se_sem_resposta_para: string | null
          nome: string
          ordem: number
          parar_se_humano: boolean
          parar_se_responder: boolean
          pipeline_id: string | null
          regua_ativa: boolean
          retorno_ativo: boolean
          retorno_janela_dias: number
          retorno_modo_atendimento: string
          retorno_pipeline_id: string | null
          retorno_responsavel_modo: string
          retorno_stage_id: string | null
          retorno_user_id: string | null
          sla_horas: number | null
          tipo: Database["public"]["Enums"]["stage_tipo"]
          trigger_pipeline_destino: string | null
        }
        Insert: {
          agent_id?: string | null
          arquivar_perdidos_dias?: number | null
          company_id: string
          cor?: string
          created_at?: string
          delay_unidade?: string
          delay_valor?: number
          department_id?: string | null
          distribution_queue_id?: string | null
          distribution_user_id?: string | null
          entrada_formulario?: boolean
          hora_do_dia?: string | null
          ia_handoff_stage_id?: string | null
          id?: string
          intent_handling_enabled?: boolean | null
          mensagem_midia_mime?: string | null
          mensagem_midia_nome?: string | null
          mensagem_midia_tipo?: string | null
          mensagem_midia_url?: string | null
          mensagem_prompt?: string | null
          mensagem_texto?: string | null
          mensagem_tipo?: string
          modo_atendimento?: string
          mostrar_valor?: boolean
          move_apos_qualificar_para?: string | null
          move_se_negativo_para?: string | null
          move_se_positivo_para?: string | null
          move_se_respondeu_para?: string | null
          move_se_sem_resposta_dias?: number | null
          move_se_sem_resposta_para?: string | null
          nome: string
          ordem?: number
          parar_se_humano?: boolean
          parar_se_responder?: boolean
          pipeline_id?: string | null
          regua_ativa?: boolean
          retorno_ativo?: boolean
          retorno_janela_dias?: number
          retorno_modo_atendimento?: string
          retorno_pipeline_id?: string | null
          retorno_responsavel_modo?: string
          retorno_stage_id?: string | null
          retorno_user_id?: string | null
          sla_horas?: number | null
          tipo?: Database["public"]["Enums"]["stage_tipo"]
          trigger_pipeline_destino?: string | null
        }
        Update: {
          agent_id?: string | null
          arquivar_perdidos_dias?: number | null
          company_id?: string
          cor?: string
          created_at?: string
          delay_unidade?: string
          delay_valor?: number
          department_id?: string | null
          distribution_queue_id?: string | null
          distribution_user_id?: string | null
          entrada_formulario?: boolean
          hora_do_dia?: string | null
          ia_handoff_stage_id?: string | null
          id?: string
          intent_handling_enabled?: boolean | null
          mensagem_midia_mime?: string | null
          mensagem_midia_nome?: string | null
          mensagem_midia_tipo?: string | null
          mensagem_midia_url?: string | null
          mensagem_prompt?: string | null
          mensagem_texto?: string | null
          mensagem_tipo?: string
          modo_atendimento?: string
          mostrar_valor?: boolean
          move_apos_qualificar_para?: string | null
          move_se_negativo_para?: string | null
          move_se_positivo_para?: string | null
          move_se_respondeu_para?: string | null
          move_se_sem_resposta_dias?: number | null
          move_se_sem_resposta_para?: string | null
          nome?: string
          ordem?: number
          parar_se_humano?: boolean
          parar_se_responder?: boolean
          pipeline_id?: string | null
          regua_ativa?: boolean
          retorno_ativo?: boolean
          retorno_janela_dias?: number
          retorno_modo_atendimento?: string
          retorno_pipeline_id?: string | null
          retorno_responsavel_modo?: string
          retorno_stage_id?: string | null
          retorno_user_id?: string | null
          sla_horas?: number | null
          tipo?: Database["public"]["Enums"]["stage_tipo"]
          trigger_pipeline_destino?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_stage_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_stage_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_stage_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "department"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_stage_distribution_queue_id_fkey"
            columns: ["distribution_queue_id"]
            isOneToOne: false
            referencedRelation: "crm_distribution_queues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_stage_ia_handoff_stage_id_fkey"
            columns: ["ia_handoff_stage_id"]
            isOneToOne: false
            referencedRelation: "crm_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_stage_move_apos_qualificar_para_fkey"
            columns: ["move_apos_qualificar_para"]
            isOneToOne: false
            referencedRelation: "crm_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_stage_move_se_negativo_para_fkey"
            columns: ["move_se_negativo_para"]
            isOneToOne: false
            referencedRelation: "crm_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_stage_move_se_positivo_para_fkey"
            columns: ["move_se_positivo_para"]
            isOneToOne: false
            referencedRelation: "crm_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_stage_move_se_respondeu_para_fkey"
            columns: ["move_se_respondeu_para"]
            isOneToOne: false
            referencedRelation: "crm_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_stage_move_se_sem_resposta_para_fkey"
            columns: ["move_se_sem_resposta_para"]
            isOneToOne: false
            referencedRelation: "crm_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_stage_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "crm_pipeline"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_stage_retorno_pipeline_id_fkey"
            columns: ["retorno_pipeline_id"]
            isOneToOne: false
            referencedRelation: "crm_pipeline"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_stage_retorno_stage_id_fkey"
            columns: ["retorno_stage_id"]
            isOneToOne: false
            referencedRelation: "crm_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_stage_trigger_pipeline_destino_fkey"
            columns: ["trigger_pipeline_destino"]
            isOneToOne: false
            referencedRelation: "crm_pipeline"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_venda: {
        Row: {
          canal: string | null
          card_id: string | null
          company_id: string
          contato_nome: string | null
          contato_numero: string | null
          created_at: string
          created_by: string | null
          custo_lead_cents: number | null
          descricao: string | null
          fin_lancamento_id: string | null
          id: string
          item_id: string | null
          item_nome: string | null
          item_tipo: string | null
          metodo_pagamento: string | null
          observacao: string | null
          olist_pedido_id: string | null
          olist_situacao: string | null
          owner_id: string | null
          pipeline_id: string | null
          stage_id: string | null
          updated_at: string
          valor_cents: number
          vendido_em: string
        }
        Insert: {
          canal?: string | null
          card_id?: string | null
          company_id: string
          contato_nome?: string | null
          contato_numero?: string | null
          created_at?: string
          created_by?: string | null
          custo_lead_cents?: number | null
          descricao?: string | null
          fin_lancamento_id?: string | null
          id?: string
          item_id?: string | null
          item_nome?: string | null
          item_tipo?: string | null
          metodo_pagamento?: string | null
          observacao?: string | null
          olist_pedido_id?: string | null
          olist_situacao?: string | null
          owner_id?: string | null
          pipeline_id?: string | null
          stage_id?: string | null
          updated_at?: string
          valor_cents?: number
          vendido_em?: string
        }
        Update: {
          canal?: string | null
          card_id?: string | null
          company_id?: string
          contato_nome?: string | null
          contato_numero?: string | null
          created_at?: string
          created_by?: string | null
          custo_lead_cents?: number | null
          descricao?: string | null
          fin_lancamento_id?: string | null
          id?: string
          item_id?: string | null
          item_nome?: string | null
          item_tipo?: string | null
          metodo_pagamento?: string | null
          observacao?: string | null
          olist_pedido_id?: string | null
          olist_situacao?: string | null
          owner_id?: string | null
          pipeline_id?: string | null
          stage_id?: string | null
          updated_at?: string
          valor_cents?: number
          vendido_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_venda_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "crm_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_venda_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_venda_fin_lancamento_id_fkey"
            columns: ["fin_lancamento_id"]
            isOneToOne: false
            referencedRelation: "fin_lancamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_venda_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "crm_pipeline"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_venda_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "crm_stage"
            referencedColumns: ["id"]
          },
        ]
      }
      csat_response: {
        Row: {
          canal: string
          comentario: string | null
          company_id: string
          contato_nome: string | null
          created_at: string
          enviado_em: string
          enviado_por: string | null
          estado: string | null
          expira_em: string | null
          id: string
          numero: string
          respondido_em: string | null
          score: number | null
          tentativas: number
          token: string
          updated_at: string
        }
        Insert: {
          canal?: string
          comentario?: string | null
          company_id: string
          contato_nome?: string | null
          created_at?: string
          enviado_em?: string
          enviado_por?: string | null
          estado?: string | null
          expira_em?: string | null
          id?: string
          numero: string
          respondido_em?: string | null
          score?: number | null
          tentativas?: number
          token?: string
          updated_at?: string
        }
        Update: {
          canal?: string
          comentario?: string | null
          company_id?: string
          contato_nome?: string | null
          created_at?: string
          enviado_em?: string
          enviado_por?: string | null
          estado?: string | null
          expira_em?: string | null
          id?: string
          numero?: string
          respondido_em?: string | null
          score?: number | null
          tentativas?: number
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "csat_response_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_preferences: {
        Row: {
          created_at: string
          layout_version: number
          layouts: Json
          updated_at: string
          user_id: string
          widget_settings: Json
          widgets: Json
          workspace_id: string
        }
        Insert: {
          created_at?: string
          layout_version?: number
          layouts?: Json
          updated_at?: string
          user_id: string
          widget_settings?: Json
          widgets?: Json
          workspace_id: string
        }
        Update: {
          created_at?: string
          layout_version?: number
          layouts?: Json
          updated_at?: string
          user_id?: string
          widget_settings?: Json
          widgets?: Json
          workspace_id?: string
        }
        Relationships: []
      }
      department: {
        Row: {
          ativo: boolean
          company_id: string
          cor: string | null
          created_at: string
          descricao: string | null
          id: string
          nome: string
          pipeline_id: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          company_id: string
          cor?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          pipeline_id?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          company_id?: string
          cor?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          pipeline_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "crm_pipeline"
            referencedColumns: ["id"]
          },
        ]
      }
      department_member: {
        Row: {
          created_at: string
          department_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          department_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          department_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_member_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "department"
            referencedColumns: ["id"]
          },
        ]
      }
      department_menu_session: {
        Row: {
          agent_config_id: string
          company_id: string
          created_at: string
          department_id: string | null
          id: string
          last_inbound_message_id: string | null
          last_menu_at: string
          numero: string
          resolved_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          agent_config_id: string
          company_id: string
          created_at?: string
          department_id?: string | null
          id?: string
          last_inbound_message_id?: string | null
          last_menu_at?: string
          numero: string
          resolved_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          agent_config_id?: string
          company_id?: string
          created_at?: string
          department_id?: string | null
          id?: string
          last_inbound_message_id?: string | null
          last_menu_at?: string
          numero?: string
          resolved_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_menu_session_agent_config_id_fkey"
            columns: ["agent_config_id"]
            isOneToOne: false
            referencedRelation: "agent_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_menu_session_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_menu_session_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "department"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      feature_flag_audit: {
        Row: {
          antes: Json | null
          changed_by: string | null
          created_at: string
          depois: Json | null
          flag_key: string
          id: string
        }
        Insert: {
          antes?: Json | null
          changed_by?: string | null
          created_at?: string
          depois?: Json | null
          flag_key: string
          id?: string
        }
        Update: {
          antes?: Json | null
          changed_by?: string | null
          created_at?: string
          depois?: Json | null
          flag_key?: string
          id?: string
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          beta_company_ids: string[]
          categoria: string
          created_at: string
          descricao: string | null
          id: string
          key: string
          nome: string
          ordem: number
          parent_key: string | null
          rollout: Database["public"]["Enums"]["feature_rollout"]
          updated_at: string
        }
        Insert: {
          beta_company_ids?: string[]
          categoria?: string
          created_at?: string
          descricao?: string | null
          id?: string
          key: string
          nome: string
          ordem?: number
          parent_key?: string | null
          rollout?: Database["public"]["Enums"]["feature_rollout"]
          updated_at?: string
        }
        Update: {
          beta_company_ids?: string[]
          categoria?: string
          created_at?: string
          descricao?: string | null
          id?: string
          key?: string
          nome?: string
          ordem?: number
          parent_key?: string | null
          rollout?: Database["public"]["Enums"]["feature_rollout"]
          updated_at?: string
        }
        Relationships: []
      }
      fin_categoria: {
        Row: {
          ativo: boolean
          company_id: string
          cor: string
          created_at: string
          id: string
          nome: string
          tipo: Database["public"]["Enums"]["fin_tipo"]
        }
        Insert: {
          ativo?: boolean
          company_id: string
          cor?: string
          created_at?: string
          id?: string
          nome: string
          tipo: Database["public"]["Enums"]["fin_tipo"]
        }
        Update: {
          ativo?: boolean
          company_id?: string
          cor?: string
          created_at?: string
          id?: string
          nome?: string
          tipo?: Database["public"]["Enums"]["fin_tipo"]
        }
        Relationships: [
          {
            foreignKeyName: "fin_categoria_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_lancamento: {
        Row: {
          anexo_url: string | null
          categoria_id: string | null
          company_id: string
          competencia: string
          contato_numero: string | null
          created_at: string
          created_by: string | null
          crm_card_id: string | null
          descricao: string
          forma_pagamento: Database["public"]["Enums"]["fin_forma"] | null
          id: string
          observacao: string | null
          owner_id: string | null
          pago_em: string | null
          status: Database["public"]["Enums"]["fin_status"]
          tipo: Database["public"]["Enums"]["fin_tipo"]
          updated_at: string
          valor_cents: number
          vencimento: string
          venda_id: string | null
        }
        Insert: {
          anexo_url?: string | null
          categoria_id?: string | null
          company_id: string
          competencia?: string
          contato_numero?: string | null
          created_at?: string
          created_by?: string | null
          crm_card_id?: string | null
          descricao: string
          forma_pagamento?: Database["public"]["Enums"]["fin_forma"] | null
          id?: string
          observacao?: string | null
          owner_id?: string | null
          pago_em?: string | null
          status?: Database["public"]["Enums"]["fin_status"]
          tipo: Database["public"]["Enums"]["fin_tipo"]
          updated_at?: string
          valor_cents: number
          vencimento: string
          venda_id?: string | null
        }
        Update: {
          anexo_url?: string | null
          categoria_id?: string | null
          company_id?: string
          competencia?: string
          contato_numero?: string | null
          created_at?: string
          created_by?: string | null
          crm_card_id?: string | null
          descricao?: string
          forma_pagamento?: Database["public"]["Enums"]["fin_forma"] | null
          id?: string
          observacao?: string | null
          owner_id?: string | null
          pago_em?: string | null
          status?: Database["public"]["Enums"]["fin_status"]
          tipo?: Database["public"]["Enums"]["fin_tipo"]
          updated_at?: string
          valor_cents?: number
          vencimento?: string
          venda_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fin_lancamento_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "fin_categoria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_lancamento_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_lancamento_crm_card_id_fkey"
            columns: ["crm_card_id"]
            isOneToOne: false
            referencedRelation: "crm_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_lancamento_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "crm_venda"
            referencedColumns: ["id"]
          },
        ]
      }
      flow: {
        Row: {
          ativo: boolean
          canvas: Json
          company_id: string
          created_at: string
          created_by: string | null
          descricao: string | null
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          canvas?: Json
          company_id: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          canvas?: Json
          company_id?: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "flow_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_run: {
        Row: {
          aguardando_ate: string | null
          aguardando_resposta_ate: string | null
          company_id: string
          created_at: string
          current_node_id: string | null
          flow_id: string
          id: string
          numero: string
          status: string
          ultimo_erro: string | null
          updated_at: string
          variables: Json
        }
        Insert: {
          aguardando_ate?: string | null
          aguardando_resposta_ate?: string | null
          company_id: string
          created_at?: string
          current_node_id?: string | null
          flow_id: string
          id?: string
          numero: string
          status?: string
          ultimo_erro?: string | null
          updated_at?: string
          variables?: Json
        }
        Update: {
          aguardando_ate?: string | null
          aguardando_resposta_ate?: string | null
          company_id?: string
          created_at?: string
          current_node_id?: string | null
          flow_id?: string
          id?: string
          numero?: string
          status?: string
          ultimo_erro?: string | null
          updated_at?: string
          variables?: Json
        }
        Relationships: [
          {
            foreignKeyName: "flow_run_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_run_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flow"
            referencedColumns: ["id"]
          },
        ]
      }
      google_integration: {
        Row: {
          access_token: string | null
          calendar_id: string | null
          channel_expira_em: string | null
          channel_id: string | null
          channel_token: string | null
          company_id: string
          conectado: boolean
          email: string | null
          expiry: string | null
          precisa_reconectar: boolean
          refresh_token: string | null
          resource_id: string | null
          sync_token: string | null
          ultima_sync_em: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          calendar_id?: string | null
          channel_expira_em?: string | null
          channel_id?: string | null
          channel_token?: string | null
          company_id: string
          conectado?: boolean
          email?: string | null
          expiry?: string | null
          precisa_reconectar?: boolean
          refresh_token?: string | null
          resource_id?: string | null
          sync_token?: string | null
          ultima_sync_em?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          calendar_id?: string | null
          channel_expira_em?: string | null
          channel_id?: string | null
          channel_token?: string | null
          company_id?: string
          conectado?: boolean
          email?: string | null
          expiry?: string | null
          precisa_reconectar?: boolean
          refresh_token?: string | null
          resource_id?: string | null
          sync_token?: string | null
          ultima_sync_em?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_integration_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      impersonation_log: {
        Row: {
          admin_email: string | null
          admin_user_id: string
          company_id: string
          ended_at: string | null
          id: string
          motivo: string | null
          started_at: string
        }
        Insert: {
          admin_email?: string | null
          admin_user_id: string
          company_id: string
          ended_at?: string | null
          id?: string
          motivo?: string | null
          started_at?: string
        }
        Update: {
          admin_email?: string | null
          admin_user_id?: string
          company_id?: string
          ended_at?: string | null
          id?: string
          motivo?: string | null
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "impersonation_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      inbound_webhook: {
        Row: {
          ativo: boolean
          company_id: string
          created_at: string
          id: string
          nome: string
          token: string
          total_recebidos: number
          user_id: string
        }
        Insert: {
          ativo?: boolean
          company_id: string
          created_at?: string
          id?: string
          nome: string
          token: string
          total_recebidos?: number
          user_id: string
        }
        Update: {
          ativo?: boolean
          company_id?: string
          created_at?: string
          id?: string
          nome?: string
          token?: string
          total_recebidos?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbound_webhook_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      integracao_chave: {
        Row: {
          auto_envio: boolean
          company_id: string
          conectado: boolean
          created_at: string
          credencial: string
          extra: Json
          id: string
          servico: string
          ultima_sync: string | null
          ultimo_resultado: string | null
          updated_at: string
        }
        Insert: {
          auto_envio?: boolean
          company_id: string
          conectado?: boolean
          created_at?: string
          credencial?: string
          extra?: Json
          id?: string
          servico: string
          ultima_sync?: string | null
          ultimo_resultado?: string | null
          updated_at?: string
        }
        Update: {
          auto_envio?: boolean
          company_id?: string
          conectado?: boolean
          created_at?: string
          credencial?: string
          extra?: Json
          id?: string
          servico?: string
          ultima_sync?: string | null
          ultimo_resultado?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integracao_chave_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_evento: {
        Row: {
          card_id: string
          company_id: string
          created_at: string
          descricao: string | null
          id: string
          tipo: string
        }
        Insert: {
          card_id: string
          company_id: string
          created_at?: string
          descricao?: string | null
          id?: string
          tipo: string
        }
        Update: {
          card_id?: string
          company_id?: string
          created_at?: string
          descricao?: string | null
          id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_evento_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "crm_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_evento_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_form: {
        Row: {
          ativo: boolean
          campos: Json
          company_id: string
          created_at: string
          distribution_queue_id: string | null
          id: string
          mensagem_sucesso: string
          nome: string
          owner_id: string | null
          owner_mode: string
          pipeline_id: string | null
          pos_envio: string
          redirect_url: string | null
          slug: string
          stage_id: string | null
          submits: number
          tags: string[]
          theme: Json
          updated_at: string
          valor_padrao: number | null
          views: number
          wa_auto_enviar: boolean
          wa_mensagem: string | null
        }
        Insert: {
          ativo?: boolean
          campos?: Json
          company_id: string
          created_at?: string
          distribution_queue_id?: string | null
          id?: string
          mensagem_sucesso?: string
          nome: string
          owner_id?: string | null
          owner_mode?: string
          pipeline_id?: string | null
          pos_envio?: string
          redirect_url?: string | null
          slug: string
          stage_id?: string | null
          submits?: number
          tags?: string[]
          theme?: Json
          updated_at?: string
          valor_padrao?: number | null
          views?: number
          wa_auto_enviar?: boolean
          wa_mensagem?: string | null
        }
        Update: {
          ativo?: boolean
          campos?: Json
          company_id?: string
          created_at?: string
          distribution_queue_id?: string | null
          id?: string
          mensagem_sucesso?: string
          nome?: string
          owner_id?: string | null
          owner_mode?: string
          pipeline_id?: string | null
          pos_envio?: string
          redirect_url?: string | null
          slug?: string
          stage_id?: string | null
          submits?: number
          tags?: string[]
          theme?: Json
          updated_at?: string
          valor_padrao?: number | null
          views?: number
          wa_auto_enviar?: boolean
          wa_mensagem?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_form_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_form_submission: {
        Row: {
          company_id: string
          created_at: string
          crm_card_id: string | null
          dados: Json
          form_id: string
          id: string
          ip_hash: string | null
          tracking: Json
        }
        Insert: {
          company_id: string
          created_at?: string
          crm_card_id?: string | null
          dados?: Json
          form_id: string
          id?: string
          ip_hash?: string | null
          tracking?: Json
        }
        Update: {
          company_id?: string
          created_at?: string
          crm_card_id?: string | null
          dados?: Json
          form_id?: string
          id?: string
          ip_hash?: string | null
          tracking?: Json
        }
        Relationships: [
          {
            foreignKeyName: "lead_form_submission_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_form_submission_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "lead_form"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_nota: {
        Row: {
          autor_id: string | null
          card_id: string
          company_id: string
          created_at: string
          id: string
          texto: string
        }
        Insert: {
          autor_id?: string | null
          card_id: string
          company_id: string
          created_at?: string
          id?: string
          texto: string
        }
        Update: {
          autor_id?: string | null
          card_id?: string
          company_id?: string
          created_at?: string
          id?: string
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_nota_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "crm_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_nota_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      lovable_credit_balance: {
        Row: {
          billing_period_used: number
          daily_remaining: number
          id: string
          remaining: number
          total_granted: number
          updated_at: string
        }
        Insert: {
          billing_period_used: number
          daily_remaining: number
          id?: string
          remaining: number
          total_granted: number
          updated_at?: string
        }
        Update: {
          billing_period_used?: number
          daily_remaining?: number
          id?: string
          remaining?: number
          total_granted?: number
          updated_at?: string
        }
        Relationships: []
      }
      master_settings: {
        Row: {
          key: string
          updated_at: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: Json
        }
        Relationships: []
      }
      mensagem_agendada: {
        Row: {
          agendado_para: string
          appointment_id: string | null
          canal: string | null
          cancelado_em: string | null
          card_id: string | null
          catalogo_item_id: string | null
          company_id: string
          concluido_em: string | null
          created_at: string
          created_by: string | null
          duracao_min: number | null
          empresa_nome: string | null
          enviado_em: string | null
          erro: string | null
          fim_em: string | null
          google_calendar_id: string | null
          google_event_id: string | null
          id: string
          lembrete_min_antes: number
          link_reuniao: string | null
          local: string | null
          mensagem: string
          modalidade: string | null
          motivo_falha: string | null
          nome_lead: string | null
          numero: string
          observacoes_internas: string | null
          origem: string
          parent_id: string | null
          presenca: string | null
          profissional_id: string | null
          recorrencia_id: string | null
          servico_id: string | null
          sincronizado_em: string | null
          status: string
          tags: string[] | null
          tipo: string
          tipo_id: string | null
          titulo: string | null
          updated_at: string
        }
        Insert: {
          agendado_para: string
          appointment_id?: string | null
          canal?: string | null
          cancelado_em?: string | null
          card_id?: string | null
          catalogo_item_id?: string | null
          company_id: string
          concluido_em?: string | null
          created_at?: string
          created_by?: string | null
          duracao_min?: number | null
          empresa_nome?: string | null
          enviado_em?: string | null
          erro?: string | null
          fim_em?: string | null
          google_calendar_id?: string | null
          google_event_id?: string | null
          id?: string
          lembrete_min_antes?: number
          link_reuniao?: string | null
          local?: string | null
          mensagem: string
          modalidade?: string | null
          motivo_falha?: string | null
          nome_lead?: string | null
          numero: string
          observacoes_internas?: string | null
          origem?: string
          parent_id?: string | null
          presenca?: string | null
          profissional_id?: string | null
          recorrencia_id?: string | null
          servico_id?: string | null
          sincronizado_em?: string | null
          status?: string
          tags?: string[] | null
          tipo?: string
          tipo_id?: string | null
          titulo?: string | null
          updated_at?: string
        }
        Update: {
          agendado_para?: string
          appointment_id?: string | null
          canal?: string | null
          cancelado_em?: string | null
          card_id?: string | null
          catalogo_item_id?: string | null
          company_id?: string
          concluido_em?: string | null
          created_at?: string
          created_by?: string | null
          duracao_min?: number | null
          empresa_nome?: string | null
          enviado_em?: string | null
          erro?: string | null
          fim_em?: string | null
          google_calendar_id?: string | null
          google_event_id?: string | null
          id?: string
          lembrete_min_antes?: number
          link_reuniao?: string | null
          local?: string | null
          mensagem?: string
          modalidade?: string | null
          motivo_falha?: string | null
          nome_lead?: string | null
          numero?: string
          observacoes_internas?: string | null
          origem?: string
          parent_id?: string | null
          presenca?: string | null
          profissional_id?: string | null
          recorrencia_id?: string | null
          servico_id?: string | null
          sincronizado_em?: string | null
          status?: string
          tags?: string[] | null
          tipo?: string
          tipo_id?: string | null
          titulo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mensagem_agendada_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "crm_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagem_agendada_catalogo_item_id_fkey"
            columns: ["catalogo_item_id"]
            isOneToOne: false
            referencedRelation: "produto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagem_agendada_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagem_agendada_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "mensagem_agendada"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagem_agendada_servico_id_fkey"
            columns: ["servico_id"]
            isOneToOne: false
            referencedRelation: "servico"
            referencedColumns: ["id"]
          },
        ]
      }
      mensagens: {
        Row: {
          autor: string
          company_id: string
          contato_nome: string | null
          created_at: string
          deletado_em: string | null
          direcao: string
          editado_em: string | null
          grupo_jid: string | null
          id: string
          midia_mime: string | null
          midia_nome: string | null
          midia_tipo: string | null
          midia_url: string | null
          numero: string
          reacao: string | null
          remetente_nome: string | null
          reply_to_id: string | null
          status_envio: string
          texto: string
          texto_original: string | null
          user_id: string
          whatsapp_message_id: string | null
        }
        Insert: {
          autor: string
          company_id: string
          contato_nome?: string | null
          created_at?: string
          deletado_em?: string | null
          direcao: string
          editado_em?: string | null
          grupo_jid?: string | null
          id?: string
          midia_mime?: string | null
          midia_nome?: string | null
          midia_tipo?: string | null
          midia_url?: string | null
          numero: string
          reacao?: string | null
          remetente_nome?: string | null
          reply_to_id?: string | null
          status_envio?: string
          texto: string
          texto_original?: string | null
          user_id: string
          whatsapp_message_id?: string | null
        }
        Update: {
          autor?: string
          company_id?: string
          contato_nome?: string | null
          created_at?: string
          deletado_em?: string | null
          direcao?: string
          editado_em?: string | null
          grupo_jid?: string | null
          id?: string
          midia_mime?: string | null
          midia_nome?: string | null
          midia_tipo?: string | null
          midia_url?: string | null
          numero?: string
          reacao?: string | null
          remetente_nome?: string | null
          reply_to_id?: string | null
          status_envio?: string
          texto?: string
          texto_original?: string | null
          user_id?: string
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mensagens_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "mensagens"
            referencedColumns: ["id"]
          },
        ]
      }
      message_hsm_template: {
        Row: {
          botoes: Json
          categoria: string
          company_id: string
          corpo: string
          created_at: string
          header_conteudo: string | null
          header_tipo: string
          id: string
          idioma: string
          instance_id: string | null
          meta_template_id: string | null
          meta_ultimo_erro: string | null
          nome: string
          rodape: string | null
          status: string
          updated_at: string
          variaveis: Json
        }
        Insert: {
          botoes?: Json
          categoria?: string
          company_id: string
          corpo: string
          created_at?: string
          header_conteudo?: string | null
          header_tipo?: string
          id?: string
          idioma?: string
          instance_id?: string | null
          meta_template_id?: string | null
          meta_ultimo_erro?: string | null
          nome: string
          rodape?: string | null
          status?: string
          updated_at?: string
          variaveis?: Json
        }
        Update: {
          botoes?: Json
          categoria?: string
          company_id?: string
          corpo?: string
          created_at?: string
          header_conteudo?: string | null
          header_tipo?: string
          id?: string
          idioma?: string
          instance_id?: string | null
          meta_template_id?: string | null
          meta_ultimo_erro?: string | null
          nome?: string
          rodape?: string | null
          status?: string
          updated_at?: string
          variaveis?: Json
        }
        Relationships: [
          {
            foreignKeyName: "message_hsm_template_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_hsm_template_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      message_template: {
        Row: {
          atalho: string
          company_id: string
          created_at: string
          id: string
          texto: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          atalho: string
          company_id: string
          created_at?: string
          id?: string
          texto: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          atalho?: string
          company_id?: string
          created_at?: string
          id?: string
          texto?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_template_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_oauth_session: {
        Row: {
          company_id: string
          consumed: boolean
          created_at: string
          expires_at: string
          handle: string
          id: string
          user_id: string
          user_token: string
        }
        Insert: {
          company_id: string
          consumed?: boolean
          created_at?: string
          expires_at?: string
          handle: string
          id?: string
          user_id: string
          user_token: string
        }
        Update: {
          company_id?: string
          consumed?: boolean
          created_at?: string
          expires_at?: string
          handle?: string
          id?: string
          user_id?: string
          user_token?: string
        }
        Relationships: []
      }
      notificacao: {
        Row: {
          company_id: string
          created_at: string
          descricao: string | null
          id: string
          lida_em: string | null
          link: string | null
          ref_id: string | null
          tipo: string
          titulo: string
        }
        Insert: {
          company_id: string
          created_at?: string
          descricao?: string | null
          id?: string
          lida_em?: string | null
          link?: string | null
          ref_id?: string | null
          tipo: string
          titulo: string
        }
        Update: {
          company_id?: string
          created_at?: string
          descricao?: string | null
          id?: string
          lida_em?: string | null
          link?: string | null
          ref_id?: string | null
          tipo?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificacao_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      olist_integration: {
        Row: {
          auto_pedido: boolean
          company_id: string
          conectado: boolean
          created_at: string
          id: string
          token: string
          ultima_sync: string | null
          ultimo_resultado: string | null
          updated_at: string
        }
        Insert: {
          auto_pedido?: boolean
          company_id: string
          conectado?: boolean
          created_at?: string
          id?: string
          token: string
          ultima_sync?: string | null
          ultimo_resultado?: string | null
          updated_at?: string
        }
        Update: {
          auto_pedido?: boolean
          company_id?: string
          conectado?: boolean
          created_at?: string
          id?: string
          token?: string
          ultima_sync?: string | null
          ultimo_resultado?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "olist_integration_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      outbound_queue: {
        Row: {
          company_id: string
          created_at: string
          id: string
          kind: string
          max_tentativas: number
          mensagem_id: string | null
          payload: Json
          proxima_em: string
          status: string
          tentativas: number
          ultimo_erro: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          kind: string
          max_tentativas?: number
          mensagem_id?: string | null
          payload: Json
          proxima_em?: string
          status?: string
          tentativas?: number
          ultimo_erro?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          kind?: string
          max_tentativas?: number
          mensagem_id?: string | null
          payload?: Json
          proxima_em?: string
          status?: string
          tentativas?: number
          ultimo_erro?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      parceiro: {
        Row: {
          codigo_indicacao: string
          created_at: string
          id: string
          porcentagem_comissao: number
          saldo_atual_cents: number
          status: string
          total_acumulado_cents: number
          total_sacado_cents: number
          updated_at: string
          user_id: string
        }
        Insert: {
          codigo_indicacao: string
          created_at?: string
          id?: string
          porcentagem_comissao?: number
          saldo_atual_cents?: number
          status?: string
          total_acumulado_cents?: number
          total_sacado_cents?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          codigo_indicacao?: string
          created_at?: string
          id?: string
          porcentagem_comissao?: number
          saldo_atual_cents?: number
          status?: string
          total_acumulado_cents?: number
          total_sacado_cents?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      parceiro_clique: {
        Row: {
          codigo: string
          created_at: string
          id: string
          parceiro_id: string
          referer: string | null
          user_agent: string | null
        }
        Insert: {
          codigo: string
          created_at?: string
          id?: string
          parceiro_id: string
          referer?: string | null
          user_agent?: string | null
        }
        Update: {
          codigo?: string
          created_at?: string
          id?: string
          parceiro_id?: string
          referer?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parceiro_clique_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiro"
            referencedColumns: ["id"]
          },
        ]
      }
      parceiro_indicacao: {
        Row: {
          atribuido_por: string | null
          company_id: string
          created_at: string
          data_conversao: string | null
          id: string
          origem: string
          parceiro_id: string
          status: string
        }
        Insert: {
          atribuido_por?: string | null
          company_id: string
          created_at?: string
          data_conversao?: string | null
          id?: string
          origem?: string
          parceiro_id: string
          status?: string
        }
        Update: {
          atribuido_por?: string | null
          company_id?: string
          created_at?: string
          data_conversao?: string | null
          id?: string
          origem?: string
          parceiro_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "parceiro_indicacao_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parceiro_indicacao_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiro"
            referencedColumns: ["id"]
          },
        ]
      }
      parceiro_saque: {
        Row: {
          comprovante_url: string | null
          created_at: string
          id: string
          pago_em: string | null
          parceiro_id: string
          status: string
          valor_cents: number
        }
        Insert: {
          comprovante_url?: string | null
          created_at?: string
          id?: string
          pago_em?: string | null
          parceiro_id: string
          status?: string
          valor_cents: number
        }
        Update: {
          comprovante_url?: string | null
          created_at?: string
          id?: string
          pago_em?: string | null
          parceiro_id?: string
          status?: string
          valor_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "parceiro_saque_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiro"
            referencedColumns: ["id"]
          },
        ]
      }
      plan: {
        Row: {
          ativo: boolean
          checkout_url: string | null
          created_at: string
          creditos_mensais: number
          creditos_trial: number
          descricao: string | null
          destaque: boolean
          features: Json
          id: string
          intervalo: string
          limite_contatos: number
          limite_instancias: number
          limite_mensagens: number
          limite_usuarios: number
          moeda: string
          nome: string
          ordem: number
          paddle_price_id: string | null
          paddle_product_id: string | null
          preco_cents: number
          slug: string
          stripe_price_id: string | null
          stripe_product_id: string | null
          trial_days: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          checkout_url?: string | null
          created_at?: string
          creditos_mensais?: number
          creditos_trial?: number
          descricao?: string | null
          destaque?: boolean
          features?: Json
          id?: string
          intervalo?: string
          limite_contatos?: number
          limite_instancias?: number
          limite_mensagens?: number
          limite_usuarios?: number
          moeda?: string
          nome: string
          ordem?: number
          paddle_price_id?: string | null
          paddle_product_id?: string | null
          preco_cents?: number
          slug: string
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          trial_days?: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          checkout_url?: string | null
          created_at?: string
          creditos_mensais?: number
          creditos_trial?: number
          descricao?: string | null
          destaque?: boolean
          features?: Json
          id?: string
          intervalo?: string
          limite_contatos?: number
          limite_instancias?: number
          limite_mensagens?: number
          limite_usuarios?: number
          moeda?: string
          nome?: string
          ordem?: number
          paddle_price_id?: string | null
          paddle_product_id?: string | null
          preco_cents?: number
          slug?: string
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          trial_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      plugin: {
        Row: {
          auth_tipo: string
          banner_subtitulo: string | null
          banner_titulo: string | null
          banner_url: string | null
          capa_url: string | null
          capacidade_slug: string | null
          categoria: string
          checkout_url: string | null
          config_schema: Json
          cor_fundo: string | null
          created_at: string
          descricao: string | null
          descricao_longa: string | null
          destaque: boolean
          docs_url: string | null
          external_product_id: string | null
          gratuito: boolean
          icone: string | null
          id: string
          modulo_rota: string | null
          nome: string
          ordem: number
          plano_minimo: string
          preco_mensal: number
          screenshots: Json
          slug: string
          status: string
          tagline: string | null
          tipo_efeito: string
          updated_at: string
          visivel_para_clientes: boolean
        }
        Insert: {
          auth_tipo?: string
          banner_subtitulo?: string | null
          banner_titulo?: string | null
          banner_url?: string | null
          capa_url?: string | null
          capacidade_slug?: string | null
          categoria?: string
          checkout_url?: string | null
          config_schema?: Json
          cor_fundo?: string | null
          created_at?: string
          descricao?: string | null
          descricao_longa?: string | null
          destaque?: boolean
          docs_url?: string | null
          external_product_id?: string | null
          gratuito?: boolean
          icone?: string | null
          id?: string
          modulo_rota?: string | null
          nome: string
          ordem?: number
          plano_minimo?: string
          preco_mensal?: number
          screenshots?: Json
          slug: string
          status?: string
          tagline?: string | null
          tipo_efeito?: string
          updated_at?: string
          visivel_para_clientes?: boolean
        }
        Update: {
          auth_tipo?: string
          banner_subtitulo?: string | null
          banner_titulo?: string | null
          banner_url?: string | null
          capa_url?: string | null
          capacidade_slug?: string | null
          categoria?: string
          checkout_url?: string | null
          config_schema?: Json
          cor_fundo?: string | null
          created_at?: string
          descricao?: string | null
          descricao_longa?: string | null
          destaque?: boolean
          docs_url?: string | null
          external_product_id?: string | null
          gratuito?: boolean
          icone?: string | null
          id?: string
          modulo_rota?: string | null
          nome?: string
          ordem?: number
          plano_minimo?: string
          preco_mensal?: number
          screenshots?: Json
          slug?: string
          status?: string
          tagline?: string | null
          tipo_efeito?: string
          updated_at?: string
          visivel_para_clientes?: boolean
        }
        Relationships: []
      }
      plugin_banner: {
        Row: {
          alt: string | null
          ativo: boolean
          created_at: string
          id: string
          imagem_mobile_url: string | null
          imagem_url: string
          link_url: string | null
          ordem: number
          plugin_id: string | null
          updated_at: string
        }
        Insert: {
          alt?: string | null
          ativo?: boolean
          created_at?: string
          id?: string
          imagem_mobile_url?: string | null
          imagem_url: string
          link_url?: string | null
          ordem?: number
          plugin_id?: string | null
          updated_at?: string
        }
        Update: {
          alt?: string | null
          ativo?: boolean
          created_at?: string
          id?: string
          imagem_mobile_url?: string | null
          imagem_url?: string
          link_url?: string | null
          ordem?: number
          plugin_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plugin_banner_plugin_id_fkey"
            columns: ["plugin_id"]
            isOneToOne: false
            referencedRelation: "plugin"
            referencedColumns: ["id"]
          },
        ]
      }
      plugin_suggestion: {
        Row: {
          company_id: string | null
          created_at: string | null
          descricao: string | null
          id: string
          status: string
          titulo: string
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          descricao?: string | null
          id?: string
          status?: string
          titulo: string
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          descricao?: string | null
          id?: string
          status?: string
          titulo?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plugin_suggestion_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      produto: {
        Row: {
          agendavel: boolean
          ativo: boolean
          categoria: string | null
          company_id: string
          cor: string | null
          created_at: string
          descricao: string | null
          duracao_min: number | null
          foto_url: string | null
          id: string
          legacy_servico_id: string | null
          nome: string
          olist_id: string | null
          ordem: number
          preco: number
          sku: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          agendavel?: boolean
          ativo?: boolean
          categoria?: string | null
          company_id: string
          cor?: string | null
          created_at?: string
          descricao?: string | null
          duracao_min?: number | null
          foto_url?: string | null
          id?: string
          legacy_servico_id?: string | null
          nome: string
          olist_id?: string | null
          ordem?: number
          preco?: number
          sku?: string | null
          tipo?: string
          updated_at?: string
        }
        Update: {
          agendavel?: boolean
          ativo?: boolean
          categoria?: string | null
          company_id?: string
          cor?: string | null
          created_at?: string
          descricao?: string | null
          duracao_min?: number | null
          foto_url?: string | null
          id?: string
          legacy_servico_id?: string | null
          nome?: string
          olist_id?: string | null
          ordem?: number
          preco?: number
          sku?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "produto_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          assinatura_ativa: boolean
          avatar_url: string | null
          cargo: string | null
          cpf: string | null
          created_at: string
          csat_auto_finalizar: boolean | null
          email: string | null
          last_seen_at: string | null
          nome: string | null
          nome_completo: string | null
          telefone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          assinatura_ativa?: boolean
          avatar_url?: string | null
          cargo?: string | null
          cpf?: string | null
          created_at?: string
          csat_auto_finalizar?: boolean | null
          email?: string | null
          last_seen_at?: string | null
          nome?: string | null
          nome_completo?: string | null
          telefone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          assinatura_ativa?: boolean
          avatar_url?: string | null
          cargo?: string | null
          cpf?: string | null
          created_at?: string
          csat_auto_finalizar?: boolean | null
          email?: string | null
          last_seen_at?: string | null
          nome?: string | null
          nome_completo?: string | null
          telefone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      prospeccao_lead: {
        Row: {
          abordagem_analise: string | null
          abordagem_em: string | null
          abordagem_foco: string | null
          abordagem_texto: string | null
          avaliacoes: number | null
          busca: string | null
          card_id: string | null
          categoria: string | null
          cidade: string | null
          cnpj: string | null
          company_id: string | null
          created_at: string
          criado_por: string | null
          dados: Json
          disparo_em: string | null
          disparo_por: string | null
          email: string | null
          endereco: string | null
          fonte: string
          id: string
          lote_em: string | null
          lote_id: string | null
          nome: string
          place_id: string | null
          rating: number | null
          site: string | null
          site_dados: Json
          site_diagnostico: string | null
          site_nota: number | null
          site_oportunidades: string | null
          site_status: string | null
          site_verificado_em: string | null
          status: string
          telefone: string | null
          uf: string | null
        }
        Insert: {
          abordagem_analise?: string | null
          abordagem_em?: string | null
          abordagem_foco?: string | null
          abordagem_texto?: string | null
          avaliacoes?: number | null
          busca?: string | null
          card_id?: string | null
          categoria?: string | null
          cidade?: string | null
          cnpj?: string | null
          company_id?: string | null
          created_at?: string
          criado_por?: string | null
          dados?: Json
          disparo_em?: string | null
          disparo_por?: string | null
          email?: string | null
          endereco?: string | null
          fonte?: string
          id?: string
          lote_em?: string | null
          lote_id?: string | null
          nome: string
          place_id?: string | null
          rating?: number | null
          site?: string | null
          site_dados?: Json
          site_diagnostico?: string | null
          site_nota?: number | null
          site_oportunidades?: string | null
          site_status?: string | null
          site_verificado_em?: string | null
          status?: string
          telefone?: string | null
          uf?: string | null
        }
        Update: {
          abordagem_analise?: string | null
          abordagem_em?: string | null
          abordagem_foco?: string | null
          abordagem_texto?: string | null
          avaliacoes?: number | null
          busca?: string | null
          card_id?: string | null
          categoria?: string | null
          cidade?: string | null
          cnpj?: string | null
          company_id?: string | null
          created_at?: string
          criado_por?: string | null
          dados?: Json
          disparo_em?: string | null
          disparo_por?: string | null
          email?: string | null
          endereco?: string | null
          fonte?: string
          id?: string
          lote_em?: string | null
          lote_id?: string | null
          nome?: string
          place_id?: string | null
          rating?: number | null
          site?: string | null
          site_dados?: Json
          site_diagnostico?: string | null
          site_nota?: number | null
          site_oportunidades?: string | null
          site_status?: string | null
          site_verificado_em?: string | null
          status?: string
          telefone?: string | null
          uf?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prospeccao_lead_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      quick_reply: {
        Row: {
          atalho: string
          categoria: string
          company_id: string
          created_at: string
          favorito: boolean
          id: string
          media_mime: string | null
          media_nome: string | null
          media_url: string | null
          ordem: number
          texto: string | null
          tipo: string
          titulo: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          atalho: string
          categoria?: string
          company_id: string
          created_at?: string
          favorito?: boolean
          id?: string
          media_mime?: string | null
          media_nome?: string | null
          media_url?: string | null
          ordem?: number
          texto?: string | null
          tipo?: string
          titulo?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          atalho?: string
          categoria?: string
          company_id?: string
          created_at?: string
          favorito?: boolean
          id?: string
          media_mime?: string | null
          media_nome?: string | null
          media_url?: string | null
          ordem?: number
          texto?: string | null
          tipo?: string
          titulo?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quick_reply_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      servico: {
        Row: {
          ativo: boolean
          company_id: string
          cor: string | null
          created_at: string
          duracao_min: number
          id: string
          nome: string
          updated_at: string
          valor_cents: number
        }
        Insert: {
          ativo?: boolean
          company_id: string
          cor?: string | null
          created_at?: string
          duracao_min?: number
          id?: string
          nome: string
          updated_at?: string
          valor_cents?: number
        }
        Update: {
          ativo?: boolean
          company_id?: string
          cor?: string | null
          created_at?: string
          duracao_min?: number
          id?: string
          nome?: string
          updated_at?: string
          valor_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "servico_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      signup_welcome_log: {
        Row: {
          created_at: string
          email: string | null
          erro: string | null
          id: string
          nome: string | null
          status: string
          telefone: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          erro?: string | null
          id?: string
          nome?: string | null
          status?: string
          telefone?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          erro?: string | null
          id?: string
          nome?: string | null
          status?: string
          telefone?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      subscription: {
        Row: {
          abacate_subscription_id: string | null
          buyer_email: string | null
          cancel_at_period_end: boolean
          canceled_at: string | null
          ciclo: string
          company_id: string
          cortesia: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          external_customer_id: string | null
          external_subscription_id: string | null
          extra_conexoes: number
          extra_usuarios: number
          id: string
          metadata: Json
          metodo_pagamento: string | null
          next_billing_amount_cents: number | null
          notas_internas: string | null
          paddle_customer_id: string | null
          paddle_subscription_id: string | null
          payment_method_brand: string | null
          payment_method_exp: string | null
          payment_method_last4: string | null
          plan_id: string | null
          provider: string
          proxima_cobranca: string | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          trial_ends_at: string | null
          updated_at: string
          valor_customizado_cents: number | null
        }
        Insert: {
          abacate_subscription_id?: string | null
          buyer_email?: string | null
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          ciclo?: string
          company_id: string
          cortesia?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          external_customer_id?: string | null
          external_subscription_id?: string | null
          extra_conexoes?: number
          extra_usuarios?: number
          id?: string
          metadata?: Json
          metodo_pagamento?: string | null
          next_billing_amount_cents?: number | null
          notas_internas?: string | null
          paddle_customer_id?: string | null
          paddle_subscription_id?: string | null
          payment_method_brand?: string | null
          payment_method_exp?: string | null
          payment_method_last4?: string | null
          plan_id?: string | null
          provider?: string
          proxima_cobranca?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          valor_customizado_cents?: number | null
        }
        Update: {
          abacate_subscription_id?: string | null
          buyer_email?: string | null
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          ciclo?: string
          company_id?: string
          cortesia?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          external_customer_id?: string | null
          external_subscription_id?: string | null
          extra_conexoes?: number
          extra_usuarios?: number
          id?: string
          metadata?: Json
          metodo_pagamento?: string | null
          next_billing_amount_cents?: number | null
          notas_internas?: string | null
          paddle_customer_id?: string | null
          paddle_subscription_id?: string | null
          payment_method_brand?: string | null
          payment_method_exp?: string | null
          payment_method_last4?: string | null
          plan_id?: string | null
          provider?: string
          proxima_cobranca?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          valor_customizado_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plan"
            referencedColumns: ["id"]
          },
        ]
      }
      support_config: {
        Row: {
          auto_reply_enabled: boolean
          auto_reply_message: string
          auto_resolve_dias: number
          csat_enabled: boolean
          csat_message: string
          dias_semana: number[]
          horario_fim: number
          horario_inicio: number
          id: boolean
          offhours_enabled: boolean
          offhours_message: string
          updated_at: string
        }
        Insert: {
          auto_reply_enabled?: boolean
          auto_reply_message?: string
          auto_resolve_dias?: number
          csat_enabled?: boolean
          csat_message?: string
          dias_semana?: number[]
          horario_fim?: number
          horario_inicio?: number
          id?: boolean
          offhours_enabled?: boolean
          offhours_message?: string
          updated_at?: string
        }
        Update: {
          auto_reply_enabled?: boolean
          auto_reply_message?: string
          auto_resolve_dias?: number
          csat_enabled?: boolean
          csat_message?: string
          dias_semana?: number[]
          horario_fim?: number
          horario_inicio?: number
          id?: boolean
          offhours_enabled?: boolean
          offhours_message?: string
          updated_at?: string
        }
        Relationships: []
      }
      support_macro: {
        Row: {
          atalho: string
          categoria: string
          conteudo: string
          created_at: string
          id: string
          ordem: number
          titulo: string
          updated_at: string
        }
        Insert: {
          atalho: string
          categoria?: string
          conteudo: string
          created_at?: string
          id?: string
          ordem?: number
          titulo: string
          updated_at?: string
        }
        Update: {
          atalho?: string
          categoria?: string
          conteudo?: string
          created_at?: string
          id?: string
          ordem?: number
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      support_message: {
        Row: {
          attachments: Json
          content: string
          created_at: string
          id: string
          read_at: string | null
          sender_id: string | null
          sender_role: string
          ticket_id: string
        }
        Insert: {
          attachments?: Json
          content: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender_id?: string | null
          sender_role: string
          ticket_id: string
        }
        Update: {
          attachments?: Json
          content?: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender_id?: string | null
          sender_role?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_message_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_ticket"
            referencedColumns: ["id"]
          },
        ]
      }
      support_note: {
        Row: {
          author_id: string | null
          content: string
          created_at: string
          id: string
          ticket_id: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          content: string
          created_at?: string
          id?: string
          ticket_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          content?: string
          created_at?: string
          id?: string
          ticket_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_note_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_ticket"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket: {
        Row: {
          assigned_to: string | null
          assunto: string
          auto_reply_sent: boolean
          categoria: string
          company_id: string
          created_at: string
          created_by: string | null
          csat_at: string | null
          csat_comment: string | null
          csat_score: number | null
          first_response_at: string | null
          id: string
          last_message_at: string
          prioridade: string
          resolved_at: string | null
          sla_due_at: string | null
          status: string
          unread_admin: number
          unread_user: number
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          assunto?: string
          auto_reply_sent?: boolean
          categoria?: string
          company_id: string
          created_at?: string
          created_by?: string | null
          csat_at?: string | null
          csat_comment?: string | null
          csat_score?: number | null
          first_response_at?: string | null
          id?: string
          last_message_at?: string
          prioridade?: string
          resolved_at?: string | null
          sla_due_at?: string | null
          status?: string
          unread_admin?: number
          unread_user?: number
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          assunto?: string
          auto_reply_sent?: boolean
          categoria?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          csat_at?: string | null
          csat_comment?: string | null
          csat_score?: number | null
          first_response_at?: string | null
          id?: string
          last_message_at?: string
          prioridade?: string
          resolved_at?: string | null
          sla_due_at?: string | null
          status?: string
          unread_admin?: number
          unread_user?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      system_alerts: {
        Row: {
          company_id: string | null
          created_at: string
          descricao: string | null
          id: string
          ref: string | null
          resolvido_em: string | null
          severidade: string
          tipo: string
          titulo: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          ref?: string | null
          resolvido_em?: string | null
          severidade?: string
          tipo: string
          titulo: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          ref?: string | null
          resolvido_em?: string | null
          severidade?: string
          tipo?: string
          titulo?: string
        }
        Relationships: []
      }
      training_banners: {
        Row: {
          created_at: string
          highlight: string | null
          id: string
          image_url: string
          is_active: boolean | null
          link_url: string | null
          sort_order: number
          subtitle: string | null
          tags: string[] | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          highlight?: string | null
          id?: string
          image_url: string
          is_active?: boolean | null
          link_url?: string | null
          sort_order?: number
          subtitle?: string | null
          tags?: string[] | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          highlight?: string | null
          id?: string
          image_url?: string
          is_active?: boolean | null
          link_url?: string | null
          sort_order?: number
          subtitle?: string | null
          tags?: string[] | null
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      training_categories: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          order: number | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          order?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          order?: number | null
        }
        Relationships: []
      }
      training_courses: {
        Row: {
          category_id: string | null
          created_at: string | null
          description: string | null
          id: string
          instructor: string | null
          is_published: boolean | null
          order: number | null
          thumbnail: string | null
          title: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          instructor?: string | null
          is_published?: boolean | null
          order?: number | null
          thumbnail?: string | null
          title: string
        }
        Update: {
          category_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          instructor?: string | null
          is_published?: boolean | null
          order?: number | null
          thumbnail?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_courses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "training_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      training_favorites: {
        Row: {
          course_id: string
          created_at: string | null
          user_id: string
        }
        Insert: {
          course_id: string
          created_at?: string | null
          user_id: string
        }
        Update: {
          course_id?: string
          created_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_favorites_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "training_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      training_lessons: {
        Row: {
          created_at: string | null
          description: string | null
          duration: string | null
          id: string
          module_id: string | null
          order: number | null
          title: string
          video_url: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          duration?: string | null
          id?: string
          module_id?: string | null
          order?: number | null
          title: string
          video_url?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          duration?: string | null
          id?: string
          module_id?: string | null
          order?: number | null
          title?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_lessons_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "training_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      training_modules: {
        Row: {
          course_id: string | null
          created_at: string | null
          id: string
          order: number | null
          title: string
        }
        Insert: {
          course_id?: string | null
          created_at?: string | null
          id?: string
          order?: number | null
          title: string
        }
        Update: {
          course_id?: string | null
          created_at?: string | null
          id?: string
          order?: number | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_modules_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "training_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      training_user_progress: {
        Row: {
          completed_at: string | null
          lesson_id: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          lesson_id: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          lesson_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_user_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "training_lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      user_feedback: {
        Row: {
          admin_reply: string | null
          attachments: Json
          category: string
          company_id: string | null
          created_at: string
          id: string
          link: string | null
          message: string
          replied_at: string | null
          replied_by: string | null
          status: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_reply?: string | null
          attachments?: Json
          category?: string
          company_id?: string | null
          created_at?: string
          id?: string
          link?: string | null
          message: string
          replied_at?: string | null
          replied_by?: string | null
          status?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_reply?: string | null
          attachments?: Json
          category?: string
          company_id?: string | null
          created_at?: string
          id?: string
          link?: string | null
          message?: string
          replied_at?: string | null
          replied_by?: string | null
          status?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_feedback_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      webhook_delivery_log: {
        Row: {
          company_id: string
          created_at: string
          endpoint_id: string | null
          erro: string | null
          evento: string
          id: string
          status_code: number | null
        }
        Insert: {
          company_id: string
          created_at?: string
          endpoint_id?: string | null
          erro?: string | null
          evento: string
          id?: string
          status_code?: number | null
        }
        Update: {
          company_id?: string
          created_at?: string
          endpoint_id?: string | null
          erro?: string | null
          evento?: string
          id?: string
          status_code?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_delivery_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_delivery_log_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "webhook_endpoint"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_endpoint: {
        Row: {
          ativo: boolean
          company_id: string
          created_at: string
          eventos: string[]
          id: string
          nome: string
          secret: string
          updated_at: string
          url: string
        }
        Insert: {
          ativo?: boolean
          company_id: string
          created_at?: string
          eventos?: string[]
          id?: string
          nome: string
          secret?: string
          updated_at?: string
          url: string
        }
        Update: {
          ativo?: boolean
          company_id?: string
          created_at?: string
          eventos?: string[]
          id?: string
          nome?: string
          secret?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_endpoint_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_errors: {
        Row: {
          company_id: string | null
          created_at: string
          erro: string
          id: string
          origem: string
          payload: Json | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          erro: string
          id?: string
          origem: string
          payload?: Json | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          erro?: string
          id?: string
          origem?: string
          payload?: Json | null
        }
        Relationships: []
      }
      whatsapp_grupo: {
        Row: {
          company_id: string
          created_at: string
          foto_url: string | null
          id: string
          instance_id: string | null
          jid: string
          nome: string | null
          participantes: number | null
          ultima_em: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          foto_url?: string | null
          id?: string
          instance_id?: string | null
          jid: string
          nome?: string | null
          participantes?: number | null
          ultima_em?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          foto_url?: string | null
          id?: string
          instance_id?: string | null
          jid?: string
          nome?: string | null
          participantes?: number | null
          ultima_em?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_instances: {
        Row: {
          billing_status: Database["public"]["Enums"]["whatsapp_billing_status"]
          company_id: string
          display_name: string | null
          id: string
          instance_name: string
          instance_token: string | null
          last_state_at: string | null
          messaging_tier: string | null
          monthly_price_cents: number
          numero: string | null
          paddle_subscription_item_id: string | null
          paused: boolean
          phone_number_id: string | null
          provider: string
          provider_type: Database["public"]["Enums"]["whatsapp_provider_type"]
          status: string
          updated_at: string
          user_id: string | null
          waba_id: string | null
          webhook_configured_at: string | null
          webhook_token: string
        }
        Insert: {
          billing_status?: Database["public"]["Enums"]["whatsapp_billing_status"]
          company_id: string
          display_name?: string | null
          id?: string
          instance_name: string
          instance_token?: string | null
          last_state_at?: string | null
          messaging_tier?: string | null
          monthly_price_cents?: number
          numero?: string | null
          paddle_subscription_item_id?: string | null
          paused?: boolean
          phone_number_id?: string | null
          provider?: string
          provider_type?: Database["public"]["Enums"]["whatsapp_provider_type"]
          status?: string
          updated_at?: string
          user_id?: string | null
          waba_id?: string | null
          webhook_configured_at?: string | null
          webhook_token?: string
        }
        Update: {
          billing_status?: Database["public"]["Enums"]["whatsapp_billing_status"]
          company_id?: string
          display_name?: string | null
          id?: string
          instance_name?: string
          instance_token?: string | null
          last_state_at?: string | null
          messaging_tier?: string | null
          monthly_price_cents?: number
          numero?: string | null
          paddle_subscription_item_id?: string | null
          paused?: boolean
          phone_number_id?: string | null
          provider?: string
          provider_type?: Database["public"]["Enums"]["whatsapp_provider_type"]
          status?: string
          updated_at?: string
          user_id?: string | null
          waba_id?: string | null
          webhook_configured_at?: string | null
          webhook_token?: string
        }
        Relationships: []
      }
    }
    Views: {
      team_profiles: {
        Row: {
          avatar_url: string | null
          nome: string | null
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          nome?: string | null
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          nome?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      can_access_feature: {
        Args: { _company_id: string; _key: string }
        Returns: boolean
      }
      can_assign_custom_role: {
        Args: { _company_id: string; _custom_role_id: string }
        Returns: boolean
      }
      can_manage_operational_reports: {
        Args: { _company_id: string }
        Returns: boolean
      }
      claim_super_admin_if_empty: { Args: never; Returns: undefined }
      company_write_allowed: { Args: { _company_id: string }; Returns: boolean }
      consume_ai_credit: {
        Args: { _company_id: string; _ref?: string }
        Returns: boolean
      }
      current_company_id: { Args: never; Returns: string }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      fin_enable_for_company: {
        Args: { _company_id: string; _enable: boolean }
        Returns: undefined
      }
      find_company_by_email: { Args: { _email: string }; Returns: string }
      gerar_notificacoes_agendamento: { Args: never; Returns: undefined }
      get_infra_stats: { Args: never; Returns: Json }
      grant_credits: {
        Args: { _company_id: string; _motivo?: string; _qtd: number }
        Returns: number
      }
      has_active_addon: {
        Args: { _company_id: string; _tipo: string }
        Returns: boolean
      }
      has_company_access: { Args: { _company_id: string }; Returns: boolean }
      has_company_role: {
        Args: { _company_id: string; _roles: string[] }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: never; Returns: boolean }
      list_feature_flags_for_me: {
        Args: never
        Returns: {
          enabled: boolean
          key: string
          rollout: string
        }[]
      }
      maintenance_cleanup: { Args: never; Returns: undefined }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      plugin_assinatura_valida: {
        Args: {
          _assinatura_status: string
          _current_period_end: string
          _gratuito: boolean
          _trial_ends_at: string
        }
        Returns: boolean
      }
      plugin_receita_resumo: {
        Args: never
        Returns: {
          assinaturas_ativas: number
          canceladas: number
          em_trial: number
          gratuito: boolean
          instalacoes: number
          nome: string
          plugin_id: string
          preco_mensal: number
          receita_mensal_cents: number
          slug: string
        }[]
      }
      provision_company_atomic: {
        Args: {
          _nome: string
          _plan_slug?: string
          _slug: string
          _trial_ate: string
          _user_id: string
        }
        Returns: string
      }
      push_notificacao: {
        Args: {
          _company_id: string
          _descricao: string
          _link: string
          _ref_id: string
          _tipo: string
          _titulo: string
        }
        Returns: undefined
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      seed_fin_categorias: { Args: { _company_id: string }; Returns: undefined }
      seed_fixed_agents: { Args: { _company_id: string }; Returns: undefined }
      seed_pipelines_for_company: {
        Args: { _company_id: string }
        Returns: undefined
      }
      topup_plan_credits: {
        Args: { _company_id: string; _plan_slug: string }
        Returns: number
      }
    }
    Enums: {
      app_role: "super_admin"
      campaign_status:
        | "rascunho"
        | "agendada"
        | "enviando"
        | "pausada"
        | "concluida"
        | "cancelada"
      campaign_target_status: "pendente" | "enviado" | "falhou" | "pulado"
      feature_rollout: "interno" | "beta" | "publico"
      fin_forma:
        | "pix"
        | "boleto"
        | "cartao"
        | "dinheiro"
        | "transferencia"
        | "outro"
      fin_status: "pendente" | "pago" | "atrasado" | "cancelado"
      fin_tipo: "receita" | "despesa"
      stage_tipo: "normal" | "ganho" | "perda"
      tenant_role: "owner" | "admin" | "atendente"
      whatsapp_billing_status:
        | "free"
        | "pending_payment"
        | "active"
        | "past_due"
        | "canceled"
      whatsapp_provider_type:
        | "lovable_whatsapp"
        | "meta_direct"
        | "evolution"
        | "uazapi"
        | "oficial_meta"
        | "wablast"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["super_admin"],
      campaign_status: [
        "rascunho",
        "agendada",
        "enviando",
        "pausada",
        "concluida",
        "cancelada",
      ],
      campaign_target_status: ["pendente", "enviado", "falhou", "pulado"],
      feature_rollout: ["interno", "beta", "publico"],
      fin_forma: [
        "pix",
        "boleto",
        "cartao",
        "dinheiro",
        "transferencia",
        "outro",
      ],
      fin_status: ["pendente", "pago", "atrasado", "cancelado"],
      fin_tipo: ["receita", "despesa"],
      stage_tipo: ["normal", "ganho", "perda"],
      tenant_role: ["owner", "admin", "atendente"],
      whatsapp_billing_status: [
        "free",
        "pending_payment",
        "active",
        "past_due",
        "canceled",
      ],
      whatsapp_provider_type: [
        "lovable_whatsapp",
        "meta_direct",
        "evolution",
        "uazapi",
        "oficial_meta",
        "wablast",
      ],
    },
  },
} as const
