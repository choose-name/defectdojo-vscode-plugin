/**
 * Command to open a dependency file
 */

import * as vscode from 'vscode';
import { COMMANDS } from '../constants';

/**
 * Registers the command to open a dependency file
 */
export function registerOpenDependencyFileCommand(): vscode.Disposable {
    return vscode.commands.registerCommand(
        COMMANDS.OPEN_DEPENDENCY_FILE,
        async (filePath: string, lineNumber: number = 0) => {
            try {
                const fileUri = vscode.Uri.file(filePath);
                const document = await vscode.workspace.openTextDocument(fileUri);
                const editor = await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
                
                if (lineNumber > 0) {
                    const line = Math.max(0, lineNumber - 1);
                    const range = new vscode.Range(line, 0, line, 0);
                    editor.selection = new vscode.Selection(range.start, range.end);
                    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Error opening file: ${errorMessage}`);
            }
        }
    );
}
