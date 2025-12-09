/**
 * Model for a finding tree item
 */

import * as vscode from 'vscode';
import type { Finding, TriageData } from '../types';
import { triageStore } from '../triageStore';
import {
    SEVERITY_EMOJI,
    UI_CONSTANTS,
} from '../constants';
import { truncateText } from '../utils';

export class FindingTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly finding?: Finding,
        public readonly isDetail?: boolean,
        public readonly detailLabel?: string,
        public readonly detailType?: string,
        public readonly triageData?: TriageData
    ) {
        super(label, collapsibleState);
        
        if (finding && !isDetail) {
            // Primary finding item
            const triage = triageStore.get(finding.id);
            let statusText = '';
            if (triage?.submitted && triage?.modified) {
                statusText = ' ✏️ Modified';
            } else if (triage?.submitted) {
                statusText = ' ✓ Submitted';
            }
            
            // Build description including triage status
            const severityEmoji = SEVERITY_EMOJI[finding.severity] || UI_CONSTANTS.DEFAULT_SEVERITY_EMOJI;
            
            this.description = `${severityEmoji} ${finding.severity}${statusText}`;
            
            // Tooltip with detailed information
            let tooltipText = `ID: ${finding.id}\n`;
            tooltipText += `Title: ${finding.title || 'N/A'}\n`;
            tooltipText += `Severity: ${finding.severity || 'N/A'}\n`;
            if (finding.file_path) {
                tooltipText += `File: ${finding.file_path}`;
                if (finding.line) {
                    tooltipText += `:${finding.line}`;
                }
                tooltipText += '\n';
            }
            if (finding.description) {
                const shortDesc = truncateText(finding.description, UI_CONSTANTS.DESCRIPTION_PREVIEW_LENGTH);
                tooltipText += `Description: ${shortDesc}`;
            }
            if (triage?.submitted && triage?.modified) {
                tooltipText += `\n\n✏️ Triage data modified after submission`;
            } else if (triage?.submitted) {
                tooltipText += `\n\n✓ Triage data submitted`;
            }
            this.tooltip = tooltipText;
            
            this.contextValue = triage?.submitted ? 'findingSubmitted' : 'finding';
            
            // Remove icon for the primary item (expander indicators stay for collapsible nodes)
            // Use resourceUri to hide the default icon
            this.resourceUri = undefined;
            this.iconPath = undefined;
        } else if (isDetail) {
            // Detail information
            this.tooltip = detailLabel || label;
            this.contextValue = detailType || 'findingDetail';
            
            // Remove all icons for details (no cross/placeholder icons)
            this.iconPath = undefined;
            this.resourceUri = undefined;
        }
    }
}
