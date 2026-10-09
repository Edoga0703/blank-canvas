import jsPDF from "jspdf";
import { STATUS_COMPROMISSO, fmtHora, type Item, type Profissional, type Servico } from "./shared";

type Opcoes = {
  itens: Item[];
  servicos: Servico[];
  profissionais: Profissional[];
  filtrosResumo: string[];
  titulo?: string;
};

const AZUL: [number, number, number] = [11, 34, 254];
const CINZA: [number, number, number] = [110, 116, 134];
const LINHA: [number, number, number] = [226, 229, 238];

export function exportarCompromissosPdf({ itens, servicos, profissionais, filtrosResumo, titulo = "Relatório de Compromissos" }: Opcoes) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const larg = doc.internal.pageSize.getWidth();
  const alt = doc.internal.pageSize.getHeight();
  const M = 28;
  const geradoEm = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

  const ordenados = itens.slice().sort((a, b) => a.agendado_para.localeCompare(b.agendado_para));

  const util = larg - M * 2;
  const pesos = [
    { k: "data", label: "Data", p: 0.085 },
    { k: "hora", label: "Hora", p: 0.055 },
    { k: "contato", label: "Contato", p: 0.215 },
    { k: "telefone", label: "Telefone", p: 0.145 },
    { k: "tipo", label: "Serviço / Título", p: 0.215 },
    { k: "resp", label: "Responsável", p: 0.145 },
    { k: "status", label: "Status", p: 0.14 },
  ] as const;
  const cols = pesos.map((c) => ({ ...c, w: util * c.p }));
  const PAD = 4;


  function cortar(txt: string, largura: number) {
    const max = largura - PAD * 2;
    if (doc.getTextWidth(txt) <= max) return txt;
    let s = txt;
    while (s.length > 1 && doc.getTextWidth(`${s}…`) > max) s = s.slice(0, -1);
    return `${s}…`;
  }

  let y = 0;

  function cabecalho(primeira: boolean) {
    if (primeira) {
      doc.setFillColor(...AZUL);
      doc.rect(0, 0, larg, 78, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.text(titulo, M, 38);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(`Gerado em ${geradoEm} · ${ordenados.length} compromisso(s)`, M, 56);
      y = 100;
      if (filtrosResumo.length) {
        doc.setTextColor(...CINZA);
        doc.setFontSize(9);
        const txt = doc.splitTextToSize(`Filtros: ${filtrosResumo.join(" · ")}`, larg - M * 2);
        doc.text(txt, M, y);
        y += txt.length * 12 + 8;
      }
    } else {
      y = 48;
    }
  }

  function cabecalhoTabela() {
    doc.setFillColor(244, 245, 249);
    doc.rect(M, y - 12, larg - M * 2, 20, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.6);
    doc.setTextColor(60, 64, 80);
    let x = M;
    for (const c of cols) {
      const ultima = c.k === "status";
      if (ultima) doc.text(cortar(c.label.toUpperCase(), c.w), x + c.w - PAD, y + 2, { align: "right" });
      else doc.text(cortar(c.label.toUpperCase(), c.w), x + PAD, y + 2);
      x += c.w;
    }
    y += 20;
  }

  function novaPagina() {
    doc.addPage();
    cabecalho(false);
    cabecalhoTabela();
  }

  function garantirEspaco(h: number) {
    if (y + h > alt - 50) novaPagina();
  }

  cabecalho(true);
  cabecalhoTabela();

  let diaAtual = "";
  for (const i of ordenados) {
    const d = new Date(i.agendado_para);
    const dia = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
    garantirEspaco(20);
    const st = STATUS_COMPROMISSO[i.status];
    const valores: Record<string, string> = {
      data: dia === diaAtual ? "" : dia,
      hora: fmtHora(i.agendado_para),
      contato: i.nome_lead || "Sem nome",
      telefone: i.numero || "—",
      tipo: servicos.find((s) => s.id === i.servico_id)?.nome || i.titulo || "—",
      resp: profissionais.find((p) => p.user_id === i.profissional_id)?.nome || "—",
      status: st?.label || i.status,
    };
    diaAtual = dia;
    let x = M;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.6);
    doc.setTextColor(35, 38, 50);
    for (const c of cols) {
      if (c.k === "data" || c.k === "hora") doc.setFont("helvetica", "bold");
      const txt = cortar(valores[c.k] ?? "—", c.w);
      if (c.k === "status") doc.text(txt, x + c.w - PAD, y + 3, { align: "right" });
      else doc.text(txt, x + PAD, y + 3);
      if (c.k === "data" || c.k === "hora") doc.setFont("helvetica", "normal");
      x += c.w;
    }
    y += 16;
    doc.setDrawColor(...LINHA);
    doc.line(M, y - 7, larg - M, y - 7);
  }


  if (ordenados.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...CINZA);
    doc.text("Nenhum compromisso encontrado para os filtros selecionados.", M, y + 10);
  }

  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setDrawColor(...LINHA);
    doc.line(M, alt - 38, larg - M, alt - 38);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...CINZA);
    doc.text("Metrix CRM · Central de Agendamentos", M, alt - 24);
    doc.text(`Página ${p} de ${total}`, larg - M, alt - 24, { align: "right" });
  }

  doc.save(`compromissos-${new Date().toISOString().slice(0, 10)}.pdf`);
}
