# Mapa de extraccion de funciones de Vocalis a Capiversa

## Objetivo

Trasladar funciones utiles de Vocalis sin copiar su Supabase, sus credenciales ni
sus contratos internos. Cada funcion debe conservar el modelo multiempresa de
Capiversa y usar sus tablas, autenticacion y bandeja unificada.

Fuente inspeccionada:

- `C:/Users/User/Documents/Codex/2026-10-06/porf/work/crm-project`

Destino:

- `C:/Users/User/Documents/Codex/2026-10-06/porf/work/capiversa-v1.1`

## Hallazgo principal: Instagram ya existe parcialmente en Capiversa

Capiversa ya tiene el nucleo de Instagram Direct y Messenger:

| Responsabilidad | Archivo existente en Capiversa |
| --- | --- |
| OAuth de Meta | `src/lib/meta-oauth.server.ts` |
| Acciones OAuth autenticadas | `src/lib/meta-oauth.functions.ts` |
| Cliente Graph API | `src/lib/meta.server.ts` |
| Altas, bajas y salud del canal | `src/lib/meta.functions.ts` |
| Callback OAuth | `src/routes/api/public/meta-oauth.callback.ts` |
| Webhook Instagram/Messenger | `src/routes/api/public/meta-webhook.ts` |
| Dialogo de conexion | `src/components/conexao/meta-connect-dialog.tsx` |
| Selector de paginas/cuentas | `src/components/conexao/meta-oauth-handler.tsx` |
| Bandeja multicanal | `src/routes/app/conversas.tsx` |
| Pantalla de conexiones | `src/routes/app/conexao.tsx` |

No se debe sustituir este nucleo por el de Vocalis. Hay que completarlo y usar
Vocalis como referencia funcional y visual.

## Bloque IG-1: Instagram Direct basico

Alcance:

- conectar una cuenta profesional mediante Meta OAuth;
- recibir texto, imagen, video, audio y documentos;
- mostrar la conversacion en la bandeja unificada;
- responder desde Capiversa;
- identificar claramente el canal Instagram;
- desconectar y volver a conectar la cuenta;
- aplicar aislamiento por `company_id` e idempotencia del webhook.

Cambios exactos que necesita Capiversa:

1. Crear una migracion nueva para `meta_oauth_session`, indices, expiracion y
   politicas. El tipo generado contiene la tabla, pero la migracion reproducible
   de Capiversa v1.1 todavia no la crea.
2. Añadir a `.env.example`:
   - `META_APP_ID`
   - `META_APP_SECRET`
   - `META_APP_SECRET_INSTAGRAM`, si se usa un app separado
   - `META_LOGIN_CONFIG_ID`
   - `META_WEBHOOK_VERIFY_TOKEN`
3. Separar el flag de WhatsApp de los canales Meta. El flag
   `VITE_BETA_LOVABLE_WHATSAPP_ONLY` no debe ocultar Instagram.
4. Volver a registrar los cards de Instagram y Messenger en
   `src/routes/app/conexao.tsx`.
5. Mantener el envio y la recepcion en las tablas unificadas de Capiversa.
6. Hacer obligatoria la verificacion de firma del webhook fuera de desarrollo.
7. Unificar la version de Graph API usada por OAuth, envio, perfiles y webhook.

Archivos de Vocalis que sirven como referencia, no como copia directa:

- `src/pages/app/InstagramDMs.tsx`
- `src/components/instagram/IgMediaMessage.tsx`
- `src/components/instagram/IgLeadContextPanel.tsx`
- `src/components/instagram/DmTemplatePicker.tsx`
- `src/components/instagram/DmTemplatesManager.tsx`
- `supabase/functions/instagram-dm-webhook/index.ts`
- `supabase/functions/instagram-reply-dm/index.ts`
- `supabase/functions/instagram-backfill-profile-pics/index.ts`
- `supabase/functions/instagram-refresh-tokens/index.ts`

## Bloque IG-2: operacion avanzada de Direct

Funciones aprovechables de Vocalis:

- asignacion de responsable;
- etiquetas y notas;
- respuestas rapidas de DM;
- grabacion y envio de audio;
- adjuntos y vista previa;
- SLA y conversaciones sin leer;
- panel de contexto del lead;
- sugerencia de respuesta, conectada despues con Drael.

Tablas de Vocalis que deben mapearse, no copiarse:

