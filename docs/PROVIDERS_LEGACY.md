# Proveedores activos y registro histórico (D-API / Meta / Telegram vs. Evolution / Uazapi / WaBlast)

Registro de arquitectura de canales de mensajería de **Capiconversa**.

## Estado actual de mensajería en `src/`

- **Canales activos:**
  - **WhatsApp:** exclusivamente **D-API** (`dapi` para WhatsApp Web QR / Pairing y `dapi_official` para Cloud API oficial de Meta), registrado en `src/lib/messaging/provider-registry.server.ts` y despachado en `src/lib/wa-dispatch.server.ts`.
  - **Instagram Direct & Facebook Messenger:** **Meta Graph API** (`meta_instagram`, `meta_messenger`).
  - **Telegram:** **Telegram Bot API** y gateway sidecar MTProto (`services/telegram-gateway`).
- **Proveedores heredados removidos (`evolution`, `uazapi`, `wablast`):**
  - Sus clientes, webhooks y funciones cliente ya fueron **eliminados de `src/`** y no están registrados en `provider-registry.server.ts`.
  - Se conserva únicamente la compatibilidad de enum histórico / valores existentes en la tabla `whatsapp_instances` en PostgreSQL para no romper registros históricos ni migraciones ya aplicadas.

## Regla de evolución

- Todo envío nuevo debe pasar por `src/lib/wa-dispatch.server.ts` o el contrato unificado `src/lib/messaging/contracts.ts` (`MessagingProvider`).
- Antes de reintroducir cualquier conector adicional, implementar `MessagingProvider` en `src/lib/messaging/providers/` y registrarlo explícitamente en `provider-registry.server.ts`.
