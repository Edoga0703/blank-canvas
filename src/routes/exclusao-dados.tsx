import { createFileRoute } from "@tanstack/react-router";
import { LegalShell } from "@/components/legal-shell";

// ============================================================================
// CONFIGURACIÓN DE IDENTIDAD Y MARCA (Actualizar con los datos definitivos)
// ============================================================================
const BRAND_NAME = "TuSaaS CRM";
const SITE_URL = "https://tudominio.com";
const SUPPORT_EMAIL = "soporte@tudominio.com";
const LEGAL_ENTITY = "[Razón Social o Titular de la Empresa]";
const URL_PAGE = `${SITE_URL}/exclusao-dados`;
const TITLE = `Instrucciones de Eliminación de Datos del Usuario — ${BRAND_NAME}`;
const DESC = `Guía detallada para solicitar la eliminación definitiva de sus datos y revocar los accesos de Meta (WhatsApp, Facebook e Instagram) en ${BRAND_NAME}.`;

export const Route = createFileRoute("/exclusao-dados")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:url", content: URL_PAGE },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: URL_PAGE }],
  }),
  component: ExclusaoDadosPage,
});

function ExclusaoDadosPage() {
  return (
    <LegalShell title="Eliminación de Datos y Desvinculación de Meta" updatedAt="8 de octubre de 2026">
      <section>
        <h2>1. Compromiso con el Derecho de Supresión</h2>
        <p>
          En <strong>{BRAND_NAME}</strong> respetamos plenamente el derecho a la privacidad, la autodeterminación informativa y el derecho de supresión (derecho al olvido) de nuestros usuarios y de los contactos gestionados en la Plataforma.
        </p>
        <p>
          En estricto cumplimiento de las directrices para desarrolladores de <strong>Meta Platforms, Inc. (Meta)</strong>, ponemos a su disposición múltiples mecanismos inmediatos y transparentes para revocar el acceso a sus cuentas y solicitar el borrado permanente de cualquier dato procesado a través de nuestras integraciones oficiales con <strong>WhatsApp Business Platform</strong>, Facebook Messenger e Instagram Direct.
        </p>
      </section>

      <section>
        <h2>2. Mecanismos para Desvincular sus Canales y Eliminar Datos</h2>

        <h3>Opción A: Desvinculación Directa desde su Teléfono (Modo Coexistencia WhatsApp)</h3>
        <p>
          Si vinculó su cuenta mediante la modalidad de coexistencia oficial con la aplicación móvil de WhatsApp Business:
        </p>
        <ol>
          <li>Abra la aplicación <strong>WhatsApp Business</strong> en su teléfono inteligente (Android o iOS).</li>
          <li>Diríjase a <strong>Ajustes</strong> (o Configuración) &gt; <strong>Cuenta</strong>.</li>
          <li>Seleccione la opción <strong>Plataforma de WhatsApp Business</strong> (o Aplicaciones vinculadas).</li>
          <li>Localice y pulse sobre <strong>{BRAND_NAME}</strong>.</li>
          <li>Seleccione <strong>Desconectar</strong> y confirme la acción.</li>
        </ol>
        <p className="text-sm text-muted-foreground mt-2">
          <em>Efecto inmediato:</em> Meta revocará automáticamente los permisos de envío y recepción a través de nuestra integración en la nube, dejando su teléfono como el único gestor de la línea sin afectar sus chats locales.
        </p>

        <h3>Opción B: Desconexión Inmediata desde el Panel de {BRAND_NAME}</h3>
        <ol>
          <li>Inicie sesión con su cuenta en {BRAND_NAME} y diríjase al módulo de <strong>Conexión</strong> (o Canales).</li>
          <li>Localice la tarjeta de su línea de <strong>WhatsApp Business</strong> (o canal de Meta correspondiente).</li>
          <li>Haga clic en el botón <strong>Desconectar</strong>.</li>
        </ol>
        <p className="text-sm text-muted-foreground mt-2">
          <em>Efecto inmediato:</em> Nuestro sistema destruye inmediatamente los tokens de acceso activo (Access Tokens), remueve la suscripción del Webhook en Meta y detiene todo flujo de datos hacia nuestros servidores.
        </p>

        <h3>Opción C: Revocación de Permisos desde su Cuenta de Facebook / Meta</h3>
        <p>
          Usted puede revocar la autorización de la aplicación directamente desde el panel de seguridad de Meta:
        </p>
        <ol>
          <li>
            Inicie sesión en su cuenta de Facebook y acceda a{" "}
            <a
              href="https://www.facebook.com/settings?tab=applications"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline font-medium"
            >
              Configuración y Privacidad &gt; Configuración &gt; Apps y sitios web
            </a>.
          </li>
          <li>En la lista de aplicaciones autorizadas, busque <strong>{BRAND_NAME}</strong>.</li>
          <li>Haga clic en <strong>Eliminar</strong> o <strong>Revocar acceso</strong>.</li>
        </ol>

        <h3>Opción D: Solicitud Formal de Eliminación Total por Correo Electrónico</h3>
        <p>
          Si desea que eliminemos no solo los accesos, sino también la totalidad de los datos históricos de leads, mensajes, archivos multimedia y registros almacenados en nuestros servidores:
        </p>
        <ul>
          <li>
            Envíe un correo electrónico a nuestro departamento de soporte y privacidad:{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline font-medium">
              {SUPPORT_EMAIL}
            </a>.
          </li>
          <li><strong>Asunto:</strong> Solicitud de Eliminación Definitiva de Datos - Meta / WhatsApp.</li>
          <li>
            <strong>Datos a incluir:</strong> Correo electrónico asociado a su cuenta de {BRAND_NAME}, nombre de la empresa y el número de teléfono de WhatsApp Business registrado (con código de país).
          </li>
        </ul>
      </section>

      <section>
        <h2>3. Datos Específicos que se Eliminan</h2>
        <p>
          Al procesar una solicitud de eliminación o cancelarse definitivamente una cuenta, se suprimen de manera irreversible:
        </p>
        <ul>
          <li>Identificadores de cuenta de Meta (WABA ID, Phone Number ID, App Scoped IDs).</li>
          <li>Tokens de acceso y claves criptográficas de autenticación de la integración.</li>
          <li>Historial completo de conversaciones, mensajes entrantes y salientes de WhatsApp.</li>
          <li>Archivos multimedia almacenados (fotos, audios, notas de voz, documentos PDF).</li>
          <li>Información de contactos, leads, notas internas y etapas del tablero Kanban.</li>
          <li>Datos de perfil de los operadores y usuarios registrados bajo la organización.</li>
        </ul>
      </section>

      <section>
        <h2>4. Plazos de Procesamiento y Protocolo de Seguridad</h2>
        <ul>
          <li><strong>Acuse de recibo:</strong> Confirmaremos la recepción de su solicitud por correo electrónico en un plazo máximo de <strong>48 horas hábiles</strong>.</li>
          <li><strong>Eliminación definitiva en bases de datos activas:</strong> El borrado completo se ejecuta en un plazo no mayor a <strong>30 días naturales</strong> a partir de la confirmación.</li>
          <li><strong>Copias de respaldo de seguridad (Backups):</strong> Los respaldos cifrados se sobrescriben de manera automática en ciclos normales de rotación en un período máximo de 90 días, sin que dichos datos sean restaurados para uso operativo.</li>
        </ul>
      </section>

      <section>
        <h2>5. Datos Excluidos de Eliminación Inmediata</h2>
        <p>
          De conformidad con la legislación aplicable, {BRAND_NAME} únicamente conservará registros mínimos indispensables de naturaleza fiscal, contable y contractual (por ejemplo, facturas emitidas por la suscripción al software) durante los plazos legalmente obligatorios, sin incluir en ningún caso el contenido de conversaciones ni datos de terceros.
        </p>
      </section>

      <section>
        <h2>6. Datos de Contacto del Responsable</h2>
        <p>
          Para cualquier consulta relativa a la protección de datos personales o seguimiento de una solicitud de eliminación:
        </p>
        <p className="mt-2 text-sm bg-muted/40 p-4 rounded-lg border">
          <strong>Entidad Responsable:</strong> {LEGAL_ENTITY}<br />
          <strong>Servicio:</strong> {BRAND_NAME}<br />
          <strong>Correo Electrónico de Privacidad:</strong>{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline font-medium">
            {SUPPORT_EMAIL}
          </a><br />
          <strong>Sitio Web Oficial:</strong>{" "}
          <a href={SITE_URL} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">
            {SITE_URL}
          </a>
        </p>
      </section>
    </LegalShell>
  );
}
