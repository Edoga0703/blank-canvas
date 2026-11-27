import type { Membership } from "./tenant";

export type Role = "owner" | "admin" | "atendente";

export const ALL_PERMISSION_KEYS = [
  "conversas.view",
  "conversas.view_all",
  "conversas.transfer",
  "conversas.delete",
  "crm.view",
  "crm.edit_stages",
  "crm.view_all",
  "crm.import_export",
  "agente.manage",
  "automacoes.manage",
  "campanhas.manage",
  "conteudo.publish",
  "catalogo.manage",
  "prospeccao.view",
  "conexao.manage",
  "integracoes.manage",
  "relatorios.view",
  "ai_usage.view",
  "configuracoes.billing",
  "configuracoes.team",
  "configuracoes.danger_zone",
] as const;

export type GranularPermissionKey = (typeof ALL_PERMISSION_KEYS)[number];
export type GranularPermissions = Record<GranularPermissionKey, boolean>;

export const NON_DELEGABLE_PERMISSIONS: readonly GranularPermissionKey[] = [
  "configuracoes.billing",
  "configuracoes.team",
  "configuracoes.danger_zone",
] as const;

export type PermissionItemDef = {
  key: GranularPermissionKey;
  label: string;
  description: string;
  adminOnly?: boolean;
};

export type PermissionGroupDef = {
  id: string;
  label: string;
  items: readonly PermissionItemDef[];
};

export const PERMISSION_GROUPS: readonly PermissionGroupDef[] = [
  {
    id: "conversas",
    label: "Conversas & Atendimento",
    items: [
      { key: "conversas.view", label: "Acessar bandeja de conversas", description: "Visualizar e responder mensagens." },
      { key: "conversas.view_all", label: "Ver chats de toda a equipe", description: "Se desativado, vê apenas os chats atribuídos a si." },
      { key: "conversas.transfer", label: "Transferir atendimentos", description: "Passar conversas para outros atendentes ou setores." },
      { key: "conversas.delete", label: "Excluir mensagens ou conversas", description: "Apagar registros no histórico do chat." },
    ],
  },
  {
    id: "crm",
    label: "CRM & Contatos",
    items: [
      { key: "crm.view", label: "Acessar CRM e contatos", description: "Visualizar leads, cards e agendamentos." },
      { key: "crm.view_all", label: "Ver leads de toda a equipe", description: "Visualizar oportunidades atribuídas a outros colegas." },
      { key: "crm.edit_stages", label: "Criar/editar funis e etapas", description: "Modificar colunas, ordenação e regras de pipeline." },
      { key: "crm.import_export", label: "Importar e exportar base (CSV/Excel)", description: "Baixar contatos ou importar planilhas em massa." },
    ],
  },
  {
    id: "ia_automacoes",
    label: "Agente IA & Automações",
    items: [
      { key: "agente.manage", label: "Gerenciar Agentes de IA", description: "Editar prompts, base de conhecimento e treinamento." },
      { key: "automacoes.manage", label: "Gerenciar Automações & Fluxos", description: "Criar, editar, publicar ou excluir fluxos." },
    ],
  },
  {
    id: "marketing",
    label: "Marketing & Conteúdo",
    items: [
      { key: "campanhas.manage", label: "Campanhas em massa", description: "Criar e disparar envios segmentados." },
      { key: "conteudo.publish", label: "Publicações e Comentários Sociais", description: "Publicar e moderar comentários no Meta/Telegram." },
      { key: "catalogo.manage", label: "Gerenciar Catálogo de produtos", description: "Criar, editar ou remover produtos e preços." },
      { key: "prospeccao.view", label: "Radar de Prospecção B2B", description: "Consultar e captar leads B2B no radar." },
    ],
  },
  {
    id: "conexoes",
    label: "Conexões & Integrações",
    items: [
      { key: "conexao.manage", label: "Gerenciar Conexões (WhatsApp/Meta/TG)", description: "Conectar QR Code, API Oficial e canais." },
      { key: "integracoes.manage", label: "Integrações, Webhooks e Plugins", description: "Configurar webhooks, formulários e apps externos." },
    ],
  },
  {
    id: "relatorios",
    label: "Relatórios & Créditos",
    items: [
      { key: "relatorios.view", label: "Métricas comerciais e relatórios", description: "Visualizar painel comercial e desempenho da equipe." },
      { key: "ai_usage.view", label: "Ver consumo de créditos de IA", description: "Consultar extrato de uso de IA da empresa." },
    ],
  },
  {
    id: "admin_exclusivo",
    label: "Exclusivos Proprietário / Admin (Não delegáveis)",
    items: [
      { key: "configuracoes.billing", label: "Plano, faturas e checkout", description: "Restrito a Owner / Admin.", adminOnly: true },
      { key: "configuracoes.team", label: "Gestão de equipe e permissões", description: "Restrito a Owner / Admin.", adminOnly: true },
      { key: "configuracoes.danger_zone", label: "Zona de perigo / Resetar dados", description: "Restrito a Owner / Admin.", adminOnly: true },
    ],
  },
] as const;

