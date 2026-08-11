"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GlobiGuardApi = void 0;
class GlobiGuardApi {
    constructor() {
        this.name = 'globiGuardApi';
        this.displayName = 'GlobiGuard API';
        this.icon = 'file:globiguard.svg';
        this.documentationUrl = 'https://github.com/globiguard/globiguard-open/tree/main/packages/n8n-nodes-globiguard#credentials';
        this.properties = [
            {
                displayName: 'Environment',
                name: 'environment',
                type: 'options',
                default: 'sandbox',
                options: [
                    { name: 'Sandbox', value: 'sandbox' },
                    { name: 'Live', value: 'live' },
                    { name: 'Local', value: 'local' }
                ],
                description: 'Must match the environment encoded in the GlobiGuard secret key'
            },
            {
                displayName: 'API URL',
                name: 'apiUrl',
                type: 'string',
                default: 'https://api.globiguard.com',
                required: true,
                description: 'GlobiGuard service origin. HTTPS is required except for loopback-only local mode'
            },
            {
                displayName: 'Project ID',
                name: 'projectId',
                type: 'string',
                default: '',
                required: true
            },
            {
                displayName: 'Secret Key',
                name: 'secretKey',
                type: 'string',
                typeOptions: { password: true },
                default: '',
                required: true,
                description: 'Server-side secret key. Never use a browser publishable key in n8n'
            }
        ];
        this.authenticate = {
            type: 'generic',
            properties: {
                headers: {
                    'x-globiguard-project-id': '={{$credentials.projectId}}',
                    'x-globiguard-secret-key': '={{$credentials.secretKey}}',
                    'x-globiguard-environment': '={{$credentials.environment}}',
                    'x-globiguard-client': 'n8n-nodes-globiguard/2'
                }
            }
        };
        this.test = {
            request: {
                baseURL: '={{$credentials.apiUrl}}',
                url: '/v1/policies',
                method: 'GET'
            }
        };
    }
}
exports.GlobiGuardApi = GlobiGuardApi;
//# sourceMappingURL=GlobiGuardApi.credentials.js.map