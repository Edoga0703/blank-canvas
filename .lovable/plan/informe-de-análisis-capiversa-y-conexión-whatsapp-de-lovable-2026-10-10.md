# Informe de análisis — Capiversa y conexión WhatsApp de Lovable

Solo análisis. No se modificó ningún archivo. Las severidades se basan en el código leído; los puntos marcados "sin confirmar" requieren revisar datos reales.

## Resumen

La base está bien orientada: receptor cerrado por defecto (responde 503 mientras no haya vínculo), contrato de mensajería único, idempotencia por evento y por mensaje, multimedia hacia R2 con enlaces firmados. Pero hay fallas en el flujo de ingestión que harían **perder mensajes de forma silenciosa** en cuanto la conexión esté activa. Conviene corregirlas antes de vincular el número.

## 1. Arquitectura y consistencia

| # | Hallazgo | Severidad |
|---|---|---|
| A1 | Conviven dos generaciones de código: Capiversa v1.1 (`src/lib/messaging/*`) y el CRM heredado Metrix (Evolution, Uazapi, WaBlast, Meta, `whatsapp-webhook.ts`, `wa-dispatch.server.ts` con ramas por proveedor). Hay dos caminos de entrada y de envío para WhatsApp. | Alta |
| A2 | Restos de marca e infraestructura heredada: `SITE_URL = metrixcrm.com.br` en la portada, recursos `metrix-*`, planes y docs de Metrix, manifiesto MCP con `project-ref-unset`. | Media |
| A3 | Uso generalizado de `supabaseAdmin as any`: se pierde la verificación de tipos justo en las tablas nuevas (`messaging_inbox_events`, `message_attachments`, `message_status_events`). | Media |
| A4 | `ingest.server.ts` importa el cliente administrativo en la parte superior. Correcto porque es `.server.ts`, pero no debe ser importado nunca desde un módulo `.functions.ts` o de ruta. | Baja |
| A5 | El proyecto usa un Supabase propio (no Lovable Cloud). Las migraciones v1.1 deben aplicarse manualmente; no hay constancia en el repositorio de que estén aplicadas (sin confirmar). | Media |

## 2. Compatibilidad con WhatsApp de Lovable

| # | Hallazgo | Severidad |
|---|---|---|
| C1 | Las seis funciones del puente (`generatedVerifyAndParseWebhook`, `SendText`, `SendMedia`, `SendTemplate`, `NormalizeEvent`, `DownloadMedia`) son esqueletos que lanzan `NotLinkedError`. Comportamiento correcto hoy (cerrado), pero nada está probado con eventos reales. | Informativo |
| C2 | El contrato asume que el conector entrega un ID de evento estable y un ID de conexión. Si el conector agrupa varios mensajes en un evento o no expone ID de conexión, la resolución cae al "único registro" (ver F3). | Media |
| C3 | `sendMedia` recibe `mediaUrl`; el conector puede exigir subida previa o ID de multimedia en vez de URL. Las URL firmadas de R2 caducan (900 s) y un reintento tardío fallaría. | Media |
| C4 | `node:crypto` (`createHash`) en el receptor: funciona en Workers con compatibilidad Node, pero conviene confirmarlo en el sitio publicado. | Baja |
| C5 | Ventana de 24 h de WhatsApp: no se observa control previo al envío de texto libre ni elección automática de plantilla fuera de ventana. | Media |

## 3. Flujo de eventos entrantes y salientes

```text
Lovable -> /api/public/lovable-whatsapp -> verificar firma -> ingestMessagingEvent
  -> resolver conexión -> insertar evento crudo (único) -> normalizar
  -> descargar multimedia -> R2 -> guardar mensajes/estados -> marcar procesado
CRM -> wa-dispatch -> proveedor lovable_whatsapp -> conector
cola de reintentos -> process-retry-queue -> wa-dispatch
```

