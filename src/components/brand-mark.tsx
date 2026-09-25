import markAsset from "@/assets/metrix-mark.png.asset.json";
import { brand } from "@/config/brand";

export function BrandMark({ className = "size-10 rounded-xl" }: { className?: string }) {
  return (
    <img
      src={markAsset.url}
      alt={brand.name}
      className={`${className} object-contain shrink-0`}
      loading="eager"
      decoding="async"
    />
  );
}
