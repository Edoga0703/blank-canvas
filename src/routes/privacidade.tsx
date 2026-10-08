import { createFileRoute } from "@tanstack/react-router";
import { LegalShell } from "@/components/legal-shell";

// ============================================================================
// CONFIGURACIÓN DE IDENTIDAD Y MARCA (Actualizar con los datos definitivos)
// ============================================================================
const BRAND_NAME = "TuSaaS CRM";
const SITE_URL = "https://tudominio.com";
const SUPPORT_EMAIL = "soporte@tudominio.com";
const PRIV_URL = `${SITE_URL}/privacidade`;
const PRIV_TITLE = `Política de Privacidad — ${BRAND_NAME}`;
const PRIV_DESC = `Conozca cómo ${BRAND_NAME} recopila, utiliza y protege sus datos personales, garantizando el estricto cumplimiento con las directrices de Meta WhatsApp Business y normativas de privacidad.`;

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: PRIV_TITLE },
      { name: "description", content: PRIV_DESC },
      { property: "og:title", content: PRIV_TITLE },
      { property: "og:description", content: PRIV_DESC },
      { property: "og:url", content: PRIV_URL },
      { property: "og:type", content: "article" },
    ],
    links: [{ rel: "canonical", href: PRIV_URL }],
  }),
  component: PrivacidadePage,
});

