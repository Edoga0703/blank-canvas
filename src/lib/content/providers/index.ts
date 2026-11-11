import { facebookAdapter, instagramAdapter } from "./meta.server";
import { tiktokAdapter } from "./tiktok.server";
import { youtubeAdapter } from "./youtube.server";
import { SocialPlatform, SocialPublisherAdapter } from "./types";

export * from "./types";
export * from "./meta.server";
export * from "./youtube.server";
export * from "./tiktok.server";

export const publisherAdapters: Record<SocialPlatform, SocialPublisherAdapter> = {
  instagram: instagramAdapter,
  facebook: facebookAdapter,
  youtube: youtubeAdapter,
  tiktok: tiktokAdapter,
};

export function getPublisherAdapter(platform: SocialPlatform): SocialPublisherAdapter {
  const adapter = publisherAdapters[platform];
  if (!adapter) {
    throw new Error(`Adaptador não implementado para a plataforma ${platform}`);
  }
  return adapter;
}
