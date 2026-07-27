import type {
  IAuthenticateGeneric,
  ICredentialTestRequest,
  ICredentialType,
  INodeProperties
} from 'n8n-workflow';

export class GlobiGuardApi implements ICredentialType {
  name = 'globiGuardApi';

  displayName = 'GlobiGuard API';

  icon = 'file:globiguard.svg' as const;

  documentationUrl =
    'https://github.com/globiguard/globiguard-open/tree/main/packages/n8n-nodes-globiguard#credentials';

  properties: INodeProperties[] = [
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
      description:
        'Must match the environment encoded in the GlobiGuard secret key'
    },
    {
      displayName: 'API URL',
      name: 'apiUrl',
      type: 'string',
      default: 'https://api.globiguard.com',
      required: true,
      description:
        'GlobiGuard service origin. HTTPS is required except for loopback-only local mode'
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
      description:
        'Server-side secret key. Never use a browser publishable key in n8n'
    }
  ];

  authenticate: IAuthenticateGeneric = {
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

  test: ICredentialTestRequest = {
    request: {
      baseURL: '={{$credentials.apiUrl}}',
      url: '/v1/policies',
      method: 'GET'
    }
  };
}
