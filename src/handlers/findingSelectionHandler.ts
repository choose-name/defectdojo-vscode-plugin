/**
 * Handles selecting a finding in the TreeView
 */

import * as vscode from 'vscode';
import type { Finding, TriageData } from '../types';
import { FindingTreeItem } from '../models/findingTreeItem';
import { FindingDetailsPanel } from '../extension';
import { triageStore } from '../triageStore';
import { checkFileExists, findDependencyInProject, extractComponentInfo } from '../utils';
import { COMMANDS } from '../constants';

/**
 * Processes finding selection in the TreeView
 */
export async function handleFindingSelection(
    item: FindingTreeItem,
    extensionUri: vscode.Uri
): Promise<void> {
    if (!item.finding) {
        return;
    }

    const finding = item.finding;
    
    // Initialize triage data from the finding if present
    initializeTriageFromFinding(finding);
    
    const config = vscode.workspace.getConfiguration('defectdojo-triage');
    const testType = config.get<string>('testType', '');
    const autoSearchDependencies = config.get<string>('autoSearchDependencies', 'true') !== 'false';
    const isDependencyTrack = testType === 'Dependency Track Finding Packaging Format (FPF) Export';
    
    // For Dependency Track, search dependencies instead of opening a file (if enabled)
    if (isDependencyTrack && autoSearchDependencies) {
        await handleDependencyTrackFinding(finding, extensionUri, config);
    } else {
        await handleRegularFinding(finding, extensionUri);
    }
}

/**
 * Initializes triage data from a finding if values exist
 */
function initializeTriageFromFinding(finding: Finding): void {
    const existingTriage = triageStore.get(finding.id);
    const impactFromFinding = (finding.impact as string | undefined) || '';
    const mitigationFromFinding = (finding.mitigation as string | undefined) || '';
    
    if (impactFromFinding || mitigationFromFinding) {
        const newTriage: TriageData = {
            ...existingTriage,
            impact: existingTriage?.impact || impactFromFinding || undefined,
            mitigation: existingTriage?.mitigation || mitigationFromFinding || undefined,
        };
        triageStore.set(finding.id, newTriage);
    }
}

/**
 * Handles a Dependency Track finding
 */
async function handleDependencyTrackFinding(
    finding: Finding,
    extensionUri: vscode.Uri,
    config: vscode.WorkspaceConfiguration
): Promise<void> {
    const componentInfo = extractComponentInfo(finding);
    if (!componentInfo || !componentInfo.name) {
        const panel = FindingDetailsPanel.createOrShow(extensionUri);
        panel.updateFinding(finding);
        return;
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        const panel = FindingDetailsPanel.createOrShow(extensionUri);
        panel.updateFinding(finding);
        return;
    }

    const panel = FindingDetailsPanel.createOrShow(extensionUri);
    panel.updateFinding(finding);
    
    const searchMessage = `Searching for dependency "${componentInfo.name}" in the project...`;
    
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: searchMessage,
        cancellable: false,
    }, async (progress: vscode.Progress<{ increment?: number; message?: string }>) => {
        try {
            progress.report({ increment: 0, message: 'Searching project files...' });
            const searchDepth = config.get<number>('dependencySearchDepth', 15);
            const locations = await findDependencyInProject(
                componentInfo.name, 
                workspaceFolders,
                undefined, // Disable version check
                searchDepth
            );
            progress.report({ increment: 100, message: 'Search completed' });
            
            panel._dependencyLocations = locations;
            panel._update();
            
            if (locations.length === 0) {
                vscode.window.showInformationMessage(`Dependency "${componentInfo.name}" was not found in the project`);
            } else {
                vscode.window.showInformationMessage(`Found ${locations.length} file(s) with dependency "${componentInfo.name}"`);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Error while searching for dependency: ${errorMessage}`);
        }
    });
}

/**
 * Handles a regular finding
 */
async function handleRegularFinding(
    finding: Finding,
    extensionUri: vscode.Uri
): Promise<void> {
    let fileExists = true;
    let fileResolvedPath: string | undefined;
    
    if (finding.file_path) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            const fileCheck = await checkFileExists(finding.file_path, workspaceFolders);
            fileExists = fileCheck.exists;
            fileResolvedPath = fileCheck.resolvedPath;
            
            // Open the file only if it exists
            if (fileExists && fileCheck.fileUri) {
                await vscode.commands.executeCommand(COMMANDS.OPEN_FINDING, finding);
            } else {
                vscode.window.showWarningMessage(`File "${finding.file_path}" was not found in the workspace`);
            }
        }
    }
    
    // Create or show the WebView panel with the description
    const panel = FindingDetailsPanel.createOrShow(extensionUri);
    panel.updateFinding(finding, fileExists, fileResolvedPath);
}
