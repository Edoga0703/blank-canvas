import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles, Wand2, User, UserPlus, Palette, Shirt, GraduationCap, Search } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { updateAgentAvatar, generateAgentAvatar } from "@/lib/agent-ai.functions";
import { toast } from "sonner";
import { AgentAvatar } from "./agent-avatar";
import { SKIN_TONES, CLOTHING_COLORS, HAIR_STYLES } from "./avatar-library";
import { cn } from "@/lib/utils";

interface AvatarBuilderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId: string;
  agentName: string;
  currentTraits?: any;
  currentAvatarUrl?: string;
  onSuccess: (url: string, traits: any) => void;
}

export function AvatarBuilder({
  open,
  onOpenChange,
  agentId,
  agentName,
  currentTraits,
  currentAvatarUrl,
  onSuccess,
}: AvatarBuilderProps) {
  const [loading, setLoading] = useState(false);
  const [traits, setTraits] = useState({
    name: currentTraits?.name || agentName || "",
    gender: currentTraits?.gender || "masculino",
    skinTone: currentTraits?.skinTone || SKIN_TONES[0].label,
    hair: currentTraits?.hair || HAIR_STYLES[0].label,
    clothingColor: currentTraits?.clothingColor || CLOTHING_COLORS[0].label,
    accessories: currentTraits?.accessories || [],
    extraPrompt: currentTraits?.extraPrompt || ""
  });
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(currentAvatarUrl || null);

  const saveTraits = useServerFn(updateAgentAvatar);
  const generateIA = useServerFn(generateAgentAvatar);

  useEffect(() => {
    if (!open) return;
    setGeneratedUrl(currentAvatarUrl || null);
    setTraits({
      name: currentTraits?.name || agentName || "",
      gender: currentTraits?.gender || "masculino",
      skinTone: currentTraits?.skinTone || SKIN_TONES[0].label,
      hair: currentTraits?.hair || HAIR_STYLES[0].label,
      clothingColor: currentTraits?.clothingColor || CLOTHING_COLORS[0].label,
      accessories: currentTraits?.accessories || [],
      extraPrompt: currentTraits?.extraPrompt || "",
    });
  }, [open, agentId, agentName, currentAvatarUrl, currentTraits]);

  const handleSave = async () => {
    if (!generatedUrl) return;
    setLoading(true);
    try {
      console.log("[AvatarBuilder] Saving:", { agentId, traits, avatarUrl: generatedUrl });
      await saveTraits({ data: { agentId, traits, avatarUrl: generatedUrl } });
      onSuccess(generatedUrl, traits);
      toast.success("Avatar salvo com sucesso!");
      onOpenChange(false);
    } catch (e: any) {
      console.error("[AvatarBuilder] Save error:", e);
      toast.error("Erro ao salvar: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateIA = async () => {
    setLoading(true);
    try {
      const res = await generateIA({ 
        data: { 
          agentId, 
          traits,
          customPrompt: traits.extraPrompt 
        } 
      });
      setGeneratedUrl(res.avatarUrl);
      toast.success("Avatar gerado com IA!");
    } catch (e: any) {
      toast.error("Erro ao gerar: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleAccessory = (acc: string) => {
    setTraits(prev => ({
      ...prev,
      accessories: prev.accessories.includes(acc)
        ? prev.accessories.filter((a: string) => a !== acc)
        : [...prev.accessories, acc]
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[650px] p-0 overflow-hidden border-none rounded-3xl bg-white">
        <div className="flex flex-col max-h-[90vh]">
          {/* Preview Panel (Top) */}
          <div className="w-full bg-slate-50 p-6 flex flex-col items-center border-b border-slate-100 shrink-0">
            <div className="relative group">
              <div className="size-32 rounded-full overflow-hidden shadow-2xl border-4 border-white bg-[#CFE6F5] flex items-center justify-center mb-4">
                <AgentAvatar avatarUrl={generatedUrl || undefined} size={128} />
              </div>
              
              {(generatedUrl || currentAvatarUrl) && (
                <Button
                  size="icon"
                  variant="secondary"
                  className="absolute bottom-4 right-0 size-8 rounded-full shadow-lg scale-0 group-hover:scale-100 transition-transform bg-white text-[#0B22FE] hover:bg-white/90"
                  onClick={() => window.open(generatedUrl || currentAvatarUrl || "", '_blank')}
                  title="Ver em tamanho maior"
                >
                  <Search className="size-4" />
                </Button>
              )}
            </div>
            
            <div className="text-center">
              <h3 className="text-lg font-bold text-slate-900">{traits.name || "Sem Nome"}</h3>
              <p className="text-sm text-slate-500 capitalize">{traits.gender}</p>
            </div>

            <div className="mt-2 w-full max-w-[320px]">
              <div className="p-3 rounded-2xl bg-blue-50 border border-blue-100 flex gap-2">
                <Sparkles className="size-4 text-[#0B22FE] shrink-0" />
                <p className="text-[11px] text-blue-800 leading-tight">
                  A IA gerará uma foto de perfil 3D profissional (estilo Pixar) sem gestos.
                </p>
              </div>
            </div>
          </div>

          {/* Controls Panel (Bottom) */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-6 space-y-6">
              <DialogHeader className="p-0 space-y-1">
                <DialogTitle className="text-xl font-bold text-[#0F172A]">Personalizar Avatar</DialogTitle>
                <DialogDescription className="text-sm text-slate-500">
                  Defina as características para a geração por IA.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6">
                {/* Nome */}
                <div className="space-y-3">
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                    <User className="size-3" /> Nome do Avatar
                  </Label>
                  <Input 
                    placeholder="Ex: Rafa, Bia, Max..."
                    value={traits.name}
                    onChange={(e) => setTraits({...traits, name: e.target.value})}
                    className="h-12 rounded-xl border-slate-200 focus-visible:ring-[#0B22FE]"
                  />
                </div>

                {/* Gênero */}
                <div className="space-y-3">
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                    <UserPlus className="size-3" /> Gênero
                  </Label>
                  <div className="grid grid-cols-2 gap-3">
                    {["masculino", "feminino"].map((g) => (
                      <Button
                        key={g}
                        variant="outline"
                        type="button"
                        onClick={() => setTraits({...traits, gender: g as any})}
                        className={cn(
                          "h-12 rounded-xl border-slate-200 capitalize font-medium",
                          traits.gender === g && "border-[#0B22FE] bg-blue-50 text-[#0B22FE]"
                        )}
                      >
                        {g}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Tom de Pele */}
                <div className="space-y-3">
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                    <Palette className="size-3" /> Tom de Pele
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {SKIN_TONES.map((s) => (
                      <button
                        key={s.label}
                        type="button"
                        onClick={() => setTraits({...traits, skinTone: s.label})}
                        className={cn(
                          "size-8 rounded-full border-2 transition-all",
                          traits.skinTone === s.label ? "border-[#0B22FE] scale-110" : "border-transparent"
                        )}
                        style={{ backgroundColor: s.color }}
                        title={s.label}
                      />
                    ))}
                  </div>
                </div>

                {/* Cor da Camisa */}
                <div className="space-y-3">
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                    <Shirt className="size-3" /> Cor da Camisa
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {CLOTHING_COLORS.map((c) => (
                      <button
                        key={c.label}
                        type="button"
                        onClick={() => setTraits({...traits, clothingColor: c.label})}
                        className={cn(
                          "size-8 rounded-full border-2 transition-all",
                          traits.clothingColor === c.label ? "border-[#0B22FE] scale-110" : "border-transparent"
                        )}
                        style={{ backgroundColor: c.color }}
                        title={c.label}
                      />
                    ))}
                  </div>
                </div>

                {/* Cabelo */}
                <div className="space-y-3">
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                    <GraduationCap className="size-3" /> Estilo de Cabelo
                  </Label>
                  <div className="grid grid-cols-3 gap-2">
                    {HAIR_STYLES.map((h) => (
                      <Button
                        key={h.id}
                        variant="outline"
                        type="button"
                        onClick={() => setTraits({...traits, hair: h.label})}
                        className={cn(
                          "h-10 rounded-lg border-slate-200 text-xs px-2 truncate",
                          traits.hair === h.label && "border-[#0B22FE] bg-blue-50 text-[#0B22FE]"
                        )}
                      >
                        {h.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Acessórios */}
                <div className="space-y-3">
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                    Acessórios
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {["Óculos", "Fone de ouvido", "Boné", "Barba", "Gravata"].map((acc) => (
                      <Button
                        key={acc}
                        variant="outline"
                        type="button"
                        onClick={() => toggleAccessory(acc)}
                        className={cn(
                          "h-10 rounded-lg border-slate-200 text-xs",
                          traits.accessories.includes(acc) && "border-[#0B22FE] bg-blue-50 text-[#0B22FE]"
                        )}
                      >
                        {acc}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Prompt Extra */}
                <div className="space-y-3">
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-400">Instruções Extras (Opcional)</Label>
                  <Textarea 
                    placeholder="Ex: Segurando um café, com fundo de escritório..."
                    value={traits.extraPrompt}
                    onChange={(e) => setTraits({...traits, extraPrompt: e.target.value})}
                    className="min-h-[80px] rounded-xl border-slate-200 focus-visible:ring-[#0B22FE] resize-none"
                  />
                </div>
              </div>

              <div className="pt-4 flex flex-col gap-3">
                <Button 
                  onClick={handleGenerateIA}
                  disabled={loading}
                  className="w-full h-14 rounded-2xl bg-gradient-to-r from-[#0B22FE] to-[#4F46E5] hover:opacity-90 font-bold gap-3 text-white shadow-xl shadow-blue-100"
                >
                  {loading ? <Loader2 className="size-5 animate-spin" /> : <Wand2 className="size-5" />}
                  Gerar Avatar com IA
                </Button>
                
                <div className="flex items-center justify-between pt-4">
                  <Button
                    variant="ghost"
                    className="rounded-xl h-12 px-6 font-bold text-slate-400 hover:bg-slate-50"
                    onClick={() => onOpenChange(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    className="rounded-xl h-12 px-10 font-bold bg-[#0B22FE] hover:bg-[#0B22FE]/90 text-white shadow-lg shadow-blue-200"
                    onClick={handleSave}
                    disabled={loading || !generatedUrl}
                  >
                    {loading && <Loader2 className="size-4 mr-2 animate-spin" />}
                    Salvar Avatar
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}