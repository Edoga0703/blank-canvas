# Contrato de generación para Lovable WhatsApp

## Regla principal

Lovable debe generar las llamadas de su conector oficial. No debe reemplazar el
CRM, crear un segundo modelo de conversaciones ni reintroducir Evolution,
Uazapi o WaBlast.

## Prompt de integración

Utilizar este pedido después de vincular WhatsApp Business al proyecto:

> Conecta la conexión existente de WhatsApp Business a este proyecto TanStack
> Start. Conserva la arquitectura de Capiversa y no crees tablas alternativas.
> Usa la ruta existente `/api/public/lovable-whatsapp`. Implementa
> `generatedVerifyAndParseWebhook` con la verificación oficial que proporciona
> el conector; solo después de validar la firma debe devolver el ID estable del
> evento, el ID de la conexión y el payload crudo. La ruta ya llama a
> `ingestMessagingEvent` con provider `lovable_whatsapp`. Implementa las
> funciones reales de texto, multimedia y plantillas solamente dentro de
> `src/lib/messaging/lovable-whatsapp.generated.server.ts`. Implementa también
> `generatedDownloadMedia` usando la descarga autenticada del conector; no
> trates la URL del proveedor como pública. Capiversa archivará el binario en
> Cloudflare R2 antes de guardar el mensaje. No expongas tokens,
> no guardes credenciales del conector en Supabase y no cambies los contratos
> públicos de `src/lib/messaging/contracts.ts`.

## Funciones que Lovable debe completar

- `generatedSendText`
- `generatedSendMedia`
- `generatedSendTemplate`
- `generatedNormalizeEvent`
- `generatedDownloadMedia`
- `generatedVerifyAndParseWebhook`

## Datos mínimos para cada mensaje normalizado

- ID externo estable.
- ID de conexión.
- Número del contacto.
- Dirección.
- Autor: contacto, teléfono, humano del CRM o IA.
- Tipo de mensaje.
- Texto o descripción.
- Fecha del proveedor.
- Mensaje respondido, cuando exista.
- Referencias de multimedia.
- Payload crudo.

## Eventos requeridos

- Mensaje recibido.
- Mensaje enviado desde el teléfono por coexistencia.
- Mensaje enviado por Capiversa.
- Enviado.
- Entregado.
- Leído.
- Fallido.

## Criterios de aceptación

- Repetir el mismo evento no crea otro mensaje.
- Un envío siempre devuelve el ID externo real.
- Los errores del proveedor se propagan y quedan registrados.
- Las credenciales permanecen en el gateway de Lovable.
- Un evento desconocido queda almacenado para diagnóstico.
- El receptor funciona en la aplicación publicada.
- Una firma inválida devuelve 401 y no registra el evento.
- Un evento sin ID estable devuelve 422.

## Preparación del proyecto en Lovable

Antes de regenerar el manifiesto MCP, define `VITE_SUPABASE_PROJECT_ID` con el
project ref del Supabase nuevo. El manifiesto entregado contiene deliberadamente
`project-ref-unset` para que nunca autentique contra la base heredada.