function buildPermMap(overrides: Partial<Record<GranularPermissionKey, boolean>>, defaultVal = false): GranularPermissions {
  const out = {} as GranularPermissions;
  for (const k of ALL_PERMISSION_KEYS) {
    out[k] = overrides[k] ?? defaultVal;
  }
  return out;
}

export type PermissionPresetId = "atendente" | "supervisor" | "marketing" | "admin";

export const PERMISSION_PRESETS: Record<
  PermissionPresetId,
  {
    id: PermissionPresetId;
    label: string;
    description: string;
    dbRole: "admin" | "atendente";
    permissions: GranularPermissions;
  }
> = {
  atendente: {
    id: "atendente",
    label: "Atendente / Vendedor",
    description: "Atende seus próprios chats, transfere e acompanha seus leads no CRM.",
    dbRole: "atendente",
    permissions: buildPermMap({
      "conversas.view": true,
      "conversas.transfer": true,
      "crm.view": true,
    }),
  },
  supervisor: {
    id: "supervisor",
    label: "Supervisor Comercial",
    description: "Enxerga todos os chats/leads da equipe, edita funis, acompanha relatórios e conexões.",
    dbRole: "atendente",
    permissions: buildPermMap({
      "conversas.view": true,
      "conversas.view_all": true,
      "conversas.transfer": true,
      "crm.view": true,
      "crm.view_all": true,
      "crm.edit_stages": true,
      "relatorios.view": true,
      "ai_usage.view": true,
      "conexao.manage": true,
    }),
  },
  marketing: {
    id: "marketing",
    label: "Marketing & Social",
    description: "Gerencia campanhas em massa, publicações, catálogo, automações e relatórios.",
    dbRole: "atendente",
    permissions: buildPermMap({
      "conversas.view": true,
      "crm.view": true,
      "campanhas.manage": true,
      "conteudo.publish": true,
      "catalogo.manage": true,
      "automacoes.manage": true,
      "relatorios.view": true,
    }),
  },
  admin: {
    id: "admin",
    label: "Administrador da Empresa",
    description: "Acesso total a todos os módulos, equipe, faturamento e configurações.",
    dbRole: "admin",
    permissions: buildPermMap({}, true),
  },
};

function mergeLegacyOrFlatPermissions(
  raw: Record<string, any> | null | undefined,
  target: GranularPermissions,
) {
  if (!raw || typeof raw !== "object") return;

  // 1) Chaves planas diretas ("modulo.acao")
  for (const key of ALL_PERMISSION_KEYS) {
    if (typeof raw[key] === "boolean") {
      target[key] = raw[key];
    }
  }

  // 2) Compatibilidade com o formato aninhado de funcoes-tab.tsx ({ modulo: { acao: bool } })
  if (raw.conversas && typeof raw.conversas === "object") {
    if (typeof raw.conversas.view === "boolean") target["conversas.view"] = raw.conversas.view;
    if (typeof raw.conversas.view_all === "boolean") target["conversas.view_all"] = raw.conversas.view_all;
    if (typeof raw.conversas.transfer === "boolean") target["conversas.transfer"] = raw.conversas.transfer;
    if (typeof raw.conversas.delete === "boolean") target["conversas.delete"] = raw.conversas.delete;
  }
  if (raw.crm && typeof raw.crm === "object") {
    if (typeof raw.crm.view === "boolean") target["crm.view"] = raw.crm.view;
    if (typeof raw.crm.view_all === "boolean") target["crm.view_all"] = raw.crm.view_all;
    if (typeof raw.crm.edit === "boolean") target["crm.edit_stages"] = raw.crm.edit;
    if (typeof raw.crm.create === "boolean" && raw.crm.create) target["crm.edit_stages"] = true;
  }
  if (raw.contatos && typeof raw.contatos === "object") {
    if (typeof raw.contatos.view === "boolean" && raw.contatos.view) target["crm.view"] = true;
    if (typeof raw.contatos.export === "boolean") target["crm.import_export"] = raw.contatos.export;
  }
  if (raw.agente && typeof raw.agente === "object") {
    if (raw.agente.edit || raw.agente.create || raw.agente.delete || raw.agente.toggle) {
      target["agente.manage"] = true;
    } else if (raw.agente.view === false) {
      target["agente.manage"] = false;
    }
  }
  if (raw.automacoes && typeof raw.automacoes === "object") {
    if (raw.automacoes.edit || raw.automacoes.create || raw.automacoes.toggle || raw.automacoes.view) {
      target["automacoes.manage"] = true;
    }
  }
  if (raw.campanhas && typeof raw.campanhas === "object") {
    if (raw.campanhas.create || raw.campanhas.send || raw.campanhas.edit || raw.campanhas.view) {
      target["campanhas.manage"] = true;
    }
  }
  if (raw.catalogo && typeof raw.catalogo === "object") {
    if (raw.catalogo.create || raw.catalogo.edit || raw.catalogo.delete || raw.catalogo.view) {
      target["catalogo.manage"] = true;
    }
  }
  if (raw.conexao && typeof raw.conexao === "object") {
    if (raw.conexao.create || raw.conexao.edit || raw.conexao.delete || raw.conexao.view) {
      target["conexao.manage"] = true;
    }
  }
  if (raw.comercial && typeof raw.comercial === "object") {
    if (typeof raw.comercial.view === "boolean") target["relatorios.view"] = raw.comercial.view;
  }
}

