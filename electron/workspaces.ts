/**
 * Workspace registry: project folders rendered as offices in the campus.
 * Persisted to ~/.pixel-agents/workspaces.json.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { WorkspaceInfo } from '../shared/protocol.js';
import { DATA_DIR_NAME } from '../src/core/constants.js';
import { isGitRepo } from './worktrees.js';

const WORKSPACES_FILE = path.join(os.homedir(), DATA_DIR_NAME, 'workspaces.json');

let cache: WorkspaceInfo[] | null = null;
/**
 * Whether a path is a git repo, remembered for the run. Derived state, so it
 * is never written to disk — but it is asked for on every workspacesLoaded
 * (several times per agent launch), and each answer costs a git process.
 * A folder that becomes a repo mid-session is rare enough to need a restart.
 */
const gitCache = new Map<string, boolean>();

function isGit(workspacePath: string): boolean {
  const known = gitCache.get(workspacePath);
  if (known !== undefined) return known;
  const answer = isGitRepo(workspacePath);
  gitCache.set(workspacePath, answer);
  return answer;
}

/**
 * The list as the webview sees it: stored fields plus derived ones. Copies,
 * so nothing derived can leak back into what gets saved.
 */
function annotate(list: WorkspaceInfo[]): WorkspaceInfo[] {
  return list.map((w) => ({ ...w, isGit: isGit(w.path) }));
}

/** Stored entries, without the derived fields (host-internal reads). */
function storedWorkspaces(): WorkspaceInfo[] {
  if (cache) return cache;
  try {
    const raw = JSON.parse(fs.readFileSync(WORKSPACES_FILE, 'utf-8')) as {
      workspaces?: WorkspaceInfo[];
    };
    cache = (raw.workspaces ?? []).filter((w) => typeof w.path === 'string');
  } catch {
    cache = [];
  }
  return cache;
}

export function loadWorkspaces(): WorkspaceInfo[] {
  return annotate(storedWorkspaces());
}

/** The setup command to run in a new worktree of this workspace, if any. */
export function getSetupCommand(workspacePath: string): string | undefined {
  const command = storedWorkspaces().find((w) => w.path === workspacePath)?.setupCommand;
  return command && command.trim() ? command : undefined;
}

/** Sets (or, with an empty command, clears) a workspace's worktree setup command. */
export function setSetupCommand(workspacePath: string, command: string): WorkspaceInfo[] {
  const entry = storedWorkspaces().find((w) => w.path === workspacePath);
  if (entry) {
    const trimmed = command.trim();
    if (trimmed) entry.setupCommand = trimmed;
    else delete entry.setupCommand;
    save();
  }
  return loadWorkspaces();
}

function save(): void {
  try {
    fs.mkdirSync(path.dirname(WORKSPACES_FILE), { recursive: true });
    fs.writeFileSync(
      WORKSPACES_FILE,
      JSON.stringify({ workspaces: cache ?? [] }, null, 2),
      'utf-8',
    );
  } catch (err) {
    console.error('[Agent Campus] Failed to save workspaces:', err);
  }
}

/** Adds (or touches) a workspace; returns the updated list. */
export function touchWorkspace(workspacePath: string, name?: string): WorkspaceInfo[] {
  const list = storedWorkspaces();
  const existing = list.find((w) => w.path === workspacePath);
  if (existing) {
    existing.lastUsedAt = Date.now();
    if (name) existing.name = name;
  } else {
    list.push({
      path: workspacePath,
      name: name ?? path.basename(workspacePath),
      addedAt: Date.now(),
      lastUsedAt: Date.now(),
    });
  }
  save();
  return annotate(list);
}

export function removeWorkspace(workspacePath: string): WorkspaceInfo[] {
  cache = storedWorkspaces().filter((w) => w.path !== workspacePath);
  save();
  return annotate(cache);
}
