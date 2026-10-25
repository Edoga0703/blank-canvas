# 🚀 Capiconversa CRM (Capiversa) — v1.2.21

> **Plataforma Integral de Atención Omnicanal, CRM Kanban Inteligente y Auditoría de Ventas con IA.**

Capiconversa CRM centraliza la comunicación con clientes, la gestión de prospectos y la inteligencia de ventas en un solo lugar. Conecta canales de mensajería (WhatsApp oficial y multi-sesión, Instagram Direct, Facebook Messenger) con un pipeline de ventas dinámico potenciado por agentes de IA y herramientas para administradores.

---

## 🌟 Principales Módulos y Capacidades

### 1. Bandeja de Entrada Omnicanal Unificada
- **WhatsApp Oficial (WABA / Meta Cloud API)** y soporte para sesiones QR (D-API / Baileys).
- **Instagram Direct y Facebook Messenger** integrados con webhooks en tiempo real.
- Asignación manual o inteligente por departamento y cola de distribución.
- Soporte multimedia completo (imágenes, audios PTT, videos, documentos) con almacenamiento persistente en **Cloudflare R2** y proxy de streaming seguro.

### 2. CRM Kanban y Pipeline de Ventas
- **Embudos y Etapas Personalizables**: Configuración de etapas por tipo (`normal`, `ganho`, `perda`), colores y orden visual.
- **Ficha 360° del Lead**: Información detallada de contacto, canal de origen, tags, notas internas, tareas y formularios completados.
- **Modos de Atención por Etapa**: Configuración por columna en modo `auto` (asistente IA), `ia` o `manual` (humano).
- **Protección de Etapas Críticas**: Bloqueo contra movimientos automáticos de IA en etapas que requieren confirmación humana (por ejemplo, *Ganado*, *Perdido* o *Soporte*).

### 3. Auditor Comercial y Diagnóstico de Leads con IA
- **Auditoría Integral 360°**: Analiza cronológicamente la conversación, ficha del lead, catálogo de productos/servicios, estado de citas en Google Meet, compras previas y políticas comerciales.
- **Diagnóstico Estructurado**: Clasifica la intención del lead (`POSITIVA`, `NEGATIVA`, `NEUTRA`, `DUDOSA`), sugiere la etapa de destino óptima con justificación y detecta productos/valores monetarios involucrados.
- **Mover con 1 Clic**: Botón de confirmación directa en el diálogo de auditoría para trasladar al lead a la etapa recomendada registrando el evento en el historial.

### 4. Copilot del Embudo CRM (Sales Ops & Arquitectura)
- Asistente conversacional para administradores y jefes de ventas dentro del CRM.
- **Acciones Estructuradas Interactivas**:
  - `create_stage`: Crear nuevas etapas con nombre, color, tipo y criterio IA (con deduplicación inteligente).
  - `stage_criteria`: Ajustar los criterios de clasificación de la IA y el bloqueo humano.
  - `stage_automation`: Cambiar el modo de atención (`auto`, `ia`, `manual`).
  - `pipeline_prompt`: Actualizar el Prompt Maestro del embudo en el agente comercial.
  - `move_lead`: Mover leads entre etapas.
  - `rename_stage`: Renombrar etapas existentes.
  - `delete_stage`: Eliminar etapas de forma segura reubicando sus leads a la primera columna.
- **Control y Confirmación Explícita**: El Copilot presenta cada acción en tarjetas interactivas. El usuario decide aplicar cada propuesta individualmente o en lote mediante el botón **"⚡ Aplicar todas las acciones pendientes"**. Ningún cambio se aplica sin el clic del usuario.

### 5. Catálogo Comercial y Agendamiento
- Catálogo de productos y servicios con categorías, precios, SKUs y opciones agendables.
- Integración de citas y videollamadas con **Google Calendar** y **Google Meet**.

### 6. Formularios de Captura & Landing Pages
- Constructor de formularios web personalizados para captura de prospectos.
- Ingesta automática directa al embudo CRM con respuestas guardadas en la ficha del lead.

---

## 🛠️ Arquitectura Técnica

- **Frontend & Routing**: TanStack Start / TanStack Router (React 19) sobre Vinxi.
- **Estilos & UI**: Tailwind CSS v4, Lucide React, Radix UI.
- **Backend & Server Functions**: TanStack Start Server Functions ejecutadas sobre Nitro Server.
- **Base de Datos & Auth**: Supabase PostgreSQL 15 con Row Level Security (RLS) y suscripciones Realtime.
- **Almacenamiento Multimedia**: Cloudflare R2 (S3 API compatible) con URLs firmadas y streaming proxy.
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
   # o: npm install
   ```

4. Iniciar servidor de desarrollo:
   ```sh
   bun run dev
   # o: npm run dev
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
│   ├── components/            # Componentes UI (CRM, chat, agenda, diálogos)
│   │   ├── crm/               # CRM Kanban, lead drawer, auditor IA, copilot sheet
│   │   ├── chat/              # Bandeja omnicanal, mensajes, audio recorder
│   │   └── ui/                # Primitivos de diseño Radix/Tailwind
│   ├── lib/                   # Lógica central del sistema
│   │   ├── crm-copilot.*      # Funciones y servidor del Copilot del CRM
│   │   ├── crm-lead-analyzer* # Motor de auditoría y diagnóstico IA de leads
│   │   ├── crm-lead-context*  # Recopilación de contexto 360° del lead (13 fuentes)
│   │   ├── crm-stage-meta.ts  # Parseo y serialización de metadatos de etapas
│   │   ├── messaging/         # Adaptadores y contratos de mensajería (WhatsApp, IG, FB)
│   │   └── storage/           # Almacenamiento en Cloudflare R2
│   ├── routes/                # Rutas y páginas de la aplicación TanStack Start
│   │   ├── app/crm.tsx        # Página principal del CRM Kanban
│   │   ├── app/conversas.tsx  # Bandeja de mensajería
│   │   └── api/public/        # Webhooks para WhatsApp, Meta e ingesta de leads
├── docs/                      # Documentación técnica y diagramas de arquitectura
├── supabase/migrations/       # Migraciones SQL y RLS de PostgreSQL
├── package.json
└── README.md
```

---

## 📄 Historial de Versiones

- **v1.2.21** (Versión actual):
  - Solución al parámetro `stageId` en el movimiento directo de leads desde el diálogo de auditoría IA.
  - Eliminación de auto-ejecuciones no confirmadas en el Copilot del embudo; confirmación explícita mediante botones individuales y "⚡ Aplicar todas las acciones pendientes".
  - Soporte completo para 7 acciones del Copilot: creación, ajuste de criterios, automatización, prompt maestro, renombrado, eliminación y movimiento de leads.
  - Actualización integral de documentación y preparación del release.
- **v1.2.20**: Auditoría exhaustiva de las 13 fuentes de datos del lead y eliminación de referencias a columnas inexistentes (`ultimo_analise_ia_em`, `prospeccao_lead`, `campaign_target`). Configuración de las 9 etapas de streaming en el CRM.
- **v1.2.06 - v1.2.19**: Evolución del CRM Kanban, multiagentes, WhatsApp D-API y almacenamiento multimedia en R2.
