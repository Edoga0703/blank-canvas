import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "./company-cache";
import { storagePathFromUrl } from "./chat-media.functions";

const BUCKET = "chat-media";
const SIGN_TTL = 60 * 60 * 24; // 24h basta para o provedor baixar a mídia

export type DestinoEncaminhar = {
  numero: string;
  nome: string | null;
  foto_url: string | null;
  grupo: boolean;
  permitido: boolean;
  motivo: string | null;
};

type Perfil = {
  companyId: string;
  userId: string;
  gerente: boolean;
};

async function carregarPerfil(supabase: any, userId: string): Promise<Perfil> {
  const companyId = await resolveCompanyIdCached(supabase, userId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: membro }, { data: superRow }] = await Promise.all([
    supabaseAdmin.from("company_user").select("role").eq("company_id", companyId).eq("user_id", userId).maybeSingle(),
    supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).eq("role", "super_admin").maybeSingle(),
  ]);
  const role = String((membro as any)?.role ?? "");
  const gerente = !!superRow || role === "owner" || role === "admin";
  return { companyId, userId, gerente };
}

/** Regra de permissão: gerentes encaminham para qualquer conversa; atendente só para o que está aberto com ele. */
function avaliarDestino(perfil: Perfil, card: any | null): { permitido: boolean; motivo: string | null } {
  if (perfil.gerente) return { permitido: true, motivo: null };
  if (!card) return { permitido: false, motivo: "Sem atendimento aberto com você" };
  if (!card.owner_id) return { permitido: false, motivo: "Atendimento encerrado" };
  if (card.owner_id !== perfil.userId) return { permitido: false, motivo: "Atendimento de outro atendente" };
  return { permitido: true, motivo: null };
}

