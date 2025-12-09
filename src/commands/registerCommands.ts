/**
 * Registration of all extension commands
 */

import * as vscode from 'vscode';
import type { Finding } from '../types';
import { COMMANDS, MESSAGES } from '../constants';
import { FindingTreeItem } from '../models/findingTreeItem';
import { FindingsProvider } from '../providers/findingsProvider';
import { SettingsPanel, FindingDetailsPanel } from '../extension';
import { extractFinding, checkFileExists } from '../utils';
import { triageStore } from '../triageStore';
import { validateTriageData } from '../utils';
import { DefectDojoClient } from '../defectDojoClient';

/**
 * Registers all extension commands
 */
export function registerAllCommands(
    context: vscode.ExtensionContext,
    findingsProvider: FindingsProvider,
    treeView: vscode.TreeView<FindingTreeItem>,
    outputChannel: vscode.OutputChannel
): vscode.Disposable[] {
    const extensionUri = context.extensionUri;
    const disposables: vscode.Disposable[] = [];

    // Register commands
    disposables.push(registerConfigureCommand(extensionUri));
    disposables.push(registerFetchFindingsCommand(findingsProvider, outputChannel));
    disposables.push(registerOpenFindingCommand());
    disposables.push(registerOpenDependencyFileCommand());
    disposables.push(registerRefreshCommand(findingsProvider));
    disposables.push(registerSearchFindingsCommand(findingsProvider));
    disposables.push(registerEditImpactCommand(treeView, extensionUri));
    disposables.push(registerEditMitigationCommand(treeView, extensionUri));
    disposables.push(registerEditStatusCommand(treeView, extensionUri));
    disposables.push(registerSubmitTriageCommand(findingsProvider, treeView));

    return disposables;
}

function registerConfigureCommand(extensionUri: vscode.Uri): vscode.Disposable {
    console.log(`DefectDojo Triage: Registering command ${COMMANDS.CONFIGURE}`);
    return vscode.commands.registerCommand(COMMANDS.CONFIGURE, async () => {
        console.log(`DefectDojo Triage: Command ${COMMANDS.CONFIGURE} executed`);
        SettingsPanel.createOrShow(extensionUri);
    });
}

function registerOpenFindingCommand(): vscode.Disposable {
    return vscode.commands.registerCommand(COMMANDS.OPEN_FINDING, async (finding: Finding) => {
        if (!finding) {
            vscode.window.showWarningMessage(MESSAGES.NO_FINDING_SELECTED);
            return;
        }
        if (!finding.file_path) {
            vscode.window.showWarningMessage(MESSAGES.NO_FILE_PATH);
            return;
        }

        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                vscode.window.showErrorMessage(MESSAGES.NO_WORKSPACE);
                return;
            }

            const fileCheck = await checkFileExists(finding.file_path, workspaceFolders);
            if (!fileCheck.exists || !fileCheck.fileUri) {
                vscode.window.showErrorMessage(`File "${finding.file_path}" was not found in the workspace`);
                return;
            }

            const document = await vscode.workspace.openTextDocument(fileCheck.fileUri);
            const editor = await vscode.window.showTextDocument(document, vscode.ViewColumn.One);

            if (finding.line && finding.line > 0) {
                const line = Math.max(0, finding.line - 1);
                const range = new vscode.Range(line, 0, line, 0);
                editor.selection = new vscode.Selection(range.start, range.end);
                editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`${MESSAGES.FILE_OPEN_ERROR}: ${errorMessage}`);
        }
    });
}

