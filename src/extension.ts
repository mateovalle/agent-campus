import * as vscode from 'vscode';

import { AgentCampusViewProvider } from './AgentCampusViewProvider.js';
import { COMMAND_EXPORT_DEFAULT_LAYOUT, COMMAND_SHOW_PANEL, VIEW_ID } from './constants.js';

let providerInstance: AgentCampusViewProvider | undefined;

export function activate(context: vscode.ExtensionContext) {
  const provider = new AgentCampusViewProvider(context);
  providerInstance = provider;

  context.subscriptions.push(vscode.window.registerWebviewViewProvider(VIEW_ID, provider));

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_SHOW_PANEL, () => {
      vscode.commands.executeCommand(`${VIEW_ID}.focus`);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_EXPORT_DEFAULT_LAYOUT, () => {
      provider.exportDefaultLayout();
    }),
  );
}

export function deactivate() {
  providerInstance?.dispose();
}