export function resolveEffectivePermissions(opts: {
  role?: string | null;
  isSuperAdmin?: boolean;
  customRolePermissions?: Record<string, any> | null;
  permissionsOverride?: Record<string, any> | null;
}): Record<string, boolean> {
  if (opts.isSuperAdmin || opts.role === "owner" || opts.role === "admin") {
    return buildPermMap({}, true);
  }

  const base: GranularPermissions = { ...PERMISSION_PRESETS.atendente.permissions };
  mergeLegacyOrFlatPermissions(opts.customRolePermissions, base);
  mergeLegacyOrFlatPermissions(opts.permissionsOverride, base);

  // Nunca delegáveis a sub-usuários ('atendente')
  for (const lockedKey of NON_DELEGABLE_PERMISSIONS) {
    base[lockedKey] = false;
  }

  return base;
}

export function hasPermission(
  perms: Record<string, boolean> | null | undefined,
  key: GranularPermissionKey | string,
): boolean {
  if (!perms) return false;
  return Boolean(perms[key]);
}

const ROUTE_PERMISSION_RULES: ReadonlyArray<{ prefix: string; permission: GranularPermissionKey }> = [
  { prefix: "/app/agente", permission: "agente.manage" },
  { prefix: "/app/automacoes", permission: "automacoes.manage" },
  { prefix: "/app/campanhas", permission: "campanhas.manage" },
  { prefix: "/app/conexao", permission: "conexao.manage" },
  { prefix: "/app/comercial", permission: "relatorios.view" },
  { prefix: "/app/relatorios", permission: "relatorios.view" },
  { prefix: "/app/publicacoes", permission: "conteudo.publish" },
  { prefix: "/app/conteudo", permission: "conteudo.publish" },
  { prefix: "/app/catalogo", permission: "catalogo.manage" },
  { prefix: "/app/prospeccao", permission: "prospeccao.view" },
  { prefix: "/app/integracoes", permission: "integracoes.manage" },
  { prefix: "/app/plugins", permission: "integracoes.manage" },
  { prefix: "/app/usuarios", permission: "configuracoes.team" },
  { prefix: "/app/checkout", permission: "configuracoes.billing" },
  { prefix: "/app/conversas", permission: "conversas.view" },
  { prefix: "/app/crm", permission: "crm.view" },
  { prefix: "/app/contatos", permission: "crm.view" },
];

export function canAccessRoute(
  pathname: string,
  perms: Record<string, boolean> | null | undefined,
  role?: string | null,
  isSuperAdmin = false,
): boolean {
  if (isSuperAdmin || role === "owner" || role === "admin") return true;
  const rule = ROUTE_PERMISSION_RULES.find(
    (r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`),
  );
  if (!rule) return true;
  return hasPermission(perms, rule.permission);
}

export function detectPresetFromPermissions(
  role: string | null | undefined,
  override?: Record<string, any> | null,
): PermissionPresetId {
  if (role === "admin" || role === "owner") return "admin";
  if (!override || typeof override !== "object") return "atendente";
  if (override["campanhas.manage"] && override["conteudo.publish"]) return "marketing";
  if (override["conversas.view_all"] && override["relatorios.view"]) return "supervisor";
  return "atendente";
}

// Compatibilidade legada com chamadas anteriores
export function can(
  membership: Membership | null | undefined,
  action:
    | "view_reports"
    | "view_settings"
    | "view_team"
    | "view_agent"
    | "view_billing"
    | "manage_team"
    | "view_master",
): boolean {
  const r = membership?.role;
  if (!r) return false;
  switch (action) {
    case "view_reports":
    case "view_settings":
    case "view_team":
    case "view_agent":
    case "manage_team":
      return r === "owner" || r === "admin";
    case "view_billing":
      return r === "owner";
    case "view_master":
      return false;
  }
}

export function requireRole(membership: Membership | null | undefined, allowed: Role[]): boolean {
  return !!membership && allowed.includes(membership.role);
}
