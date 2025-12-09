/**
 * Data provider for the findings TreeView
 */

import * as vscode from 'vscode';
import type { Finding } from '../types';
import { FindingTreeItem } from '../models/findingTreeItem';
import {
    SEVERITY_EMOJI,
    UI_CONSTANTS,
} from '../constants';
import { truncateText } from '../utils';

export class FindingsProvider implements vscode.TreeDataProvider<FindingTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<FindingTreeItem | undefined | null | void> = new vscode.EventEmitter<FindingTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<FindingTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private findings: Finding[] = [];
    private searchQuery: string = '';

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    updateFindings(findings: Finding[]): void {
        this.findings = findings;
        this.refresh();
    }

    setSearchQuery(query: string): void {
        this.searchQuery = query;
        this.refresh();
    }

    clearSearch(): void {
        this.searchQuery = '';
        this.refresh();
    }

    getSearchQuery(): string {
        return this.searchQuery;
    }

    getFindings(): Finding[] {
        return this.findings;
    }

    private filterFindings(findings: Finding[]): Finding[] {
        if (!this.searchQuery || this.searchQuery.trim() === '') {
            return findings;
        }

        const query = this.searchQuery.toLowerCase().trim();
        return findings.filter(finding => {
            // Search by ID
            if (String(finding.id).includes(query)) {
                return true;
            }
            
            // Search by title
            if (finding.title && finding.title.toLowerCase().includes(query)) {
                return true;
            }
            
            // Search by description
            if (finding.description && finding.description.toLowerCase().includes(query)) {
                return true;
            }
            
            // Search by file
            if (finding.file_path && finding.file_path.toLowerCase().includes(query)) {
                return true;
            }
            
            // Search by severity
            if (finding.severity && finding.severity.toLowerCase().includes(query)) {
                return true;
            }
            
            // Search by CWE
            if (finding.cwe && String(finding.cwe).includes(query)) {
                return true;
            }
            
            // Search by URL
            if (finding.url && finding.url.toLowerCase().includes(query)) {
                return true;
            }
            
            return false;
        });
    }

    getTreeItem(element: FindingTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: FindingTreeItem): Thenable<FindingTreeItem[]> {
        if (!element) {
            // Root nodes are the list of findings
            const filteredFindings = this.filterFindings(this.findings);
            
            if (filteredFindings.length === 0) {
                // Return an empty array to display the welcome message
                return Promise.resolve([]);
            }
            
            return Promise.resolve(
                filteredFindings.map(finding => {
                    const prefix = SEVERITY_EMOJI[finding.severity] || UI_CONSTANTS.DEFAULT_SEVERITY_EMOJI;
                    const title = finding.title || 'Untitled';
                    const shortTitle = truncateText(title, UI_CONSTANTS.TITLE_MAX_LENGTH);
                    
                    const item = new FindingTreeItem(
                        `${prefix} ${shortTitle}`,
                        vscode.TreeItemCollapsibleState.None,
                        finding,
                        false
                    );
                    return item;
                })
            );
        } else if (element.finding) {
            // Do not show details in the tree anymore—they are displayed in the WebView
            return Promise.resolve([]);
        }
        
        return Promise.resolve([]);
    }
}
