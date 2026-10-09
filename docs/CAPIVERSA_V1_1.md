# Capiversa v1.1 — alcance técnico

## Propósito

Capiversa v1.1 será utilizado primero por CuentasTuPana como CRM interno y
entorno beta. Se conserva el modelo multiempresa, pero la operación inicial
utiliza una empresa y una conexión oficial de WhatsApp Business.

## Decisiones vigentes

- Base principal: Capibersa/Capi Conversa.
- Nombre de producto: Capiversa.
- WhatsApp beta: conector oficial administrado por Lovable.
- Proveedor de IA posterior: Drael.
- Automatizaciones externas: n8n cuando aporten valor.
- Multimedia: Cloudflare R2.
- Base relacional y autenticación: Supabase propio.
- GHL y BTZap quedan fuera de la nueva arquitectura.

## Implementado en la fundación v1.1

- `src/lib/messaging/contracts.ts`: vocabulario canónico de mensajes.
- `src/lib/messaging/provider-registry.server.ts`: registro de adaptadores.
- `src/lib/messaging/providers/lovable-whatsapp.server.ts`: adaptador oficial.
- `src/lib/messaging/lovable-whatsapp.generated.server.ts`: límite donde se
  incorporará el código que genere Lovable.
- `src/lib/messaging/ingest.server.ts`: entrada idempotente y registro crudo.
- `src/lib/storage/r2.server.ts`: archivos privados en R2 y enlaces temporales.
- `src/lib/messaging/media-archive.server.ts`: puente de descarga autenticada
  desde Lovable hacia R2.
- `src/lib/storage/r2.functions.ts`: autoriza subidas directas desde la bandeja.
- `src/lib/messaging/lovable-connection.functions.ts`: registro local de la
  conexión oficial mientras llega el primer evento real.
- `src/routes/api/public/lovable-whatsapp.ts`: receptor cerrado por defecto;
  exige la verificación real generada por Lovable.
- `src/config/beta.ts`: oculta proveedores heredados durante la beta.
- `supabase/migrations/20261009030000_capiversa_v1_1_core.sql`: núcleo de datos.

## Estado del conector

La arquitectura está preparada, pero el puente generado permanece cerrado
hasta vincular la conexión real en Lovable. Esta decisión evita inventar un API
privado del gateway y evita falsos positivos en el envío.

## Flujo de multimedia preparado

1. Lovable recibe el evento y normaliza las referencias de cada archivo.
2. Su función `generatedDownloadMedia` descarga el binario usando la
   autenticación que administra el propio conector.
3. Capiversa guarda el binario en R2 bajo el espacio de la empresa.
4. La base conserva metadatos, hash y `storage_key` de todos los adjuntos.
5. La bandeja genera una URL firmada corta cuando el usuario abre el archivo.
6. Los archivos salientes se suben directamente del navegador a R2 mediante
   una URL PUT temporal; los reintentos generan una nueva URL de lectura.

No se guardan credenciales de R2 en el navegador ni URLs temporales en la base.
La configuración del bucket y su CORS está en `docs/R2_SETUP.md`.

## Próximo bloque

1. Vincular repositorio y proyecto Lovable.
2. Crear Supabase nuevo y aplicar la migración.
3. Ejecutar `bootstrap_capiversa_company` con el primer usuario autenticado.
4. Vincular WhatsApp Business en Lovable.
5. Generar y adaptar el receptor real.
6. Capturar eventos reales y completar la normalización y descarga.
7. Verificar texto, imagen, audio, documento y estados con un número beta.
