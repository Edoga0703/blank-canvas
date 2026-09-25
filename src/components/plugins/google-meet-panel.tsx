import { GoogleCalendarPanel } from "@/components/plugins/google-calendar-panel";

/**
 * O Meet usa a mesma conta Google da agenda da empresa.
 * Por isso reaproveitamos o painel de conexão do Google Calendar.
 */
export function GoogleMeetPanel() {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        O Google Meet usa a mesma conta Google da agenda da empresa. Conecte a conta abaixo e o botão
        <strong> Meet</strong> passa a criar a sala direto no formulário do compromisso.
      </p>
      <GoogleCalendarPanel />
    </div>
  );
}