/** Lista de contatos e grupos para escolher o destino do encaminhamento. */
export const listarDestinosEncaminhamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { busca?: string | null }) => d ?? {})
  .handler(async ({ context, data }): Promise<DestinoEncaminhar[]> => {
    const { supabase, userId } = context;
    const perfil = await carregarPerfil(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const busca = (data?.busca ?? "").trim().toLowerCase();

    const [{ data: cards }, { data: company }] = await Promise.all([
      supabaseAdmin
        .from("crm_cards")
        .select("numero,nome,foto_url,owner_id,ultima_em")
        .eq("company_id", perfil.companyId)
        .order("ultima_em", { ascending: false, nullsFirst: false })
        .limit(500),
      supabaseAdmin.from("company").select("grupos_ativos").eq("id", perfil.companyId).maybeSingle(),
    ]);

    const lista: DestinoEncaminhar[] = [];
    for (const card of (cards ?? []) as any[]) {
      if (!card.numero || String(card.numero).includes("@g.us")) continue;
      const { permitido, motivo } = avaliarDestino(perfil, card);
      lista.push({
        numero: card.numero, nome: card.nome ?? null, foto_url: card.foto_url ?? null,
        grupo: false, permitido, motivo,
      });
    }

    if ((company as any)?.grupos_ativos) {
      const { data: grupos } = await supabaseAdmin
        .from("whatsapp_grupo")
        .select("jid,nome,foto_url,ultima_em")
        .eq("company_id", perfil.companyId)
        .order("ultima_em", { ascending: false, nullsFirst: false })
        .limit(200);
      for (const g of (grupos ?? []) as any[]) {
        lista.push({
          numero: g.jid, nome: g.nome ?? null, foto_url: g.foto_url ?? null,
          grupo: true, permitido: true, motivo: null,
        });
      }
    }

    const filtrada = busca
      ? lista.filter((d) => (d.nome ?? "").toLowerCase().includes(busca) || d.numero.includes(busca.replace(/\D/g, "")))
      : lista;

    // Destinos liberados primeiro
    return filtrada.sort((a, b) => Number(b.permitido) - Number(a.permitido)).slice(0, 200);
  });

/** Encaminha uma mensagem (texto, imagem, vídeo, áudio ou documento) para um ou mais destinos. */
export const encaminharMensagem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { messageId: string; destinos: string[] }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const perfil = await carregarPerfil(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (await import("./billing/access.server")).assertCompanyCanWrite(perfil.companyId);

    const destinos = Array.from(new Set((data.destinos ?? []).map((n) => String(n).trim()).filter(Boolean)));
    if (!destinos.length) throw new Error("Escolha pelo menos um destino.");
    if (destinos.length > 20) throw new Error("Encaminhe para no máximo 20 conversas por vez.");

    const { data: msg } = await supabaseAdmin
      .from("mensagens")
      .select("id,numero,texto,midia_url,midia_tipo,midia_mime,midia_nome,whatsapp_message_id")
      .eq("id", data.messageId)
      .eq("company_id", perfil.companyId)
      .maybeSingle();
    if (!msg) throw new Error("Mensagem não encontrada.");

    // Resolve a mídia (reassina a URL do storage quando necessário)
    let midiaUrl: string | null = (msg as any).midia_url ?? null;
    const midiaTipo: string | null = (msg as any).midia_tipo ?? null;
    if (midiaTipo && midiaUrl) {
      const path = storagePathFromUrl(midiaUrl);
      if (path) {
        const { data: signed } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, SIGN_TTL);
        if (signed?.signedUrl) midiaUrl = signed.signedUrl;
      }
    }
    if (midiaTipo && (!midiaUrl || midiaUrl.startsWith("/api/public/chat-media"))) {
      const { data: att } = await (supabaseAdmin as any)
        .from("message_attachments")
        .select("storage_key, storage_url, provider_url")
        .eq("mensagem_id", data.messageId)
        .eq("company_id", perfil.companyId)
        .limit(1)
        .maybeSingle();
      if (att?.storage_key) {
        const { createR2DownloadUrl } = await import("@/lib/storage/r2.server");
        midiaUrl = createR2DownloadUrl(att.storage_key, 3600);
      } else if (att?.storage_url || att?.provider_url) {
        midiaUrl = att.storage_url || att.provider_url;
      }
    }
    if (midiaTipo && !midiaUrl) throw new Error("A mídia desta mensagem não está mais disponível para encaminhar.");

    const texto = (msg as any).texto ?? "";
    if (!midiaTipo && !texto.trim()) throw new Error("Esta mensagem não tem conteúdo para encaminhar.");

    // Cards dos destinos (para checagem de permissão)
    const numerosContato = destinos.filter((d) => !d.includes("@g.us"));
    const cardsPorNumero = new Map<string, any>();
    if (numerosContato.length) {
      const { data: cards } = await supabaseAdmin
        .from("crm_cards")
        .select("numero,nome,owner_id")
        .eq("company_id", perfil.companyId)
        .in("numero", numerosContato);
      for (const c of (cards ?? []) as any[]) cardsPorNumero.set(String(c.numero), c);
    }

    const { getInstanceForContact, extractWhatsappMessageId } = await import("./whatsapp-helpers");
    const { waSendText, waSendMedia, waSendAudio } = await import("./wa-dispatch.server");
    const mediaTypeEnvio = (midiaTipo === "image" || midiaTipo === "video" || midiaTipo === "document")
      ? midiaTipo : "document";
    const mimeEnvio = (msg as any).midia_mime ?? "application/octet-stream";

    const instGrupo: any = null;

    const resultados: { numero: string; ok: boolean; erro?: string }[] = [];

    for (const destino of destinos) {
      const grupo = destino.includes("@g.us");
      try {
        if (!grupo) {
          const { permitido, motivo } = avaliarDestino(perfil, cardsPorNumero.get(destino) ?? null);
          if (!permitido) { resultados.push({ numero: destino, ok: false, erro: motivo ?? "Sem permissão" }); continue; }
        }

        let waId: string | null = null;

        if (grupo) {
          throw new Error("O envio para grupos está desabilitado na D-API.");
        } else {
          const inst = await getInstanceForContact(
            supabaseAdmin, perfil.companyId, destino,
            "instance_name,status,numero,provider,provider_type,instance_token", userId,
          );
          if (!inst?.instance_name) throw new Error("Conexão não disponível para este contato.");
          const rawProv = String((inst as any).provider || (inst as any).provider_type || "dapi").toLowerCase();
          const waInst = {
            company_id: perfil.companyId,
            instance_name: inst.instance_name,
            instance_token: (inst as any).instance_token ?? null,
            provider: (rawProv === "dapi_official" ? "dapi_official" : rawProv === "meta_instagram" || rawProv === "meta_messenger" || rawProv === "telegram" ? rawProv : "dapi") as any,
            status: (inst as any).status ?? "connected",
            paused: false,
          };
          if (midiaTipo === "audio") {
            const resp: any = await waSendAudio(waInst as any, destino, midiaUrl!);
            waId = extractWhatsappMessageId(resp);
          } else if (midiaTipo) {
            const resp: any = await waSendMedia(waInst as any, destino, {
              type: mediaTypeEnvio, url: midiaUrl!, mime: mimeEnvio,
              fileName: (msg as any).midia_nome ?? undefined,
              caption: texto || undefined,
            });
            waId = extractWhatsappMessageId(resp);
          } else {
            const resp: any = await waSendText(waInst as any, destino, texto);
            waId = extractWhatsappMessageId(resp);
          }
        }

        await supabaseAdmin.from("mensagens").insert({
          company_id: perfil.companyId, user_id: userId, numero: destino,
          contato_nome: grupo ? null : (cardsPorNumero.get(destino)?.nome ?? null),
          direcao: "saida", autor: "humano",
          texto: midiaTipo === "audio" ? "" : texto,
          midia_url: midiaTipo ? midiaUrl : null,
          midia_tipo: midiaTipo, midia_mime: (msg as any).midia_mime ?? null,
          midia_nome: (msg as any).midia_nome ?? null,
          grupo_jid: grupo ? destino : null,
          whatsapp_message_id: waId,
          status_envio: waId ? "enviado" : "pendente",
        } as any);

        resultados.push({ numero: destino, ok: true });
      } catch (e: any) {
        resultados.push({ numero: destino, ok: false, erro: e?.message ?? "Falha ao encaminhar" });
      }
    }

    const enviados = resultados.filter((r) => r.ok).length;
    return { ok: enviados > 0, enviados, total: destinos.length, resultados };
  });