function registerOpenDependencyFileCommand(): vscode.Disposable {
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

function registerRefreshCommand(findingsProvider: FindingsProvider): vscode.Disposable {
    return vscode.commands.registerCommand(COMMANDS.REFRESH, () => {
        findingsProvider.refresh();
    });
}

function registerSearchFindingsCommand(findingsProvider: FindingsProvider): vscode.Disposable {
    return vscode.commands.registerCommand(COMMANDS.SEARCH_FINDINGS, async () => {
        const currentQuery = (findingsProvider as any).searchQuery || '';
        
        const searchQuery = await vscode.window.showInputBox({
            prompt: 'Enter text to search findings',
            placeHolder: 'Search by ID, title, description, file, severity, CWE...',
            value: currentQuery,
        });

        if (searchQuery !== undefined) {
            findingsProvider.setSearchQuery(searchQuery);
            
            const allFindings = (findingsProvider as any).findings as Finding[];
            if (allFindings && allFindings.length > 0) {
                const filteredCount = allFindings.filter(f => {
                    if (!searchQuery || searchQuery.trim() === '') {
                        return true;
                    }
                    const query = searchQuery.toLowerCase().trim();
                    return String(f.id).includes(query) ||
                           (f.title && f.title.toLowerCase().includes(query)) ||
                           (f.description && f.description.toLowerCase().includes(query)) ||
                           (f.file_path && f.file_path.toLowerCase().includes(query)) ||
                           (f.severity && f.severity.toLowerCase().includes(query)) ||
                           (f.cwe && String(f.cwe).includes(query)) ||
                           (f.url && f.url.toLowerCase().includes(query));
                }).length;
                
                if (searchQuery.trim() === '') {
                    vscode.window.showInformationMessage('Search cleared');
                } else {
                    vscode.window.showInformationMessage(`Found ${filteredCount} findings for "${searchQuery}"`);
                }
            }
        }
    });
}

function registerEditImpactCommand(
    treeView: vscode.TreeView<FindingTreeItem>,
    extensionUri: vscode.Uri
): vscode.Disposable {
    return vscode.commands.registerCommand(
        COMMANDS.EDIT_IMPACT,
        async (item?: FindingTreeItem | Finding) => {
            const result = extractFinding(item, treeView.selection);
            if (!result?.finding) {
                vscode.window.showWarningMessage('Select a finding to edit');
                return;
            }
            const panel = FindingDetailsPanel.createOrShow(extensionUri);
            panel.updateFinding(result.finding as Finding);
        }
    );
}

function registerEditMitigationCommand(
    treeView: vscode.TreeView<FindingTreeItem>,
    extensionUri: vscode.Uri
): vscode.Disposable {
    return vscode.commands.registerCommand(
        COMMANDS.EDIT_MITIGATION,
        async (item?: FindingTreeItem | Finding) => {
            const result = extractFinding(item, treeView.selection);
            if (!result?.finding) {
                vscode.window.showWarningMessage('Select a finding to edit');
                return;
            }
            const panel = FindingDetailsPanel.createOrShow(extensionUri);
            panel.updateFinding(result.finding as Finding);
        }
    );
}

function registerEditStatusCommand(
    treeView: vscode.TreeView<FindingTreeItem>,
    extensionUri: vscode.Uri
): vscode.Disposable {
    return vscode.commands.registerCommand(
        COMMANDS.EDIT_STATUS,
        async (item?: FindingTreeItem | Finding) => {
            const result = extractFinding(item, treeView.selection);
            if (!result?.finding) {
                vscode.window.showWarningMessage('Select a finding to edit');
                return;
            }
            const panel = FindingDetailsPanel.createOrShow(extensionUri);
            panel.updateFinding(result.finding as Finding);
        }
    );
}

function registerSubmitTriageCommand(
    findingsProvider: FindingsProvider,
    treeView: vscode.TreeView<FindingTreeItem>
): vscode.Disposable {
    return vscode.commands.registerCommand(
        COMMANDS.SUBMIT_TRIAGE,
        async (item?: FindingTreeItem | Finding) => {
            const result = extractFinding(item, treeView.selection);
            if (!result?.finding) {
                vscode.window.showWarningMessage(MESSAGES.NO_FINDING_SELECTED);
                return;
            }

            const finding = result.finding as Finding;
            const triage = triageStore.get(finding.id);

            const validation = validateTriageData(triage);
            if (!validation.isValid) {
                vscode.window.showWarningMessage(MESSAGES.FILL_ALL_FIELDS);
                return;
            }

            if (!triage || !triage.impact || !triage.mitigation || !triage.status) {
                vscode.window.showWarningMessage(MESSAGES.FILL_ALL_FIELDS);
                return;
            }

            const config = vscode.workspace.getConfiguration('defectdojo-triage');
            const apiToken = config.get<string>('apiToken', '');
            const url = config.get<string>('url', '');

            if (!apiToken || !url) {
                vscode.window.showErrorMessage(MESSAGES.CONFIGURE_CONNECTION);
                return;
            }

            try {
                const findingId = finding.id;
                const isAggregated = finding._isAggregated === true;
                const originalFindingIds = finding._aggregatedFindingIds || [findingId];

                await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: isAggregated ? 'Submitting triage data (aggregated finding)' : 'Submitting triage data',
                        cancellable: false,
                    },
                    async (progress: vscode.Progress<{ increment?: number; message?: string }>) => {
                        progress.report({ increment: 0, message: 'Preparing data...' });

                        const client = new DefectDojoClient(url, apiToken);
                        
                        const impact = triage.impact!;
                        const mitigation = triage.mitigation!;
                        const status = triage.status!;
                        
                        const totalFindings = originalFindingIds.length;
                        let completed = 0;
                        
                        const jiraErrors: Array<{ id: number; error: string }> = [];
                        
                        for (const id of originalFindingIds) {
                            progress.report({ 
                                increment: Math.floor(70 / totalFindings), 
                                message: isAggregated 
                                    ? `Sending data to DefectDojo... (${completed + 1}/${totalFindings})`
                                    : 'Sending data to DefectDojo...'
                            });
                            
                            const result = await client.updateFinding(id, {
                                impact,
                                mitigation,
                                status,
                            });
                            
                            // Keep Jira error information if it occurred
                            if (result?.jiraError) {
                                jiraErrors.push({ id, error: result.jiraError });
                            }
                            
                            triageStore.markAsSubmitted(id);
                            completed++;
                        }
                        
                        // Show warnings about Jira errors if any were returned
                        if (jiraErrors.length > 0) {
                            const errorMessages = jiraErrors.map(e => `Finding #${e.id}: ${e.error}`).join('\n');
                            if (jiraErrors.length === 1) {
                                vscode.window.showWarningMessage(
                                    `Triage data submitted, but Jira push failed:\n${errorMessages}`
                                );
                            } else {
                                vscode.window.showWarningMessage(
                                    `Triage data submitted, but Jira push failed for ${jiraErrors.length} findings.`
                                );
                            }
                        }

                        progress.report({ increment: 100, message: 'Submitted' });

                        findingsProvider.refresh();

                        if (
                            FindingDetailsPanel.currentPanel &&
                            FindingDetailsPanel.currentPanel._currentFinding?.id === findingId
                        ) {
                            FindingDetailsPanel.currentPanel._update();
                        }

                        if (isAggregated) {
                            vscode.window.showInformationMessage(
                                `Triage data submitted for ${totalFindings} findings (IDs: ${originalFindingIds.join(', ')})`
                            );
                        } else {
                            vscode.window.showInformationMessage(MESSAGES.TRIAGE_SUBMITTED(findingId));
                        }
                    }
                );
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Error submitting data: ${errorMessage}`);
            }
        }
    );
}

function registerFetchFindingsCommand(
    findingsProvider: FindingsProvider,
    outputChannel: vscode.OutputChannel
): vscode.Disposable {
    return vscode.commands.registerCommand(COMMANDS.FETCH_FINDINGS, async () => {
        const config = vscode.workspace.getConfiguration('defectdojo-triage');
        
        let apiToken = config.get<string>('apiToken', '');
        let url = config.get<string>('url', '');
        let productName = config.get<string>('productName', '');
        let testType = config.get<string>('testType', '');

        if (!apiToken || !url || !productName || !testType) {
            const configure = await vscode.window.showWarningMessage(
                MESSAGES.NOT_ALL_CONFIGURED,
                'Yes',
                'No'
            );

            if (configure === 'Yes') {
                await vscode.commands.executeCommand(COMMANDS.CONFIGURE);
                apiToken = config.get<string>('apiToken', '');
                url = config.get<string>('url', '');
                productName = config.get<string>('productName', '');
                testType = config.get<string>('testType', '');
            } else {
                return;
            }
        }

        if (!apiToken || !url || !productName || !testType) {
            vscode.window.showErrorMessage('Not all parameters are configured');
            return;
        }

        try {
            await fetchFindingsWithProgress(
                url,
                apiToken,
                productName,
                testType,
                config,
                findingsProvider,
                outputChannel
            );
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Error: ${errorMessage}`);
            outputChannel.appendLine(`Error: ${errorMessage}`);
            outputChannel.show();
        }
    });
}

