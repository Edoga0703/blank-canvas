# 🚀 Capiconversa CRM (Capiversa) — v1.3.01

> **Plataforma Integral de Atención Omnicanal, CRM Kanban Inteligente, Auditoría de Ventas con IA, Reanálisis Masivo con Control de Privacidad y Atribución Meta Ads (Conversions API).**

Capiconversa CRM centraliza la comunicación con clientes, la gestión de prospectos y la inteligencia de ventas en un solo lugar. Conecta canales de mensajería (WhatsApp oficial WABA Cloud API y multi-sesión QR dapi, Instagram Direct, Facebook Messenger) con un pipeline de ventas dinámico potenciado por agentes de IA, retroalimentación a Meta Ads vía Conversions API (CAPI) online y offline, y herramientas operativas para administradores.

---

## 🌟 Principales Módulos y Capacidades

### 1. Bandeja de Entrada Omnicanal Unificada
- **WhatsApp Oficial (WABA / Meta Cloud API)** y soporte para sesiones QR (D-API / Baileys).
- **Instagram Direct y Facebook Messenger** integrados con webhooks en tiempo real.
- Asignación manual o inteligente por departamento y cola de distribución.
- Soporte multimedia completo (imágenes, audios PTT Opus/OGG, videos, documentos) con almacenamiento persistente en **Cloudflare R2** y proxy de streaming seguro (`/api/public/chat-media`).

### 2. CRM Kanban y Pipeline de Ventas
- **Embudos y Etapas Personalizables**: Configuración de etapas por tipo (`normal`, `ganho`, `perda`), colores y orden visual.
- **Ficha 360° del Lead**: Información detallada de contacto, canal de origen, tags, notas internas, tareas y formularios completados.
- **Modos de Atención por Etapa**: Configuración por columna en modo `auto` (asistente IA), `ia` o `manual` (humano).
- **Protección de Etapas Críticas**: Bloqueo contra movimientos automáticos de IA en etapas que requieren confirmación humana (`bloqueada_para_ia: true` en etapas como *Atención humana* o *Ganado*).

### 3. Reanálisis Masivo con IA & Tracking Offline Meta CAPI (Nuevo en v1.3.01)
- **Alcance Dual Flexible**:
  - **"Todo el Embudo"**: Audita masivamente todas las etapas del pipeline activo de forma secuencial.
  - **"Una Sola Etapa"**: Selector desplegable con todas las etapas, color identificador y conteo de leads en vivo para auditar únicamente la columna deseada (accesible también desde el menú de 3 puntos de cada columna en el Kanban).
- **Controles Granulares de Privacidad hacia Meta Ads**:
  - **Nombres de Catálogo (`content_name`)**: Desactivado por defecto. Si está apagado, Meta nunca sabrá qué producto o ítem comercial cotizó o compró el lead; los campos `content_name`, `contents`, `content_type` y `content_category` son expurgados absolutamente del payload.
  - **Valores Monetarios (`value` y USD)**: Switch para decidir si enviar el valor monetario a Meta para optimización por ROAS o suprimirlo para proteger la facturación.
  - **Nombres de Clientes (`fn` y `ln`)**: Switch para incluir nombres cifrados en SHA-256 o hacer el match estrictamente por teléfono (`ph`).
  - **Filtro de Eventos**: Selección de eventos autorizados (`Purchase`, `QualifiedLead`, `Lead`).
  - **Visor interactivo en vivo**: Vista previa del JSON exacto que recibirá Meta antes de iniciar el proceso.
- **Motor de Procesamiento Resiliente**:
  - Procesamiento concurrente en bloques (pool de 4 llamadas simultáneas) para no saturar APIs ni cuotas de IA.
  - Botones de **Pausar**, **Continuar** y **Detener** en tiempo real.
  - Barra de progreso porcentual, métricas en vivo (*Analizados*, *Movidos*, *Meta CAPI*, *Ganados/Activos*) y registro visual de los últimos movimientos realizados.

### 4. Copilot del Embudo CRM y Tipografía Enriquecida (Mejorado en v1.3.01)
- Asistente conversacional de Sales Operations para administradores dentro del CRM.
- **Renderizado de Markdown Enriquecido**: Interpretación completa de títulos (`###`), negritas (`**` y `*`), listas ordenadas y viñetas (`-`, `1.`), separadores (`--`, `---`), citas tipo callout (`>`), y soporte para combinaciones complejas como triple asterisco (`***`).
- **Acciones Estructuradas Interactivas**:
  - `create_stage`: Crear nuevas etapas con nombre, color, tipo y criterio IA.
  - `stage_criteria`: Ajustar los criterios de clasificación de la IA y el bloqueo humano.
  - `stage_automation`: Cambiar el modo de atención (`auto`, `ia`, `manual`).
  - `pipeline_prompt`: Actualizar el Prompt Maestro del embudo en el agente comercial.
  - `move_lead`: Mover leads entre etapas.
  - `rename_stage`: Renombrar etapas existentes.
  - `delete_stage`: Eliminar etapas de forma segura reubicando sus leads a la primera columna.
