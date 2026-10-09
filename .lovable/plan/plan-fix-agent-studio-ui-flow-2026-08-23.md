# Plan - Fix Agent Studio UI Flow

The user reported that when clicking on agents in the AI Agent Studio, they are briefly taken to a screen that says "Conte sobre seu negócio" (Tell us about your business). This happens because the current logic in `AgentePage` shows the setup/interview flow if `hasConfig` is false, and the `reload` function resets `hasConfig` to false at the start of every reload, which is triggered whenever the active agent changes.

## Proposed Changes

### AI Agent Studio (`src/routes/app/agente.tsx`)

- Modify the `reload` function to prevent UI flickering by not resetting `hasConfig` to `false` immediately if an agent is already selected.
- Ensure `hasConfig` is only set to `false` if the agent truly has no configuration after the database fetch.
- Update the initialization logic to better handle switching between existing agents without showing the "first-time setup" screen.

## Technical Details

- In `src/routes/app/agente.tsx`, the `reload` function (lines 143-191) calls `setHasConfig(false)` at the beginning. This causes the component to render the `!hasConfig` branch (lines 509-656), which contains the "Conte sobre o seu negócio" header (line 603).
- I will change this to maintain the previous `hasConfig` state until the new agent's data is loaded, or use a separate `loading` state to show a skeleton instead of the setup screen during transitions.
- I will also verify that the `hasConfig` check correctly identifies fully configured agents (checking `nome_agente` and `sobre_empresa`) to avoid showing the setup flow for partially saved agents that the user intended to manage via the Studio.

## Verification Plan

### Automated Tests
- Run a Playwright script to:
  1. Navigate to `/app/agente`.
  2. Select different agents from the sidebar.
  3. Verify that the "Conte sobre o seu negócio" text does not appear during the transition between existing agents.
  4. Verify that clicking "Plus" (Create new agent) correctly shows the creation/setup flow if applicable.

### Manual Verification
- Inspect the UI behavior when switching agents in the preview to ensure smooth transitions.
