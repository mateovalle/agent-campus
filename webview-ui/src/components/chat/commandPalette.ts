/**
 * When the composer should be offering slash commands, and which ones.
 *
 * Pure, because the open/closed rule is the whole feature: a palette that
 * stays up while someone is writing a message that merely begins with a
 * slash would eat their Enter key.
 */

export interface SlashCommandOption {
  name: string;
  description: string;
  argumentHint?: string;
}

export interface CommandMatches {
  /** What has been typed after the slash, lowercased. */
  query: string;
  matches: SlashCommandOption[];
}

/**
 * The palette for a draft, or null when it should not be open.
 *
 * It opens only while the caret is still inside the FIRST token: once there
 * is a space, the user is writing arguments (or a sentence that happens to
 * start with a slash) and the keys they press belong to the composer again.
 */
export function matchCommands(
  commands: readonly SlashCommandOption[],
  draft: string,
): CommandMatches | null {
  if (!draft.startsWith('/')) return null;
  const typed = draft.slice(1);
  // A space ends the command name; everything after it is arguments.
  if (/\s/.test(typed)) return null;

  const query = typed.toLowerCase();
  const matches = commands
    .filter((command) => command.name.toLowerCase().startsWith(query))
    // Shortest first: an exact name should not sit below everything it
    // happens to be a prefix of.
    .sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name));
  return matches.length > 0 ? { query, matches } : null;
}

/** The draft after accepting a command: ready for its arguments. */
export function applyCommand(command: SlashCommandOption): string {
  return `/${command.name} `;
}