- **Confirmación Explícita**: El usuario aplica cada propuesta individualmente o en lote mediante el botón **"⚡ Aplicar todas las acciones pendientes"**.

### 5. Auditor Comercial y Diagnóstico 360° de Leads con IA
- **Auditoría Integral 360°**: Analiza cronológicamente la conversación, ficha del lead, catálogo de productos/servicios, estado de citas en Google Meet, compras previas y políticas comerciales.
- **Diagnóstico Estructurado**: Clasifica la intención del lead (`POSITIVA`, `NEGATIVA`, `NEUTRA`, `DUDOSA`), sugiere la etapa de destino óptima con justificación y detecta productos/valores monetarios involucrados.
- **Auditoría Automática en Segundo Plano**: Disparo reactivo en cada mensaje entrante para mantener calificado el embudo sin intervención manual.

### 6. Atribución Avanzada de Anuncios y Meta Conversions API (CAPI)
- **Rastreo Automático Click-to-WhatsApp (CTWA)**: Ingesta y persistencia de `ctwa_clid`, `fbclid`, `gclid`, UTMs (`source`, `medium`, `campaign`, `term`, `content`) y códigos de protocolo en enlaces cortos.
- **Extracción de Contexto de Anuncio de Meta**: Captura del titular, copy, identificador de anuncio (`ad_id`) y miniatura del anuncio que originó la conversación.
- **Motor Dual Conversions API (Graph API v25.0)**:
  - **WABA Oficial / Cloud API**: Envío de conversiones bajo `action_source: "business_messaging"` y `messaging_channel: "whatsapp"`.
  - **Instancias QR (D-API) y Web**: Envío bajo `action_source: "website"` o `"system_generated"` con Hashing seguro SHA-256 de teléfono, email, nombre y UF brasileño.
- **Disparos Automáticos por Etapa**: Configuración de eventos Meta (`LeadSubmitted`, `QualifiedLead`, `ViewContent`, `AddToCart`, `InitiateCheckout`, `AppointmentBooked`, `Purchase`) por columna.
- **Centro de Control CAPI**: Panel dedicado en **Configurações → Integrações → Meta Ads & CAPI** con prueba de conexión, inspección de FBTrace ID y tabla de auditoría de eventos enviados.

### 7. Catálogo Comercial, Citas y Formularios
- Catálogo de productos y servicios con categorías, precios, SKUs y opciones agendables.
- Integración de citas y videollamadas con **Google Calendar** y **Google Meet**.
- Constructor de formularios web personalizados para captura de prospectos con ingesta automática directa al embudo CRM.

---

## 🛠️ Arquitectura Técnica

- **Frontend & Routing**: TanStack Start / TanStack Router (React 19) sobre Vinxi.
- **Estilos & UI**: Tailwind CSS v4, Lucide React, Radix UI.
- **Backend & Server Functions**: TanStack Start Server Functions ejecutadas sobre Nitro Server.
- **Base de Datos & Auth**: Supabase PostgreSQL 15 con Row Level Security (RLS) y suscripciones Realtime.
- **Almacenamiento Multimedia**: Cloudflare R2 (S3 API compatible) con credenciales de producción estáticas de respaldo y compatibilidad con `define` en Vite / Nitro.
- **Modelos de Inteligencia Artificial**: Integración con Google Gemini (Gemini 2.5 Flash / Pro), OpenAI y Claude mediante adaptadores de servidor.

---

## 💻 Desarrollo Local

