/**
 * Command to refresh the findings list
 */

import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import { FindingsProvider } from '../providers/findingsProvider';

/**
 * Registers the refresh findings command
 */
export function registerRefreshCommand(findingsProvider: FindingsProvider): vscode.Disposable {
    return vscode.commands.registerCommand(COMMANDS.REFRESH, () => {
        findingsProvider.refresh();
    });
}
