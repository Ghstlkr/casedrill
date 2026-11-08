import { type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const GUTTER = 16;
/** Small scrolls, such as a browser revealing a focused button, keep the box open. */
const MOVE_TOLERANCE = 24;

type Props = {
  anchor: RefObject<HTMLElement>;
  width: number;
  label: string;
  onClose: () => void;
  children: ReactNode;
};

/** A floating box placed next to its button, kept inside the screen and outside any scrolling table. */
export function Popover({ anchor, width, label, onClose, children }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const anchorBox = anchor.current?.getBoundingClientRect();
    const height = box.current?.offsetHeight ?? 0;
    if (!anchorBox) return;
    const available = Math.min(width, window.innerWidth - GUTTER * 2);
    const left = Math.max(GUTTER, Math.min(anchorBox.left, window.innerWidth - available - GUTTER));
    const below = anchorBox.bottom + 6;
    const top = below + height > window.innerHeight - GUTTER ? Math.max(GUTTER, anchorBox.top - height - 6) : below;
    setPosition({ top, left, width: available });
  }, [anchor, width]);

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Element;
      if (!target.closest("[data-popover]") && !anchor.current?.contains(target)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      onClose();
      anchor.current?.focus();
    };
    const start = anchor.current?.getBoundingClientRect();
    const onScroll = () => {
      const now = anchor.current?.getBoundingClientRect();
      if (!start || !now) return;
      if (Math.abs(now.top - start.top) > MOVE_TOLERANCE || Math.abs(now.left - start.left) > MOVE_TOLERANCE) onClose();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={box}
      data-popover
      role="dialog"
      aria-label={label}
      className="popover"
      style={position ?? { top: 0, left: 0, width, visibility: "hidden" }}
    >
      {children}
    </div>,
    document.body,
  );
}
