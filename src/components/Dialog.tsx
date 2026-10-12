import { useEffect, useRef, type ReactNode } from 'react';
export function Dialog({ title, onClose, children, className = '' }: { title: string; onClose: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current!; dialog.showModal();
    return () => { dialog.close(); previous?.focus(); };
  }, []);
  return <dialog ref={ref} className={`dialog ${className}`} onCancel={e => { e.preventDefault(); onClose(); }}>
    <header className="dialog-header"><h2>{title}</h2><button className="icon-button" aria-label="Zamknij" onClick={onClose}>×</button></header>
    <div className="dialog-body">{children}</div>
  </dialog>;
}
export function Confirm({ title, message, action, cancel = 'Anuluj', destructive = false, onConfirm, onClose }: { title: string; message: string; action: string; cancel?: string; destructive?: boolean; onConfirm: () => void; onClose: () => void }) {
  return <Dialog title={title} onClose={onClose} className="compact"><p>{message}</p><div className="actions"><button onClick={onClose}>{cancel}</button><button className={destructive ? 'danger' : 'primary'} onClick={onConfirm}>{action}</button></div></Dialog>;
}
