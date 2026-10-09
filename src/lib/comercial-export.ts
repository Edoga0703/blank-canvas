// Exportações do módulo Comercial (client-side).
import { jsPDF } from "jspdf";
import { brand } from "@/config/brand";
import logoAsset from "@/assets/metrix-receipt-white.png.asset.json";

type Cell = string | number;
type SummaryItem = { label: string; value: string };
type ReportInput = {
  titulo: string;
  subtitulo: string;
  headers: string[];
  rows: Cell[][];
  resumo?: SummaryItem[];
};

const BRAND: [number, number, number] = [11, 34, 254];
const INK: [number, number, number] = [28, 32, 48];
const MUTED: [number, number, number] = [102, 110, 132];
const LINE: [number, number, number] = [225, 229, 239];
const SOFT: [number, number, number] = [246, 247, 251];

export function exportCSV(filename: string, headers: string[], rows: Cell[][]) {
  const esc = (v: Cell) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [headers.map(esc).join(";"), ...rows.map((r) => r.map(esc).join(";"))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

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

function safeFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function columnWeights(headers: string[]) {
  const custom: Record<string, number> = {
    Data: 0.75,
    Cliente: 1.65,
    Item: 1.45,
    Canal: 1,
    Vendedor: 1.35,
    Pagamento: 1.1,
    Valor: 1,
    Vendas: 0.75,
    Receita: 1.05,
    "Ticket médio": 1.05,
    Meta: 1.05,
    Progresso: 0.9,
    Falta: 1.05,
    Categoria: 1.15,
  };
  return headers.map((header) => custom[header] ?? 1.3);
}

function isNumericColumn(header: string) {
  return ["Vendas", "Receita", "Ticket médio", "Meta", "Progresso", "Falta", "Valor"].includes(header);
}

export async function createComercialPdf({ titulo, subtitulo, headers, rows, resumo = [] }: ReportInput) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4", compress: true });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 34;
  const tableW = W - M * 2;
  const generatedAt = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  const logo = await imageData(logoAsset.url);
  const weights = columnWeights(headers);
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  const widths = weights.map((weight) => (tableW * weight) / totalWeight);
  const footerTop = H - 31;
  let y = 0;

  function drawHeader(firstPage: boolean) {
    doc.setFillColor(...BRAND);
    doc.rect(0, 0, W, 82, "F");
    doc.setFillColor(255, 255, 255);
    doc.setGState(new (doc as any).GState({ opacity: 0.08 }));
    doc.circle(W - 28, 0, 94, "F");
    doc.setGState(new (doc as any).GState({ opacity: 1 }));

    if (logo) doc.addImage(logo, "PNG", M, 18, 126, 36, undefined, "FAST");
    else {
      doc.setFont("helvetica", "bold").setFontSize(20).setTextColor(255, 255, 255);
      doc.text(brand.name, M, 39);
    }
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(220, 225, 255);
    doc.text("INTELIGÊNCIA COMERCIAL", M, 66);

    doc.setFont("helvetica", "bold").setFontSize(17).setTextColor(255, 255, 255);
    doc.text(titulo, W - M, 34, { align: "right" });
    doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(226, 230, 255);
    doc.text(firstPage ? subtitulo : `${subtitulo} · continuação`, W - M, 53, { align: "right", maxWidth: W * 0.58 });
    doc.text(`Emitido em ${generatedAt}`, W - M, 67, { align: "right" });
    y = 102;
  }

  function drawSummary() {
    if (!resumo.length) return;
    const gap = 10;
    const itemW = (tableW - gap * (resumo.length - 1)) / resumo.length;
    resumo.forEach((item, index) => {
      const x = M + index * (itemW + gap);
      doc.setFillColor(...SOFT);
      doc.setDrawColor(...LINE);
      doc.roundedRect(x, y, itemW, 52, 6, 6, "FD");
      doc.setFont("helvetica", "bold").setFontSize(7).setTextColor(...MUTED);
      doc.text(item.label.toUpperCase(), x + 12, y + 17);
      doc.setFont("helvetica", "bold").setFontSize(15).setTextColor(...INK);
      const value = doc.splitTextToSize(item.value, itemW - 24) as string[];
      doc.text(value.slice(0, 1), x + 12, y + 38);
      doc.setFillColor(...BRAND);
      doc.rect(x, y, 3, 52, "F");
    });
    y += 68;
  }

  function drawTableHeader() {
    doc.setFillColor(235, 238, 247);
    doc.roundedRect(M, y, tableW, 25, 4, 4, "F");
    let x = M;
    headers.forEach((header, index) => {
      const alignRight = isNumericColumn(header);
      doc.setFont("helvetica", "bold").setFontSize(7.2).setTextColor(64, 72, 96);
      doc.text(header.toUpperCase(), alignRight ? x + widths[index] - 7 : x + 7, y + 16, {
        align: alignRight ? "right" : "left",
        maxWidth: widths[index] - 14,
      });
      x += widths[index];
    });
    y += 25;
  }

  function addPage() {
    doc.addPage("a4", "landscape");
    drawHeader(false);
    drawTableHeader();
  }

  drawHeader(true);
  drawSummary();
  drawTableHeader();

  if (!rows.length) {
    doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(...MUTED);
    doc.text("Nenhum dado encontrado para o período selecionado.", M + 8, y + 28);
  }

  rows.forEach((row, rowIndex) => {
    const lines = row.map((cell, index) => {
      const value = String(cell ?? "—");
      return doc.splitTextToSize(value, widths[index] - 14) as string[];
    });
    const rowH = Math.max(27, Math.min(50, Math.max(...lines.map((line) => line.length), 1) * 10 + 12));
    if (y + rowH > footerTop - 10) addPage();

    if (rowIndex % 2 === 1) {
      doc.setFillColor(249, 250, 253);
      doc.rect(M, y, tableW, rowH, "F");
    }
    let x = M;
    row.forEach((_cell, index) => {
      const alignRight = isNumericColumn(headers[index] ?? "");
      doc.setFont("helvetica", index === 0 ? "bold" : "normal").setFontSize(8).setTextColor(...INK);
      doc.text(lines[index].slice(0, 4), alignRight ? x + widths[index] - 7 : x + 7, y + 17, {
        align: alignRight ? "right" : "left",
        lineHeightFactor: 1.15,
      });
      x += widths[index];
    });
    doc.setDrawColor(...LINE);
    doc.line(M, y + rowH, M + tableW, y + rowH);
    y += rowH;
  });

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...LINE);
    doc.line(M, footerTop, W - M, footerTop);
    doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(...MUTED);
    doc.text(`${brand.name} · Relatórios comerciais`, M, H - 16);
    doc.text(`Página ${page} de ${pages}`, W - M, H - 16, { align: "right" });
  }

  doc.setProperties({
    title: `${titulo} — ${brand.name}`,
    subject: subtitulo,
    author: brand.name,
    creator: brand.name,
  });
  return doc;
}

export async function printReport(titulo: string, subtitulo: string, headers: string[], rows: Cell[][], resumo?: SummaryItem[]) {
  const doc = await createComercialPdf({ titulo, subtitulo, headers, rows, resumo });
  doc.save(`${safeFileName(titulo)}-${new Date().toISOString().slice(0, 10)}.pdf`);
}