| # | Hallazgo | Severidad |
|---|---|---|
| F1 | **Pérdida de eventos en reintento.** El evento crudo se inserta antes de procesar. Si el procesamiento falla (R2 caído, descarga lenta, error de base), queda `failed` y responde 500. Cuando Lovable reintenta, el insert choca con la clave única y se responde `ok, duplicate` sin reprocesar. El mensaje nunca llega al CRM. | Crítica |
| F2 | **Filtro construido con texto del proveedor.** `resolveConnection` arma `.or("external_connection_id.eq.X,instance_name.eq.X")` interpolando el ID recibido. Comas, paréntesis o puntos alteran el filtro. | Alta |
| F3 | Si el ID no coincide y existe un único registro `lovable_whatsapp`, se asigna a ese registro. En la beta es útil, pero con un segundo número o empresa enviaría mensajes a la empresa equivocada o fallaría. | Media |
| F4 | Estados que llegan antes que el mensaje (carrera habitual) se guardan con `mensagem_id` nulo y nunca se reenlazan. | Media |
| F5 | Los estados pueden llegar desordenados; un "entregado" tardío sobrescribe un "leído". No hay regla de solo avanzar. | Media |
| F6 | `persistStatus` ignora los errores de sus escrituras. | Media |
| F7 | La ingestión solo escribe en `mensagens`. No se observa en este flujo la creación o actualización de conversación, lead, contador de no leídos, disparo del agente de IA ni automatizaciones que sí hace el webhook heredado (sin confirmar en detalle). | Alta |
| F8 | Eco de mensajes enviados por Capiversa: la deduplicación depende de que `wa-dispatch` guarde exactamente el mismo `whatsapp_message_id` y `provider`. Si guarda otro valor, aparecerán mensajes duplicados en la bandeja. | Media |
| F9 | `midia_url` guarda `storageUrl`; la documentación dice que no se guardan URL temporales. Debe verificarse que `storeMediaObject` devuelva nulo o una URL permanente, nunca firmada. | Baja |
| F10 | Cada evento marca la instancia como `connected`; no hay registro de desconexión ni de errores de conector. | Baja |

## 4. Cuellos de botella y riesgos antes de activar

| # | Riesgo | Severidad |
|---|---|---|
| R1 | Todo el trabajo (descarga de multimedia, subida a R2, varias escrituras) ocurre dentro de la petición del webhook. Un video grande puede superar el tiempo del proveedor, provocar reintento y, con F1, pérdida. | Alta |
| R2 | Sin límite de tasa en el receptor ni en los demás webhooks públicos. | Media |
| R3 | No hay un proceso que reintente eventos `failed` de `messaging_inbox_events`. | Alta |
| R4 | La tabla `mensagens` ya tenía muchas lecturas sin índice (auditoría anterior). Se añade `raw_payload` por mensaje, lo que aumenta el tamaño rápidamente. | Media |
| R5 | No hay alerta cuando el receptor responde 4xx/5xx en serie ni panel de eventos fallidos. | Media |
| R6 | Proveedores heredados siguen activos en el código; un ajuste incorrecto de `VITE_BETA_LOVABLE_WHATSAPP_ONLY` reabre caminos antiguos. | Baja |

## Recomendaciones preventivas (orden sugerido)

1. Hacer la ingestión reprocesable: ante un evento duplicado en estado `failed` o `received`, volver a procesarlo en lugar de responder `duplicate`.
2. Separar recepción y procesamiento: guardar el evento, responder 200 y procesar (incluida la multimedia) en una tarea programada con reintentos y límite de intentos.
3. Reemplazar el filtro interpolado por dos consultas `.eq()` separadas.
4. Restringir el respaldo de "único registro" a la beta y registrar una advertencia cuando se use.
5. Enlazar estados huérfanos al guardar el mensaje y aplicar orden de estados (solo avanzar).
6. Conectar la ingestión con conversación, lead, no leídos, IA y automatizaciones reutilizando la lógica del webhook heredado.
7. Confirmar con el conector real: forma del evento, ID de conexión, envío de multimedia por URL o por subida, y control de ventana de 24 h.
8. Añadir límite de tasa, alerta de errores en serie y un panel de eventos fallidos.
9. Verificar que las migraciones v1.1 estén aplicadas y generar tipos para eliminar los `as any`.
10. Probar con un número beta: texto, imagen, audio, documento, plantilla y los cuatro estados, incluido un reintento forzado.

## Detalles técnicos

- Archivos clave: `src/routes/api/public/lovable-whatsapp.ts`, `src/lib/messaging/ingest.server.ts`, `src/lib/messaging/lovable-whatsapp.generated.server.ts`, `src/lib/messaging/media-archive.server.ts`, `src/lib/wa-dispatch.server.ts`, `src/routes/api/public/hooks/process-retry-queue.ts`, `supabase/migrations/20261009030000_capiversa_v1_1_core.sql`.
- F1: `ingestMessagingEvent` devuelve `{duplicate: true}` ante el código `23505` sin revisar el `status` de la fila existente.
- F2: `query.or(\`external_connection_id.eq.${id},instance_name.eq.${id}\`)`.
- Unicidades presentes: `messaging_inbox_events(provider, external_event_id)`, `mensagens(company_id, provider, whatsapp_message_id)`, `message_status_events(company_id, external_message_id, status, occurred_at)`.
