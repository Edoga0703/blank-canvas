// Geração do recibo em PDF (client-side, download direto).
import { jsPDF } from "jspdf";
import { brand } from "@/config/brand";
import type { ReceiptData } from "@/lib/invoices.functions";
import whiteLogoAsset from "@/assets/metrix-receipt-white.png.asset.json";
import blueLogoAsset from "@/assets/metrix-receipt-blue.png.asset.json";

const BRAND: [number, number, number] = [11, 34, 254];
const INK: [number, number, number] = [24, 26, 40];
const MUTED: [number, number, number] = [124, 130, 150];
const LINE: [number, number, number] = [228, 231, 240];

function brl(cents: number | null) {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function dataBR(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "short" });
}
function docFmt(v?: string | null) {
  const d = (v ?? "").replace(/\D/g, "");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return v || "";
}

export type ReceiptItem = { nome: string; quantidade: number; total_cents: number };

async function imageData(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function gerarReciboPDF(d: ReceiptData & { itens?: ReceiptItem[] }) {
  const [whiteLogo, blueLogo] = await Promise.all([
    imageData(whiteLogoAsset.url),
    imageData(blueLogoAsset.url),
  ]);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 46;
  const pago = d.invoice.status === "pago";

  // ---------- Cabeçalho ----------
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, W, 110, "F");
  doc.setFillColor(255, 255, 255);
  doc.setGState(new (doc as any).GState({ opacity: 0.08 }));
  doc.circle(W - 60, 10, 90, "F");
  doc.setGState(new (doc as any).GState({ opacity: 1 }));

  if (whiteLogo) {
    doc.addImage(whiteLogo, "PNG", M, 22, 170, 48, undefined, "FAST");
  } else {
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold").setFontSize(22);
    doc.text(brand.name, M, 46);
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "normal").setFontSize(10.5);
  doc.text("Recibo de pagamento", M, 86);
  if (d.emissor.cnpj) {
    doc.setFontSize(9);
    doc.text(`CNPJ ${docFmt(d.emissor.cnpj)}`, M, 101);
  }
  doc.setFontSize(9);
  doc.text(`Recibo nº ${d.invoice.id.slice(0, 8).toUpperCase()}`, W - M, 46, { align: "right" });
  doc.text(dataBR(d.invoice.created_at), W - M, 63, { align: "right" });

  // Selo de status
  const selo = pago ? "PAGO" : d.invoice.status.toUpperCase();
  doc.setFont("helvetica", "bold").setFontSize(9);
  const selW = doc.getTextWidth(selo) + 22;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(W - M - selW, 74, selW, 20, 10, 10, "F");
  doc.setTextColor(...BRAND);
  doc.text(selo, W - M - selW / 2, 88, { align: "center" });

  // Marca-d'água institucional, atrás de todo o conteúdo.
  if (blueLogo) {
    doc.setGState(new (doc as any).GState({ opacity: 0.035 }));
    doc.addImage(blueLogo, "PNG", (W - 400) / 2, (H - 113) / 2, 400, 113, undefined, "FAST");
    doc.setGState(new (doc as any).GState({ opacity: 1 }));
  }

  // ---------- Valor em destaque ----------
  let y = 140;
  doc.setFillColor(246, 247, 252);
  doc.roundedRect(M, y - 26, W - M * 2, 74, 12, 12, "F");
  doc.setFont("helvetica", "normal").setFontSize(9.5).setTextColor(...MUTED);
  doc.text("VALOR PAGO", M + 18, y - 4);
  doc.setFont("helvetica", "bold").setFontSize(28).setTextColor(...BRAND);
  doc.text(brl(d.invoice.amount_cents), M + 18, y + 28);
  doc.setFont("helvetica", "normal").setFontSize(9.5).setTextColor(...MUTED);
  doc.text("FORMA DE PAGAMENTO", W - M - 18, y - 4, { align: "right" });
  doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(...INK);
  doc.text(d.invoice.metodo ?? "—", W - M - 18, y + 20, { align: "right" });
  y += 78;

  // ---------- Blocos lado a lado ----------
  const colW = (W - M * 2 - 18) / 2;
  const bloco = (x: number, topo: number, titulo: string, linhas: Array<[string, string]>) => {
    let yy = topo;
    doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...BRAND);
    doc.text(titulo.toUpperCase(), x, yy);
    yy += 6;
    doc.setDrawColor(...LINE);
    doc.line(x, yy, x + colW, yy);
    yy += 16;
    doc.setFontSize(9.5);
    for (const [k, v] of linhas) {
      if (!v) continue;
      doc.setFont("helvetica", "normal").setTextColor(...MUTED);
      doc.text(k, x, yy);
      doc.setTextColor(...INK);
      const txt = doc.splitTextToSize(v, colW - 96) as string[];
      doc.text(txt, x + 96, yy);
      yy += 14 * txt.length + 3;
    }
    return yy;
  };

  const yEmissor = bloco(M, y, "Emitido por", [
    ["Razão social", d.emissor.razao_social || brand.name],
    ["CNPJ", docFmt(d.emissor.cnpj)],
    ["Endereço", d.emissor.endereco],
    ["E-mail", d.emissor.email],
    ["Telefone", d.emissor.telefone],
  ]);
  const yPagador = bloco(M + colW + 18, y, "Pagador", [
    ["Nome", d.pagador.nome ?? "—"],
    ["CNPJ/CPF", docFmt(d.pagador.documento)],
    ["E-mail", d.pagador.email ?? ""],
  ]);
  y = Math.max(yEmissor, yPagador) + 14;

  // ---------- Detalhes ----------
  y = bloco(M, y, "Detalhes da cobrança", []) + 4;
  const detalhes: Array<[string, string]> = [
    ["Descrição", d.plano ? `Assinatura ${brand.name} — plano ${d.plano}` : `Assinatura ${brand.name}`],
    ["Processado por", d.invoice.provider.charAt(0).toUpperCase() + d.invoice.provider.slice(1)],
    ["Identificador", d.invoice.external_id ?? d.invoice.id],
    ["Data do pagamento", dataBR(d.invoice.created_at)],
    ["Válido até", d.invoice.periodo_fim ? new Date(d.invoice.periodo_fim).toLocaleDateString("pt-BR") : ""],
  ];
  doc.setFontSize(9.5);
  for (const [k, v] of detalhes) {
    if (!v) continue;
    doc.setFont("helvetica", "normal").setTextColor(...MUTED);
    doc.text(k, M, y);
    doc.setTextColor(...INK);
    doc.text(doc.splitTextToSize(v, W - M * 2 - 130) as string[], M + 130, y);
    y += 16;
  }
  y += 12;

  // ---------- Itens ----------
  if (d.itens?.length) {
    doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...BRAND);
    doc.text("ITENS", M, y);
    y += 6;
    doc.setDrawColor(...LINE);
    doc.line(M, y, W - M, y);
    y += 16;
    doc.setFontSize(10);
    for (const it of d.itens) {
      doc.setFont("helvetica", "normal").setTextColor(...INK);
      doc.text(`${it.quantidade > 1 ? `${it.quantidade}x ` : ""}${it.nome}`, M, y);
      doc.text(brl(it.total_cents), W - M, y, { align: "right" });
      y += 17;
    }
    doc.setDrawColor(...LINE);
    doc.line(M, y, W - M, y);
    y += 18;
    doc.setFont("helvetica", "bold").setTextColor(...INK);
    doc.text("Total pago", M, y);
    doc.setTextColor(...BRAND);
    doc.text(brl(d.invoice.amount_cents), W - M, y, { align: "right" });
    y += 24;
  }

  if (d.emissor.observacao) {
    doc.setFont("helvetica", "italic").setFontSize(9).setTextColor(...MUTED);
    doc.text(doc.splitTextToSize(d.emissor.observacao, W - M * 2) as string[], M, y);
  }

  // ---------- Rodapé ----------
  doc.setFillColor(246, 247, 252);
  doc.rect(0, H - 56, W, 56, "F");
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED);
  doc.text(
    `Recebemos de ${d.pagador.nome ?? "—"} a importância de ${brl(d.invoice.amount_cents)} referente à assinatura ${brand.name}.`,
    W / 2,
    H - 34,
    { align: "center" },
  );
  doc.text("Documento gerado eletronicamente. Não substitui nota fiscal.", W / 2, H - 20, { align: "center" });

  const dt = new Date(d.invoice.created_at).toISOString().slice(0, 10);
  doc.save(`recibo-${dt}-${d.invoice.id.slice(0, 8)}.pdf`);
}
