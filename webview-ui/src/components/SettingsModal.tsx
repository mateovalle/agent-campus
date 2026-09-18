import { useEffect, useState } from 'react';

import type {
  AchievementInfo,
  HostToWebviewMessage,
  ScheduleEntry,
  UsageSummary,
  WorkspaceInfo,
} from '../../../shared/protocol.js';
import {
  ACHIEVEMENT_LIST_MAX_HEIGHT_PX,
  ACHIEVEMENT_LOCKED_DESCRIPTION,
  ACHIEVEMENT_LOCKED_OPACITY,
  SETTINGS_MODAL_WIDTH_PX,
  USAGE_CHART_BAR_DIM_COLOR,
  USAGE_CHART_BAR_GAP_PX,
  USAGE_CHART_BAR_MIN_HEIGHT_PX,
  USAGE_CHART_HEIGHT_PX,
  USAGE_CHART_LABEL_COLOR,
  USAGE_CHART_LABEL_FONT_PX,
  USAGE_CHART_ZERO_BAR_COLOR,
} from '../constants.js';
import { isSoundEnabled, setSoundEnabled } from '../notificationSound.js';
import { formatUsd } from '../office/toolUtils.js';
import { DAY_ABBREV, describeCadence, workspaceBasename } from '../scheduleUtils.js';
import { vscode } from '../vscodeApi.js';

const usageRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 16,
  padding: '1px 10px',
  fontSize: '18px',
  color: 'rgba(255, 255, 255, 0.7)',
};

/** Compact 14-day spend bar chart — pure divs, pixel aesthetic (sharp corners). */
function DailyBarChart({ days }: { days: UsageSummary['days'] }) {
  const max = Math.max(0, ...days.map((d) => d.usd));
  if (days.length === 0 || max <= 0) return null;

  return (
    <div style={{ padding: '4px 10px 0' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: USAGE_CHART_BAR_GAP_PX,
          height: USAGE_CHART_HEIGHT_PX,
          borderBottom: '1px solid var(--pixel-border)',
        }}
      >
        {days.map((d, i) => {
          const isToday = i === days.length - 1;
          const barH =
            d.usd > 0
              ? Math.max(
                  USAGE_CHART_BAR_MIN_HEIGHT_PX,
                  Math.round((d.usd / max) * USAGE_CHART_HEIGHT_PX),
                )
              : USAGE_CHART_BAR_MIN_HEIGHT_PX;
          return (
            // Full-height hover target so tooltips work on short bars too
            <div
              key={`${d.day}-${i}`}
              title={`${d.day} · $${d.usd.toFixed(2)}`}
              style={{
                flex: 1,
                height: '100%',
                display: 'flex',
                alignItems: 'flex-end',
                cursor: 'default',
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: barH,
                  borderRadius: 0,
                  background: isToday
                    ? 'var(--pixel-accent)'
                    : d.usd > 0
                      ? USAGE_CHART_BAR_DIM_COLOR
                      : USAGE_CHART_ZERO_BAR_COLOR,
                }}
              />
            </div>
          );
        })}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: USAGE_CHART_LABEL_FONT_PX,
          color: USAGE_CHART_LABEL_COLOR,
          marginTop: 2,
        }}
      >
        <span>{days[0].day}</span>
        <span>{days[days.length - 1].day}</span>
      </div>
    </div>
  );
}

