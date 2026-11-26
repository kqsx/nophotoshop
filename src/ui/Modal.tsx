import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';

export function Modal({ title, onClose, children, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [onClose]);
  // Portal ra body: tránh bị khung cha (thanh trên có hiệu ứng mờ) cắt mất nội dung
  return createPortal(
    <div className="backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} onClick={(e) => e.stopPropagation()} style={wide ? { width: 'min(100%, 760px)' } : undefined}>
        <div className="grabber" />
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Đóng"><X size={24} strokeWidth={1.75} /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <span className="switch">
      <input type="checkbox" role="switch" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span />
    </span>
  );
}
