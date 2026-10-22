import { createContext, useContext } from 'react';

import { vscode } from '../../vscodeApi.js';
import type { FileRef } from './filePaths.js';

/**
 * Which agent's working directory a relative path belongs to.
 *
 * Paths an agent writes ("electron/main.ts") only mean something against the
 * directory it runs in — which for a worktree agent is its checkout, not the
 * repo. Carried as context because the text that mentions paths is rendered
 * several components deep (markdown bodies, tool cards, diffs) and threading
 * an id through every one of them would be noise.
 *
 * Lives apart from the component that uses it so fast refresh keeps working:
 * a file that exports both a component and a context reloads neither cleanly.
 */
export const ChatAgentContext = createContext<number | undefined>(undefined);

/** Opens a file reference through the host, which owns the filesystem. */
export function useOpenFileRef(): (ref: FileRef) => void {
  const agentId = useContext(ChatAgentContext);
  return (ref) => {
    vscode.postMessage({
      type: 'openFile',
      ...(agentId !== undefined ? { agentId } : {}),
      path: ref.path,
      ...(ref.line !== undefined ? { line: ref.line } : {}),
    });
  };
}
