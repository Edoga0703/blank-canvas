# Diagnóstico: Instagram Direct no entra en /app/conversas

Análisis de código únicamente. No se consultaron filas reales de la base ni la configuración del panel de Meta, así que las causas de configuración están marcadas como "a confirmar".

## Cómo funciona hoy (resumen)

```text
Meta ──webhook──> /api/public/meta-webhook
  object="instagram" -> canal instagram; busca whatsapp_instances por phone_number_id = recipient.id (ID de IG)
  -> mensagens (provider=meta_instagram) -> crm_cards (canal_chat=instagram)
Respaldo: meta-sync (cron) -> /{pageId}/conversations?platform=instagram con el token de la Página
Bandeja: tab Instagram cuenta tarjetas con canal_chat=instagram o último mensaje provider=meta_instagram
```

La bandeja **no** tiene un filtro que oculte Instagram: si existiera una sola fila `mensagens.provider = meta_instagram` o un `crm_cards.canal_chat = instagram`, el contador mostraría más de 0. El contador en (0) significa que **nunca se guardó ningún mensaje de Instagram**. El problema está antes de la bandeja.

## Hallazgos

### 1. Crítico — La cuenta de Instagram nunca se suscribe a los avisos (código)
En la conexión por Facebook Login (`meta-oauth.functions.ts`, línea ~170) solo se llama `metaSubscribePage(pageToken, pageId)` con los campos de **Página** (Messenger). No hay suscripción para Instagram.
En la otra ruta (`meta.functions.ts`, línea ~113) con `instagram: true` se llama `/me/subscribed_apps` con campos `comments,mentions` usando un **token de Página**: esos campos no existen para una Página y Meta rechaza la llamada; el error se ignora en silencio.
Resultado: Messenger recibe avisos, Instagram no.

### 2. Crítico (a confirmar en el panel de Meta) — Producto de avisos de Instagram
Meta envía los DM de Instagram con `object: "instagram"`, que se configura aparte del objeto "page". Hay que verificar en la app de Meta:
- Webhooks -> objeto **Instagram** con URL `/api/public/meta-webhook`, mismo token de verificación, campo **messages** suscrito.
- Permiso `instagram_manage_messages` con **Acceso Avanzado** (si la app está en modo Desarrollo, solo llegan mensajes de personas con rol en la app).
- En la app de Instagram del negocio: Configuración -> Mensajes -> **"Permitir acceso a los mensajes"** activado (sin esto Meta no entrega DMs a terceros).

### 3. Alto — Firma con secreto distinto
Si los avisos de Instagram se configuraron con el producto "Instagram con inicio de sesión de Instagram", llegan firmados con el secreto de la app de Instagram. El código acepta `META_APP_SECRET_INSTAGRAM`; si falta, el webhook responde 401 y el mensaje se pierde sin dejar rastro en `messaging_inbox_events` (el rechazo ocurre antes de guardar). Confirmar en los registros si hay "assinatura ausente ou inválida".

### 4. Alto — La sincronización de respaldo falla sin avisar
`meta-sync` pide `/{pageId}/conversations?platform=instagram` con el token de la Página Messenger conectada. Falla si:
- falta `instagram_manage_messages` en ese token (error de permisos),
- la Página "Cuentastupanas" vinculada no es la dueña de @cuentastupanas,
- el canal Messenger no está en estado `connected`.
El error se guarda en `result.errors` pero no se muestra en la bandeja; el botón queda en "Sincronizando...".

### 5. Medio — Búsqueda de canal frágil en el webhook
- La búsqueda usa `.maybeSingle()` sobre `phone_number_id`: si hay dos filas con el mismo ID (reconexiones), devuelve error y el mensaje se descarta (`if (!inst) continue`).
- El respaldo `ilike("instance_name", %id%)` usa texto externo sin escapar.
- Si el ID guardado para Instagram fuera el de la Página o el ID "scoped" de Instagram Login en vez del `instagram_business_account.id`, `recipient.id` no coincide y se ignora todo.

### 6. Medio — Mensajes descartados sin registro
Cuando no se encuentra el canal, el evento queda en `messaging_inbox_events` como "processed" igualmente, ocultando la falla. No hay forma de distinguir "llegó y se ignoró" de "nunca llegó".

## Verificaciones a ejecutar (primer paso de la implementación)

1. `messaging_inbox_events` con `provider = 'meta_instagram'`: ¿existe alguno? Si hay 0 -> Meta no envía (hallazgos 1-3). Si hay -> falla interna (hallazgo 5).
2. `whatsapp_instances` con `provider = 'meta_instagram'`: comparar `phone_number_id` con el `instagram_business_account.id` real; revisar duplicados.
3. `GET /{pageId}/subscribed_apps` con el token de la Página: ver qué campos tiene suscritos.
4. `GET /me/permissions` del token: confirmar `instagram_manage_messages` y `instagram_basic`.
5. Registros del webhook: buscar respuestas 401.

## Correcciones propuestas (tras confirmar)

1. Al conectar por Facebook Login, suscribir la Página con `messages,messaging_postbacks,message_reactions,messaging_seen` y, cuando tenga IG vinculado, registrar esa suscripción; quitar la llamada inválida con campos `comments,mentions` sobre token de Página.
2. Mostrar en Conexiones un estado "Recibiendo mensajes de Instagram: sí/no" basado en el último evento recibido y en los permisos del token.
3. Webhook: buscar canal con `.limit(1)` + filtro por provider según `object`, escapar el texto del respaldo y marcar el evento como `ignored_no_instance` en vez de "processed".
4. Sync: mostrar el error real de Instagram en la bandeja en lugar de quedar en "Sincronizando...".
5. Guía corta para el cliente: activar "Permitir acceso a los mensajes" en Instagram.

## Detalles técnicos

- Archivos: `src/lib/meta-oauth.functions.ts`, `src/lib/meta.functions.ts`, `src/lib/meta.server.ts` (`metaSubscribePage`), `src/routes/api/public/meta-webhook.ts`, `src/lib/meta-sync.server.ts`, `src/routes/app/conversas.tsx` (solo mensaje de error de sync).
- Sin cambios de esquema; posible nuevo valor de `status` en `messaging_inbox_events`.