- `ig_dm_conversations` -> `crm_cards` y estado de conversacion de Capiversa;
- `ig_dm_messages` -> `mensagens` y `message_media`;
- `ig_dm_templates` -> respuestas rapidas con campo de canal;
- `instagram_accounts` -> `whatsapp_instances` con provider
  `meta_instagram`.

## Bloque IG-3: automatizaciones Instagram

Funciones:

- palabra clave recibida por DM;
- comentario con palabra clave;
- cualquier comentario;
- respuesta a comentario y DM privada;
- respuestas a stories y menciones;
- esperas, condiciones, etiquetas y botones;
- limites diarios, horario, cooldown y registro de ejecucion;
- transferencia al atendente y apertura del lead en CRM.

Referencia principal en Vocalis:

- `src/pages/app/instagram/FlowBuilder.tsx`
- `src/pages/app/instagram/flow/`
- `src/components/instagram/AutomationLibraryDialog.tsx`
- `src/components/instagram/AutomationTrackingSheet.tsx`
- `supabase/functions/instagram-webhook/index.ts`
- `supabase/functions/instagram-comment-to-dm/index.ts`
- `supabase/functions/instagram-reply-comment/index.ts`
- `supabase/functions/ig-flow-resume-scheduled/index.ts`
- `supabase/functions/ig-dm-scheduled-worker/index.ts`

Estas funciones requieren tablas nuevas nativas de Capiversa para reglas,
pasos, ejecuciones, deduplicacion y cola. No deben depender de las tablas
ausentes del Supabase de Vocalis.

## Bloque IG-4: analitica y contenido

Funciones independientes del atendimento:

- metricas de cuenta y publicaciones;
- crecimiento de seguidores;
- biblioteca de publicaciones;
- calendario y programacion;
- borradores, carruseles y estudio de contenido;
- publicacion en Instagram;
- analisis de rendimiento.

Referencia en Vocalis:

- `src/pages/app/InstagramHub.tsx`
- `src/pages/app/instagram/AnalyticsTabs.tsx`
- `src/pages/app/instagram/studio/`
- `src/components/instagram/IntelligenceTab.tsx`
- `src/components/instagram/SnapshotPanel.tsx`
- `supabase/functions/instagram-sync-account-insights/index.ts`
- `supabase/functions/instagram-sync-media-insights/index.ts`
- `supabase/functions/content-publish/index.ts`
- `supabase/functions/ig-content-publish/index.ts`
- `supabase/functions/ig-content-scheduler/index.ts`

Este bloque debe entrar despues de validar Direct y automatizaciones. Tiene mas
tablas, jobs programados, permisos de Meta y consumo de IA.

## Otras funciones de Vocalis que vale la pena adaptar

| Prioridad | Modulo | Decision para Capiversa |
| --- | --- | --- |
| Alta | Meta Lead Ads | Adaptar al pipeline y contactos existentes |
| Alta | Flujos visuales | Unificar WhatsApp, Instagram y acciones de CRM |
| Alta | Banco de leads y leads de trafico | Integrar como vistas del CRM, sin duplicar contactos |
| Media | Google Calendar | Conectar con Agendamientos existente |
| Media | Email corporativo | Añadir como canal futuro en la bandeja unificada |
| Media | Link en Bio | Modulo separado que crea leads en Capiversa |
| Media | Agentes web | Reutilizar CRM, handoff e historial de conversaciones |
| Baja inicial | Meta Ads completo | Añadir despues de Lead Ads y analitica basica |
| Baja inicial | Estudio de contenido | Añadir despues de estabilizar los canales de atendimento |
| No migrar ahora | Facturacion y planes de Vocalis | Capiversa conservara su propio modelo |
| No migrar ahora | Dependencias BTZap | No forman parte del canal oficial actual |

## Orden de implementacion

1. IG-1: Direct dentro de Conversaciones.
2. Meta Lead Ads hacia el pipeline de Capiversa.
3. IG-2: herramientas de operacion del atendente.
4. IG-3: automatizaciones y constructor de flujos.
5. Google Calendar y Link en Bio.
6. IG-4: analitica, programacion y estudio de contenido.
7. Meta Ads avanzado.

## Criterio de extraccion

Para cada modulo se entregaran juntos:

- migracion SQL reproducible y RLS;
- contratos TypeScript;
- servicios server-only;
- endpoints o webhooks;
- componentes y ruta;
- variables documentadas en `.env.example`;
- estados vacio, cargando, error y desconectado;
- lista de permisos externos necesarios;
- prueba manual de aceptacion.

No se copiaran tokens, claves, URLs del Supabase original, datos de clientes ni
marcas de Vocalis.