function PrivacidadePage() {
  return (
    <LegalShell title="Política de Privacidad" updatedAt="8 de octubre de 2026">
      <section>
        <h2>1. Identificación y Roles en el Tratamiento de Datos</h2>
        <p>
          La presente Política de Privacidad describe el tratamiento de datos personales realizado a través de la plataforma <strong>{BRAND_NAME}</strong> (en adelante, el "Servicio" o la "Plataforma").
        </p>
        <p>
          En el marco de la prestación de nuestros servicios de software CRM y gestión de comunicaciones empresariales:
        </p>
        <ul>
          <li>
            <strong>El Cliente (Su Empresa):</strong> Actúa como <strong>Responsable del Tratamiento (Data Controller)</strong> de los datos de contacto, conversaciones y clientes potenciales (leads) que gestiona e ingresa en la Plataforma.
          </li>
          <li>
            <strong>{BRAND_NAME}:</strong> Actúa como <strong>Encargado del Tratamiento (Data Processor)</strong>, tratando dichos datos únicamente bajo las instrucciones del Cliente y para las finalidades estipuladas en los Términos de Servicio.
          </li>
          <li>
            <strong>Respecto a los datos de registro y cuenta del Cliente:</strong> {BRAND_NAME} actúa como Responsable del Tratamiento para la administración comercial, facturación y seguridad de la relación contractual.
          </li>
        </ul>
      </section>

      <section>
        <h2>2. Datos que Recopilamos</h2>
        <p>Recopilamos las siguientes categorías de información:</p>
        <ul>
          <li>
            <strong>Datos de Registro y Perfil:</strong> Nombre completo, dirección de correo electrónico corporativo, número de teléfono comercial, credenciales de acceso protegidas mediante hash criptográfico y nombre de la empresa.
          </li>
          <li>
            <strong>Datos de Facturación y Pago:</strong> Historial de transacciones, planes contratados y detalles de suscripción. El procesamiento de cobros se delega a pasarelas de pago certificadas; {BRAND_NAME} no almacena datos confidenciales de tarjetas de crédito.
          </li>
          <li>
            <strong>Datos de Uso y Telemetría:</strong> Dirección IP, registros de auditoría (logs), tipo de navegador, sistema operativo y eventos de diagnóstico técnico orientados a preservar la integridad y seguridad del sistema.
          </li>
          <li>
            <strong>Contenido y Gestión de Clientes:</strong> Mensajes, archivos multimedia, notas internas, etiquetas, etapas de embudo (Kanban) y recordatorios generados en el uso del CRM.
          </li>
        </ul>
      </section>

      <section>
        <h2>3. Tratamiento de Datos de la Plataforma WhatsApp Business (Meta Cloud API)</h2>
        <p>
          {BRAND_NAME} proporciona una integración oficial con la <strong>WhatsApp Business Platform (Cloud API)</strong>, operada y provista por <strong>Meta Platforms, Inc. ("Meta")</strong>. El tratamiento de los datos derivados de esta integración se rige por las siguientes condiciones específicas:
        </p>
        
        <h3>3.1. Categorías de Datos de WhatsApp Tratados</h3>
        <ul>
          <li><strong>Identificadores de Línea:</strong> Número de teléfono en formato internacional (E.164 / <code>wa_id</code>) tanto de la línea comercial emisora como de los contactos destinatarios.</li>
          <li><strong>Datos de Perfil de WhatsApp:</strong> Nombre público de perfil de usuario y avatar provisto por la API de Meta.</li>
          <li><strong>Contenido de Mensajes:</strong> Texto de las conversaciones, audios, notas de voz, imágenes, videos, documentos y ubicaciones enviados o recibidos.</li>
          <li><strong>Metadatos y Estado de Entrega:</strong> Identificadores únicos de mensaje (<code>wamid</code>), marcas de tiempo (timestamps) y reportes de estado (enviado, entregado, leído y fallido).</li>
          <li><strong>Identificadores de Cuenta Meta:</strong> WhatsApp Business Account ID (WABA ID), Phone Number ID y tokens de autorización otorgados en el proceso de conexión.</li>
        </ul>

        <h3>3.2. Finalidad Exclusiva y Principio de Uso Limitado</h3>
        <p>
          Los datos provenientes de la API de WhatsApp son procesados <strong>única y exclusivamente</strong> para prestar las funcionalidades del CRM contratadas por el Cliente:
        </p>
        <ul>
          <li>Visualizar y responder conversaciones desde la bandeja multicanal en tiempo real.</li>
          <li>Organizar leads y estados en el tablero comercial Kanban.</li>
          <li>Facilitar respuestas rápidas, plantillas preaprobadas (HSM) y asignación de chats a agentes del equipo.</li>
          <li>Generar reportes analíticos de rendimiento de atención para uso exclusivo del Cliente.</li>
        </ul>

        <h3>3.3. Compromiso Estricto de No Comercialización y No Publicidad</h3>
        <ul>
          <li>
            <strong>Prohibición de Venta:</strong> {BRAND_NAME} <strong>NO</strong> vende, alquila, comercializa ni cede datos de WhatsApp ni listas de contactos a terceros, anunciantes o intermediarios de datos.
          </li>
          <li>
            <strong>No Perfilado Publicitario:</strong> Los datos de WhatsApp <strong>NUNCA</strong> son utilizados para fines publicitarios, creación de audiencias comerciales ajenas al servicio ni mercadeo de terceros.
          </li>
          <li>
            <strong>No Entrenamiento de Modelos Públicos de IA:</strong> Las conversaciones privadas y los datos personales de WhatsApp no se utilizan para entrenar modelos públicos o generalistas de Inteligencia Artificial.
          </li>
        </ul>

        <h3>3.4. Coexistencia con la Aplicación Móvil de WhatsApp Business</h3>
        <p>
          En caso de utilizar la función de coexistencia oficial de Meta (que mantiene activa la aplicación móvil de WhatsApp Business en su teléfono inteligente en paralelo con el CRM), los mensajes enviados directamente desde el teléfono móvil son sincronizados como ecos legítimos (<code>is_echo: true</code>) con el único fin de mantener actualizado el historial de la conversación en el CRM para el equipo del Cliente.
        </p>
      </section>

      <section>
        <h2>4. Integración con Google (Google API Services User Data Policy)</h2>
        <p>
          Cuando el Cliente activa la sincronización con Google Calendar, solicitamos únicamente los alcances (scopes) estrictamente necesarios para consultar, crear, modificar y eliminar eventos de agenda asociados a las citas programadas en el CRM, así como el correo electrónico de identificación de la cuenta vinculada.
        </p>
        <p>
          El uso y la transferencia por parte de {BRAND_NAME} de la información recibida a través de las APIs de Google se adhieren plenamente a la{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline font-medium"
          >
            Política de Datos de Usuario de los Servicios de API de Google
          </a>
          , incluyendo los requisitos de <strong>Uso Limitado (Limited Use)</strong>. Los datos de Google no se comercializan, no se transfieren a terceros y los accesos pueden revocarse en cualquier momento desde los ajustes de la cuenta.
        </p>
      </section>

      <section>
        <h2>5. Destinatarios y Subprocesadores de Datos</h2>
        <p>
          Compartimos datos únicamente con proveedores de servicios de confianza (subprocesadores) indispensables para la operatividad técnica del Servicio, bajo acuerdos vinculantes de confidencialidad y protección de datos:
        </p>
        <ul>
          <li><strong>Meta Platforms, Inc.:</strong> Como proveedor oficial de la infraestructura de transporte y entrega de mensajes de WhatsApp Business.</li>
          <li><strong>Proveedores de Alojamiento y Base de Datos en la Nube:</strong> Servidores seguros provistos de aislamiento lógico multitenant y cifrado en reposo.</li>
          <li><strong>Pasarelas de Facturación:</strong> Proveedores certificados encargados de la emisión de comprobantes fiscales y procesamiento de suscripciones.</li>
          <li><strong>Autoridades Competentes:</strong> Únicamente ante requerimiento legal fundado y motivado emitido por autoridad competente en el marco de la ley.</li>
        </ul>
      </section>

      <section>
        <h2>6. Medidas de Seguridad de la Información</h2>
        <p>
          Implementamos rigurosas salvaguardas técnicas, administrativas y organizativas para mitigar riesgos de acceso no autorizado, pérdida, alteración o divulgación de datos:
        </p>
        <ul>
          <li>Cifrado integral de las comunicaciones en tránsito mediante protocolos criptográficos modernos (TLS 1.3 / HTTPS).</li>
          <li>Cifrado en reposo de bases de datos y respaldos de seguridad.</li>
          <li>Control de acceso estricto basado en roles (RBAC) y principio de menor privilegio para el personal autorizado.</li>
          <li>Aislamiento estricto de datos entre empresas clientes mediante identificadores únicos de organización en base de datos.</li>
          <li>Monitoreo continuo de integridad de servicios y auditoría periódica de accesos.</li>
        </ul>
      </section>

      <section>
        <h2>7. Período de Retención y Conservación de Datos</h2>
        <p>
          Los datos personales y el historial de comunicaciones se conservan durante el tiempo que la cuenta del Cliente permanezca activa y al corriente de pago. Al momento de la rescisión o cancelación del servicio, los datos son conservados durante un período de resguardo de hasta 30 días para permitir la exportación de información por parte del Cliente, tras lo cual son eliminados de forma definitiva o anonimizados de nuestros servidores productivos, salvo obligación legal expresa de conservación contable o fiscal.
        </p>
      </section>

      <section>
        <h2>8. Derechos de los Titulares (ARCO y Privacidad Global)</h2>
        <p>
          Los usuarios y contactos cuyos datos personales sean tratados tienen derecho a ejercer sus prerrogativas legales de <strong>Acceso, Rectificación, Cancelación/Supresión, Oposición, Portabilidad y Limitación del Tratamiento</strong>.
        </p>
        <p>
          Dado que {BRAND_NAME} actúa como Encargado del Tratamiento respecto a las conversaciones de los clientes finales, las solicitudes recibidas de personas que interactúan con una empresa usuaria serán canalizadas al Cliente correspondiente (Responsable del Tratamiento).
        </p>
        <p>
          Para solicitudes relativas a la cuenta de usuario en la Plataforma, puede comunicarse formalmente a nuestro canal de privacidad:{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline font-medium">
            {SUPPORT_EMAIL}
          </a>.
        </p>
      </section>

      <section>
        <h2>9. Modificaciones a la Política de Privacidad</h2>
        <p>
          Nos reservamos el derecho de actualizar esta Política para reflejar mejoras técnicas, nuevas integraciones o cambios regulatorios. Cualquier cambio sustancial será notificado oportunamente mediante aviso destacado en la Plataforma o por correo electrónico antes de su entrada en vigor.
        </p>
      </section>
    </LegalShell>
  );
}
