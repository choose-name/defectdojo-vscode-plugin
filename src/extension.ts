import * as vscode from 'vscode';
import type { Finding, TriageStatus, WebViewMessage } from './types';
import { triageStore } from './triageStore';
import { DefectDojoClient } from './defectDojoClient';
import {
    COMMANDS,
    WEBVIEW_COMMANDS,
    SEVERITY_COLORS,
    TRIAGE_STATUS_OPTIONS,
    UI_CONSTANTS,
    MESSAGES,
} from './constants';
import {
    escapeHtml,
    extractComponentInfo,
    type DependencyLocation,
} from './utils';

// Import classes from modularized files
import { FindingTreeItem } from './models/findingTreeItem';
import { FindingsProvider } from './providers/findingsProvider';
import { registerAllCommands } from './commands/registerCommands';
import { handleFindingSelection } from './handlers/findingSelectionHandler';

// Class that manages the settings WebView panel
export class SettingsPanel {
    public static currentPanel: SettingsPanel | undefined;
    public static readonly viewType = 'defectdojoSettings';
    
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    
    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;
        
        // If the panel is already open, reveal it
        if (SettingsPanel.currentPanel) {
            SettingsPanel.currentPanel._panel.reveal(column);
            SettingsPanel.currentPanel._update();
            return SettingsPanel.currentPanel;
        }
        
