import React, { useMemo } from "react";
import { Sparkles, FileText, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FormattedMessageTextProps {
  text: string;
  isOut?: boolean;
  className?: string;
}

interface InlineToken {
  type: "text" | "bold" | "italic" | "strikethrough" | "code" | "link";
  content: string;
  url?: string;
  tokens?: InlineToken[];
}

interface ParsedBlock {
  type: "header" | "divider" | "list-item" | "blockquote" | "code-block" | "paragraph" | "empty";
  level?: number;
  listType?: "bullet" | "number";
  itemNumber?: string;
  rawText: string;
}

function parseBlocks(raw: string): {
  isAiAnalysis: boolean;
  analysisTitle?: string;
  isPaymentVoucher: boolean;
  blocks: ParsedBlock[];
} {
  let text = (raw || "").trim();
  let isAiAnalysis = false;
  let isPaymentVoucher = false;
  let analysisTitle: string | undefined = undefined;

  // Detect [Imagen recibido: ...] or [Documento recibido: ...] or [O cliente enviou...: ...]
  const analysisMatch = text.match(
    /^\[(Imagen recibid[ao]|Documento recibid[ao]|O cliente enviou um[a]? (?:imagem|documento|v[íi]deo)[^:]*):\s*([\s\S]*?)\]$/i,
  );

  if (analysisMatch) {
    isAiAnalysis = true;
    const kind = analysisMatch[1]!.toLowerCase();
    const content = analysisMatch[2]!.trim();
    text = content;

    const isDoc = kind.includes("documento");
    const isPayment = /comprovante|comprobante|transfer[eê]ncia|pago m[oó]vil|banco|operaci[oó]n exitosa|refer[eê]ncia|valor da opera/i.test(
      content,
    );

    if (isPayment) {
      isPaymentVoucher = true;
      analysisTitle = "Análisis de Comprobante / Pago (IA)";
    } else if (isDoc) {
      analysisTitle = "Resumen de Documento (IA)";
    } else {
      analysisTitle = "Análisis Visual de IA";
    }
  }

  const lines = text.split(/\r?\n/);
  const blocks: ParsedBlock[] = [];
  let inCodeBlock = false;
  let codeBuffer: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // Code block check ```
    if (trimmed.startsWith("```")) {
      if (inCodeBlock) {
        blocks.push({
          type: "code-block",
          rawText: codeBuffer.join("\n"),
        });
        codeBuffer = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    // Empty line
    if (!trimmed) {
      blocks.push({ type: "empty", rawText: "" });
      continue;
    }

    // Horizontal divider: ---, ***, ___
    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ type: "divider", rawText: line });
      continue;
    }

    // Headings: #, ##, ###, ####
    const headerMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headerMatch) {
      blocks.push({
        type: "header",
        level: headerMatch[1]!.length,
        rawText: headerMatch[2]!.trim(),
      });
      continue;
    }

    // Blockquote: > ...
    if (trimmed.startsWith(">")) {
      blocks.push({
        type: "blockquote",
        rawText: trimmed.replace(/^>\s*/, ""),
      });
      continue;
    }

    // Numbered list item: 1. , 2. , etc.
    const numMatch = trimmed.match(/^(\d+)[\.\)]\s+(.*)$/);
    if (numMatch) {
      blocks.push({
        type: "list-item",
        listType: "number",
        itemNumber: numMatch[1],
        rawText: numMatch[2]!.trim(),
      });
      continue;
    }

    // Bullet list item: * , - , • 
    const bulletMatch = trimmed.match(/^[\*\-•]\s+(.*)$/);
    if (bulletMatch) {
      blocks.push({
        type: "list-item",
        listType: "bullet",
        rawText: bulletMatch[1]!.trim(),
      });
      continue;
    }

    // Standard paragraph line
    blocks.push({
      type: "paragraph",
      rawText: line,
    });
  }

  if (inCodeBlock && codeBuffer.length > 0) {
    blocks.push({
      type: "code-block",
      rawText: codeBuffer.join("\n"),
    });
  }

  return { isAiAnalysis, analysisTitle, isPaymentVoucher, blocks };
}

