import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
export interface PayloadSummary {
    sha256: string;
    approxBytes: number;
    topLevelKeys: string[];
    topLevelValueKinds: IDataObject;
    recordCount?: number;
    binaryCount?: number;
    binaryBytes?: number;
    binaryProperties?: string[];
}
export declare function summarizeN8nPayload(value: INodeExecutionData['json']): Promise<PayloadSummary>;
export declare function summarizeN8nItem(context: IExecuteFunctions, itemIndex: number, item: INodeExecutionData): Promise<PayloadSummary>;
export declare function canonicalJson(value: unknown): string;
