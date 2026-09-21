import { useEffect, type ReactNode } from 'react';
import { IconClose } from './Icons';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Adds a sticky action row at the bottom of the sheet. */
  footer?: ReactNode;
}

/** A bottom sheet, which is the shape iOS users expect for a secondary task. */
export default function Sheet({ open, title, onClose, children, footer }: Props) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-label="Close" />
      <div className="relative max-h-[86vh] w-full overflow-hidden rounded-t-3xl border-t border-ink-600 bg-ink-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink-700 px-5 py-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <button className="rounded-full p-2 text-slate-400 hover:text-slate-100" onClick={onClose} aria-label="Close">
            <IconClose />
          </button>
        </div>
        <div className="no-scrollbar max-h-[62vh] overflow-y-auto px-5 py-4" style={{ WebkitOverflowScrolling: 'touch' }}>
          {children}
        </div>
        {footer && (
          <div
            className="border-t border-ink-700 bg-ink-900 px-5 py-4"
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
