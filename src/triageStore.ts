/**
 * Triage data store
 */

import type { TriageData } from './types';
import { isTriageModified } from './utils';

class TriageStore {
    private readonly store = new Map<number, TriageData>();

    /**
     * Retrieves triage data for a finding
     */
    get(findingId: number): TriageData | undefined {
        return this.store.get(findingId);
    }

    /**
     * Saves triage data for a finding
     */
    set(findingId: number, data: TriageData): void {
        this.store.set(findingId, data);
    }

    /**
     * Updates the impact field
     */
    updateImpact(findingId: number, impact: string): void {
        const triage = this.get(findingId) || {};
        const newTriage: TriageData = {
            ...triage,
            impact,
        };
        
        if (triage.submitted && triage.originalImpact !== undefined) {
            newTriage.modified = isTriageModified(newTriage);
        }
        
        this.set(findingId, newTriage);
    }

    /**
     * Updates the mitigation field
     */
    updateMitigation(findingId: number, mitigation: string): void {
        const triage = this.get(findingId) || {};
        const newTriage: TriageData = {
            ...triage,
            mitigation,
        };
        
        if (triage.submitted && triage.originalMitigation !== undefined) {
            newTriage.modified = isTriageModified(newTriage);
        }
        
        this.set(findingId, newTriage);
    }

    /**
     * Updates the status field
     */
    updateStatus(findingId: number, status: TriageData['status']): void {
        const triage = this.get(findingId) || {};
        const newTriage: TriageData = {
            ...triage,
            status,
        };
        
        if (triage.submitted && triage.originalStatus !== undefined) {
            newTriage.modified = isTriageModified(newTriage);
        }
        
        this.set(findingId, newTriage);
    }

    /**
     * Marks triage data as submitted
     */
    markAsSubmitted(findingId: number): void {
        const triage = this.get(findingId);
        if (!triage) {
            return;
        }

        this.set(findingId, {
            ...triage,
            submitted: true,
            submittedAt: new Date(),
            modified: false,
            originalImpact: triage.impact,
            originalMitigation: triage.mitigation,
            originalStatus: triage.status,
        });
    }

    /**
     * Clears the store
     */
    clear(): void {
        this.store.clear();
    }
}

export const triageStore = new TriageStore();
