import React from 'react';

export const AVATAR_LAYERS = {
  // Background circular
  background: (color: string = "#CFE6F5") => (
    <circle cx="200" cy="200" r="180" fill={color} />
  ),
  
  // Masculino
  masculine: {
    shoulders: (color: string) => (
      <path
        d="M80 350 Q200 320 320 350 L320 400 L80 400 Z"
        fill={color}
        stroke="#0F172A"
        strokeWidth="3"
      />
    ),
    polo: (color: string) => (
      <g>
        <path d="M80 350 Q200 320 320 350 L320 400 L80 400 Z" fill={color} />
        <path d="M160 335 L200 360 L240 335" fill="none" stroke="#0F172A" strokeWidth="3" />
        <path d="M170 335 L200 375 L230 335" fill={color} stroke="#0F172A" strokeWidth="2" />
      </g>
    ),
    face: (skinTone: string) => (
      <g>
        {/* Neck */}
        <path d="M175 300 Q200 320 225 300 L225 340 Q200 350 175 340 Z" fill={skinTone} stroke="#0F172A" strokeWidth="2" />
        {/* Head Shape */}
        <path
          d="M130 180 Q130 80 200 80 Q270 80 270 180 Q270 280 200 280 Q130 280 130 180"
          fill={skinTone}
          stroke="#0F172A"
          strokeWidth="3"
        />
      </g>
    ),
    features: {
      eyes: () => (
        <g>
          <circle cx="170" cy="180" r="6" fill="#0F172A" />
          <circle cx="230" cy="180" r="6" fill="#0F172A" />
        </g>
      ),
      nose: () => <path d="M195 200 Q200 215 205 200" fill="none" stroke="#0F172A" strokeWidth="2" />,
      mouth: () => <path d="M175 235 Q200 255 225 235" fill="none" stroke="#0F172A" strokeWidth="3" strokeLinecap="round" />,
    },
    hair: {
      curto: () => <path d="M130 160 Q130 70 200 70 Q270 70 270 160 Q270 140 250 120 Q200 90 150 120 Q130 140 130 160" fill="#2D1B14" stroke="#0F172A" strokeWidth="2" />,
      cacheado: () => <path d="M120 180 Q120 60 200 60 Q280 60 280 180 Q260 160 240 160 Q200 130 160 160 Q140 160 120 180" fill="#2D1B14" stroke="#0F172A" strokeWidth="2" />,
      crespo: () => <path d="M125 170 Q125 65 200 65 Q275 65 275 170" fill="#1A110D" stroke="#0F172A" strokeWidth="2" />,
      ondulado: () => <path d="M120 170 Q120 70 200 70 Q280 70 280 170 L260 160 Q200 120 140 160 Z" fill="#3D2B1F" stroke="#0F172A" strokeWidth="2" />,
      executivo: () => <path d="M130 160 Q130 50 200 50 Q270 50 270 160 Q260 140 230 130 Q200 120 170 130 Q140 140 130 160" fill="#2D1B14" stroke="#0F172A" strokeWidth="2" />,
      despojado: () => <path d="M120 170 Q120 60 200 40 Q280 60 280 170 Q260 150 240 160 Q200 140 160 160 Q140 150 120 170" fill="#3D2B1F" stroke="#0F172A" strokeWidth="2" />,
      careca: () => null,
    },

    accessories: {
      oculos: () => (
        <g fill="none" stroke="#0F172A" strokeWidth="3">
          <circle cx="170" cy="180" r="18" />
          <circle cx="230" cy="180" r="18" />
          <path d="M188 180 L212 180" />
        </g>
      ),
      barba: () => <path d="M130 180 Q130 285 200 285 Q270 285 270 180 Q270 230 200 230 Q130 230 130 180" fill="#2D1B14" opacity="0.8" />,
      bone: () => (
        <g>
          <path d="M130 140 Q200 100 270 140 L280 150 L120 150 Z" fill="#0B22FE" />
          <path d="M130 145 L70 145 Q70 120 130 140" fill="#0B22FE" stroke="#0F172A" strokeWidth="2" />
        </g>
      ),
    }
  },
  
  // Feminino
  feminine: {
    shoulders: (color: string) => (
      <path
        d="M90 350 Q200 330 310 350 L310 400 L90 400 Z"
        fill={color}
        stroke="#0F172A"
        strokeWidth="3"
      />
    ),
    polo: (color: string) => (
      <g>
        <path d="M90 350 Q200 330 310 350 L310 400 L90 400 Z" fill={color} />
        <path d="M165 340 L200 365 L235 340" fill="none" stroke="#0F172A" strokeWidth="3" />
      </g>
    ),
    face: (skinTone: string) => (
      <g>
        <path d="M180 300 Q200 315 220 300 L220 340 Q200 350 180 340 Z" fill={skinTone} stroke="#0F172A" strokeWidth="2" />
        <path
          d="M135 180 Q135 90 200 90 Q265 90 265 180 Q265 270 200 270 Q135 270 135 180"
          fill={skinTone}
          stroke="#0F172A"
          strokeWidth="3"
        />
      </g>
    ),
    features: {
      eyes: () => (
        <g>
          <ellipse cx="175" cy="180" rx="5" ry="7" fill="#0F172A" />
          <ellipse cx="225" cy="180" rx="5" ry="7" fill="#0F172A" />
          <path d="M165 170 Q175 165 185 170" fill="none" stroke="#0F172A" strokeWidth="2" />
          <path d="M215 170 Q225 165 235 170" fill="none" stroke="#0F172A" strokeWidth="2" />
        </g>
      ),
      nose: () => <path d="M197 205 Q200 212 203 205" fill="none" stroke="#0F172A" strokeWidth="1.5" />,
      mouth: () => <path d="M182 235 Q200 250 218 235" fill="none" stroke="#0B22FE" strokeWidth="3" strokeLinecap="round" />,
    },
    hair: {
      curto: () => <path d="M130 170 Q130 80 200 80 Q270 80 270 170 Q270 200 280 230 Q250 210 230 180 Q200 160 170 180 Q150 210 120 230 Z" fill="#4A3728" stroke="#0F172A" strokeWidth="2" />,
      cacheado: () => <path d="M110 180 Q110 50 200 50 Q290 50 290 180 Q290 250 270 280 Q240 250 200 240 Q160 250 130 280 Z" fill="#2D1B14" stroke="#0F172A" strokeWidth="2" />,
      crespo: () => <path d="M120 160 Q120 60 200 60 Q280 60 280 160 Q280 220 260 240 Q200 210 140 240 Z" fill="#1A110D" stroke="#0F172A" strokeWidth="2" />,
      ondulado: () => <path d="M120 180 Q120 70 200 70 Q280 70 280 180 Q280 280 250 300 Q200 270 150 300 Q120 280 120 180 Z" fill="#5C4033" stroke="#0F172A" strokeWidth="2" />,
      careca: () => null,
    },
    accessories: {
      oculos: () => (
        <g fill="none" stroke="#0F172A" strokeWidth="2.5">
          <circle cx="175" cy="180" r="16" />
          <circle cx="225" cy="180" r="16" />
          <path d="M191 180 L209 180" />
        </g>
      ),
      barba: () => null,
      bone: () => (
        <g>
          <path d="M135 140 Q200 100 265 140 L275 150 L125 150 Z" fill="#0B22FE" />
          <path d="M135 145 L85 145 Q85 125 135 140" fill="#0B22FE" stroke="#0F172A" strokeWidth="2" />
        </g>
      ),
    }
  }
};
