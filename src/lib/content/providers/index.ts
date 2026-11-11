import { facebookAdapter, instagramAdapter } from "./meta.server";
import { tiktokAdapter } from "./tiktok.server";
import { youtubeAdapter } from "./youtube.server";
import { telegramAdapter } from "./telegram.server";
import { SocialPlatform, SocialPublisherAdapter } from "./types";

export * from "./types";
export * from "./meta.server";
export * from "./youtube.server";
export * from "./tiktok.server";
export * from "./telegram.server";

export const publisherAdapters: Record<SocialPlatform, SocialPublisherAdapter> = {
  instagram: instagramAdapter,
  facebook: facebookAdapter,
  youtube: youtubeAdapter,
  tiktok: tiktokAdapter,
  telegram: telegramAdapter,
};

export function getPublisherAdapter(platform: SocialPlatform): SocialPublisherAdapter {
  const adapter = publisherAdapters[platform];
  if (!adapter) {
    throw new Error(`Adaptador não implementado para a plataforma ${platform}`);
  }
  return adapter;
}
