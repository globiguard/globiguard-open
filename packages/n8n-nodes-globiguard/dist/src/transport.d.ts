import type { IDataObject, IExecuteFunctions, IHttpRequestMethods } from 'n8n-workflow';
type GlobiGuardService = 'controlPlane';
export interface GlobiGuardRequestOptions {
    body?: IDataObject;
    query?: IDataObject;
}
export declare function globiGuardRequest<TResponse>(context: IExecuteFunctions, service: GlobiGuardService, method: IHttpRequestMethods, path: string, options?: GlobiGuardRequestOptions): Promise<TResponse>;
export declare function encodePathSegment(value: string): string;
export {};
