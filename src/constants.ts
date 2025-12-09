/**
 * Constants for the DefectDojo Triage extension
 */

import type { Severity } from './types';

export const COMMANDS = {
    CONFIGURE: 'defectdojo-triage.configure',
    FETCH_FINDINGS: 'defectdojo-triage.fetchFindings',
    REFRESH: 'defectdojo-triage.refresh',
    SEARCH_FINDINGS: 'defectdojo-triage.searchFindings',
    OPEN_FINDING: 'defectdojo-triage.openFinding',
    OPEN_DEPENDENCY_FILE: 'defectdojo-triage.openDependencyFile',
    EDIT_IMPACT: 'defectdojo-triage.editImpact',
    EDIT_MITIGATION: 'defectdojo-triage.editMitigation',
    EDIT_STATUS: 'defectdojo-triage.editStatus',
    SUBMIT_TRIAGE: 'defectdojo-triage.submitTriage',
} as const;

export const WEBVIEW_COMMANDS = {
    UPDATE_IMPACT: 'updateImpact',
    UPDATE_MITIGATION: 'updateMitigation',
    UPDATE_STATUS: 'updateStatus',
    SUBMIT_TRIAGE: 'submitTriage',
    OPEN_FILE: 'openFile',
    CHECK_STATUS: 'checkStatus',
    SHOW_ERROR: 'showError',
    UPDATE_STATUS_BADGE: 'updateStatusBadge',
} as const;

export const SEVERITY_EMOJI: Record<Severity, string> = {
    Critical: '🔴',
    High: '🟠',
    Medium: '🟡',
    Low: '🟢',
    Info: '🔵',
} as const;

export const SEVERITY_PREFIX: Record<Severity, string> = {
    Critical: 'C',
    High: 'H',
    Medium: 'M',
    Low: 'L',
    Info: 'I',
} as const;

export const SEVERITY_COLORS: Record<Severity, { bg: string; text: string }> = {
    Critical: { bg: '#d32f2f', text: '#fff' },
    High: { bg: '#f57c00', text: '#fff' },
    Medium: { bg: '#fbc02d', text: '#000' },
    Low: { bg: '#388e3c', text: '#fff' },
    Info: { bg: '#1976d2', text: '#fff' },
} as const;

export const TRIAGE_STATUS_OPTIONS = [
    { value: '', label: 'Not specified' },
    { value: 'False positive', label: 'False positive' },
    { value: 'Out Of Scope', label: 'Out Of Scope' },
    { value: 'Verified', label: 'Verified' },
    { value: 'Close', label: 'Close' },
] as const;

export const UI_CONSTANTS = {
    TITLE_MAX_LENGTH: 50,
    DESCRIPTION_PREVIEW_LENGTH: 200,
    TOOLTIP_PREVIEW_LENGTH: 60,
    DEBOUNCE_DELAY: 300,
    DEFAULT_SEVERITY_EMOJI: '⚪',
    DEFAULT_SEVERITY_PREFIX: '?',
    DEFAULT_SEVERITY_COLOR: { bg: '#757575', text: '#fff' },
} as const;

export const MESSAGES = {
    NO_FINDING_SELECTED: 'No finding selected',
    NO_FILE_PATH: 'File path is not specified for this finding',
    NO_WORKSPACE: 'No workspace is open',
    FILE_OPEN_ERROR: 'Failed to open file',
    FILL_TRIAGE_DATA: 'Fill in triage data first',
    FILL_ALL_FIELDS: 'Fill all required fields (Impact, Mitigation, and Status) before submitting',
    CONFIGURE_CONNECTION: 'Configure the DefectDojo connection parameters',
    NOT_ALL_CONFIGURED: 'Not all parameters are configured. Configure now?',
    CONFIG_SAVED: 'DefectDojo settings saved',
    FINDINGS_FETCHED: (count: number) => `Fetched ${count} findings from DefectDojo`,
    TRIAGE_SUBMITTED: (id: number) => `✓ Triage data for finding #${id} sent successfully`,
} as const;
