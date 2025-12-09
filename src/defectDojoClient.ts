/**
 * Client for working with the DefectDojo API
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import type { Finding } from './types';

export class DefectDojoClient {
    private readonly axiosInstance: AxiosInstance;

    constructor(baseURL: string, apiToken: string) {
        const normalizedUrl = baseURL.endsWith('/') ? baseURL.slice(0, -1) : baseURL;
        
        this.axiosInstance = axios.create({
            baseURL: normalizedUrl,
            headers: {
                'Authorization': `Token ${apiToken}`,
                'Content-Type': 'application/json',
            },
        });
    }

    /**
     * Checks connectivity to the DefectDojo API
     */
    async testConnection(): Promise<void> {
        try {
            // Perform a simple API request to verify connectivity
            await this.axiosInstance.get('/api/v2/products/', {
                params: { limit: 1 }
            });
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const axiosError = error as AxiosError<{ detail?: string; message?: string }>;
                if (axiosError.response?.status === 401 || axiosError.response?.status === 403) {
                    throw new Error('Authentication error: verify the API token');
                } else if (axiosError.response?.status === 404) {
                    throw new Error('API endpoint not found. Verify the URL.');
                }
            }
            throw this.handleError(error, 'Error while testing connectivity');
        }
    }

    /**
     * Retrieves a product ID by name
     */
    async getProductId(productName: string): Promise<number | null> {
        try {
            const response = await this.axiosInstance.get('/api/v2/products/', {
                params: {
                    name: productName,
                    limit: 1,
                },
            });

            const results = response.data?.results;
            if (Array.isArray(results) && results.length > 0) {
                return results[0].id;
            }
            
            return null;
        } catch (error) {
            throw this.handleError(error, `Error fetching product ID: ${productName}`);
        }
    }

    /**
     * Retrieves a test type ID by name
     */
    async getTestTypeId(testTypeName: string): Promise<number | null> {
        try {
            const response = await this.axiosInstance.get('/api/v2/test_types/', {
                params: {
                    name: testTypeName,
                    limit: 1,
                },
            });

            const results = response.data?.results;
            if (Array.isArray(results) && results.length > 0) {
                return results[0].id;
            }
            
            return null;
        } catch (error) {
            throw this.handleError(error, `Error fetching scan type ID: ${testTypeName}`);
        }
    }

    /**
     * Retrieves the list of findings
     */
    async getFindings(
        productId: number,
        testTypeId: number,
        options?: {
            active?: string | boolean;
            duplicate?: string | boolean;
            verified?: string | boolean;
            limit?: string | number;
        }
    ): Promise<Finding[]> {
        try {
            const params: Record<string, string> = {
                'test__engagement__product': String(productId),
                'test__test_type': String(testTypeId),
            };

            // Add extra parameters if provided
            if (options?.active !== undefined) {
                params.active = String(options.active);
            }
            if (options?.duplicate !== undefined) {
                params.duplicate = String(options.duplicate);
            }
            if (options?.verified !== undefined) {
                params.verified = String(options.verified);
            }
            if (options?.limit !== undefined) {
                params.limit = String(options.limit);
            }

            const response = await this.axiosInstance.get<{ results?: Finding[] }>('/api/v2/findings/', {
                params,
            });
            
            return response.data?.results || [];
        } catch (error) {
            throw this.handleError(error, 'Error fetching findings list');
        }
    }

    /**
     * Updates triage data for a finding
     * @returns Object with Jira error info (if any), otherwise undefined
     */
    async updateFinding(
        findingId: number,
        data: {
            impact: string;
            mitigation: string;
            status: 'Verified' | 'False positive' | 'Out Of Scope' | 'Close';
        }
    ): Promise<{ jiraError?: string } | undefined> {
        try {
            // Build request payload based on status
            const updateData: Record<string, unknown> = {
                impact: data.impact,
                mitigation: data.mitigation,
            };

            // Map statuses according to DefectDojo expectations
            if (data.status === 'Verified') {
                updateData.verified = true;
                updateData.active = true;
                updateData.false_p = false;
                updateData.out_of_scope = false;
            } else if (data.status === 'False positive') {
                updateData.false_p = true;
                // updateData.verified = true;
                updateData.active = false;
                updateData.out_of_scope = false;
            } else if (data.status === 'Out Of Scope') {
                updateData.out_of_scope = true;
                // updateData.verified = true;
                updateData.active = false;
                updateData.false_p = false;
                updateData.push_to_jira = true;
            } else if (data.status === 'Close') {
                updateData.verified = false;
                updateData.active = false;
                updateData.false_p = false;
                updateData.out_of_scope = false;
            }

            await this.axiosInstance.patch(`/api/v2/findings/${findingId}/`, updateData);
            
            // TODO: This case is not functional because the API has no endpoint for sending data to Jira
            // // If status is Verified, send an extra request to push to Jira
            // if (data.status === 'Verified') {
            //     try {
            //         await this.axiosInstance.post(`/finding/${findingId}/jira/push`);
            //     } catch (jiraError) {
            //         // Do not interrupt execution; return info about the error instead
            //         const errorMessage = this.handleError(jiraError, `Error pushing to Jira for finding #${findingId}`).message;
            //         return { jiraError: errorMessage };
            //     }
            // }
            
            return undefined;
        } catch (error) {
            throw this.handleError(error, `Error updating finding #${findingId}`);
        }
    }

    /**
     * Handles API errors
     */
    private handleError(error: unknown, defaultMessage: string): Error {
        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError<{ detail?: string; message?: string }>;
            const message = axiosError.response?.data?.detail 
                || axiosError.response?.data?.message 
                || axiosError.message 
                || defaultMessage;
            return new Error(message);
        }
        
        if (error instanceof Error) {
            return error;
        }
        
        return new Error(defaultMessage);
    }
}
