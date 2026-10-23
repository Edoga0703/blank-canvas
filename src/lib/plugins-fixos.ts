/** Plugins essenciais: sempre disponíveis e não podem ser desinstalados. */
export const PLUGINS_FIXOS = new Set<string>([]);

export function isPluginFixo(slug: string) {
  return PLUGINS_FIXOS.has(slug);
}
