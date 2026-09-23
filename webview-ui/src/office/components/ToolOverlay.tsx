import { useEffect, useRef, useState } from 'react';

import type { AgentActionSuggestion } from '../../../../shared/protocol.js';
import { CHARACTER_SITTING_OFFSET_PX, TOOL_OVERLAY_VERTICAL_OFFSET } from '../../constants.js';
import type { SubagentCharacter } from '../../hooks/useExtensionMessages.js';
import type { CampusState } from '../engine/campusState.js';
import type { ToolActivity } from '../types.js';
import { BubbleKind, CharacterState, TILE_SIZE } from '../types.js';

interface ToolOverlayProps {
  campus: CampusState;
  isEditMode: boolean;
  agents: number[];
  agentTools: Record<number, ToolActivity[]>;
  subagentCharacters: SubagentCharacter[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  panRef: React.RefObject<{ x: number; y: number }>;
  onCloseAgent: (id: number) => void;
  agentSuggestions: Record<number, AgentActionSuggestion[]>;
  onRunAction: (id: number, command: string) => void;
  /** Available role skins (empty until loaded — hides the picker). */
  roles: Array<{ id: string; name: string }>;
  onSetRole: (id: number, role: string | null) => void;
}

/** Derive a short human-readable activity string from tools/status */
function getActivityText(
  agentId: number,
  agentTools: Record<number, ToolActivity[]>,
  isActive: boolean,
): string {
  const tools = agentTools[agentId];
  if (tools && tools.length > 0) {
    // Find the latest non-done tool
    const activeTool = [...tools].reverse().find((t) => !t.done);
    if (activeTool) {
      if (activeTool.permissionWait) return 'Needs approval';
      return activeTool.status;
    }
    // All tools done but agent still active (mid-turn) — keep showing last tool status
    if (isActive) {
      const lastTool = tools[tools.length - 1];
      if (lastTool) return lastTool.status;
    }
  }

  return 'Idle';
}

export function ToolOverlay({
  campus,
  isEditMode,
  agents,
  agentTools,
  subagentCharacters,
  containerRef,
  zoom,
  panRef,
  onCloseAgent,
  agentSuggestions,
  onRunAction,
  roles,
  onSetRole,
}: ToolOverlayProps) {
  const [, setTick] = useState(0);
  /** Agent id whose role dropdown is open, or null. */
  const [rolePickerFor, setRolePickerFor] = useState<number | null>(null);
  // Only re-render (and measure the container) while an overlay is visible —
  // i.e., an agent is hovered or selected — plus one final tick to clear it.
  const hadOverlayRef = useRef(false);
  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      const hasOverlay =
        campus.getHoveredAgentId() !== null || campus.getSelectedAgentId() !== null;
      if (hasOverlay || hadOverlayRef.current) {
        setTick((n) => n + 1);
      }
      hadOverlayRef.current = hasOverlay;
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [campus]);

  const el = containerRef.current;
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const canvasW = Math.round(rect.width * dpr);
  const canvasH = Math.round(rect.height * dpr);
  // Base offset must mirror the canvas renderer: edit mode centers the active
  // office; campus mode centers the whole campus bounding box.
  let mapW: number;
  let mapH: number;
  if (isEditMode) {
    const layout = campus.getActiveOffice().getLayout();
    mapW = layout.cols * TILE_SIZE * zoom;
    mapH = layout.rows * TILE_SIZE * zoom;
  } else {
    const size = campus.getPixelSize();
    mapW = size.w * zoom;
    mapH = size.h * zoom;
  }
  const deviceOffsetX = Math.floor((canvasW - mapW) / 2) + Math.round(panRef.current.x);
  const deviceOffsetY = Math.floor((canvasH - mapH) / 2) + Math.round(panRef.current.y);

  const selectedId = campus.getSelectedAgentId();
  const hoveredId = campus.getHoveredAgentId();

  // All character IDs
  const allIds = [...agents, ...subagentCharacters.map((s) => s.id)];

