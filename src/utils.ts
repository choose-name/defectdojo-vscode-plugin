/**
 * Utilities for the DefectDojo Triage extension
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { TriageData, Finding } from './types';

// Re-export utilities from submodules
export { escapeHtml, truncateText } from './utils/text';
export { displayFindings } from './utils/output';

/**
 * Checks whether triage data changed after submission
 */
export function isTriageModified(triage: TriageData): boolean {
    if (!triage.submitted || !triage.originalImpact) {
        return false;
    }
    
    return (
        triage.impact !== triage.originalImpact ||
        triage.mitigation !== triage.originalMitigation ||
        triage.status !== triage.originalStatus
    );
}

/**
 * Validates triage data
 */
export function validateTriageData(triage: TriageData | undefined): {
    isValid: boolean;
    errors: string[];
} {
    const errors: string[] = [];
    
    if (!triage) {
        return { isValid: false, errors: ['Triage data not found'] };
    }
    
    if (!triage.impact || triage.impact.trim() === '') {
        errors.push('Impact is required');
    }
    
    if (!triage.mitigation || triage.mitigation.trim() === '') {
        errors.push('Mitigation is required');
    }
    
    if (!triage.status) {
        errors.push('Status is required');
    }
    
    return {
        isValid: errors.length === 0,
        errors,
    };
}

/**
 * Normalizes a file path
 */
export function normalizeFilePath(filePath: string): string {
    return filePath.trim().replace(/\\/g, '/');
}

/**
 * Checks whether a file exists in the workspace
 */
export async function checkFileExists(
    filePath: string,
    workspaceFolders: readonly vscode.WorkspaceFolder[]
): Promise<{ exists: boolean; fileUri?: vscode.Uri; resolvedPath?: string }> {
    if (!filePath || !workspaceFolders || workspaceFolders.length === 0) {
        return { exists: false };
    }

    let normalizedPath = normalizeFilePath(filePath);

    // If the path is absolute, check directly
    if (path.isAbsolute(normalizedPath)) {
        try {
            const fileUri = vscode.Uri.file(normalizedPath);
            await vscode.workspace.fs.stat(fileUri);
            return { exists: true, fileUri, resolvedPath: normalizedPath };
        } catch {
            return { exists: false };
        }
    }

    // If the path is relative, search workspace folders
    if (normalizedPath.startsWith('/')) {
        normalizedPath = normalizedPath.substring(1);
    }

    for (const folder of workspaceFolders) {
        const fullPath = path.join(folder.uri.fsPath, normalizedPath);
        try {
            const fileUri = vscode.Uri.file(fullPath);
            await vscode.workspace.fs.stat(fileUri);
            return { exists: true, fileUri, resolvedPath: fullPath };
        } catch {
            // Try the next workspace folder
        }
    }

    // If still not found, try building a URI from the first workspace folder
    try {
        const fileUri = vscode.Uri.joinPath(workspaceFolders[0].uri, normalizedPath);
        await vscode.workspace.fs.stat(fileUri);
        return { exists: true, fileUri, resolvedPath: fileUri.fsPath };
    } catch {
        return { exists: false };
    }
}

/**
 * Extracts a finding from various inputs
 */
export function extractFinding(
    item: unknown,
    treeViewSelection?: readonly unknown[]
): { finding: unknown } | null {
    // Check if the item is a FindingTreeItem with a finding
    if (item && typeof item === 'object' && 'finding' in item && item.finding) {
        return { finding: item.finding };
    }
    
    // Check if the item itself is a Finding
    if (item && typeof item === 'object' && 'id' in item) {
        return { finding: item };
    }
    
    // Try to get from the selection
    if (treeViewSelection && treeViewSelection.length > 0) {
        const firstItem = treeViewSelection[0];
        if (firstItem && typeof firstItem === 'object' && 'finding' in firstItem) {
            return { finding: (firstItem as { finding: unknown }).finding };
        }
    }
    
    return null;
}

/**
 * Result of extracting component information
 */
export interface ComponentInfo {
    name: string;
    version?: string;
}

/**
 * Extracts component/dependency name and version from a Dependency Track finding
 */