        // Otherwise, create a new panel
        const panel = vscode.window.createWebviewPanel(
            SettingsPanel.viewType,
            'DefectDojo Triage Settings',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri]
            }
        );
        
        SettingsPanel.currentPanel = new SettingsPanel(panel, extensionUri);
        return SettingsPanel.currentPanel;
    }
    
    private constructor(panel: vscode.WebviewPanel, _extensionUri: vscode.Uri) {
        this._panel = panel;
        
        // Set the initial content
        this._update();
        
        // Listen for messages from the WebView
        this._panel.webview.onDidReceiveMessage(
            async (message: WebViewMessage & { data?: unknown }) => {
                switch (message.command) {
                    case 'saveSettings':
                        if (message.data && typeof message.data === 'object' && 'apiToken' in message.data && 'url' in message.data && 'productName' in message.data && 'testType' in message.data) {
                            await this.saveSettings(message.data as Parameters<typeof this.saveSettings>[0]);
                        }
                        break;
                    case 'testConnection':
                        if (message.data && typeof message.data === 'object' && 'apiToken' in message.data && 'url' in message.data) {
                            await this.testConnection(message.data as Parameters<typeof this.testConnection>[0]);
                        }
                        break;
                }
            },
            null,
            this._disposables
        );
        
        // Clean up on close
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }
    
    private async saveSettings(data: {
        apiToken: string;
        url: string;
        productName: string;
        testType: string;
        active?: string;
        duplicate?: string;
        verified?: string;
        limit?: string;
        autoSearchDependencies?: string;
        aggregateDependencyTrack?: string;
        dependencySearchDepth?: number;
    }) {
        try {
            const config = vscode.workspace.getConfiguration('defectdojo-triage');
            
            await config.update('apiToken', data.apiToken, vscode.ConfigurationTarget.Global);
            await config.update('url', data.url, vscode.ConfigurationTarget.Global);
            await config.update('productName', data.productName, vscode.ConfigurationTarget.Global);
            await config.update('testType', data.testType, vscode.ConfigurationTarget.Global);
            
            // Save additional parameters (an empty string means "not selected")
            await config.update('active', data.active?.trim() || '', vscode.ConfigurationTarget.Global);
            await config.update('duplicate', data.duplicate?.trim() || '', vscode.ConfigurationTarget.Global);
            await config.update('verified', data.verified?.trim() || '', vscode.ConfigurationTarget.Global);
            await config.update('limit', data.limit?.trim() || '', vscode.ConfigurationTarget.Global);
            await config.update('autoSearchDependencies', data.autoSearchDependencies?.trim() || 'true', vscode.ConfigurationTarget.Global);
            await config.update('aggregateDependencyTrack', data.aggregateDependencyTrack?.trim() || 'true', vscode.ConfigurationTarget.Global);
            if (data.dependencySearchDepth !== undefined) {
                await config.update('dependencySearchDepth', data.dependencySearchDepth, vscode.ConfigurationTarget.Global);
            }
            
            this._panel.webview.postMessage({
                command: 'settingsSaved',
                success: true
            });
            
            vscode.window.showInformationMessage(MESSAGES.CONFIG_SAVED);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this._panel.webview.postMessage({
                command: 'settingsSaved',
                success: false,
                error: errorMessage
            });
            vscode.window.showErrorMessage(`Error saving settings: ${errorMessage}`);
        }
    }
    
    private async testConnection(data: {
        apiToken: string;
        url: string;
    }) {
        try {
            if (!data.apiToken || !data.url) {
                this._panel.webview.postMessage({
                    command: 'connectionTested',
                    success: false,
                    error: 'Fill in all fields to test the connection'
                });
                return;
            }
            
            const client = new DefectDojoClient(data.url, data.apiToken);
            // Verify API connectivity
            await client.testConnection();
            
            this._panel.webview.postMessage({
                command: 'connectionTested',
                success: true,
                message: 'Connection successful! API is reachable.'
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this._panel.webview.postMessage({
                command: 'connectionTested',
                success: false,
                error: `Connection error: ${errorMessage}`
            });
        }
    }
    
    public _update() {
        const webview = this._panel.webview;
        const config = vscode.workspace.getConfiguration('defectdojo-triage');
        
        const currentSettings = {
            apiToken: config.get<string>('apiToken', ''),
            url: config.get<string>('url', ''),
            productName: config.get<string>('productName', ''),
            testType: config.get<string>('testType', ''),
            active: config.get<string>('active', ''),
            duplicate: config.get<string>('duplicate', ''),
            verified: config.get<string>('verified', ''),
            limit: config.get<string>('limit', ''),
            autoSearchDependencies: config.get<string>('autoSearchDependencies', 'true'),
            aggregateDependencyTrack: config.get<string>('aggregateDependencyTrack', 'true'),
            dependencySearchDepth: config.get<number>('dependencySearchDepth', 15),
        };
        
        this._panel.webview.html = this._getHtmlForWebview(webview, currentSettings);
    }
    
    public dispose() {
        SettingsPanel.currentPanel = undefined;
        this._panel.dispose();
        
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
    
    private _getHtmlForWebview(_webview: vscode.Webview, settings: {
        apiToken: string;
        url: string;
        productName: string;
        testType: string;
        active?: string;
        duplicate?: string;
        verified?: string;
        limit?: string;
        autoSearchDependencies?: string;
        aggregateDependencyTrack?: string;
        dependencySearchDepth?: number;
    }): string {
        return `<!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>DefectDojo Triage Settings</title>
            <style>
                * {
                    box-sizing: border-box;
                }
                body {
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                    margin: 0;
                    padding: 0;
                    height: 100vh;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                }
                .settings-container {
                    display: flex;
                    flex: 1;
                    overflow: hidden;
                }
                .settings-sidebar {
                    width: 220px;
                    background-color: var(--vscode-sideBar-background);
                    border-right: 1px solid var(--vscode-panel-border);
                    padding: 20px 0;
                    overflow-y: auto;
                    flex-shrink: 0;
                }
                .settings-content {
                    flex: 1;
                    overflow-y: auto;
                    padding: 20px 30px;
                }
                .nav-item {
                    padding: 10px 20px;
                    cursor: pointer;
                    color: var(--vscode-foreground);
                    border-left: 3px solid transparent;
                    transition: all 0.2s;
                    font-size: 13px;
                }
                .nav-item:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }
                .nav-item.active {
                    background-color: var(--vscode-list-activeSelectionBackground);
                    border-left-color: var(--vscode-textLink-foreground);
                    color: var(--vscode-list-activeSelectionForeground);
                }
                .content-section {
                    display: none;
                }
                .content-section.active {
                    display: block;
                }
                .section-header {
                    margin-bottom: 30px;
                }
                .section-title {
                    font-size: 24px;
                    font-weight: bold;
                    margin: 0 0 8px 0;
                    color: var(--vscode-foreground);
                }
                .section-description {
                    color: var(--vscode-descriptionForeground);
                    font-size: 13px;
                    margin: 0;
                }
                .form-group {
                    margin: 25px 0;
                }
                .form-label {
                    display: block;
                    font-weight: 600;
                    color: var(--vscode-foreground);
                    margin-bottom: 8px;
                    font-size: 13px;
                }
                .form-description {
                    font-size: 12px;
                    color: var(--vscode-descriptionForeground);
                    margin-top: 4px;
                    margin-bottom: 10px;
                    line-height: 1.5;
                }
                .form-input {
                    width: 100%;
                    padding: 8px 12px;
                    border: 1px solid var(--vscode-input-border);
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border-radius: 2px;
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    transition: border-color 0.2s;
                }
                .form-input:focus {
                    outline: none;
                    border-color: var(--vscode-focusBorder);
                }
                .form-input::placeholder {
                    color: var(--vscode-input-placeholderForeground);
                }
                .form-select {
                    width: 100%;
                    padding: 8px 12px;
                    border: 1px solid var(--vscode-input-border);
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border-radius: 2px;
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    transition: border-color 0.2s;
                    cursor: pointer;
                }
                .form-select:focus {
                    outline: none;
                    border-color: var(--vscode-focusBorder);
                }
                .custom-input-group {
                    margin-top: 10px;
                    display: none;
                }
                .custom-input-group.show {
                    display: block;
                }
                .button-group {
                    display: flex;
                    gap: 10px;
                    margin-top: 30px;
                    padding-top: 20px;
                    border-top: 1px solid var(--vscode-panel-border);
                }
                button {
                    padding: 8px 16px;
                    border: none;
                    border-radius: 2px;
                    cursor: pointer;
                    font-weight: 500;
                    font-size: 13px;
                    transition: background-color 0.2s;
                }
                .btn-primary {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                }
                .btn-primary:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                .btn-test {
                    background-color: #0e639c;
                    color: white;
                }
                .btn-test:hover {
                    background-color: #1177bb;
                }
                .status-message {
                    margin-top: 15px;
                    padding: 10px 12px;
                    border-radius: 2px;
                    font-size: 12px;
                    display: none;
                }
                .status-message.success {
                    background-color: rgba(76, 175, 80, 0.15);
                    color: #4caf50;
                    border: 1px solid rgba(76, 175, 80, 0.3);
                }
                .status-message.error {
                    background-color: rgba(244, 67, 54, 0.15);
                    color: #f44336;
                    border: 1px solid rgba(244, 67, 54, 0.3);
                }
                .status-message.show {
                    display: block;
                }
                .required {
                    color: var(--vscode-errorForeground);
                }
                .top-bar {
                    display: flex;
                    justify-content: flex-end;
                    padding: 10px 20px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                    background-color: var(--vscode-editor-background);
                }
                .top-bar button {
                    margin-left: 8px;
                }
            </style>
        </head>
        <body>
            <div class="top-bar">
                <button class="btn-test" onclick="testConnection()">Test connection</button>
            </div>
            <div class="settings-container">
                <div class="settings-sidebar">
                    <div class="nav-item active" data-section="connection" onclick="switchSection('connection')">
                        Connection
                    </div>
                    <div class="nav-item" data-section="advanced" onclick="switchSection('advanced')">
                        Advanced
                    </div>
                </div>
                <div class="settings-content">
                    <div id="connection-section" class="content-section active">
                        <div class="section-header">
                            <div class="section-title">Connection</div>
                            <div class="section-description">
                                Configure DefectDojo connection settings for working with findings
                            </div>
                        </div>
                        
                        <form id="settings-form">
                            <div class="form-group">
                                <label class="form-label" for="url">
                                    DefectDojo URL <span class="required">*</span>
                                </label>
                                <div class="form-description">
                                    Enter your DefectDojo server URL (for example: https://defect-dojo.test.pro)
                                </div>
                                <input 
                                    type="text" 
                                    id="url" 
                                    class="form-input" 
                                    placeholder="https://defect-dojo.example.com"
                                    value="${escapeHtml(settings.url)}"
                                    required
                                />
                            </div>
                            
                            <div class="form-group">
                                <label class="form-label" for="apiToken">
                                    API Token <span class="required">*</span>
                                </label>
                                <div class="form-description">
                                    Enter the API token for DefectDojo access. You can obtain a token in your DefectDojo profile settings.
                                </div>
                                <input 
                                    type="password" 
                                    id="apiToken" 
                                    class="form-input" 
                                    placeholder="Enter API token"
                                    value="${escapeHtml(settings.apiToken)}"
                                    required
                                />
                            </div>
                            
                            <div class="form-group">
                                <label class="form-label" for="productName">
                                    Project/Product name <span class="required">*</span>
                                </label>
                                <div class="form-description">
                                    Enter the exact product or project name in DefectDojo
                                </div>
                                <input 
                                    type="text" 
                                    id="productName" 
                                    class="form-input" 
                                    placeholder="Product name"
                                    value="${escapeHtml(settings.productName)}"
                                    required
                                />
                            </div>
                            
                            <div class="form-group">
                                <label class="form-label" for="testType">
                                    Scan type <span class="required">*</span>
                                </label>
                                <div class="form-description">
                                    Select a scan type from the list or provide your own
                                </div>
                                <select 
                                    id="testType" 
                                    class="form-select"
                                    onchange="handleTestTypeChange()"
                                    required
                                >
                                    <option value="">-- Select scan type --</option>
                                    <optgroup label="Static Analyze">
                                        <option value="Semgrep Scan (GitLab SAST Report)" ${settings.testType === 'Semgrep Scan (GitLab SAST Report)' ? 'selected' : ''}>Semgrep Scan (GitLab SAST Report)</option>
                                        <option value="GitLab SAST Report" ${settings.testType === 'GitLab SAST Report' ? 'selected' : ''}>GitLab SAST Report</option>
                                    </optgroup>
                                    <optgroup label="SCA">
                                        <option value="Dependency Track Finding Packaging Format (FPF) Export" ${settings.testType === 'Dependency Track Finding Packaging Format (FPF) Export' ? 'selected' : ''}>Dependency Track Finding Packaging Format (FPF) Export</option>
                                        <option value="trivy" ${settings.testType === 'trivy' ? 'selected' : ''}>trivy</option>
                                    </optgroup>
                                    <optgroup label="Checksec">
                                        <option value="RChecksec Scan" ${settings.testType === 'RChecksec Scan' ? 'selected' : ''}>RChecksec Scan</option>
                                    </optgroup>
                                    <option value="__custom__">Other (custom value)</option>
                                </select>
                                <div id="customTestTypeGroup" class="custom-input-group">
                                    <input 
                                        type="text" 
                                        id="customTestType" 
                                        class="form-input" 
                                        placeholder="Enter custom scan type"
                                        value="${settings.testType && !['Semgrep Scan (GitLab SAST Report)', 'GitLab SAST Report', 'Dependency Track Finding Packaging Format (FPF) Export', 'trivy', 'RChecksec Scan'].includes(settings.testType) ? escapeHtml(settings.testType) : ''}"
                                    />
                                </div>
                            </div>
                            
                            <div class="button-group">
                                <button type="button" class="btn-primary" onclick="saveAllSettings()">Save</button>
                            </div>
                            
                            <div id="status-message" class="status-message"></div>
                        </form>
                    </div>
                    
                    <div id="advanced-section" class="content-section">
                        <div class="section-header">
                            <div class="section-title">Advanced</div>
                            <div class="section-description">
                                Additional query parameters for retrieving findings from the DefectDojo API
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label" for="active">
                                Active (active findings)
                            </label>
                            <div class="form-description">
                                Filter by active findings. Choose a value or leave "not set" to omit this parameter from the request.
                            </div>
                            <select 
                                id="active" 
                                class="form-select"
                            >
                                <option value="">not set</option>
                                <option value="true" ${settings.active === 'true' ? 'selected' : ''}>true</option>
                                <option value="false" ${settings.active === 'false' ? 'selected' : ''}>false</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label" for="duplicate">
                                Duplicate (duplicates)
                            </label>
                            <div class="form-description">
                                Filter by duplicates. Choose a value or leave "not set" to omit this parameter from the request.
                            </div>
                            <select 
                                id="duplicate" 
                                class="form-select"
                            >
                                <option value="">not set</option>
                                <option value="true" ${settings.duplicate === 'true' ? 'selected' : ''}>true</option>
                                <option value="false" ${settings.duplicate === 'false' ? 'selected' : ''}>false</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label" for="verified">
                                Verified (verified findings)
                            </label>
                            <div class="form-description">
                                Filter by verified findings. Choose a value or leave "not set" to omit this parameter from the request.
                            </div>
                            <select 
                                id="verified" 
                                class="form-select"
                            >
                                <option value="">not set</option>
                                <option value="true" ${settings.verified === 'true' ? 'selected' : ''}>true</option>
                                <option value="false" ${settings.verified === 'false' ? 'selected' : ''}>false</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label" for="limit">
                                Limit (max records)
                            </label>
                            <div class="form-description">
                                Maximum number of findings to fetch. Choose a value or leave "not set" to omit this parameter from the request.
                            </div>
                            <select 
                                id="limit" 
                                class="form-select"
                                onchange="handleLimitChange()"
                            >
                                <option value="">not set</option>
                                <option value="100" ${settings.limit === '100' ? 'selected' : ''}>100</option>
                                <option value="500" ${settings.limit === '500' ? 'selected' : ''}>500</option>
                                <option value="1000" ${settings.limit === '1000' ? 'selected' : ''}>1000</option>
                                <option value="5000" ${settings.limit === '5000' ? 'selected' : ''}>5000</option>
                                <option value="99999" ${settings.limit === '99999' ? 'selected' : ''}>99999</option>
                                <option value="__custom__">Other (custom value)</option>
                            </select>
                            <div id="customLimitGroup" class="custom-input-group">
                                <input 
                                    type="text" 
                                    id="customLimit" 
                                    class="form-input" 
                                    placeholder="Enter a custom limit"
                                    value="${settings.limit && !['100', '500', '1000', '5000', '99999'].includes(settings.limit) ? escapeHtml(settings.limit) : ''}"
                                />
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label" for="autoSearchDependencies">
                                Automatic dependency search
                            </label>
                            <div class="form-description">
                                Enable automatic dependency search for "Dependency Track Finding Packaging Format (FPF) Export" findings. If disabled, standard file-opening behavior is used.
                            </div>
                            <select 
                                id="autoSearchDependencies" 
                                class="form-select"
                            >
                                <option value="true" ${settings.autoSearchDependencies === 'true' || settings.autoSearchDependencies === '' ? 'selected' : ''}>Enabled</option>
                                <option value="false" ${settings.autoSearchDependencies === 'false' ? 'selected' : ''}>Disabled</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label" for="aggregateDependencyTrack">
                                Dependency Track aggregation
                            </label>
                            <div class="form-description">
                                Aggregate Dependency Track findings by the Location field. Findings with the same Location are merged. When triage data is submitted, it applies to all merged findings equally.
                            </div>
                            <select 
                                id="aggregateDependencyTrack" 
                                class="form-select"
                            >
                                <option value="true" ${settings.aggregateDependencyTrack === 'true' || settings.aggregateDependencyTrack === '' ? 'selected' : ''}>Enabled</option>
                                <option value="false" ${settings.aggregateDependencyTrack === 'false' ? 'selected' : ''}>Disabled</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label" for="dependencySearchDepth">
                                Dependency search depth
                            </label>
                            <div class="form-description">
                                Maximum directory depth for dependency search in the project. Default: 15.
                            </div>
                            <input 
                                type="number" 
                                id="dependencySearchDepth" 
                                class="form-input"
                                min="1"
                                max="100"
                                value="${settings.dependencySearchDepth !== undefined ? settings.dependencySearchDepth : 15}"
                            />
                        </div>
                    </div>
                </div>
            </div>
            
            <script>
                const vscode = acquireVsCodeApi();
                
                function switchSection(sectionId) {
                    // Update navigation
                    document.querySelectorAll('.nav-item').forEach(item => {
                        item.classList.remove('active');
                    });
                    const navItem = document.querySelector('[data-section="' + sectionId + '"]');
                    if (navItem) {
                        navItem.classList.add('active');
                    }
                    
                    // Update visible content
                    document.querySelectorAll('.content-section').forEach(section => {
                        section.classList.remove('active');
                    });
                    const contentSection = document.getElementById(sectionId + '-section');
                    if (contentSection) {
                        contentSection.classList.add('active');
                    }
                }
                
                const form = document.getElementById('settings-form');
                const statusMessage = document.getElementById('status-message');
                
                function showMessage(message, isSuccess) {
                    statusMessage.textContent = message;
                    statusMessage.className = 'status-message ' + (isSuccess ? 'success' : 'error') + ' show';
                    setTimeout(() => {
                        statusMessage.className = 'status-message';
                    }, 5000);
                }
                
                function handleTestTypeChange() {
                    const select = document.getElementById('testType');
                    const customGroup = document.getElementById('customTestTypeGroup');
                    const customInput = document.getElementById('customTestType');
                    
                    if (select && select.value === '__custom__') {
                        if (customGroup) {
                            customGroup.classList.add('show');
                        }
                        if (customInput) {
                            customInput.required = true;
                            customInput.focus();
                        }
                    } else {
                        if (customGroup) {
                            customGroup.classList.remove('show');
                        }
                        if (customInput) {
                            customInput.required = false;
                            customInput.value = '';
                        }
                    }
                }
                
                function getTestTypeValue() {
                    const select = document.getElementById('testType');
                    if (!select) return '';
                    
                    if (select.value === '__custom__') {
                        const customInput = document.getElementById('customTestType');
                        return customInput ? customInput.value.trim() : '';
                    }
                    return select.value.trim();
                }
                
                function handleLimitChange() {
                    const select = document.getElementById('limit');
                    const customGroup = document.getElementById('customLimitGroup');
                    const customInput = document.getElementById('customLimit');
                    
                    if (select && select.value === '__custom__') {
                        if (customGroup) {
                            customGroup.classList.add('show');
                        }
                        if (customInput) {
                            customInput.focus();
                        }
                    } else {
                        if (customGroup) {
                            customGroup.classList.remove('show');
                        }
                        if (customInput) {
                            customInput.value = '';
                        }
                    }
                }
                
                function getLimitValue() {
                    const select = document.getElementById('limit');
                    if (!select) return '';
                    
                    if (select.value === '__custom__') {
                        const customInput = document.getElementById('customLimit');
                        return customInput ? customInput.value.trim() : '';
                    }
                    return select.value.trim();
                }
                
                function saveAllSettings() {
                    const activeSelect = document.getElementById('active');
                    const duplicateSelect = document.getElementById('duplicate');
                    const verifiedSelect = document.getElementById('verified');
                    const autoSearchDependenciesSelect = document.getElementById('autoSearchDependencies');
                    const aggregateDependencyTrackSelect = document.getElementById('aggregateDependencyTrack');
                    const dependencySearchDepthInput = document.getElementById('dependencySearchDepth');
                    const urlInput = document.getElementById('url');
                    const apiTokenInput = document.getElementById('apiToken');
                    const productNameInput = document.getElementById('productName');
                    
                    const data = {
                        url: urlInput ? urlInput.value.trim() : '',
                        apiToken: apiTokenInput ? apiTokenInput.value.trim() : '',
                        productName: productNameInput ? productNameInput.value.trim() : '',
                        testType: getTestTypeValue(),
                        active: activeSelect ? activeSelect.value : '',
                        duplicate: duplicateSelect ? duplicateSelect.value : '',
                        verified: verifiedSelect ? verifiedSelect.value : '',
                        limit: getLimitValue(),
                        autoSearchDependencies: autoSearchDependenciesSelect ? autoSearchDependenciesSelect.value : 'true',
                        aggregateDependencyTrack: aggregateDependencyTrackSelect ? aggregateDependencyTrackSelect.value : 'true',
                        dependencySearchDepth: dependencySearchDepthInput ? parseInt(dependencySearchDepthInput.value, 10) : 15
                    };
                    
                    // Validation
                    if (!data.url || !data.apiToken || !data.productName || !data.testType) {
                        showMessage('Fill all required fields', false);
                        return;
                    }
                    
                    vscode.postMessage({
                        command: 'saveSettings',
                        data: data
                    });
                }
                
                // Initialize on load
                (function() {
                    // Initialize testType
                    const select = document.getElementById('testType');
                    const customInput = document.getElementById('customTestType');
                    const currentValue = '${escapeHtml(settings.testType)}';
                    
                    // List of predefined values
                    const predefinedValues = [
                        'Semgrep Scan (GitLab SAST Report)',
                        'GitLab SAST Report',
                        'Dependency Track Finding Packaging Format (FPF) Export',
                        'trivy',
                        'RChecksec Scan'
                    ];
                    
                    if (currentValue && !predefinedValues.includes(currentValue)) {
                        // If the value is not in the predefined list, treat it as custom
                        if (select) {
                            select.value = '__custom__';
                        }
                        if (customInput) {
                            customInput.value = currentValue;
                        }
                        handleTestTypeChange();
                    }
                    
                    // Initialize limit
                    const limitSelect = document.getElementById('limit');
                    const customLimitInput = document.getElementById('customLimit');
                    const currentLimitValue = '${escapeHtml(settings.limit || '')}';
                    
                    const predefinedLimitValues = ['100', '500', '1000', '5000', '99999'];
                    
                    if (currentLimitValue && !predefinedLimitValues.includes(currentLimitValue)) {
                        // If the value is not in the predefined list, treat it as custom
                        if (limitSelect) {
                            limitSelect.value = '__custom__';
                        }
                        if (customLimitInput) {
                            customLimitInput.value = currentLimitValue;
                        }
                        handleLimitChange();
                    }
                })();
                
                form.addEventListener('submit', (e) => {
                    e.preventDefault();
                    saveAllSettings();
                });
                
                function testConnection() {
                    const urlInput = document.getElementById('url');
                    const apiTokenInput = document.getElementById('apiToken');
                    
                    const data = {
                        url: urlInput ? urlInput.value.trim() : '',
                        apiToken: apiTokenInput ? apiTokenInput.value.trim() : ''
                    };
                    
                    if (!data.url || !data.apiToken) {
                        showMessage('Enter URL and API token to test the connection', false);
                        return;
                    }
                    
                    showMessage('Testing connection...', true);
                    
                    vscode.postMessage({
                        command: 'testConnection',
                        data: data
                    });
                }
                
                // Message handler from the extension
                window.addEventListener('message', event => {
                    const message = event.data;
                    
                    if (message.command === 'settingsSaved') {
                        if (message.success) {
                            showMessage('✓ Settings saved successfully!', true);
                        } else {
                            showMessage('✗ Failed to save settings: ' + (message.error || 'Unknown error'), false);
                        }
                    } else if (message.command === 'connectionTested') {
                        if (message.success) {
                            showMessage('✓ ' + (message.message || 'Connection successful!'), true);
                        } else {
                            showMessage('✗ Connection error: ' + (message.error || 'Unknown error'), false);
                        }
                    }
                });
            </script>
        </body>
        </html>`;
    }
}

// Class that manages the finding details WebView panel
export class FindingDetailsPanel {
    public static currentPanel: FindingDetailsPanel | undefined;
    public static readonly viewType = 'defectdojoFindingDetails';
    
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    public _currentFinding: Finding | undefined;
    public _dependencyLocations: DependencyLocation[] = [];
    public _fileExists: boolean = true;
    public _fileResolvedPath: string | undefined;
    
    public static createOrShow(extensionUri: vscode.Uri) {
        // Define the WebView column: open beside the active editor when possible, otherwise in the second column
        let column = vscode.ViewColumn.Two;
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            // If a file is open in the first column, open the WebView in the second
            if (activeEditor.viewColumn === vscode.ViewColumn.One) {
                column = vscode.ViewColumn.Two;
            } else {
                // Otherwise open beside the active editor
                column = activeEditor.viewColumn || vscode.ViewColumn.Two;
            }
        }
        
        // If the panel is already open, reveal it
        if (FindingDetailsPanel.currentPanel) {
            FindingDetailsPanel.currentPanel._panel.reveal(column);
            return FindingDetailsPanel.currentPanel;
        }
        
        // Otherwise, create a new panel
        const panel = vscode.window.createWebviewPanel(
            FindingDetailsPanel.viewType,
            'DefectDojo Finding',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri]
            }
        );
        
        FindingDetailsPanel.currentPanel = new FindingDetailsPanel(panel, extensionUri);
        return FindingDetailsPanel.currentPanel;
    }
    
    private constructor(panel: vscode.WebviewPanel, _extensionUri: vscode.Uri) {
        this._panel = panel;
        
        // Set the initial content
        this._update();
        
        // Listen for messages from the WebView
        this._panel.webview.onDidReceiveMessage(
            (message: WebViewMessage) => {
                switch (message.command) {
                    case WEBVIEW_COMMANDS.UPDATE_IMPACT:
                        if (this._currentFinding && message.value !== undefined) {
                            const finding = this._currentFinding;
                            // For aggregated findings update all original entries
                            if (finding._isAggregated && finding._aggregatedFindingIds) {
                                for (const id of finding._aggregatedFindingIds) {
                                    triageStore.updateImpact(id, message.value);
                                }
                            } else {
                                triageStore.updateImpact(finding.id, message.value);
                            }
                        }
                        break;
                    case WEBVIEW_COMMANDS.UPDATE_MITIGATION:
                        if (this._currentFinding && message.value !== undefined) {
                            const finding = this._currentFinding;
                            // For aggregated findings update all original entries
                            if (finding._isAggregated && finding._aggregatedFindingIds) {
                                for (const id of finding._aggregatedFindingIds) {
                                    triageStore.updateMitigation(id, message.value);
                                }
                            } else {
                                triageStore.updateMitigation(finding.id, message.value);
                            }
                        }
                        break;
                    case WEBVIEW_COMMANDS.UPDATE_STATUS:
                        if (this._currentFinding && message.value !== undefined) {
                            const finding = this._currentFinding;
                            // For aggregated findings update all original entries
                            if (finding._isAggregated && finding._aggregatedFindingIds) {
                                for (const id of finding._aggregatedFindingIds) {
                                    triageStore.updateStatus(id, message.value as TriageStatus);
                                }
                            } else {
                                triageStore.updateStatus(finding.id, message.value as TriageStatus);
                            }
                            this._update();
                        }
                        break;
                    case WEBVIEW_COMMANDS.SUBMIT_TRIAGE:
                        if (this._currentFinding) {
                            vscode.commands.executeCommand(COMMANDS.SUBMIT_TRIAGE, this._currentFinding);
                        }
                        break;
                    case WEBVIEW_COMMANDS.OPEN_FILE:
                        if (this._currentFinding) {
                            // Check file existence before opening
                            if (!this._fileExists) {
                                vscode.window.showWarningMessage(`File "${this._currentFinding.file_path}" was not found in the workspace`);
                                return;
                            }
                            vscode.commands.executeCommand(COMMANDS.OPEN_FINDING, this._currentFinding);
                        }
                        break;
                    case 'openDependencyFile':
                        if (message.filePath) {
                            vscode.commands.executeCommand(COMMANDS.OPEN_DEPENDENCY_FILE, message.filePath, message.lineNumber || 0);
                        }
                        break;
                    case WEBVIEW_COMMANDS.CHECK_STATUS:
                        if (this._currentFinding) {
                            const triage = triageStore.get(this._currentFinding.id);
                            this._panel.webview.postMessage({
                                command: WEBVIEW_COMMANDS.UPDATE_STATUS_BADGE,
                                submitted: triage?.submitted ?? false,
                                modified: triage?.modified ?? false,
                            });
                        }
                        break;
                }
            },
            null,
            this._disposables
        );
        
        // Clean up on close
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }
    
    public updateFinding(finding: Finding, fileExists: boolean = true, fileResolvedPath?: string) {
        this._currentFinding = finding;
        this._dependencyLocations = []; // Clear on update
        this._fileExists = fileExists;
        this._fileResolvedPath = fileResolvedPath;
        this._update();
    }
    
    public _update() {
        const webview = this._panel.webview;
        this._panel.webview.html = this._getHtmlForWebview(webview);
    }
    
    private _getHtmlForWebview(_webview: vscode.Webview): string {
        if (!this._currentFinding) {
            return `<!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>DefectDojo Finding</title>
            </head>
            <body>
                <div style="padding: 20px; text-align: center; color: var(--vscode-foreground);">
                    <p>Select a finding from the list on the left</p>
                </div>
            </body>
            </html>`;
        }
        
        const finding = this._currentFinding;
        const triage = triageStore.get(finding.id) || {};
        const severityStyle = SEVERITY_COLORS[finding.severity] || UI_CONSTANTS.DEFAULT_SEVERITY_COLOR;
        
        // Get URL from configuration for DefectDojo links
        const config = vscode.workspace.getConfiguration('defectdojo-triage');
        const defectDojoUrl = config.get<string>('url', '');
        
        // For aggregated findings, create links to all original findings
        const findingIds = finding._isAggregated && finding._aggregatedFindingIds 
            ? finding._aggregatedFindingIds 
            : [finding.id];
        const defectDojoLinks = defectDojoUrl 
            ? findingIds.map(id => ({
                id,
                url: `${defectDojoUrl}/finding/${id}`
            }))
            : [];
        
        const testType = config.get<string>('testType', '');
        const isDependencyTrack = testType === 'Dependency Track Finding Packaging Format (FPF) Export';
        const componentInfo = isDependencyTrack ? extractComponentInfo(finding) : null;
        
        return `<!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>DefectDojo Finding #${finding.id}</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                    padding: 20px;
                    margin: 0;
                }
                .header {
                    border-bottom: 2px solid var(--vscode-panel-border);
                    padding-bottom: 15px;
                    margin-bottom: 20px;
                }
                .severity-badge {
                    display: inline-block;
                    padding: 4px 12px;
                    border-radius: 4px;
                    font-weight: bold;
                    font-size: 14px;
                    margin-right: 10px;
                }
                .title {
                    font-size: 20px;
                    font-weight: bold;
                    margin: 10px 0;
                }
                .section {
                    margin: 25px 0;
                    padding: 15px;
                    background-color: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                }
                .section-title {
                    font-size: 16px;
                    font-weight: bold;
                    margin-bottom: 15px;
                    color: var(--vscode-textLink-foreground);
                }
                .info-row {
                    margin: 10px 0;
                    padding: 8px 0;
                    border-bottom: 1px solid var(--vscode-panel-border);
                }
                .info-label {
                    font-weight: bold;
                    color: var(--vscode-descriptionForeground);
                    margin-bottom: 5px;
                }
                .info-value {
                    color: var(--vscode-foreground);
                    word-break: break-word;
                }
                .description {
                    line-height: 1.6;
                    white-space: pre-wrap;
                    word-wrap: break-word;
                }
                textarea, select {
                    width: 100%;
                    padding: 8px;
                    margin-top: 5px;
                    border: 1px solid var(--vscode-input-border);
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border-radius: 4px;
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    box-sizing: border-box;
                }
                textarea {
                    min-height: 100px;
                    resize: vertical;
                }
                button {
                    padding: 10px 20px;
                    margin: 10px 5px 0 0;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-weight: bold;
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                }
                button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                .submit-btn {
                    background-color: #0e639c;
                }
                .submit-btn:hover {
                    background-color: #1177bb;
                }
                .file-link {
                    color: var(--vscode-textLink-foreground);
                    cursor: pointer;
                    text-decoration: underline;
                }
                .file-link:hover {
                    color: var(--vscode-textLink-activeForeground);
                }
                .status-badge {
                    display: inline-block;
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 12px;
                    margin-left: 10px;
                }
                .submitted {
                    background-color: #4caf50;
                    color: white;
                }
                .not-submitted {
                    background-color: #ff9800;
                    color: white;
                }
                .modified {
                    background-color: #ff9800;
                    color: white;
                }
                button:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                .error-message {
                    color: var(--vscode-errorForeground);
                    font-size: 12px;
                    margin-top: 5px;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <span class="severity-badge" style="background-color: ${severityStyle.bg}; color: ${severityStyle.text};">
                    ${finding.severity}
                </span>
                <span class="title">${escapeHtml(finding.title || 'Untitled')}</span>
                ${triage.submitted && !triage.modified ? '<span class="status-badge submitted" id="status-badge">✓ Submitted</span>' : 
                  triage.submitted && triage.modified ? '<span class="status-badge modified" id="status-badge">✏️ Modified</span>' : 
                  '<span class="status-badge not-submitted" id="status-badge">⏳ Not submitted</span>'}
            </div>
            
            <div class="section">
                <div class="section-title">Finding info</div>
                <div class="info-row">
                    <div class="info-label">ID</div>
                    <div class="info-value">${finding.id}</div>
                </div>
                ${finding.cwe ? `
                <div class="info-row">
                    <div class="info-label">CWE</div>
                    <div class="info-value">CWE-${finding.cwe}</div>
                </div>
                ` : ''}
                ${!isDependencyTrack && finding.file_path ? `
                <div class="info-row">
                    <div class="info-label">File</div>
                    <div class="info-value">
                        ${this._fileExists ? `
                            <span class="file-link" onclick="openFile()">${escapeHtml(finding.file_path)}${finding.line ? `:${finding.line}` : ''}</span>
                        ` : `
                            <div style="color: var(--vscode-errorForeground);">
                                <span style="font-weight: bold;">⚠️ File not found:</span> ${escapeHtml(finding.file_path)}${finding.line ? `:${finding.line}` : ''}
                            </div>
                            <div style="font-size: 12px; color: var(--vscode-descriptionForeground); margin-top: 5px;">
                                The file does not exist in the workspace. The path may be wrong or the file was removed.
                            </div>
                        `}
                    </div>
                </div>
                ` : ''}
                ${isDependencyTrack && componentInfo ? `
                <div class="info-row">
                    <div class="info-label">Component</div>
                    <div class="info-value">
                        ${escapeHtml(componentInfo.name)}
                        ${componentInfo.version ? `<span style="color: var(--vscode-descriptionForeground); margin-left: 8px;">version: ${escapeHtml(componentInfo.version)}</span>` : ''}
                    </div>
                </div>
                ` : ''}
                ${finding.url ? `
                <div class="info-row">
                    <div class="info-label">URL</div>
                    <div class="info-value">${escapeHtml(finding.url)}</div>
                </div>
                ` : ''}
                <div class="info-row">
                    <div class="info-label">Status</div>
                    <div class="info-value" style="display: flex; flex-direction: column; gap: 5px;">
                        <div>Active: ${finding.active ? '<span style="color: #4caf50;">✅ Yes</span>' : '<span style="color: #f44336;">❌ No</span>'}</div>
                        <div>Verified: ${finding.verified ? '<span style="color: #4caf50;">✅ Yes</span>' : '<span style="color: #f44336;">❌ No</span>'}</div>
                        <div>Duplicate: ${finding.duplicate ? '<span style="color: #f44336;">❌ Yes</span>' : '<span style="color: #4caf50;">✅ No</span>'}</div>
                    </div>
                </div>
                ${defectDojoLinks.length > 0 ? `
                <div class="info-row">
                    <div class="info-label">Link${defectDojoLinks.length > 1 ? 's' : ''} to DefectDojo</div>
                    <div class="info-value" style="display: flex; flex-direction: column; gap: 5px;">
                        ${defectDojoLinks.map(link => `
                            <a href="${escapeHtml(link.url)}" target="_blank" class="file-link">
                                ${escapeHtml(link.url)}${defectDojoLinks.length > 1 ? ` (ID: ${link.id})` : ''}
                            </a>
                        `).join('')}
                    </div>
                </div>
                ` : ''}
            </div>
            
            <div class="section">
                <div class="section-title">Description</div>
                <div class="description">${escapeHtml(finding.description || 'No description provided')}</div>
            </div>
            
            ${finding._isAggregated && finding._originalFindings ? `
            <div class="section">
                <div class="section-title">Aggregated finding</div>
                <div class="info-value" style="display: flex; flex-direction: column; gap: 10px;">
                    <div style="padding: 10px; background-color: var(--vscode-editor-inactiveSelectionBackground); border-radius: 4px;">
                        <div style="font-weight: bold; margin-bottom: 10px; color: var(--vscode-textLink-foreground);">
                            This finding combines ${finding._originalFindings.length} findings with the same Location
                        </div>
                        <div style="font-size: 13px; margin-top: 10px;">
                            <strong>Included findings:</strong>
                            <ul style="margin: 10px 0; padding-left: 20px;">
                                ${finding._originalFindings.map((f) => {
                                    const componentInfo = extractComponentInfo(f);
                                    const componentName: string = componentInfo?.name || (typeof f.component_name === 'string' ? f.component_name : 'Unknown component');
                                    const componentVersion: string = componentInfo?.version || (typeof f.component_version === 'string' ? f.component_version : '');
                                    const versionText = componentVersion ? ` (${componentVersion})` : '';
                                    const severity = f.severity || 'Unknown';
                                    const title = f.title || `Finding #${f.id}`;
                                    return `<li>ID ${f.id}: ${escapeHtml(title)} - ${escapeHtml(componentName)}${escapeHtml(versionText)} (${severity})</li>`;
                                }).join('')}
                            </ul>
                        </div>
                        <div style="font-size: 12px; color: var(--vscode-descriptionForeground); margin-top: 10px;">
                            <strong>Note:</strong> When triage data is filled out and submitted, it will be applied to all ${finding._originalFindings.length} findings equally.
                        </div>
                    </div>
                </div>
            </div>
            ` : ''}
            
            ${isDependencyTrack && this._dependencyLocations.length > 0 ? `
            <div class="section">
                <div class="section-title">Dependency location</div>
                <div class="info-value" style="display: flex; flex-direction: column; gap: 10px;">
                                ${this._dependencyLocations.map((loc) => {
                        const safeFilePath = escapeHtml(loc.filePath).replace(/'/g, "\\'");
                        const safeRelativePath = escapeHtml(loc.relativePath);
                        const safeContent = loc.content ? escapeHtml(loc.content) : '';
                        return `
                        <div style="padding: 10px; background-color: var(--vscode-editor-inactiveSelectionBackground); border-radius: 4px;">
                            <div style="font-weight: bold; margin-bottom: 5px;">
                                <span class="file-link" onclick="openDependencyFile('${safeFilePath}', ${loc.lineNumber || 0})">
                                    ${safeRelativePath}
                                    ${loc.lineNumber ? `:${loc.lineNumber}` : ''}
                                </span>
                            </div>
                            ${safeContent ? `<div style="font-size: 12px; color: var(--vscode-descriptionForeground); font-family: monospace; margin-top: 5px;">${safeContent}</div>` : ''}
                        </div>
                    `;
                    }).join('')}
                </div>
            </div>
            ` : isDependencyTrack ? `
            <div class="section">
                <div class="section-title">Dependency location</div>
                <div class="info-value" style="color: var(--vscode-descriptionForeground);">
                    Searching for dependencies in the project...
                </div>
            </div>
            ` : ''}
            
            <div class="section">
                <div class="section-title">Triage data</div>
                
                <div class="info-row">
                    <div class="info-label">Impact (vulnerability impact) <span style="color: var(--vscode-errorForeground);">*</span></div>
                    <textarea id="impact" placeholder="Describe the impact on the system..." required>${escapeHtml(triage.impact || '')}</textarea>
                    <div class="error-message" id="impact-error" style="display: none;">This field is required</div>
                </div>
                
                <div class="info-row">
                    <div class="info-label">Mitigation (remediation steps) <span style="color: var(--vscode-errorForeground);">*</span></div>
                    <textarea id="mitigation" placeholder="Describe remediation or risk reduction steps..." required>${escapeHtml(triage.mitigation || '')}</textarea>
                    <div class="error-message" id="mitigation-error" style="display: none;">This field is required</div>
                </div>
                
                <div class="info-row">
                    <div class="info-label">Status <span style="color: var(--vscode-errorForeground);">*</span></div>
                    <select id="status" required>
                        ${TRIAGE_STATUS_OPTIONS.map(option => 
                            `<option value="${option.value}" ${triage.status === option.value ? 'selected' : ''}>${option.label}</option>`
                        ).join('')}
                    </select>
                    <div class="error-message" id="status-error" style="display: none;">This field is required</div>
                </div>
                
                ${triage.submitted && triage.submittedAt ? `
                <div class="info-row">
                    <div class="info-label">Submitted</div>
                    <div class="info-value">${new Date(triage.submittedAt).toLocaleString('en-US')}</div>
                </div>
                ` : ''}
                
                <button class="submit-btn" id="submit-btn" onclick="submitTriage()" disabled>Submit triage data</button>
            </div>
            
            <script>
                const vscode = acquireVsCodeApi();
                
                // Debounce helper to reduce message frequency
                function debounce(func, wait) {
                    let timeout;
                    return function executedFunction(...args) {
                        const later = () => {
                            clearTimeout(timeout);
                            func(...args);
                        };
                        clearTimeout(timeout);
                        timeout = setTimeout(later, wait);
                    };
                }
                
                // Validate fields
                function validateFields() {
                    const impactField = document.getElementById('impact');
                    const mitigationField = document.getElementById('mitigation');
                    const statusField = document.getElementById('status');
                    const submitBtn = document.getElementById('submit-btn');
                    
                    const impactValue = impactField ? impactField.value.trim() : '';
                    const mitigationValue = mitigationField ? mitigationField.value.trim() : '';
                    const statusValue = statusField ? statusField.value : '';
                    
                    const isValid = impactValue !== '' && mitigationValue !== '' && statusValue !== '';
                    
                    // Update button state
                    if (submitBtn) {
                        submitBtn.disabled = !isValid;
                    }
                    
                    // Show/hide error messages
                    const impactError = document.getElementById('impact-error');
                    const mitigationError = document.getElementById('mitigation-error');
                    const statusError = document.getElementById('status-error');
                    
                    if (impactError) {
                        impactError.style.display = impactValue === '' ? 'block' : 'none';
                    }
                    if (mitigationError) {
                        mitigationError.style.display = mitigationValue === '' ? 'block' : 'none';
                    }
                    if (statusError) {
                        statusError.style.display = statusValue === '' ? 'block' : 'none';
                    }
                    
                    return isValid;
                }
                
                // Debounced update functions
                const updateImpactDebounced = debounce((value) => {
                    vscode.postMessage({
                        command: 'updateImpact',
                        value: value
                    });
                    validateFields();
                    // Update the status badge after changes
                    checkAndUpdateStatus();
                }, ${UI_CONSTANTS.DEBOUNCE_DELAY});
                
                const updateMitigationDebounced = debounce((value) => {
                    vscode.postMessage({
                        command: 'updateMitigation',
                        value: value
                    });
                    validateFields();
                    // Update the status badge after changes
                    checkAndUpdateStatus();
                }, ${UI_CONSTANTS.DEBOUNCE_DELAY});
                
                // Check and update submission status
                function checkAndUpdateStatus() {
                    // Ask the extension to verify status
                    vscode.postMessage({
                        command: 'checkStatus'
                    });
                }
                
                // Initialize handlers after DOM is ready
                const impactField = document.getElementById('impact');
                const mitigationField = document.getElementById('mitigation');
                
                if (impactField) {
                    impactField.addEventListener('input', (e) => {
                        updateImpactDebounced(e.target.value);
                    });
                }
                
                if (mitigationField) {
                    mitigationField.addEventListener('input', (e) => {
                        updateMitigationDebounced(e.target.value);
                    });
                }
                
                const statusField = document.getElementById('status');
                if (statusField) {
                    statusField.addEventListener('change', (e) => {
                        vscode.postMessage({
                            command: 'updateStatus',
                            value: e.target.value
                        });
                        validateFields();
                        // Update the status badge after changes
                        checkAndUpdateStatus();
                    });
                }
                
                // Update the status badge text and styles
                function updateStatusBadge(submitted, modified) {
                    const statusBadge = document.getElementById('status-badge');
                    if (statusBadge) {
                        if (submitted && !modified) {
                            statusBadge.textContent = '✓ Submitted';
                            statusBadge.className = 'status-badge submitted';
                        } else if (submitted && modified) {
                            statusBadge.textContent = '✏️ Modified';
                            statusBadge.className = 'status-badge modified';
                        } else {
                            statusBadge.textContent = '⏳ Not submitted';
                            statusBadge.className = 'status-badge not-submitted';
                        }
                    }
                }
                
                // Handle messages from the extension
                // In VS Code WebViews, extension messages arrive via window.addEventListener
                window.addEventListener('message', event => {
                    const message = event.data;
                    if (message.command === 'updateStatusBadge') {
                        updateStatusBadge(message.submitted, message.modified);
                    }
                });
                
                function submitTriage() {
                    // Validate before submitting
                    if (!validateFields()) {
                        vscode.postMessage({
                            command: 'showError',
                            message: 'Fill all required fields'
                        });
                        return;
                    }
                    
                    // Send the latest values before submitting
                    const impactEl = document.getElementById('impact');
                    const mitigationEl = document.getElementById('mitigation');
                    const statusEl = document.getElementById('status');
                    
                    if (impactEl) {
                        vscode.postMessage({
                            command: 'updateImpact',
                            value: impactEl.value.trim()
                        });
                    }
                    if (mitigationEl) {
                        vscode.postMessage({
                            command: 'updateMitigation',
                            value: mitigationEl.value.trim()
                        });
                    }
                    if (statusEl) {
                        vscode.postMessage({
                            command: 'updateStatus',
                            value: statusEl.value
                        });
                    }
                    
                    vscode.postMessage({
                        command: 'submitTriage'
                    });
                }
                
                function openFile() {
                    vscode.postMessage({
                        command: 'openFile'
                    });
                }
                
                function openDependencyFile(filePath, lineNumber) {
                    vscode.postMessage({
                        command: 'openDependencyFile',
                        filePath: filePath,
                        lineNumber: lineNumber
                    });
                }
                
                // Validate fields on load
                validateFields();
            </script>
        </body>
        </html>`;
    }
    
    
    public dispose() {
        FindingDetailsPanel.currentPanel = undefined;
        
        this._panel.dispose();
        
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
}


export function activate(context: vscode.ExtensionContext) {
    console.log('DefectDojo Triage: Activating extension...');
    
    const outputChannel = vscode.window.createOutputChannel('DefectDojo Triage');
    
    // Extension URI for WebViews
    const extensionUri = context.extensionUri;
    
    // Create the TreeView to display findings
    const findingsProvider = new FindingsProvider();
    const treeView = vscode.window.createTreeView('defectdojoFindings', {
        treeDataProvider: findingsProvider,
        showCollapseAll: true,
        canSelectMany: false
    });
    
    // Handle finding selection - open WebView with details and file
    treeView.onDidChangeSelection(async (e: vscode.TreeViewSelectionChangeEvent<FindingTreeItem>) => {
        if (e.selection && e.selection.length > 0) {
            const item = e.selection[0];
            await handleFindingSelection(item, extensionUri);
        }
    });

    // Register all commands
    const commandDisposables = registerAllCommands(
        context,
        findingsProvider,
        treeView,
        outputChannel
    );

    console.log(`DefectDojo Triage: Registered ${commandDisposables.length} commands`);

    context.subscriptions.push(
        ...commandDisposables,
        outputChannel,
        treeView
    );
    
    console.log('DefectDojo Triage: Extension activated successfully');
}

// The displayFindings function was moved to utils/output.ts
// The displayFindings function was moved to utils/output.ts

export function deactivate() {}
