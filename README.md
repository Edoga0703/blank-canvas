# Capiversa CRM v1.1

Base de trabajo para el CRM interno de CuentasTuPana.

Capiversa v1.1 parte del código de Capi Conversa y lo adapta para:

- WhatsApp Business oficial mediante el conector de Lovable.
- Atención humana multiusuario.
- CRM Kanban conectado a las conversaciones.
- Integración posterior con Drael.
- Multimedia persistida en Cloudflare R2.
- Base de datos propia y reproducible.
- Evolución futura hacia un SaaS multiempresa.

## Estado actual

El repositorio contiene la fundación de v1.1:

- Marca y versión propias.
- Feature flag para mostrar solamente WhatsApp oficial de Lovable durante la beta.
- Contrato neutral de mensajería.
- Adaptador reservado para el código generado por Lovable.
- Entrada idempotente de eventos.
- Migración SQL inicial con RLS.
- Proveedores heredados conservados para uso futuro.

El conector todavía debe vincularse desde Lovable. Hasta que Lovable genere sus
funciones reales, el puente de envío falla de forma explícita para impedir que
un mensaje parezca enviado cuando no lo fue.

## Configuración local

1. Copiar `.env.example` como `.env.local`.
2. Crear un Supabase propio.
3. Aplicar las migraciones de `supabase/migrations`.
4. Configurar las variables públicas y secretos del backend.
5. Instalar dependencias y ejecutar el proyecto.

```sh
npm install
npm run dev
```

## Integración con Lovable

La aplicación usa TanStack Start y cumple el requisito de arquitectura del
conector actual de WhatsApp Business de Lovable.

Después de importar o vincular el repositorio a Lovable:

1. Abrir Connectors.
2. Conectar WhatsApp Business mediante el flujo de Meta.
3. Vincular la conexión a este proyecto.
4. Generar el receptor de mensajes y estados.
5. Generar las acciones de texto, multimedia y plantillas.
6. Integrar esas funciones únicamente en
   `src/lib/messaging/lovable-whatsapp.generated.server.ts`.

Consultar `docs/LOVABLE_WHATSAPP_HANDOFF.md` antes de generar la integración.

## Documentación

- `docs/CAPIVERSA_V1_1.md`: alcance y estado técnico.
- `docs/LOVABLE_WHATSAPP_HANDOFF.md`: contrato para la generación en Lovable.
- `supabase/migrations`: esquema reproducible de la base.

## Proveedores heredados

Evolution, Uazapi y WaBlast permanecen en el código para una futura edición
SaaS. Durante la beta están ocultos mediante
`VITE_BETA_LOVABLE_WHATSAPP_ONLY=true`.