  return (
    <>
      {allIds.map((id) => {
        const ch = campus.getCharacter(id);
        if (!ch) return null;

        const isSelected = selectedId === id;
        const isHovered = hoveredId === id;
        const isSub = ch.isSubagent;

        // Only show for hovered or selected agents
        if (!isSelected && !isHovered) return null;

        // Office origin in campus world space (0,0 in edit mode)
        const entry = isEditMode ? null : campus.getEntryForAgent(id);
        const originX = entry ? entry.originCol * TILE_SIZE : 0;
        const originY = entry ? entry.originRow * TILE_SIZE : 0;

        // Position above character
        const sittingOffset = ch.state === CharacterState.TYPE ? CHARACTER_SITTING_OFFSET_PX : 0;
        const screenX = (deviceOffsetX + (originX + ch.x) * zoom) / dpr;
        const screenY =
          (deviceOffsetY + (originY + ch.y + sittingOffset - TOOL_OVERLAY_VERTICAL_OFFSET) * zoom) /
          dpr;

        // Get activity text
        const subHasPermission = isSub && ch.bubbleType === BubbleKind.BLOCKED;
        let activityText: string;
        if (isSub) {
          if (subHasPermission) {
            activityText = 'Needs approval';
          } else {
            const sub = subagentCharacters.find((s) => s.id === id);
            activityText = sub ? sub.label : 'Subtask';
          }
        } else {
          activityText = getActivityText(id, agentTools, ch.isActive);
        }

        // Named agents lead with the name and demote the activity to the
        // subtitle; unnamed ones keep the old activity-first layout.
        const displayName = isSub ? undefined : ch.name;
        const primaryText = displayName ?? activityText;
        const secondaryText =
          [displayName ? activityText : null, ch.folderName].filter(Boolean).join(' · ') || null;

        // Determine dot color
        const tools = agentTools[id];
        const hasPermission = subHasPermission || tools?.some((t) => t.permissionWait && !t.done);
        const hasActiveTools = tools?.some((t) => !t.done);
        const isActive = ch.isActive;

        let dotColor: string | null = null;
        if (hasPermission) {
          dotColor = 'var(--pixel-status-permission)';
        } else if (isActive && hasActiveTools) {
          dotColor = 'var(--pixel-status-active)';
        }

        return (
          <div
            key={id}
            style={{
              position: 'absolute',
              left: screenX,
              top: screenY - 24,
              transform: 'translateX(-50%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              pointerEvents: isSelected ? 'auto' : 'none',
              zIndex: isSelected ? 'var(--pixel-overlay-selected-z)' : 'var(--pixel-overlay-z)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                background: 'var(--pixel-bg)',
                border: isSelected
                  ? '2px solid var(--pixel-border-light)'
                  : '2px solid var(--pixel-border)',
                borderRadius: 0,
                padding: isSelected ? '3px 6px 3px 8px' : '3px 8px',
                boxShadow: 'var(--pixel-shadow)',
                whiteSpace: 'nowrap',
                maxWidth: 220,
              }}
            >
              {dotColor && (
                <span
                  className={isActive && !hasPermission ? 'pixel-agents-pulse' : undefined}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: dotColor,
                    flexShrink: 0,
                  }}
                />
              )}
              <div style={{ overflow: 'hidden' }}>
                <span
                  style={{
                    fontSize: isSub ? '20px' : '22px',
                    fontStyle: isSub ? 'italic' : undefined,
                    color: 'var(--vscode-foreground)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: 'block',
                  }}
                >
                  {primaryText}
                </span>
                {secondaryText && (
                  <span
                    style={{
                      fontSize: '16px',
                      color: 'var(--pixel-text-dim)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: 'block',
                    }}
                  >
                    {secondaryText}
                  </span>
                )}
              </div>
              {isSelected && !isSub && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseAgent(id);
                  }}
                  title="Close agent"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--pixel-close-text)',
                    cursor: 'pointer',
                    padding: '0 2px',
                    fontSize: '26px',
                    lineHeight: 1,
                    marginLeft: 2,
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.color = 'var(--pixel-close-hover)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.color = 'var(--pixel-close-text)';
                  }}
                >
                  ×
                </button>
              )}
            </div>
            {isSelected && !isSub && roles.length > 0 && (
              <div style={{ position: 'relative', marginTop: 4 }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setRolePickerFor((prev) => (prev === id ? null : id));
                  }}
                  title="Assign a role skin to this agent"
                  style={{
                    background: 'var(--pixel-bg)',
                    border: '2px solid var(--pixel-border)',
                    borderRadius: 0,
                    boxShadow: 'var(--pixel-shadow)',
                    color: 'var(--pixel-text-dim)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: '16px',
                    lineHeight: 1,
                    padding: '3px 7px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {roles.find((r) => r.id === ch.role)?.name ?? 'No role'} ▾
                </button>
                {rolePickerFor === id && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      marginTop: 2,
                      background: 'var(--pixel-bg)',
                      border: '2px solid var(--pixel-border-light)',
                      boxShadow: 'var(--pixel-shadow)',
                      display: 'flex',
                      flexDirection: 'column',
                      zIndex: 'var(--pixel-overlay-selected-z)',
                    }}
                  >
                    {[{ id: null as string | null, name: 'No role' }, ...roles].map((r) => (
                      <button
                        key={r.id ?? 'none'}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSetRole(id, r.id);
                          setRolePickerFor(null);
                        }}
                        style={{
                          background:
                            (ch.role ?? null) === r.id ? 'var(--pixel-active-bg)' : 'transparent',
                          border: 'none',
                          borderRadius: 0,
                          color: 'var(--pixel-text)',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          fontSize: '16px',
                          lineHeight: 1,
                          padding: '4px 10px',
                          textAlign: 'left',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {r.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {isSelected && !isSub && !ch.isActive && (agentSuggestions[id]?.length ?? 0) > 0 && (
              <div
                style={{
                  display: 'flex',
                  gap: 4,
                  marginTop: 4,
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                }}
              >
                {agentSuggestions[id].map((s) => (
                  <button
                    key={s.label}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRunAction(id, s.command);
                    }}
                    title={s.reason ? `${s.reason} — sends: ${s.command}` : s.command}
                    style={{
                      background: 'var(--pixel-bg)',
                      border: '2px solid var(--pixel-border)',
                      borderRadius: 0,
                      boxShadow: 'var(--pixel-shadow)',
                      color: 'var(--vscode-foreground)',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      fontSize: '18px',
                      lineHeight: 1,
                      padding: '4px 8px',
                      whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor =
                        'var(--pixel-border-light)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = 'var(--pixel-border)';
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
