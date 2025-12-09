/**
 * Utilities for presenting data
 */

import * as vscode from 'vscode';
import type { Finding } from '../types';
import { UI_CONSTANTS } from '../constants';
import { truncateText } from './text';

/**
 * Displays the list of findings in the Output Channel
 */
export function displayFindings(findings: Finding[], outputChannel: vscode.OutputChannel): void {
    outputChannel.clear();
    outputChannel.appendLine('='.repeat(80));
    outputChannel.appendLine(`DEFECTDOJO FINDINGS`);
    outputChannel.appendLine(`Total found: ${findings.length}`);
    outputChannel.appendLine('='.repeat(80));
    outputChannel.appendLine('');

    if (findings.length === 0) {
        outputChannel.appendLine('No findings found.');
        outputChannel.show();
        return;
    }

    findings.forEach((finding, index) => {
        outputChannel.appendLine(`[${index + 1}] ID: ${finding.id}`);
        outputChannel.appendLine(`    Title: ${finding.title || 'N/A'}`);
        outputChannel.appendLine(`    Severity: ${finding.severity || 'N/A'}`);
        outputChannel.appendLine(`    CWE: ${finding.cwe || 'N/A'}`);
        outputChannel.appendLine(`    URL: ${finding.url || 'N/A'}`);
        outputChannel.appendLine(`    File: ${finding.file_path || 'N/A'}`);
        if (finding.line) {
            outputChannel.appendLine(`    Line: ${finding.line}`);
        }
        outputChannel.appendLine(
            `    Description: ${finding.description ? truncateText(finding.description, UI_CONSTANTS.DESCRIPTION_PREVIEW_LENGTH) : 'N/A'}`
        );
        outputChannel.appendLine(`    Active: ${finding.active ? 'Yes' : 'No'}`);
        outputChannel.appendLine(`    Verified: ${finding.verified ? 'Yes' : 'No'}`);
        outputChannel.appendLine(`    Duplicate: ${finding.duplicate ? 'Yes' : 'No'}`);
        outputChannel.appendLine('-'.repeat(80));
    });

    outputChannel.show();
}
