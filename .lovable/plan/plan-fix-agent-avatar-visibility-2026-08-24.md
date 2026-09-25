# Plan - Fix Agent Avatar Visibility

The user reports that the agent "Rafa" is missing an avatar in the sidebar. This plan ensures that all agents, including newly created orprovisioned ones, correctly display their visual identity by hardening the avatar resolution logic and ensuring cache consistency.

## User Review Required

> [!IMPORTANT]
> I have identified that the avatar for "Rafa" might be missing due to a local state synchronization issue or a fallback failure. The following changes will enforce the Pixar-style avatar for all agents.

## Proposed Changes

### AI Studio & Sidebar
- **src/routes/app/agente.tsx**:
    - Update the `reload` function to ensure it always fetches the latest `avatar_url` from the database, bypassing local state if it's stale.
    - Ensure the sidebar list correctly passes both `avatar_url` and `avatar_traits` to the `AgentAvatar` component.

### Avatar Component
- **src/components/agente/agent-avatar.tsx**:
    - Refine the initial-based fallback to be more robust. If no image URL or traits are provided, it will generate a consistent color-coded background with the agent's first letter.

### Avatar Builder & Persistence
- **src/components/agente/avatar-builder.tsx**:
    - Ensure that after a successful save, the `onSuccess` callback updates the parent state immediately to avoid "ghost" updates where the UI doesn't reflect the saved image until a refresh.

### Backend Cache
- **src/lib/agent-ai.functions.ts**:
    - Verify that `updateAgentAvatar` and `generateAgentAvatar` correctly trigger cache invalidation for the company's agent list.

## Technical Details

- Use `supabase.from('agent_config').select('*')` in `loadAgents` to ensure full data hydration.
- Add a specific check for "Rafa" in the initial provision migration (if applicable) to ensure a default Pixar URL is present.
- Use Supabase Realtime in `AgentePage` to listen for changes to the `agent_config` table for the current company.

```typescript
// Example of hardening the sidebar avatar rendering in src/routes/app/agente.tsx
{agents.map((a) => (
  <div key={a.id} onClick={() => setActiveAgentId(a.id)}>
    <AgentAvatar 
      avatarUrl={a.avatar_url} 
      traits={a.avatar_traits} 
      fallbackName={a.nome_agente} 
      size={32} 
    />
    <span>{a.nome_agente}</span>
  </div>
))}
```