async function fetchFindingsWithProgress(
    url: string,
    apiToken: string,
    productName: string,
    testType: string,
    config: vscode.WorkspaceConfiguration,
    findingsProvider: FindingsProvider,
    outputChannel: vscode.OutputChannel
): Promise<void> {
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Fetching data from DefectDojo",
        cancellable: false
    }, async (progress: vscode.Progress<{ increment?: number; message?: string }>) => {
        progress.report({ increment: 0, message: "Connecting to API..." });

        const client = new DefectDojoClient(url, apiToken);

        progress.report({ increment: 25, message: "Resolving product..." });
        const productId = await client.getProductId(productName);
        if (!productId) {
            throw new Error(`Product "${productName}" not found`);
        }

        progress.report({ increment: 50, message: "Resolving scan type..." });
        const testTypeId = await client.getTestTypeId(testType);
        if (!testTypeId) {
            throw new Error(`Scan type "${testType}" not found`);
        }

        progress.report({ increment: 75, message: "Fetching findings list..." });
        
        const options = buildFetchOptions(config);
        let findings = await client.getFindings(productId, testTypeId, Object.keys(options).length > 0 ? options : undefined);

        // Aggregate Dependency Track findings (if enabled)
        if (testType === 'Dependency Track Finding Packaging Format (FPF) Export') {
            const aggregateDependencyTrack = config.get<string>('aggregateDependencyTrack', 'true');
            if (aggregateDependencyTrack !== 'false') {
                const { aggregateDependencyTrackFindings } = await import('../utils');
                findings = aggregateDependencyTrackFindings(findings);
            }
        }

        progress.report({ increment: 100, message: "Done" });

        findingsProvider.updateFindings(findings);
        
        const { displayFindings } = await import('../utils/output');
        displayFindings(findings, outputChannel);
        
        vscode.window.showInformationMessage(MESSAGES.FINDINGS_FETCHED(findings.length));
    });
}

