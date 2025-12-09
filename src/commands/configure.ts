/**
 * Command for configuring settings
 */

import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import { SettingsPanel } from '../panels/settingsPanel';

/**
 * Registers the configure settings command
 */
export function registerConfigureCommand(extensionUri: vscode.Uri): vscode.Disposable {
    return vscode.commands.registerCommand(COMMANDS.CONFIGURE, async () => {
        SettingsPanel.createOrShow(extensionUri);
    });
}
