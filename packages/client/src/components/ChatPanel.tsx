import { useEffect, useRef, useState } from 'react';
import type { AckResponse, ChatMessage } from '@golf/engine';

interface ChatPanelProps {
  messages: ChatMessage[];
  myPlayerId: string;
  open: boolean;
  unreadCount: number;
  onOpen: () => void;
  onClose: () => void;
  onSend: (text: string, done: (res: AckResponse<null>) => void) => void;
}

/**
 * Tracks the *visible* part of the screen. On iOS the on-screen keyboard does not shrink the
 * layout viewport (so `bottom: 0` ends up hidden behind the keyboard); only visualViewport
 * reflects it. `inset` is how far up from the bottom the visible area starts.
 */
function useVisibleViewport(active: boolean) {
  const [viewport, setViewport] = useState({ inset: 0, height: window.innerHeight });

  useEffect(() => {
    if (!active) return;
    const vv = window.visualViewport;
    function update() {
      if (!vv) {
        setViewport({ inset: 0, height: window.innerHeight });
        return;
      }
      setViewport({
        inset: Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)),
        height: vv.height,
      });
    }
    update();
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [active]);

  return viewport;
}

function formatTime(sentAt: number): string {
  return new Date(sentAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function ChatPanel({ messages, myPlayerId, open, unreadCount, onOpen, onClose, onSend }: ChatPanelProps) {
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const viewport = useVisibleViewport(open);

  useEffect(() => {
    if (open && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [open, messages.length, viewport.height]);

  if (!open) {
    return (
      <button className="chat-fab" onClick={onOpen} aria-label="Open chat">
        💬
        {unreadCount > 0 && <span className="chat-fab-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setSendError(null);
    setDraft('');
    onSend(text, (res) => {
      if (!res.ok) {
        setDraft((current) => current || text);
        setSendError(res.error);
      }
    });
  }

  return (
    <div
      className="chat-panel"
      style={{
        bottom: viewport.inset,
        height: Math.min(380, Math.round(viewport.height * 0.55)),
        paddingBottom: viewport.inset > 0 ? 8 : 'max(8px, env(safe-area-inset-bottom))',
      }}
    >
      <div className="chat-header">
        <strong>Chat</strong>
        <button className="chat-close" onClick={onClose} aria-label="Close chat">
          ✕
        </button>
      </div>

      <div className="chat-messages" ref={listRef}>
        {messages.length === 0 && <p className="chat-empty">No messages yet — say hi!</p>}
        {messages.map((m) => {
          const mine = m.playerId === myPlayerId;
          return (
            <div key={m.id} className={`chat-message ${mine ? 'chat-message-mine' : ''}`}>
              <div className="chat-meta">
                {mine ? 'You' : m.name} · {formatTime(m.sentAt)}
              </div>
              <div className="chat-bubble">{m.text}</div>
            </div>
          );
        })}
      </div>

      {sendError && <p className="chat-error">{sendError}</p>}

      <form className="chat-form" onSubmit={handleSubmit}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={280}
          placeholder="Message…"
          enterKeyHint="send"
          aria-label="Chat message"
        />
        <button type="submit" disabled={!draft.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
