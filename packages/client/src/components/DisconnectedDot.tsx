import { useEffect, useState } from 'react';

/** Compact "this player is offline" marker; tap it (no hover on phones) to spell it out briefly. */
export function DisconnectedDot() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => setOpen(false), 2500);
    return () => clearTimeout(timer);
  }, [open]);

  return (
    <span
      className={`disconnected-dot ${open ? 'disconnected-dot-open' : ''}`}
      title="Disconnected"
      onClick={() => setOpen(true)}
    >
      {open ? 'Disconnected' : <span className="disconnected-dot-mark" />}
    </span>
  );
}