export function extractComponentInfo(finding: { 
    title?: string; 
    component_name?: string; 
    component_version?: string;
    [key: string]: unknown 
}): ComponentInfo | null {
    let componentName: string | null = null;
    let componentVersion: string | undefined = undefined;
    
    // First try component_name and component_version
    if (finding.component_name && typeof finding.component_name === 'string') {
        componentName = finding.component_name;
    }
    if (finding.component_version && typeof finding.component_version === 'string') {
        componentVersion = finding.component_version;
    }
    
    // If a name exists, return it (with version if present)
    if (componentName) {
        return { name: componentName, version: componentVersion };
    }
    
    // Otherwise try to extract from the title
    if (finding.title && typeof finding.title === 'string') {
        const title = finding.title;
        
        // Try to find patterns like "Component: name:version", "name:version", or just "name"
        // Version format examples: 1.2.3, 1.2.3.4, 1.2.3-beta, 1.2.3-SNAPSHOT, etc.
        const versionPattern = /([\d.]+(?:-[a-zA-Z0-9.-]+)?(?:-SNAPSHOT)?)/;
        const componentMatch = title.match(/(?:Component:\s*)?([^\s:]+)(?::([^\s]+))?/i);
        
        if (componentMatch && componentMatch[1]) {
            componentName = componentMatch[1];
            // Try extracting version from the second group or the title
            if (componentMatch[2]) {
                const versionMatch = componentMatch[2].match(versionPattern);
                if (versionMatch) {
                    componentVersion = versionMatch[1];
                }
            } else {
                // Search for a version in the title after the component name
                const versionInTitle = title.match(new RegExp(`${componentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s:]+${versionPattern.source}`));
                if (versionInTitle && versionInTitle[1]) {
                    componentVersion = versionInTitle[1];
                }
            }
            
            return { name: componentName, version: componentVersion };
        }
        
        // If no pattern found, return the whole title as the name
        return { name: title };
    }
    
    return null;
}

/**
 * Extracts a component/dependency name from a Dependency Track finding (for backward compatibility)
 */
export function extractComponentName(finding: { title?: string; component_name?: string; [key: string]: unknown }): string | null {
    const info = extractComponentInfo(finding as { title?: string; component_name?: string; component_version?: string; [key: string]: unknown });
    return info ? info.name : null;
}

/**
 * Result interface for dependency search
 */
export interface DependencyLocation {
    filePath: string;
    relativePath: string;
    lineNumber?: number;
    content?: string;
}

/**
 * Searches for a dependency across project files
 */