function tokenizeInline(text: string): InlineToken[] {
  if (!text) return [];

  const placeholderMap = new Map<string, InlineToken>();
  let pIdx = 0;

  // Protect code spans `...`
  let processed = text.replace(/`([^`\n]+)`/g, (_, code) => {
    const key = `\uE000CODE${pIdx++}\uE001`;
    placeholderMap.set(key, { type: "code", content: code });
    return key;
  });

  // Protect URLs
  processed = processed.replace(/(https?:\/\/[^\s<]+)/g, (_, url) => {
    const key = `\uE000URL${pIdx++}\uE001`;
    placeholderMap.set(key, { type: "link", content: url, url });
    return key;
  });

  // Protect markdown links [label](url)
  processed = processed.replace(/\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g, (_, label, url) => {
    const key = `\uE000LINK${pIdx++}\uE001`;
    placeholderMap.set(key, { type: "link", content: label, url });
    return key;
  });

  function parseFormatting(s: string): InlineToken[] {
    const tokens: InlineToken[] = [];
    let remaining = s;
    let idx = 0;

    while (idx < remaining.length) {
      // 1. Italic parenthetical: *( ... )*
      if (remaining.startsWith("*(", idx)) {
        const closeIdx = remaining.indexOf(")*", idx + 2);
        if (closeIdx !== -1) {
          if (idx > 0) tokens.push({ type: "text", content: remaining.slice(0, idx) });
          const inner = remaining.slice(idx + 2, closeIdx);
          tokens.push({
            type: "italic",
            content: `(${inner})`,
            tokens: parseFormatting(`(${inner})`),
          });
          remaining = remaining.slice(closeIdx + 2);
          idx = 0;
          continue;
        }
      }

      // 2. Bold: **...**
      if (remaining.startsWith("**", idx)) {
        const closeIdx = remaining.indexOf("**", idx + 2);
        if (closeIdx !== -1) {
          if (idx > 0) tokens.push({ type: "text", content: remaining.slice(0, idx) });
          const inner = remaining.slice(idx + 2, closeIdx);
          tokens.push({
            type: "bold",
            content: inner,
            tokens: parseFormatting(inner),
          });
          remaining = remaining.slice(closeIdx + 2);
          idx = 0;
          continue;
        }
      }

      // 3. Bold: __...__
      if (remaining.startsWith("__", idx)) {
        const closeIdx = remaining.indexOf("__", idx + 2);
        if (closeIdx !== -1) {
          if (idx > 0) tokens.push({ type: "text", content: remaining.slice(0, idx) });
          const inner = remaining.slice(idx + 2, closeIdx);
          tokens.push({
            type: "bold",
            content: inner,
            tokens: parseFormatting(inner),
          });
          remaining = remaining.slice(closeIdx + 2);
          idx = 0;
          continue;
        }
      }

      // 4. Strikethrough: ~~...~~
      if (remaining.startsWith("~~", idx)) {
        const closeIdx = remaining.indexOf("~~", idx + 2);
        if (closeIdx !== -1) {
          if (idx > 0) tokens.push({ type: "text", content: remaining.slice(0, idx) });
          const inner = remaining.slice(idx + 2, closeIdx);
          tokens.push({
            type: "strikethrough",
            content: inner,
            tokens: parseFormatting(inner),
          });
          remaining = remaining.slice(closeIdx + 2);
          idx = 0;
          continue;
        }
      }

      // 5. WhatsApp bold or markdown italic: Single *...*
      if (remaining[idx] === "*" && remaining[idx + 1] !== "*" && remaining[idx - 1] !== "*") {
        let closeIdx = -1;
        for (let j = idx + 1; j < remaining.length; j++) {
          if (remaining[j] === "*" && remaining[j + 1] !== "*" && remaining[j - 1] !== "*" && remaining[j - 1] !== " ") {
            closeIdx = j;
            break;
          }
        }
        if (closeIdx !== -1 && closeIdx > idx + 1 && remaining[idx + 1] !== " ") {
          if (idx > 0) tokens.push({ type: "text", content: remaining.slice(0, idx) });
          const inner = remaining.slice(idx + 1, closeIdx);
          tokens.push({
            type: "bold",
            content: inner,
            tokens: parseFormatting(inner),
          });
          remaining = remaining.slice(closeIdx + 1);
          idx = 0;
          continue;
        }
      }

      // 6. Italic: _..._
      if (remaining[idx] === "_" && remaining[idx + 1] !== "_" && remaining[idx - 1] !== "_") {
        let closeIdx = -1;
        for (let j = idx + 1; j < remaining.length; j++) {
          if (remaining[j] === "_" && remaining[j + 1] !== "_" && remaining[j - 1] !== "_" && remaining[j - 1] !== " ") {
            closeIdx = j;
            break;
          }
        }
        if (closeIdx !== -1 && closeIdx > idx + 1 && remaining[idx + 1] !== " ") {
          if (idx > 0) tokens.push({ type: "text", content: remaining.slice(0, idx) });
          const inner = remaining.slice(idx + 1, closeIdx);
          tokens.push({
            type: "italic",
            content: inner,
            tokens: parseFormatting(inner),
          });
          remaining = remaining.slice(closeIdx + 1);
          idx = 0;
          continue;
        }
      }

      // 7. Strikethrough: ~...~
      if (remaining[idx] === "~" && remaining[idx + 1] !== "~" && remaining[idx - 1] !== "~") {
        let closeIdx = -1;
        for (let j = idx + 1; j < remaining.length; j++) {
          if (remaining[j] === "~" && remaining[j + 1] !== "~" && remaining[j - 1] !== "~" && remaining[j - 1] !== " ") {
            closeIdx = j;
            break;
          }
        }
        if (closeIdx !== -1 && closeIdx > idx + 1 && remaining[idx + 1] !== " ") {
          if (idx > 0) tokens.push({ type: "text", content: remaining.slice(0, idx) });
          const inner = remaining.slice(idx + 1, closeIdx);
          tokens.push({
            type: "strikethrough",
            content: inner,
            tokens: parseFormatting(inner),
          });
          remaining = remaining.slice(closeIdx + 1);
          idx = 0;
          continue;
        }
      }

      idx++;
    }

    if (remaining.length > 0) {
      tokens.push({ type: "text", content: remaining });
    }

    return tokens;
  }

  function restorePlaceholders(tokens: InlineToken[]): InlineToken[] {
    const result: InlineToken[] = [];
    for (const token of tokens) {
      if (token.type === "text") {
        let t = token.content;
        const phRegex = /\uE000(CODE|URL|LINK)\d+\uE001/g;
        let last = 0;
        let phMatch: RegExpExecArray | null;
        while ((phMatch = phRegex.exec(t)) !== null) {
          if (phMatch.index > last) {
            result.push({ type: "text", content: t.slice(last, phMatch.index) });
          }
          const ph = placeholderMap.get(phMatch[0]);
          if (ph) result.push(ph);
          else result.push({ type: "text", content: phMatch[0] });
          last = phRegex.lastIndex;
        }
        if (last < t.length) {
          result.push({ type: "text", content: t.slice(last) });
        }
      } else if (token.tokens) {
        result.push({ ...token, tokens: restorePlaceholders(token.tokens) });
      } else {
        result.push(token);
      }
    }
    return result;
  }

  return restorePlaceholders(parseFormatting(processed));
}

function RenderInline({ tokens, isOut }: { tokens: InlineToken[]; isOut?: boolean }) {
  return (
    <>
      {tokens.map((token, i) => {
        if (token.type === "bold") {
          return (
            <strong key={i} className="font-bold text-inherit">
              {token.tokens ? <RenderInline tokens={token.tokens} isOut={isOut} /> : token.content}
            </strong>
          );
        }
        if (token.type === "italic") {
          return (
            <em key={i} className="italic text-inherit opacity-90">
              {token.tokens ? <RenderInline tokens={token.tokens} isOut={isOut} /> : token.content}
            </em>
          );
        }
        if (token.type === "strikethrough") {
          return (
            <del key={i} className="line-through opacity-70">
              {token.tokens ? <RenderInline tokens={token.tokens} isOut={isOut} /> : token.content}
            </del>
          );
        }
        if (token.type === "code") {
          return (
            <code
              key={i}
              className={cn(
                "font-mono text-[11.5px] px-1.5 py-0.5 rounded font-medium",
                isOut
                  ? "bg-white/20 text-white border border-white/25"
                  : "bg-muted text-foreground border border-border/50",
              )}
            >
              {token.content}
            </code>
          );
        }
        if (token.type === "link") {
          return (
            <a
              key={i}
              href={token.url || token.content}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "underline underline-offset-2 break-all font-medium transition hover:opacity-80",
                isOut ? "text-white" : "text-[color:var(--brand)]",
              )}
            >
              {token.content}
            </a>
          );
        }
        return <React.Fragment key={i}>{token.content}</React.Fragment>;
      })}
    </>
  );
}

export function FormattedMessageText({ text, isOut, className }: FormattedMessageTextProps) {
  const parsed = useMemo(() => parseBlocks(text), [text]);

  if (!text) return null;

  const content = (
    <div className={cn("text-[13px] sm:text-[13.5px] leading-relaxed select-text space-y-1", className)}>
      {parsed.blocks.map((block, idx) => {
        if (block.type === "empty") {
          return <div key={idx} className="h-1.5" />;
        }

        if (block.type === "divider") {
          return (
            <hr
              key={idx}
              className={cn(
                "my-2.5 border-t",
                isOut ? "border-white/25" : "border-[color:var(--hairline)]",
              )}
            />
          );
        }

        if (block.type === "header") {
          const tokens = tokenizeInline(block.rawText);
          const level = block.level || 3;
          const headerClasses =
            level === 1
              ? "text-[15px] sm:text-[16px] font-extrabold tracking-tight mt-3 mb-1.5"
              : level === 2
                ? "text-[14px] sm:text-[14.5px] font-bold tracking-tight mt-2.5 mb-1"
                : "text-[13px] sm:text-[13.5px] font-bold tracking-tight mt-2 mb-0.5";

          return (
            <div key={idx} className={cn(headerClasses, "text-inherit")}>
              <RenderInline tokens={tokens} isOut={isOut} />
            </div>
          );
        }

        if (block.type === "list-item") {
          const tokens = tokenizeInline(block.rawText);
          return (
            <div key={idx} className="flex items-start gap-2 my-0.5 pl-0.5">
              <span
                className={cn(
                  "select-none shrink-0 text-center font-medium",
                  block.listType === "number"
                    ? "font-mono text-[11px] min-w-[16px] pt-0.5 opacity-80"
                    : "text-[14px] leading-tight opacity-75",
                  isOut ? "text-white/80" : "text-muted-foreground",
                )}
              >
                {block.listType === "number" ? `${block.itemNumber}.` : "•"}
              </span>
              <div className="flex-1 break-words leading-relaxed text-inherit">
                <RenderInline tokens={tokens} isOut={isOut} />
              </div>
            </div>
          );
        }

        if (block.type === "blockquote") {
          const tokens = tokenizeInline(block.rawText);
          return (
            <blockquote
              key={idx}
              className={cn(
                "border-l-2 pl-2.5 my-1.5 italic opacity-90",
                isOut ? "border-white/40" : "border-[color:var(--brand)]",
              )}
            >
              <RenderInline tokens={tokens} isOut={isOut} />
            </blockquote>
          );
        }

        if (block.type === "code-block") {
          return (
            <pre
              key={idx}
              className={cn(
                "font-mono text-[11.5px] p-2.5 rounded-lg overflow-x-auto my-2",
                isOut
                  ? "bg-black/25 text-white border border-white/15"
                  : "bg-muted text-foreground border border-border/60",
              )}
            >
              {block.rawText}
            </pre>
          );
        }

        // Standard paragraph
        const tokens = tokenizeInline(block.rawText);
        return (
          <div key={idx} className="break-words leading-relaxed text-inherit">
            <RenderInline tokens={tokens} isOut={isOut} />
          </div>
        );
      })}
    </div>
  );

  // If this was an AI vision or document analysis message, wrap it in a dedicated high-end card
  if (parsed.isAiAnalysis) {
    return (
      <div
        className={cn(
          "rounded-xl p-3 my-1 border transition-shadow",
          isOut
            ? "bg-white/10 border-white/20 text-white"
            : parsed.isPaymentVoucher
              ? "bg-emerald-500/5 dark:bg-emerald-950/20 border-emerald-500/20 text-foreground"
              : "bg-blue-500/5 dark:bg-blue-950/20 border-blue-500/20 text-foreground",
        )}
      >
        <div
          className={cn(
            "flex items-center gap-1.5 text-[11px] font-bold tracking-wider uppercase mb-2.5 pb-1.5 border-b",
            isOut
              ? "text-white/90 border-white/20"
              : parsed.isPaymentVoucher
                ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/15"
                : "text-blue-600 dark:text-blue-400 border-blue-500/15",
          )}
        >
          {parsed.isPaymentVoucher ? (
            <CheckCircle2 className="size-3.5" />
          ) : parsed.analysisTitle?.includes("Documento") ? (
            <FileText className="size-3.5" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
          <span>{parsed.analysisTitle || "Análisis Visual de IA"}</span>
        </div>
        {content}
      </div>
    );
  }

  return content;
}
