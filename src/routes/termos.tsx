import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalShell } from "@/components/legal-shell";

// ============================================================================
// CONFIGURACIÓN DE IDENTIDAD Y MARCA (Actualizar con los datos definitivos)
// ============================================================================
const BRAND_NAME = "TuSaaS CRM";
const SITE_URL = "https://tudominio.com";
const SUPPORT_EMAIL = "soporte@tudominio.com";
const TERMOS_URL = `${SITE_URL}/termos`;
const TERMOS_TITLE = `Términos y Condiciones de Servicio — ${BRAND_NAME}`;
const TERMOS_DESC = `Condiciones de contratación y uso del software CRM y servicios de automatización de ${BRAND_NAME}, incluyendo políticas de uso de WhatsApp Business.`;

export const Route = createFileRoute("/termos")({
  head: () => ({
    meta: [
      { title: TERMOS_TITLE },
      { name: "description", content: TERMOS_DESC },
      { property: "og:title", content: TERMOS_TITLE },
      { property: "og:description", content: TERMOS_DESC },
      { property: "og:url", content: TERMOS_URL },
      { property: "og:type", content: "article" },
    ],
    links: [{ rel: "canonical", href: TERMOS_URL }],
  }),
  component: TermosPage,
});

function TermosPage() {
  return (
    <LegalShell title="Términos y Condiciones de Servicio" updatedAt="8 de octubre de 2026">
      <section>
        <h2>1. Aceptación y Objeto</h2>
        <p>
          Los presentes Términos y Condiciones (en adelante, los "Términos") regulan el acceso, registro y uso de la plataforma de software como servicio (SaaS) comercializada bajo el nombre <strong>{BRAND_NAME}</strong> (el "Servicio"), operada por sus titulares legítimos (en adelante, "nosotros" o la "Compañía").
        </p>
        <p>
          Al crear una cuenta, iniciar sesión, suscribirse a cualquiera de nuestros planes o hacer uso de las funcionalidades del Servicio, usted (en adelante, el "Cliente" o el "Usuario") declara ser mayor de edad, contar con las facultades legales suficientes para obligar a la entidad que representa y manifiesta su aceptación plena y sin reservas de estos Términos, así como de nuestra <Link to="/privacidade" className="text-primary hover:underline font-medium">Política de Privacidad</Link>. Si no está de acuerdo, deberá abstenerse de utilizar la Plataforma.
        </p>
      </section>

      <section>
        <h2>2. Descripción del Servicio</h2>
        <p>
          {BRAND_NAME} es una solución en la nube diseñada para la gestión de relaciones con clientes (CRM), administración de contactos, organización visual de prospectos en tableros Kanban, centralización de bandejas de comunicación multicanal, automatización de respuestas y programación de citas comerciales.
        </p>
        <p>
          El Servicio se proporciona bajo un modelo de suscripción por software ("SaaS"). La disponibilidad de funciones específicas dependerá del plan comercial contratado por el Cliente.
        </p>
      </section>

      <section>
        <h2>3. Registro de Cuenta y Seguridad</h2>
        <p>
          Para acceder a la Plataforma, el Cliente debe proporcionar información verídica, exacta y actualizada. El Cliente es el único responsable de:
        </p>
        <ul>
          <li>Preservar la estricta confidencialidad de sus contraseñas y claves de acceso de todos los usuarios asignados a su organización.</li>
          <li>Todas las actividades, mensajes, notas y transacciones realizadas bajo sus cuentas y credenciales.</li>
          <li>Notificar de inmediato a nuestro equipo de soporte ({SUPPORT_EMAIL}) ante cualquier indicio de vulneración de seguridad o acceso no autorizado.</li>
        </ul>
      </section>

      <section>
        <h2>4. Condiciones Especiales de Uso de WhatsApp Business (Meta Cloud API)</h2>
        <p>
          {BRAND_NAME} ofrece integración con la plataforma oficial de WhatsApp Business a través de las APIs en la nube provistas por <strong>Meta Platforms, Inc. ("Meta")</strong>. El uso de esta integración está sujeto a las siguientes cláusulas contractuales de estricto cumplimiento:
        </p>

        <h3>4.1. Adhesión Obligatoria a las Políticas de Meta</h3>
        <p>
          El Cliente se compromete de manera irrevocable a cumplir en todo momento con las políticas oficiales de Meta, las cuales forman parte vinculante de este contrato por referencia:
        </p>
        <ul>
          <li>
            Las{" "}
            <a href="https://www.whatsapp.com/legal/business-terms/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">
              Condiciones de WhatsApp Business (WhatsApp Business Terms of Service)
            </a>.
          </li>
          <li>
            La{" "}
            <a href="https://www.whatsapp.com/legal/business-policy/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">
              Política de Mensajería Comercial de WhatsApp (WhatsApp Business Messaging Policy)
            </a>.
          </li>
          <li>
            La{" "}
            <a href="https://www.whatsapp.com/legal/commerce-policy/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">
              Política de Comercio de WhatsApp (WhatsApp Commerce Policy)
            </a>.
          </li>
        </ul>

        <h3>4.2. Requisito de Consentimiento Previo Verificable (Opt-In) y Prohibición de Spam</h3>
        <p>
          El Cliente declara, garantiza y asume plena responsabilidad respecto a que:
        </p>
        <ul>
          <li>
            Cuenta con el <strong>consentimiento previo, explícito e informado (Opt-In)</strong> de cada usuario o consumidor antes de iniciar una conversación comercial o enviar mensajes informativos mediante plantillas preaprobadas (HSM).
          </li>
          <li>
            <strong>Prohibición Terminante de Spam:</strong> Queda terminantemente prohibido utilizar el Servicio para enviar comunicaciones masivas no solicitadas, comprar o utilizar listas de números telefónicos de terceros, emitir publicidad engañosa, esquemas piramidales o promocionar productos prohibidos por las políticas de Meta (como armas, tabaco, juegos de azar no regulados o productos farmacéuticos no autorizados).
          </li>
        </ul>

        <h3>4.3. Respeto Inmediato a las Solicitudes de Baja (Opt-Out)</h3>
        <p>
          El Cliente debe ofrecer y respetar mecanismos claros y sencillos para que los destinatarios puedan solicitar no recibir más mensajes (mediante palabras como STOP, CANCELAR, BAJA o equivalentes). Ante dicha manifestación, el Cliente debe cesar de inmediato cualquier envío comercial hacia ese número telefónico.
        </p>

        <h3>4.4. Facultad de Suspensión Preventiva e Indemnidad</h3>
        <p>
          {BRAND_NAME} se reserva la facultad de suspender o revocar de inmediato el acceso a la integración de WhatsApp a cualquier cuenta que:
        </p>
        <ul>
          <li>Reciba quejas o reportes reiterados de usuarios por envío de spam.</li>
          <li>Experimente una degradación de la calificación de calidad de su número en Meta a nivel "Bajo" (Low Quality).</li>
          <li>Incurra en violaciones comprobadas de las políticas de mensajería de Meta.</li>
        </ul>
        <p>
          El Cliente mantendrá indemne a {BRAND_NAME}, sus socios, empleados y afiliados frente a cualquier daño, reclamación judicial, multa, penalidad o sanción impuesta por Meta Platforms, Inc. o por terceros que derive del incumplimiento de estas normas por parte del Cliente.
        </p>
      </section>

      <section>
        <h2>5. Reglas Generales de Uso Aceptable</h2>
        <p>El Cliente se compromete a no utilizar la Plataforma para:</p>
        <ul>
          <li>Incurrir en actividades fraudulentas, difamatorias, ilícitas o violatorias de derechos de privacidad de terceros.</li>
          <li>Introducir virus, troyanos, gusanos, código malicioso o vulnerar las medidas de seguridad del servidor.</li>
          <li>Realizar ingeniería inversa, descompilar, extraer el código fuente o realizar scraping no autorizado de la Plataforma.</li>
          <li>Sublicenciar, revender, arrendar o transferir el acceso al Servicio a terceros sin previa autorización escrita de la Compañía.</li>
        </ul>
      </section>

      <section>
        <h2>6. Planes, Pagos y Facturación</h2>
        <ul>
          <li><strong>Precios y Moneda:</strong> Los precios de las suscripciones corresponden a las tarifas vigentes publicadas en nuestro sitio web oficial al momento de la contratación.</li>
          <li><strong>Renovación Automática:</strong> Las suscripciones se renuevan automáticamente al término de cada período de facturación (mensual o anual), a menos que el Cliente cancele su plan con anterioridad a la fecha de corte desde su panel de usuario.</li>
          <li><strong>Impuestos y Cargos de Meta:</strong> Las tarifas del SaaS cubren el uso del software {BRAND_NAME}. Cualquier cargo por consumo de conversaciones facturado directamente por Meta Platforms, Inc. a la cuenta de WhatsApp Business del Cliente es responsabilidad directa e independiente del Cliente con Meta.</li>
          <li><strong>Falta de Pago:</strong> La falta de abono oportuno de la cuota periódica facultará a {BRAND_NAME} para suspender temporalmente el acceso a la cuenta tras un aviso previo de gracia de 5 días hábiles.</li>
        </ul>
      </section>

      <section>
        <h2>7. Reembolsos y Cancelaciones</h2>
        <p>
          El Cliente puede cancelar su suscripción en cualquier momento a través de la sección de administración de cuenta de la Plataforma. La cancelación impedirá cargos en los siguientes ciclos de renovación. Las políticas de devolución o reembolso se aplicarán conforme a nuestra política de garantía inicial publicada en el Servicio o los requisitos imperativos de protección al consumidor del país de origen.
        </p>
      </section>

      <section>
        <h2>8. Propiedad Intelectual</h2>
        <p>
          Todos los derechos de propiedad intelectual, marcas, logotipos, código fuente, interfaces visuales, diseños y documentación asociados a {BRAND_NAME} son propiedad exclusiva de la Compañía o de sus licenciantes. Se otorga al Cliente una licencia de uso limitada, no exclusiva, intransferible y revocable para utilizar el software durante la vigencia de su suscripción.
        </p>
        <p>
          El Cliente conserva en todo momento la titularidad exclusiva sobre sus datos, contenidos, archivos y base de contactos ingresados en la Plataforma.
        </p>
      </section>

      <section>
        <h2>9. Disponibilidad y Limitación de Garantías</h2>
        <p>
          Nos esforzamos por garantizar una alta disponibilidad del Servicio (apuntando a un 99.5% de tiempo de actividad). No obstante, el Cliente reconoce que el software se suministra "tal cual" y "según disponibilidad". No garantizamos que el Servicio sea ininterrumpido ni esté libre de errores transitorios, especialmente aquellos derivados de caídas generales de internet, incidentes en la infraestructura de proveedores externos (incluyendo caídas de los servidores de Meta o Google) o fuerza mayor.
        </p>
      </section>

      <section>
        <h2>10. Limitación de Responsabilidad</h2>
        <p>
          En la máxima medida permitida por la ley aplicable, {BRAND_NAME} no será responsable por daños indirectos, lucro cesante, pérdidas comerciales, pérdida de oportunidades de negocio o daños derivados del bloqueo de números telefónicos por parte de Meta ocasionados por el uso inadecuado del Cliente. La responsabilidad total agregada de {BRAND_NAME} ante cualquier reclamación derivada de estos Términos se limitará al monto total efectivamente abonado por el Cliente en los doce (12) meses anteriores al hecho causante.
        </p>
      </section>

      <section>
        <h2>11. Modificaciones a los Términos</h2>
        <p>
          Podremos modificar estos Términos periódicamente. En caso de cambios sustanciales, publicaremos la versión actualizada con la nueva fecha de vigencia y lo notificaremos con antelación razonable mediante correo electrónico o un aviso en el panel de control. El uso continuado del Servicio tras la entrada en vigor de los cambios constituye la aceptación íntegra de los nuevos Términos.
        </p>
      </section>

      <section>
        <h2>12. Contacto</h2>
        <p>
          Para consultas, notificaciones legales o aclaraciones sobre el alcance de estos Términos, comuníquese con nosotros a través de:{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline font-medium">
            {SUPPORT_EMAIL}
          </a>.
        </p>
      </section>
    </LegalShell>
  );
}