function UsageSection({ liveSummary }: { liveSummary: UsageSummary | null }) {
  // Fallback: request a summary on open and listen for the reply, in case the
  // live push hasn't arrived yet (e.g., host older than the push behavior)
  const [fetched, setFetched] = useState<UsageSummary | null>(null);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data as HostToWebviewMessage;
      if (msg.type === 'usageSummary') {
        setFetched(msg.summary);
      }
    };
    window.addEventListener('message', handler);
    vscode.postMessage({ type: 'getUsageSummary' });
    return () => window.removeEventListener('message', handler);
  }, []);

  const summary = liveSummary ?? fetched;
  if (!summary || summary.turnCount === 0) return null;

  return (
    <div style={{ borderTop: '1px solid var(--pixel-border)', marginTop: 4, paddingTop: 4 }}>
      <div style={{ ...usageRowStyle, color: 'rgba(255, 255, 255, 0.9)', fontSize: '20px' }}>
        <span>Chat Usage</span>
      </div>
      <DailyBarChart days={summary.days} />
      <div style={usageRowStyle}>
        <span>Today</span>
        <span>{formatUsd(summary.todayUsd)}</span>
      </div>
      <div style={usageRowStyle}>
        <span>This month</span>
        <span>{formatUsd(summary.monthUsd)}</span>
      </div>
      <div style={usageRowStyle}>
        <span>All time</span>
        <span>{formatUsd(summary.allTimeUsd)}</span>
      </div>
      {summary.perProject.length > 0 && (
        <div style={{ marginTop: 3 }}>
          {summary.perProject.map((p) => (
            <div key={p.path} style={{ ...usageRowStyle, fontSize: '16px' }} title={p.path}>
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: 180,
                }}
              >
                {p.folder}
              </span>
              <span style={{ flexShrink: 0 }}>
                {formatUsd(p.monthUsd)} <span style={{ opacity: 0.5 }}>/ mo</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AchievementsSection({ achievements }: { achievements: AchievementInfo[] }) {
  if (achievements.length === 0) return null;

  const unlockedCount = achievements.filter((a) => a.unlockedAt !== undefined).length;

  return (
    <div style={{ borderTop: '1px solid var(--pixel-border)', marginTop: 4, paddingTop: 4 }}>
      <div style={{ ...usageRowStyle, color: 'rgba(255, 255, 255, 0.9)', fontSize: '20px' }}>
        <span>Achievements</span>
        <span>
          {unlockedCount} / {achievements.length}
        </span>
      </div>
      <div style={{ maxHeight: ACHIEVEMENT_LIST_MAX_HEIGHT_PX, overflowY: 'auto' }}>
        {achievements.map((a) => {
          const unlocked = a.unlockedAt !== undefined;
          return (
            <div
              key={a.id}
              style={{
                padding: '3px 10px',
                opacity: unlocked ? 1 : ACHIEVEMENT_LOCKED_OPACITY,
              }}
            >
              <div style={{ fontSize: '18px', color: 'rgba(255, 255, 255, 0.9)' }}>
                {unlocked ? '🏆' : '🔒'} {a.name}
              </div>
              <div style={{ fontSize: '15px', color: 'rgba(255, 255, 255, 0.6)' }}>
                {unlocked ? a.description : ACHIEVEMENT_LOCKED_DESCRIPTION}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDebugMode: boolean;
  onToggleDebugMode: () => void;
  /** Live usage summary from useExtensionMessages (null until first push). */
  usageSummary: UsageSummary | null;
  /** Full achievements list from useExtensionMessages (empty until loaded). */
  achievements: AchievementInfo[];
  /** Recurring scheduled runs (Electron only; empty elsewhere). */
  schedules: ScheduleEntry[];
  /** Registered workspaces — targets for the new-schedule form. */
  workspaces: WorkspaceInfo[];
  /** Available dispatch roles for the new-schedule form. */
  roles: Array<{ id: string; name: string }>;
  launchAtLogin: boolean;
  onSetLaunchAtLogin: (enabled: boolean) => void;
  /** When on, new agents launch with permissions bypassed (--dangerously-skip-permissions). */
  bypassPermissions: boolean;
  onSetBypassPermissions: (enabled: boolean) => void;
}

const formFieldStyle: React.CSSProperties = {
  background: 'var(--pixel-bg)',
  color: 'rgba(255,255,255,0.85)',
  border: '2px solid var(--pixel-border)',
  borderRadius: 0,
  fontSize: '16px',
  fontFamily: 'inherit',
  padding: '2px 4px',
};

/** Inline creation form: workspace + cadence + prompt → addSchedule message. */
function ScheduleForm({
  workspaces,
  roles,
  onDone,
}: {
  workspaces: WorkspaceInfo[];
  roles: Array<{ id: string; name: string }>;
  onDone: () => void;
}) {
  const [workspacePath, setWorkspacePath] = useState(workspaces[0]?.path ?? '');
  const [kind, setKind] = useState<ScheduleEntry['kind']>('daily');
  const [time, setTime] = useState('09:00');
  const [days, setDays] = useState<number[]>([1]);
  const [everyMinutes, setEveryMinutes] = useState(60);
  const [role, setRole] = useState('');
  const [prompt, setPrompt] = useState('');

  const valid =
    workspacePath.length > 0 &&
    prompt.trim().length > 0 &&
    (kind === 'interval' ? everyMinutes >= 1 : /^\d{1,2}:\d{2}$/.test(time)) &&
    (kind !== 'weekly' || days.length > 0);

  const create = () => {
    vscode.postMessage({
      type: 'addSchedule',
      workspacePath,
      prompt: prompt.trim(),
      ...(role ? { role } : {}),
      kind,
      ...(kind !== 'interval' ? { time } : {}),
      ...(kind === 'weekly' ? { days } : {}),
      ...(kind === 'interval' ? { everyMinutes } : {}),
    });
    onDone();
  };

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '4px 10px 6px' }}
      // Keep clicks inside the form from bubbling to modal-level handlers
      onClick={(e) => e.stopPropagation()}
    >
      <select
        value={workspacePath}
        onChange={(e) => setWorkspacePath(e.target.value)}
        style={formFieldStyle}
      >
        {workspaces.map((w) => (
          <option key={w.path} value={w.path}>
            {w.name}
          </option>
        ))}
      </select>
      <div style={{ display: 'flex', gap: 4 }}>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as ScheduleEntry['kind'])}
          style={{ ...formFieldStyle, flex: 1 }}
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="interval">Every N min</option>
        </select>
        {kind === 'interval' ? (
          <input
            type="number"
            min={1}
            value={everyMinutes}
            onChange={(e) => setEveryMinutes(Number(e.target.value))}
            style={{ ...formFieldStyle, width: 64 }}
            title="Minutes between runs"
          />
        ) : (
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            style={formFieldStyle}
          />
        )}
      </div>
      {kind === 'weekly' && (
        <div style={{ display: 'flex', gap: 2 }}>
          {DAY_ABBREV.map((label, d) => {
            const on = days.includes(d);
            return (
              <button
                key={label}
                onClick={() => setDays((prev) => (on ? prev.filter((x) => x !== d) : [...prev, d]))}
                style={{
                  ...formFieldStyle,
                  flex: 1,
                  padding: '2px 0',
                  fontSize: '13px',
                  cursor: 'pointer',
                  background: on ? 'rgba(90, 140, 255, 0.8)' : 'var(--pixel-bg)',
                  color: on ? '#fff' : 'rgba(255,255,255,0.6)',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}
      <select value={role} onChange={(e) => setRole(e.target.value)} style={formFieldStyle}>
        <option value="">No role</option>
        {roles.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Self-contained task prompt (the run is unattended)…"
        rows={3}
        style={{ ...formFieldStyle, resize: 'vertical' }}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
        <button
          onClick={onDone}
          style={{ ...formFieldStyle, cursor: 'pointer', color: 'rgba(255,255,255,0.6)' }}
        >
          Cancel
        </button>
        <button
          onClick={valid ? create : undefined}
          disabled={!valid}
          style={{
            ...formFieldStyle,
            cursor: valid ? 'pointer' : 'default',
            background: valid ? 'var(--pixel-accent)' : 'var(--pixel-bg)',
            color: valid ? '#fff' : 'rgba(255,255,255,0.35)',
            border: '2px solid var(--pixel-accent)',
          }}
        >
          Create
        </button>
      </div>
    </div>
  );
}

/** Scheduled runs: always-visible section — list + inline creation form. */
function SchedulesSection({
  schedules,
  workspaces,
  roles,
}: {
  schedules: ScheduleEntry[];
  workspaces: WorkspaceInfo[];
  roles: Array<{ id: string; name: string }>;
}) {
  const [showForm, setShowForm] = useState(false);
  return (
    <div style={{ borderTop: '1px solid var(--pixel-border)', marginTop: 4, paddingTop: 4 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '2px 10px',
          fontSize: '20px',
          color: 'rgba(255,255,255,0.9)',
        }}
      >
        <span>Scheduled Runs</span>
        <button
          onClick={() => setShowForm((v) => !v)}
          title="Create a scheduled run"
          style={{
            background: 'transparent',
            border: '2px solid var(--pixel-border)',
            borderRadius: 0,
            color: 'rgba(255,255,255,0.8)',
            fontSize: '16px',
            cursor: 'pointer',
            padding: '0 6px',
            lineHeight: 1.4,
            fontFamily: 'inherit',
          }}
        >
          {showForm ? '−' : '+ New'}
        </button>
      </div>
      {showForm && (
        <ScheduleForm workspaces={workspaces} roles={roles} onDone={() => setShowForm(false)} />
      )}
      {schedules.length === 0 && !showForm && (
        <div style={{ padding: '0 10px 4px', fontSize: '16px', color: 'rgba(255,255,255,0.45)' }}>
          None yet — create one here or ask the Assistant.
        </div>
      )}
      {schedules.map((s) => (
        <div
          key={s.id}
          title={s.prompt}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '2px 10px',
            fontSize: '18px',
            color: 'rgba(255, 255, 255, 0.7)',
          }}
        >
          <span
            style={{
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              opacity: s.enabled ? 1 : 0.45,
            }}
          >
            {describeCadence(s)} · {workspaceBasename(s.workspacePath)}
            {s.role ? ` · ${s.role}` : ''}
          </span>
          <button
            onClick={() =>
              vscode.postMessage({ type: 'toggleSchedule', id: s.id, enabled: !s.enabled })
            }
            title={s.enabled ? 'Disable' : 'Enable'}
            style={{
              width: 14,
              height: 14,
              border: '2px solid rgba(255,255,255,0.5)',
              borderRadius: 0,
              background: s.enabled ? 'rgba(90, 140, 255, 0.8)' : 'transparent',
              cursor: 'pointer',
              padding: 0,
              flexShrink: 0,
              color: '#fff',
              fontSize: '11px',
              lineHeight: 1,
            }}
          >
            {s.enabled ? 'X' : ''}
          </button>
          <button
            onClick={() => vscode.postMessage({ type: 'deleteSchedule', id: s.id })}
            title="Delete schedule"
            style={{
              background: 'transparent',
              border: 'none',
              borderRadius: 0,
              color: 'rgba(255, 100, 100, 0.8)',
              fontSize: '18px',
              cursor: 'pointer',
              padding: '0 2px',
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            X
          </button>
        </div>
      ))}
    </div>
  );
}

const menuItemBase: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  padding: '6px 10px',
  fontSize: '24px',
  color: 'rgba(255, 255, 255, 0.8)',
  background: 'transparent',
  border: 'none',
  borderRadius: 0,
  cursor: 'pointer',
  textAlign: 'left',
};

export function SettingsModal({
  isOpen,
  onClose,
  isDebugMode,
  onToggleDebugMode,
  usageSummary,
  achievements,
  schedules,
  workspaces,
  roles,
  launchAtLogin,
  onSetLaunchAtLogin,
  bypassPermissions,
  onSetBypassPermissions,
}: SettingsModalProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  // Bump to re-render after toggling sound (source of truth lives in notificationSound)
  const [, setSoundTick] = useState(0);

  if (!isOpen) return null;

  // Read the current setting on every open render so it stays in sync with
  // external changes (e.g., settingsLoaded from the extension after mount)
  const soundOn = isSoundEnabled();

  return (
    <>
      {/* Dark backdrop — click to close */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(0, 0, 0, 0.5)',
          zIndex: 49,
        }}
      />
      {/* Centered modal */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 50,
          background: 'var(--pixel-bg)',
          border: '2px solid var(--pixel-border)',
          borderRadius: 0,
          padding: '4px',
          boxShadow: 'var(--pixel-shadow)',
          width: SETTINGS_MODAL_WIDTH_PX,
          maxWidth: '90vw',
          maxHeight: '82vh',
          overflowY: 'auto',
        }}
      >
        {/* Header with title and X button */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '4px 10px',
            borderBottom: '1px solid var(--pixel-border)',
            marginBottom: '4px',
          }}
        >
          <span style={{ fontSize: '24px', color: 'rgba(255, 255, 255, 0.9)' }}>Settings</span>
          <button
            onClick={onClose}
            onMouseEnter={() => setHovered('close')}
            onMouseLeave={() => setHovered(null)}
            style={{
              background: hovered === 'close' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
              border: 'none',
              borderRadius: 0,
              color: 'rgba(255, 255, 255, 0.6)',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '0 4px',
              lineHeight: 1,
            }}
          >
            X
          </button>
        </div>
        {/* Menu items */}
        <button
          onClick={() => {
            vscode.postMessage({ type: 'openSessionsFolder' });
            onClose();
          }}
          onMouseEnter={() => setHovered('sessions')}
          onMouseLeave={() => setHovered(null)}
          style={{
            ...menuItemBase,
            background: hovered === 'sessions' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
          }}
        >
          Open Sessions Folder
        </button>
        <button
          onClick={() => {
            const newVal = !isSoundEnabled();
            setSoundEnabled(newVal);
            setSoundTick((n) => n + 1);
            vscode.postMessage({ type: 'setSoundEnabled', enabled: newVal });
          }}
          onMouseEnter={() => setHovered('sound')}
          onMouseLeave={() => setHovered(null)}
          style={{
            ...menuItemBase,
            background: hovered === 'sound' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
          }}
        >
          <span>Sound Notifications</span>
          <span
            style={{
              width: 14,
              height: 14,
              border: '2px solid rgba(255, 255, 255, 0.5)',
              borderRadius: 0,
              background: soundOn ? 'rgba(90, 140, 255, 0.8)' : 'transparent',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              lineHeight: 1,
              color: '#fff',
            }}
          >
            {soundOn ? 'X' : ''}
          </span>
        </button>
        <button
          onClick={() => onSetLaunchAtLogin(!launchAtLogin)}
          onMouseEnter={() => setHovered('login')}
          onMouseLeave={() => setHovered(null)}
          style={{
            ...menuItemBase,
            background: hovered === 'login' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
          }}
        >
          <span>Launch at Login</span>
          <span
            style={{
              width: 14,
              height: 14,
              border: '2px solid rgba(255, 255, 255, 0.5)',
              borderRadius: 0,
              background: launchAtLogin ? 'rgba(90, 140, 255, 0.8)' : 'transparent',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              lineHeight: 1,
              color: '#fff',
            }}
          >
            {launchAtLogin ? 'X' : ''}
          </span>
        </button>
        <button
          onClick={() => onSetBypassPermissions(!bypassPermissions)}
          onMouseEnter={() => setHovered('bypass')}
          onMouseLeave={() => setHovered(null)}
          title="New agents start with all permission prompts skipped (--dangerously-skip-permissions)"
          style={{
            ...menuItemBase,
            background: hovered === 'bypass' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
          }}
        >
          <span>Bypass Permissions</span>
          <span
            style={{
              width: 14,
              height: 14,
              border: '2px solid rgba(255, 255, 255, 0.5)',
              borderRadius: 0,
              background: bypassPermissions ? 'rgba(255, 170, 60, 0.9)' : 'transparent',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              lineHeight: 1,
              color: '#fff',
            }}
          >
            {bypassPermissions ? 'X' : ''}
          </span>
        </button>
        <button
          onClick={onToggleDebugMode}
          onMouseEnter={() => setHovered('debug')}
          onMouseLeave={() => setHovered(null)}
          style={{
            ...menuItemBase,
            background: hovered === 'debug' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
          }}
        >
          <span>Debug View</span>
          {isDebugMode && (
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'rgba(90, 140, 255, 0.8)',
                flexShrink: 0,
              }}
            />
          )}
        </button>
        <SchedulesSection schedules={schedules} workspaces={workspaces} roles={roles} />
        <UsageSection liveSummary={usageSummary} />
        <AchievementsSection achievements={achievements} />
      </div>
    </>
  );
}