export async function findDependencyInProject(
    componentName: string,
    workspaceFolders: readonly vscode.WorkspaceFolder[],
    componentVersion?: string,
    maxDepth: number = 15
): Promise<DependencyLocation[]> {
    const results: DependencyLocation[] = [];
    
    // Files to search for dependencies
    const dependencyFiles = [
        'package.json',      // npm/yarn
        'package-lock.json', // npm
        'yarn.lock',         // yarn
        'requirements.txt',  // Python
        // 'requirements-dev.txt', // Python
        // 'Pipfile',          // Python
        // 'Pipfile.lock',     // Python
        'poetry.lock',      // Poetry
        'pyproject.toml',   // Poetry, uv
        'uv.lock',          // uv
        'pom.xml',          // Maven
        'build.gradle',     // Gradle
        // 'build.gradle.kts', // Gradle Kotlin
        // 'Gemfile',          // Ruby
        // 'Gemfile.lock',     // Ruby
        // 'composer.json',    // PHP
        // 'composer.lock',    // PHP
        'Cargo.toml',       // Rust
        'Cargo.lock',       // Rust
        'go.mod',           // Go
        'go.sum',           // Go
    ];
    
    // File extensions to search (including all .lock files)
    const dependencyFileExtensions = ['.lock'];
    
    // Escape special characters for regular expressions
    const escapedName = componentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedVersion = componentVersion ? componentVersion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : null;
    
    // Search within a single file
    const searchInFile = async (filePath: string, relativePath: string): Promise<void> => {
        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            const lines = content.split('\n');
            
            // Determine file type for specific patterns
            const fileName = path.basename(filePath).toLowerCase();
            const isLockFile = fileName.endsWith('.lock');
            const isYarnLock = fileName === 'yarn.lock';
            const isPoetryLock = fileName === 'poetry.lock';
            const isUvLock = fileName === 'uv.lock';
            const isPyProjectToml = fileName === 'pyproject.toml';
            const isPackageJson = fileName === 'package.json';
            const isRequirementsTxt = fileName === 'requirements.txt';
            
            // For lock files, use a more flexible search (multi-line context)
            if (isLockFile && (isYarnLock || isPoetryLock || isUvLock)) {
                // For yarn.lock, poetry.lock, uv.lock search within a block of lines
                let inPackageBlock = false;
                let packageLines: number[] = [];
                
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    
                    // Detect the start of a package block
                    if (isYarnLock) {
                        // yarn.lock: "package-name@version": or "package-name@^version":
                        if (line.match(new RegExp(`["']${escapedName}@`, 'i'))) {
                            inPackageBlock = true;
                            packageLines = [i];
                        }
                        // Block ends on an empty line or a new package (starts with a quote)
                        if (inPackageBlock && line.trim() === '' && packageLines.length > 0) {
                            // Save all lines from the block
                            for (const lineNum of packageLines) {
                                const blockLine = lines[lineNum];
                                const hasVersion = escapedVersion ? 
                                    blockLine.match(new RegExp(escapedVersion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')) : true;
                                if (!escapedVersion || hasVersion) {
                                    results.push({
                                        filePath,
                                        relativePath,
                                        lineNumber: lineNum + 1,
                                        content: blockLine.trim(),
                                    });
                                }
                            }
                            inPackageBlock = false;
                            packageLines = [];
                        } else if (inPackageBlock) {
                            packageLines.push(i);
                        }
                    } else if (isPoetryLock || isUvLock) {
                        // poetry.lock and uv.lock: [[package]] or [package.name] or name = "package-name"
                        if (line.match(new RegExp(`\\[\\[package\\]\\]|\\[package\\.`, 'i')) || 
                            line.match(new RegExp(`name\\s*=\\s*["']${escapedName}["']`, 'i'))) {
                            inPackageBlock = true;
                            packageLines = [i];
                        }
                        // Block ends on a new [[package]] or an empty line after the block
                        if (inPackageBlock && line.match(/^\[\[package\]\]|^\[package\./i) && !line.match(new RegExp(`name\\s*=\\s*["']${escapedName}["']`, 'i'))) {
                            // Save all lines from the previous block
                            for (const lineNum of packageLines) {
                                const blockLine = lines[lineNum];
                                const hasVersion = escapedVersion ? 
                                    blockLine.match(new RegExp(escapedVersion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')) : true;
                                if (!escapedVersion || hasVersion) {
                                    results.push({
                                        filePath,
                                        relativePath,
                                        lineNumber: lineNum + 1,
                                        content: blockLine.trim(),
                                    });
                                }
                            }
                            // Start a new block
                            if (line.match(new RegExp(`name\\s*=\\s*["']${escapedName}["']`, 'i'))) {
                                packageLines = [i];
                            } else {
                                inPackageBlock = false;
                                packageLines = [];
                            }
                        } else if (inPackageBlock) {
                            packageLines.push(i);
                        }
                    }
                }
                
                // Handle the last block if the file ends
                if (inPackageBlock && packageLines.length > 0) {
                    for (const lineNum of packageLines) {
                        const blockLine = lines[lineNum];
                        const hasVersion = escapedVersion ? 
                            blockLine.match(new RegExp(escapedVersion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')) : true;
                        if (!escapedVersion || hasVersion) {
                            results.push({
                                filePath,
                                relativePath,
                                lineNumber: lineNum + 1,
                                content: blockLine.trim(),
                            });
                        }
                    }
                }
                return; // Done for lock files
            }
            
            // For other files, search line by line
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                let found = false;
                
                // If a version is provided, search by name and version
                if (escapedVersion) {
                    // Patterns for searching with a version
                    const patternsWithVersion: RegExp[] = [];
                    
                    // npm/yarn package.json: "name": "version" or "name@version"
                    if (isPackageJson) {
                        patternsWithVersion.push(
                            new RegExp(`["']${escapedName}["']\\s*:\\s*["']${escapedVersion}["']`, 'i'),
                            new RegExp(`["']${escapedName}@${escapedVersion}["']`, 'i')
                        );
                    }
                    
                    // yarn.lock: name@version or "name@version":
                    if (isYarnLock) {
                        patternsWithVersion.push(
                            new RegExp(`${escapedName}@${escapedVersion}`, 'i'),
                            new RegExp(`["']${escapedName}@${escapedVersion}["']`, 'i')
                        );
                    }
                    
                    // requirements.txt: name==version, name>=version, name<=version, name~=version
                    if (isRequirementsTxt) {
                        patternsWithVersion.push(
                            new RegExp(`\\b${escapedName}\\s*==\\s*${escapedVersion}\\b`, 'i'),
                            new RegExp(`\\b${escapedName}\\s*[<>=~]+\\s*${escapedVersion}\\b`, 'i')
                        );
                    }
                    
                    // poetry.lock: [[package]] name = "version" or name = {version = "version"}
                    if (isPoetryLock) {
                        patternsWithVersion.push(
                            new RegExp(`name\\s*=\\s*["']${escapedName}["']`, 'i'),
                            new RegExp(`["']${escapedName}["']\\s*=\\s*["']${escapedVersion}["']`, 'i'),
                            new RegExp(`version\\s*=\\s*["']${escapedVersion}["']`, 'i')
                        );
                    }
                    
                    // uv.lock: name = { version = "version" } or name = "version"
                    if (isUvLock) {
                        patternsWithVersion.push(
                            new RegExp(`["']${escapedName}["']\\s*=\\s*\\{[^}]*version\\s*=\\s*["']${escapedVersion}["']`, 'i'),
                            new RegExp(`["']${escapedName}["']\\s*=\\s*["']${escapedVersion}["']`, 'i'),
                            new RegExp(`name\\s*=\\s*["']${escapedName}["']`, 'i')
                        );
                    }
                    
                    // pyproject.toml: [tool.poetry.dependencies] name = "version" or [project.dependencies] name = "version"
                    if (isPyProjectToml) {
                        patternsWithVersion.push(
                            new RegExp(`["']${escapedName}["']\\s*=\\s*["']${escapedVersion}["']`, 'i'),
                            new RegExp(`${escapedName}\\s*=\\s*["']${escapedVersion}["']`, 'i')
                        );
                    }
                    
                    // Common patterns for lock files
                    if (isLockFile) {
                        patternsWithVersion.push(
                            new RegExp(`${escapedName}@${escapedVersion}`, 'i'),
                            new RegExp(`["']${escapedName}["'].*?${escapedVersion}`, 'i'),
                            new RegExp(`${escapedName}.*?["']${escapedVersion}["']`, 'i')
                        );
                    }
                    
                    // Common patterns for all files
                    patternsWithVersion.push(
                        new RegExp(`["']${escapedName}["']\\s*:\\s*["']${escapedVersion}["']`, 'i'),
                        new RegExp(`["']${escapedName}@${escapedVersion}["']`, 'i'),
                        new RegExp(`\\b${escapedName}\\s*==\\s*${escapedVersion}\\b`, 'i'),
                        new RegExp(`\\b${escapedName}\\s*[<>=~]+\\s*${escapedVersion}\\b`, 'i'),
                        new RegExp(`${escapedName}\\s*=\\s*["']${escapedVersion}["']`, 'i'),
                        new RegExp(`\\b${escapedName}\\s+${escapedVersion}\\b`, 'i')
                    );
                    
                    for (const pattern of patternsWithVersion) {
                        if (pattern.test(line)) {
                            found = true;
                            break;
                        }
                    }
                }
                
                // If not found with a version or no version was provided, search by name only
                if (!found) {
                    const patterns: RegExp[] = [];
                    
                    // File-type specific patterns
                    if (isYarnLock) {
                        patterns.push(
                            new RegExp(`${escapedName}@`, 'i'),
                            new RegExp(`["']${escapedName}@`, 'i')
                        );
                    }
                    
                    if (isPoetryLock || isUvLock) {
                        patterns.push(
                            new RegExp(`name\\s*=\\s*["']${escapedName}["']`, 'i'),
                            new RegExp(`["']${escapedName}["']\\s*=`, 'i')
                        );
                    }
                    
                    if (isPyProjectToml) {
                        patterns.push(
                            new RegExp(`["']${escapedName}["']\\s*=`, 'i'),
                            new RegExp(`${escapedName}\\s*=`, 'i')
                        );
                    }
                    
                    if (isRequirementsTxt) {
                        patterns.push(
                            new RegExp(`\\b${escapedName}\\s*[<>=~=]`, 'i'),
                            new RegExp(`^\\s*${escapedName}\\s*[<>=~=]`, 'i')
                        );
                    }
                    
                    // Common patterns for all files
                    patterns.push(
                        new RegExp(`["']${escapedName}["']`, 'i'),
                        new RegExp(`["']${escapedName}@`, 'i'),
                        new RegExp(`\\b${escapedName}\\b`, 'i')
                    );
                    
                    for (const pattern of patterns) {
                        if (pattern.test(line)) {
                            found = true;
                            break;
                        }
                    }
                }
                
                if (found) {
                    results.push({
                        filePath,
                        relativePath,
                        lineNumber: i + 1,
                        content: line.trim(),
                    });
                }
            }
        } catch (error) {
            // Ignore file read errors
        }
    };
    
    // Recursively search files in the project
    const searchInDirectory = async (dirPath: string, relativePath: string, depth: number = 0): Promise<void> => {
        // Limit search depth
        if (depth > maxDepth) {
            return;
        }
        
        try {
            const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
            
            for (const entry of entries) {
                // Skip node_modules, .git, and other service directories
                if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'vendor') {
                    continue;
                }
                
                const fullPath = path.join(dirPath, entry.name);
                const entryRelativePath = path.join(relativePath, entry.name);
                
                if (entry.isFile()) {
                    // Check if the file is a dependency file
                    const isDependencyFile = dependencyFiles.includes(entry.name) ||
                        dependencyFileExtensions.some(ext => entry.name.endsWith(ext));
                    
                    if (isDependencyFile) {
                        await searchInFile(fullPath, entryRelativePath);
                    }
                } else if (entry.isDirectory()) {
                    await searchInDirectory(fullPath, entryRelativePath, depth + 1);
                }
            }
        } catch (error) {
            // Ignore directory access errors
        }
    };
    
    // Search across all workspace folders
    for (const folder of workspaceFolders) {
        await searchInDirectory(folder.uri.fsPath, '', 0);
    }
    
    return results;
}

/**
 * Aggregates Dependency Track findings by Location.
 * If multiple dependencies share the same Location, a single finding with the combined list is shown.
 */
export function aggregateDependencyTrackFindings(findings: Finding[]): Finding[] {
    // Group findings by Location
    const locationMap = new Map<string, Finding[]>();
    
    for (const finding of findings) {
        // Try to get Location from different fields
        // In Dependency Track, Location can be in file_path or in a dedicated Location field
        const location = finding.file_path || '';
        
        if (!locationMap.has(location)) {
            locationMap.set(location, []);
        }
        locationMap.get(location)!.push(finding);
    }
    
    // Build aggregated findings
    const aggregatedFindings: Finding[] = [];
    
    for (const [location, locationFindings] of locationMap.entries()) {
        if (locationFindings.length === 1) {
            // If only one finding has this Location, keep it as is
            aggregatedFindings.push(locationFindings[0]);
        } else {
            // If multiple findings share the same Location, aggregate them
            const firstFinding = locationFindings[0];
            
            // Build aggregated description with the list of findings
            const vulnerabilityList = locationFindings.map((f, index) => {
                const componentInfo = extractComponentInfo(f);
                const componentName = componentInfo?.name || f.component_name || 'Unknown component';
                const componentVersion = componentInfo?.version || f.component_version || '';
                const versionText = componentVersion ? ` version ${componentVersion}` : '';
                const severity = f.severity || 'Unknown';
                const title = f.title || `Finding #${f.id}`;
                
                return `${index + 1}. ${title} (${componentName}${versionText}, ${severity})`;
            }).join('\n');
            
            const aggregatedDescription = `Aggregated finding for Location: ${location}\n\n` +
                `Includes the following findings:\n${vulnerabilityList}\n\n` +
                `Total count: ${locationFindings.length}`;
            
            // Create aggregated finding
            const aggregatedFinding: Finding = {
                ...firstFinding,
                id: firstFinding.id, // Use the ID of the first finding
                description: aggregatedDescription,
                title: `[Aggregated] ${firstFinding.title || 'Finding'}`,
                // Store the list of all IDs in a dedicated field for tracking
                _aggregatedFindingIds: locationFindings.map(f => f.id),
                _isAggregated: true,
                _originalFindings: locationFindings,
            };
            
            aggregatedFindings.push(aggregatedFinding);
        }
    }
    
    return aggregatedFindings;
}