function buildFetchOptions(config: vscode.WorkspaceConfiguration): {
    active?: string | boolean;
    duplicate?: string | boolean;
    verified?: string | boolean;
    limit?: string | number;
} {
    const options: {
        active?: string | boolean;
        duplicate?: string | boolean;
        verified?: string | boolean;
        limit?: string | number;
    } = {};
    
    const activeParam = config.get<string>('active', '');
    if (activeParam && activeParam.trim() !== '') {
        const activeLower = activeParam.toLowerCase().trim();
        options.active = activeLower === 'true' || activeLower === 'false' ? activeLower === 'true' : activeParam;
    }
    
    const duplicateParam = config.get<string>('duplicate', '');
    if (duplicateParam && duplicateParam.trim() !== '') {
        const duplicateLower = duplicateParam.toLowerCase().trim();
        options.duplicate = duplicateLower === 'true' || duplicateLower === 'false' ? duplicateLower === 'true' : duplicateParam;
    }
    
    const verifiedParam = config.get<string>('verified', '');
    if (verifiedParam && verifiedParam.trim() !== '') {
        const verifiedLower = verifiedParam.toLowerCase().trim();
        options.verified = verifiedLower === 'true' || verifiedLower === 'false' ? verifiedLower === 'true' : verifiedParam;
    }
    
    const limitParam = config.get<string>('limit', '');
    if (limitParam && limitParam.trim() !== '') {
        const limitNum = parseInt(limitParam, 10);
        options.limit = !isNaN(limitNum) ? limitNum : limitParam;
    }
    
    return options;
}
