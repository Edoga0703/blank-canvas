# Verificación previa a Lovable — Capiversa v1.1

Fecha: 2026-10-09

## Resultado

La base está lista para importarse en Lovable y continuar allí la vinculación de servicios. La compilación de producción genera correctamente el cliente y el servidor TanStack Start.

La aplicación aún no debe recibir tráfico real de WhatsApp hasta completar en Lovable el puente oficial descrito en `docs/LOVABLE_WHATSAPP_HANDOFF.md` y configurar Supabase y R2.

## Comprobaciones ejecutadas

- `npm run build`: correcto con Vite 7.3.7; genera cliente y servidor.
- ESLint sobre los módulos nuevos de mensajería, R2, webhook y MCP: sin errores.
- TypeScript: sin errores en los módulos nuevos ni en `src/routeTree.gen.ts`.
- Ruta registrada: `/api/public/lovable-whatsapp` aparece en el árbol generado.
- Búsqueda de credenciales: el paquete no contiene claves privadas ni valores de `.env`.
- Supabase heredado: se eliminó la referencia al proyecto antiguo `rboflrriannlrjreatxb`.
- MCP: el envío dejó de llamar a Evolution y ahora usa el proveedor `lovable_whatsapp`.
- MCP de leads: consulta `crm_cards.numero`, que coincide con la migración v1.1.
- Dependencias: Vite se actualizó de 7.3.1 a 7.3.7 para corregir los avisos publicados que sí tenían actualización compatible.

## Configuración obligatoria en Lovable

1. Crear o conectar el Supabase propio de Capiversa.
2. Definir `VITE_SUPABASE_PROJECT_ID`, las URLs y claves indicadas en `.env.example`.
3. Aplicar `supabase/migrations/20261009030000_capiversa_v1_1_core.sql`.
4. Configurar el bucket privado y las credenciales de Cloudflare R2.
5. Vincular WhatsApp Business en Lovable.
6. Pedir a Lovable que complete únicamente las funciones de `src/lib/messaging/lovable-whatsapp.generated.server.ts` siguiendo `docs/LOVABLE_WHATSAPP_HANDOFF.md`.
7. Regenerar el manifiesto MCP después de definir `VITE_SUPABASE_PROJECT_ID`; el ZIP usa deliberadamente `project-ref-unset` para evitar conectarse al Supabase anterior.
8. Probar recepción, envío, imagen, audio, documento, estados, coexistencia e idempotencia con una WABA de prueba.

## Pendientes conocidos de la base heredada

- El lint completo reporta 23.134 incidencias heredadas, principalmente formato Prettier y usos de `any`.
- El chequeo TypeScript completo reporta alrededor de 1.790 incidencias heredadas, sobre todo tipos de componentes UI antiguos. No impiden la compilación de producción actual.
- TanStack avisa que `createServerFn().inputValidator()` está obsoleto y deberá migrarse gradualmente a `.validator()`.
- Algunos bundles son grandes por ExcelJS/XLSX y otras funciones históricas; conviene dividirlos en una fase de rendimiento.
- `npm audit --omit=dev` deja 9 avisos: 3 altos, 5 moderados y 1 bajo, sin críticos. Los altos restantes provienen de `xlsx` y de la cadena `@lovable.dev/mcp-js`/`@modelcontextprotocol/sdk`; actualmente no ofrecen una actualización automática compatible. Deben revisarse durante el bloque de producción.
- Persisten textos, dominios y nombres históricos de Metrix en funciones secundarias heredadas. Deben sustituirse antes de activar correo, facturación, OAuth de Google, formularios públicos, academia y PDFs bajo la marca final.

## Alcance de la validación

La compilación y los contratos internos quedaron verificados localmente. No fue posible ejecutar una prueba real contra Supabase, R2 o WhatsApp de Lovable porque esas conexiones y credenciales todavía no existen en este proyecto. El adaptador oficial responde de forma controlada con `connector_not_linked` hasta que Lovable genere las seis funciones del puente.
