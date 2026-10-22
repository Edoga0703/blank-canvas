# Proveedores heredados — estacionamiento (Evolution / Uazapi / WaBlast)

Lugar único documentado de los proveedores no oficiales, conservados para el
futuro SaaS. La beta en Lovable usa únicamente `lovable_whatsapp`.

Estado actual: **estacionados**. No se trabajan hasta que decidamos conectarlos.
Mantenerlos vivos y visibles aquí; no refactorearlos de paso en otras tareas.

## Cómo quedan hoy

- Ocultos en Conexiones por `VITE_BETA_LOVABLE_WHATSAPP_ONLY=true`
  (`src/config/beta.ts`). El canal lovable_whatsapp siempre visible.
- NO registrados en `src/lib/messaging/provider-registry.server.ts`: el envío
  va por el camino legado de `src/lib/wa-dispatch.server.ts` y la recepción por
  sus propios webhooks (no pasan por `ingestMessagingEvent`).
- Sus rutas webhook públicas siguen activas y funcionando.
- Los IDs `evolution | uazapi | wablast` ya existen en
  `src/lib/messaging/contracts.ts` para cuando se registren.

## Mapa de archivos

### Evolution API
| Archivo | Rol |
|---|---|
| `src/lib/evolution-raw.server.ts` | Cliente HTTP crudo de Evolution API |
| `src/lib/evolution.server.ts` | Wrapper histórico `evoXxx`; rotea dinámicamente evolution↔uazapi según `whatsapp_instances.provider` |
| `src/lib/evolution-helpers.ts` | Helpers (p.ej. instancia por contacto) |
| `src/lib/evolution.functions.ts` | Funciones del cliente (crear instancia, QR, estado) |
| `src/routes/api/public/whatsapp-webhook.ts` | Webhook Evolution (WAMessage); Uazapi reenvía aquí |
| `src/routes/app/conexao.tsx` | Canal "WhatsApp Web" (oculto en beta) |

### Uazapi
| Archivo | Rol |
|---|---|
| `src/lib/uazapi.server.ts` | Cliente de API (texto, media, QR, webhook, estado, reactions…) |
| `src/lib/uazapi-webhook.server.ts` | Normalización de payloads Uazapi |
| `src/lib/uazapi-test.functions.ts` | Prueba de conexión |
| `src/lib/reconfigure-uazapi.functions.ts` | Reconfiguración (webhook, etc.) |
| `src/routes/api/public/uazapi-webhook.ts` | Ruta pública que normaliza y reenvía al webhook de Evolution |

### WaBlast
| Archivo | Rol |
|---|---|
| `src/lib/wablast.server.ts` | Cliente Cloud API (WABA) + verificación de firma de webhook |
| `src/lib/wablast.functions.ts` | Onboarding (`startWablastOnboarding`) |
| `src/routes/api/public/wablast-webhook.ts` | Webhook público con firma |

### Despacho compartido
- `src/lib/wa-dispatch.server.ts`: despacha por proveedor de la instancia activa
  (`evolution | uazapi | wablast | meta_instagram | meta_messenger |
  lovable_whatsapp`). Único punto de ramificación de envío.
- Tokens por instancia en `whatsapp_instances.instance_token`; no hay env
  globales de proveedor que revisar salvo los de cada cuenta (verificar antes
  de reactivar).

## Checklist para reconectar uno (futuro)

1. Registrar adaptador que implemente `MessagingProvider` (capa fina sobre
   `evolution.server.ts` / `uazapi.server.ts` / `wablast.server.ts`) en
   `provider-registry.server.ts`.
2. Rendir su webhook hacia `ingestMessagingEvent` para heredar idempotencia,
   reintentos y archivo R2 de multimedia.
3. Desocultar canal: `VITE_BETA_LOVABLE_WHATSAPP_ONLY=false` (+ plugin por
   empresa si aplica).
4. Verificar env del proveedor en el entorno objetivo y probar QR/conexión con
   un número de prueba.
5. Actualizar este documento (estado + fecha).

## Regla mientras estén estacionados

- No borrar ni renombrar estos archivos ni rutas en tareas de Lovable/Gemini.
- Si una refactorización los rompe, es daño colateral: restaurar, no mejorar.
- El código nuevo no debe crear dependencias directas sobre estas lib; los
  envíos nuevos pasan por `wa-dispatch.server.ts` o el contrato `messaging/`.
