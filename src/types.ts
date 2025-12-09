/**
 * Types and interfaces for the DefectDojo Triage extension
 */

export type TriageStatus = 'False positive' | 'Out Of Scope' | 'Verified' | 'Close';

export type Severity = 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';

export interface DefectDojoConfig {
    apiToken: string;
    url: string;
    productName: string;
    testType: string;
}

export interface Finding {
    id: number;
    title: string;
    description: string;
    severity: Severity;
    cwe: number | null;
    url: string;
    file_path: string;
    line: number | null;
    active: boolean;
    verified: boolean;
    duplicate: boolean;
    false_p: boolean;
    risk_accepted: boolean;
    test: number;
    test_type: number;
    // Fields for Dependency Track findings aggregation
    _aggregatedFindingIds?: number[];
    _isAggregated?: boolean;
    _originalFindings?: Finding[];
    [key: string]: unknown;
}

export interface TriageData {
    impact?: string;
    mitigation?: string;
    status?: TriageStatus;
    submitted?: boolean;
    submittedAt?: Date;
    modified?: boolean;
    originalImpact?: string;
    originalMitigation?: string;
    originalStatus?: TriageStatus;
}

export interface WebViewMessage {
    command: string;
    value?: string;
    message?: string;
    submitted?: boolean;
    modified?: boolean;
    data?: unknown;
    filePath?: string;
    lineNumber?: number;
}