### Requisitos
- Node.js 20+ o [Bun](https://bun.sh/) 1.1+
- Proyecto Supabase con esquema de base de datos migrado.

### Pasos
1. Clonar el repositorio:
   ```sh
   git clone https://github.com/Edoga0703/blank-canvas.git
   cd blank-canvas
   ```

2. Configurar variables de entorno:
   ```sh
   cp .env.example .env.local
   ```
   Completar las credenciales de Supabase (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`), Cloudflare R2 y APIs de mensajería.

3. Instalar dependencias:
   ```sh
   bun install
   ```

4. Iniciar servidor de desarrollo:
   ```sh
   bun run dev
   ```

5. Compilar para producción:
   ```sh
   bun run build
   ```

---

## 📁 Estructura del Proyecto

```
blank-canvas/
├── src/
│   ├── components/            # Componentes UI (CRM, chat, agenda, diálogos, integraciones)
│   │   ├── crm/               # CRM Kanban, crm-bulk-analyzer-dialog, copilot sheet, lead drawer
│   │   ├── chat/              # Bandeja omnicanal, formatted-message-text, audio recorder
│   │   ├── config/            # Configuraciones, integraciones y meta-capi-card
│   │   └── ui/                # Primitivos de diseño Radix/Tailwind
│   ├── lib/                   # Lógica central del sistema
│   │   ├── meta-capi.*        # Motor dual CAPI (Business Messaging y Pixel), tracking offline
│   │   ├── tracking-utils.ts  # Extracción de CTWA, UTMs, referral y click-IDs
│   │   ├── crm-copilot.*      # Funciones y servidor del Copilot del CRM
│   │   ├── crm-lead-analyzer* # Motor de auditoría y bulk reanalysis con IA
│   │   ├── crm-lead-context*  # Recopilación de contexto 360° del lead (13 fuentes)
│   │   ├── crm-stage-meta.ts  # Parseo y empaquetado de metadatos de etapas (criterios + CAPI)
│   │   ├── messaging/         # Adaptadores y contratos de mensajería (WhatsApp, IG, FB)
│   │   └── storage/           # Almacenamiento en Cloudflare R2 con credenciales estáticas
│   ├── routes/                # Rutas y páginas de la aplicación TanStack Start
│   │   ├── app/crm.tsx        # Página principal del CRM Kanban, toolbar y diálogos
│   │   ├── app/conversas.tsx  # Bandeja de mensajería
│   │   └── api/public/        # Webhooks para WhatsApp, Meta e ingesta de leads
│   ├── integrations/          # Clientes Supabase browser y server-admin
├── supabase/migrations/       # Migraciones SQL y RLS (incluye meta_capi_business_messaging.sql)
├── package.json
└── README.md
```

---

## 📄 Historial de Versiones

- **v1.3.01** (Versión actual):
  - **Reanálisis Masivo IA & Meta CAPI Offline Tracking**:
    - Diálogo interactivo `CrmBulkAnalyzerDialog` con selección de alcance: "Todo el Embudo" vs "Una Sola Etapa" (con selector desplegable y conteo en vivo de leads).
    - Acceso directo por columna desde el menú contextual (`Re-analizar columna ({count})`).
    - Controles de privacidad granular hacia Meta CAPI: exclusión de nombres de productos (`content_name` apagado por defecto), montos monetarios (`value`) y nombres de clientes (`fn`/`ln`).
    - Visor interactivo en vivo del payload JSON antes del envío.
    - Controles de ejecución: Pausar, Continuar y Detener en caliente con registro de eventos y métricas en tiempo real.
  - **Motor Tipográfico Enriquecido Markdown**:
    - Integración de `FormattedMessageText` en `crm-copilot-sheet.tsx`, `lead-ai-analyzer-dialog.tsx` y `lead-drawer.tsx`.
    - Eliminación de signos crudos (`**`, `###`, `-**`, `--`, `***`) en las respuestas de la IA.
    - Subtítulos semánticos, negritas reales, viñetas redondeadas, líneas divisorias y tarjetas de cita elegantes.
    - System Prompt del Copilot afinado con directrices explícitas de estilo comercial.
  - **Resiliencia Cloudflare R2 y Variables de Servidor**:
    - Corrección de `R2_ACCOUNT_ID` y credenciales de Cloudflare R2 mediante fallbacks estáticos en `r2.server.ts` y acceso directo compatible con Vite `define`.
    - Fallbacks estáticos robustos para `MEDIA_SIGNING_SECRET`, `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `DAPI_API_KEY` y `APP_USER_CONNECTION_KEY_SECRET`.
  - **Verificación en Vivo del Analista IA de Leads**:
    - Confirmación de transiciones automáticas en base de datos (`lead_evento`) activadas por mensajes entrantes.
- **v1.2.26**:
  - Corrección de visibilidad de scrollbars en Kanban y bandeja de entrada en resoluciones intermedias.
  - Optimización de suscripciones Realtime en PostgreSQL para evitar desconexiones intermitentes.
- **v1.2.25**:
  - Refinamiento de filtros por origen de lead (`whatsapp_direto`, `ads_meta`, `ads_google`, `organico`).
- **v1.2.24**:
  - Mejoras en la régua de automatización inmediata por cambio de etapa.
- **v1.2.23**:
  - Optimización de carga inicial del CRM mediante caché instantáneo de tenant.
- **v1.2.22**:
  - Integración Completa con Meta Conversions API (CAPI) para WABA Cloud API y Píxel Web / QR con Hashing SHA-256.
  - Rastreo automático de anuncios (`ctwa_clid`, `fbclid`, UTMs).
