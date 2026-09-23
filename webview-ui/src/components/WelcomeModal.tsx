import { useState } from 'react';

import type { ClaudeAuthState } from '../../../shared/protocol.js';
import { vscode } from '../vscodeApi.js';

interface WelcomeModalProps {
  /** Null until the host reports; the modal stays hidden while unknown. */
  auth: ClaudeAuthState | null;
}

const buttonBase: React.CSSProperties = {
  borderRadius: 0,
  fontSize: '20px',
  cursor: 'pointer',
  padding: '5px 14px',
  fontFamily: 'inherit',
  border: '2px solid var(--pixel-border)',
  background: 'var(--pixel-btn-bg)',
  color: 'rgba(255,255,255,0.85)',
};

const primaryButton: React.CSSProperties = {
  ...buttonBase,
  background: 'var(--pixel-agent-hover-bg)',
  border: '2px solid var(--pixel-agent-border)',
  color: 'var(--pixel-agent-text)',
};

const codeStyle: React.CSSProperties = {
  background: 'var(--pixel-chat-code-bg)',
  border: '1px solid var(--pixel-border)',
  padding: '1px 5px',
};

/**
 * First-run gate. Agents cannot start until Claude Code is authenticated,
 * and the failure without this is an SDK spawn error inside a chat tab the
 * user had to create first. The office stays visible behind the panel —
 * the layout editor and everything else still work logged out.
 */
export function WelcomeModal({ auth }: WelcomeModalProps) {
  const [rechecking, setRechecking] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (!auth || auth.kind === 'ok' || dismissed) return null;

  const unavailable = auth.kind === 'unavailable';

  const recheck = () => {
    setRechecking(true);
    vscode.postMessage({ type: 'recheckClaudeAuth' });
    // The host answers with a fresh claudeAuth message; this only stops the
    // button from looking stuck if the probe is slow.
    setTimeout(() => setRechecking(false), 2000);
  };

  return (
    <>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          zIndex: 79,
        }}
      />
      <div
        role="dialog"
        aria-label="Connect Claude Code"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 80,
          background: 'var(--pixel-bg)',
          border: '2px solid var(--pixel-border)',
          borderRadius: 0,
          boxShadow: 'var(--pixel-shadow)',
          padding: '12px 14px',
          width: 'min(460px, calc(100vw - 32px))',
          maxHeight: '80vh',
          overflowY: 'auto',
        }}
      >
        <div style={{ fontSize: '26px', color: 'rgba(255,255,255,0.92)', marginBottom: 6 }}>
          {unavailable ? "Claude Code didn't answer" : 'Welcome to Agent Campus'}
        </div>

        {unavailable ? (
          <p style={{ fontSize: '18px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>
            The bundled Claude Code could not report its status, so agents will not start. It said:{' '}
            <span style={codeStyle}>{auth.reason}</span>
          </p>
        ) : (
          <p style={{ fontSize: '18px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>
            Your office is ready, but nobody can start working yet: Claude Code is not logged in.
            Agents here run real Claude Code sessions, so they use your own account.
          </p>
        )}

        <div style={{ fontSize: '18px', color: 'rgba(255,255,255,0.75)', lineHeight: 1.6 }}>
          <p style={{ margin: '10px 0 4px' }}>There are two ways in:</p>
          <p style={{ margin: '0 0 4px' }}>
            1. Sign in with your Claude subscription. The button below opens a terminal tab that
            walks you through it.
          </p>
          <p style={{ margin: 0 }}>
            2. Use an API key: set <span style={codeStyle}>ANTHROPIC_API_KEY</span> in your shell
            profile, then restart the app so it inherits the variable.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
          <button
            style={primaryButton}
            onClick={() => vscode.postMessage({ type: 'startClaudeLogin' })}
          >
            Log in with Claude
          </button>
          <button style={buttonBase} onClick={recheck} disabled={rechecking}>
            {rechecking ? 'Checking…' : 'Check again'}
          </button>
          <button
            style={{ ...buttonBase, color: 'rgba(255,255,255,0.5)' }}
            onClick={() => setDismissed(true)}
            title="Close this and look around; agents still will not start until you log in"
          >
            Look around first
          </button>
        </div>
      </div>
    </>
  );
}
