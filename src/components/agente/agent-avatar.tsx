import React from 'react';
import { AVATAR_LAYERS } from './avatar-layers';
import { type AvatarTraits } from './avatar-library';
import { cn } from '@/lib/utils';
import avatarPlaceholder from "@/assets/avatar-placeholder.png.asset.json";

interface AgentAvatarProps {
  traits?: AvatarTraits;
  avatarUrl?: string;
  size?: number;
  className?: string;
  fallbackSrc?: string;
  fallbackName?: string;
}

export function AgentAvatar({ traits, avatarUrl, size = 128, className = "", fallbackSrc, fallbackName }: AgentAvatarProps) {
  const finalUrl = avatarUrl || fallbackSrc;

  if (finalUrl) {
    return (
      <div 
        className={cn("relative overflow-hidden bg-slate-100 flex items-center justify-center", className)}
        style={{ width: size, height: size, borderRadius: '50%' }}
      >
        <img 
          src={finalUrl} 
          alt={fallbackName || "Avatar do Agente"} 
          className="w-full h-full object-cover"
          onError={(e) => {
            if (fallbackSrc && (e.target as HTMLImageElement).src !== fallbackSrc) {
              (e.target as HTMLImageElement).src = fallbackSrc;
            }
          }}
        />
      </div>
    );
  }

  if (traits) {
    const isMasculine = traits.gender === "masculino";
    const layers = isMasculine ? AVATAR_LAYERS.masculine : AVATAR_LAYERS.feminine;
    
    // Mapping traits to internal layer names if necessary
    const hairStyle = traits.hair as keyof typeof layers.hair;
    const hairFn = layers.hair[hairStyle] || layers.hair.curto;

    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 400 400"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
      >
        {/* Background */}
        {AVATAR_LAYERS.background("#CFE6F5")}
        
        {/* Shoulders & Clothing */}
        {layers.polo(traits.clothingColor)}
        
        {/* Neck & Face Shape */}
        {layers.face(traits.skinTone)}
        
        {/* Features */}
        {layers.features.eyes()}
        {layers.features.nose()}
        {layers.features.mouth()}
        
        {/* Hair */}
        {hairFn()}
        
        {/* Accessories */}
        {traits.accessories.includes("oculos") && layers.accessories.oculos()}
        {traits.accessories.includes("barba") && layers.accessories.barba?.()}
        {traits.accessories.includes("bone") && layers.accessories.bone()}
      </svg>
    );
  }

  return (
    <div 
      className={cn("relative overflow-hidden bg-[#CFE6F5] flex items-center justify-center text-white font-bold", className)}
      style={{ width: size, height: size, borderRadius: '50%', fontSize: size * 0.4 }}
    >
      {fallbackName ? (
        fallbackName.slice(0, 1).toUpperCase()
      ) : (
        <img 
          src={avatarPlaceholder.url} 
          alt="Avatar Placeholder" 
          className="w-full h-full object-cover opacity-80"
        />
      )}
    </div>
  );
}
