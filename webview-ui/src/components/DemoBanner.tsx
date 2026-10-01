import { vscode } from '../vscodeApi.js';

interface DemoBannerProps {
  onEnd: () => void;
}

/**
 * Shown while demo mode runs, so pretend agents are never mistaken for real
 * ones: says what they are, and offers the two ways out.
 */
export function DemoBanner({ onEnd }: DemoBannerProps) {
  const button: React.CSSProperties = {
    borderRadius: 0,
    fontSize: '18px',
    cursor: 'pointer',
    padding: '2px 10px',
    fontFamily: 'inherit',
    border: '2px solid var(--pixel-border)',
    background: 'var(--pixel-btn-bg)',
    color: 'rgba(255,255,255,0.85)',
  };
  return (
    <div
      role="status"
      style={{
        position: 'absolute',
        top: 10,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '4px 10px',
        background: 'var(--pixel-bg)',
        border: '2px solid var(--pixel-agent-border)',
        borderRadius: 0,
        boxShadow: 'var(--pixel-shadow)',
        fontSize: '18px',
        color: 'rgba(255,255,255,0.85)',
        whiteSpace: 'nowrap',
      }}
    >
      <span>Demo — these agents are pretend</span>
      <button
        style={{ ...button, borderColor: 'var(--pixel-agent-border)' }}
        onClick={() => {
          onEnd();
          vscode.postMessage({ type: 'startClaudeLogin' });
        }}
      >
        Log in to start yours
      </button>
      <button style={button} onClick={onEnd}>
        End demo
      </button>
    </div>
  );
}
