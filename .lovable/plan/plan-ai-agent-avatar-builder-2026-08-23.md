# Plan - AI Agent Avatar Builder

Implement a visual avatar builder for AI agents, allowing users to customize gender, skin tone, hair style, accessories, and clothing color.

## User Review Required

> [!IMPORTANT]
> The current database schema for `agent_config` does not explicitly have separate columns for each avatar trait (gender, skin, etc.). I will store these as a JSON object in a new `avatar_traits` column or within `avatar_prompt` if I want to keep it simple, but for a true "builder" I should ideally update the schema or use a structured field. I'll check if I can use a JSON field or if I should just update the `avatar_url` after generation.

- **Avatar Selection**: Users will be able to choose from a predefined list of characters or build one using the selector.
- **Visual Feedback**: Real-time preview of the selected traits.

## Proposed Changes

### Database & Backend
- Add `avatar_traits` JSON column to `agent_config` table to persist user choices.
- Create a server function `updateAgentAvatar` in `src/lib/agent-ai.functions.ts` that saves the selected traits and potentially triggers an AI image generation based on them.

### UI Components
- **`src/components/agente/avatar-builder.tsx`**: A new component for the avatar selection dialog shown in the reference image.
  - Categories: Modelo (Gender), Tom de pele (Skin tone), Cabelo (Hair style), Acessórios (Accessories), Cor da roupa (Clothing color).
  - "Sugestões prontas": Predefined avatar options.

### Route Updates
- **`src/routes/app/agente.tsx`**:
  - Add a "Customizar avatar" button next to the current avatar preview.
  - Integrate the `AvatarBuilder` dialog.
  - Update the avatar display logic to reflect the custom-built avatar.

## Technical Details
- Use local assets or high-quality illustration placeholders for the builder options.
- The "Gerar outra opção" button will use the selected traits to construct a detailed prompt for the AI image generator.
- Colors and icons will match the Metrix CRM identity (#0B22FE).

```text
Avatar Traits Object Example:
{
  "gender": "masculino",
  "skinTone": "# Tom",
  "hair": "curto",
  "accessories": ["oculos", "barba"],
  "clothingColor": "blue"
}
```
