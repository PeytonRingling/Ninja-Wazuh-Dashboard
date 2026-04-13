import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export interface ContextMenuItem {
  label: string;
  icon?: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}

interface Props {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = () => onClose();
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  // Clamp to viewport
  const style: React.CSSProperties = {
    position: "fixed",
    left: Math.min(x, window.innerWidth - 200),
    top: Math.min(y, window.innerHeight - items.length * 36 - 16),
    zIndex: 9999,
  };

  const menu = (
    <div
      ref={ref}
      onClick={e => e.stopPropagation()}
      className="w-48 rounded-xl border border-surface-600 shadow-2xl overflow-hidden animate-fade-in"
      style={{
        ...style,
        background: "linear-gradient(180deg, #1a1a3e 0%, #13132b 100%)",
        boxShadow: "0 8px 40px rgba(0,0,0,0.7), inset 0 1px 0 rgba(124,58,237,0.20)",
      }}
    >
      {items.map((item, i) => (
        <button
          key={i}
          onClick={() => { if (!item.disabled) { item.onClick(); onClose(); } }}
          disabled={item.disabled}
          className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-sm transition-colors
            ${item.disabled
              ? "text-slate-600 cursor-not-allowed"
              : item.danger
                ? "text-[#ff2d6d] hover:bg-[#ff2d6d]/10"
                : "text-slate-300 hover:bg-surface-600 hover:text-white"
            }`}
        >
          {item.icon && (
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
            </svg>
          )}
          {item.label}
        </button>
      ))}
    </div>
  );

  return createPortal(menu, document.body);
}
