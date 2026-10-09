import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InitialsAvatar } from "@/components/ui/initials-avatar";

export function AvatarViewer({
  name,
  src,
  size,
  className,
}: {
  name: string;
  src?: string | null;
  size: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const clickable = !!src;

  return (
    <>
      <button
        type="button"
        className={`tt-exempt shrink-0 rounded-full ${clickable ? "cursor-zoom-in hover:opacity-90 transition-opacity" : "cursor-default"} ${className ?? ""}`}
        style={{ minHeight: size, minWidth: size, width: size, height: size, padding: 0 }}
        onClick={() => clickable && setOpen(true)}
        aria-label={clickable ? `Ver foto de ${name}` : name}
      >
        <InitialsAvatar name={name} size={size} src={src ?? undefined} />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm p-4">
          <DialogHeader>
            <DialogTitle className="truncate text-sm">{name}</DialogTitle>
          </DialogHeader>
          {src && (
            <img
              src={src}
              alt={`Foto de ${name}`}
              className="w-full rounded-xl object-contain max-h-[70dvh] bg-[color:var(--panel-2)]"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
