import type {
  IDataObject,
  IExecuteFunctions,
  IHttpRequestMethods,
  IHttpRequestOptions
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

type GlobiGuardService = 'controlPlane';
const CONTROL_PLANE_TIMEOUT_MS = 30_000;

export interface GlobiGuardRequestOptions {
  body?: IDataObject;
  query?: IDataObject;
}

export async function globiGuardRequest<TResponse>(
  context: IExecuteFunctions,
  service: GlobiGuardService,
  method: IHttpRequestMethods,
  path: string,
  options: GlobiGuardRequestOptions = {}
): Promise<TResponse> {
  const credentials = await context.getCredentials('globiGuardApi');
  const environment = requireString(credentials.environment, 'Environment');
  const configuredUrl = requireString(credentials.apiUrl, 'API URL');
  const baseUrl = validateServiceOrigin(configuredUrl, environment);
  const request: IHttpRequestOptions = {
    method,
    url: `${baseUrl}${normalizePath(path)}`,
    json: true,
    returnFullResponse: false,
    timeout: CONTROL_PLANE_TIMEOUT_MS,
    disableFollowRedirect: true,
    sendCredentialsOnCrossOriginRedirect: false
  };

  if (options.body !== undefined) {
    request.body = options.body;
  }
  if (options.query !== undefined) {
    request.qs = removeUndefinedValues(options.query);
  }

  try {
    return (await context.helpers.httpRequestWithAuthentication.call(
      context,
      'globiGuardApi',
      request
    )) as TResponse;
  } catch (error) {
    throw new NodeOperationError(context.getNode(), sanitizeTransportError(error));
  }
}

export function encodePathSegment(value: string): string {
  return encodeURIComponent(value);
}

function validateServiceOrigin(value: string, environment: string): string {
  if (!URL.canParse(value)) {
    throw new Error('GlobiGuard service URL must be a valid URL.');
  }
  const parsed = new URL(value);

  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(
      'GlobiGuard service URL must be an origin without credentials, query parameters, or fragments.'
    );
  }
  if (parsed.pathname !== '/' && parsed.pathname !== '') {
    throw new Error(
      'GlobiGuard service URL must be an origin, not a versioned API path.'
    );
  }

  if (environment === 'local') {
    const localHost =
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '::1' ||
      parsed.hostname.endsWith('.localhost');
    if (!localHost) {
      throw new Error('Local GlobiGuard credentials may only target a loopback host.');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Local GlobiGuard service URL must use HTTP or HTTPS.');
    }
  } else if (parsed.protocol !== 'https:') {
    throw new Error('GlobiGuard service URL must use HTTPS outside local mode.');
  }

  return parsed.origin;
}

function normalizePath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

function removeUndefinedValues(value: IDataObject): IDataObject {
  return Object.fromEntries(
    Object.entries(value).filter((entry) => entry[1] !== undefined)
  ) as IDataObject;
}

function requireString(value: unknown, label: string): string {
  const normalized = optionalString(value);
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  return normalized;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function sanitizeTransportError(error: unknown): string {
  const message =
    error instanceof Error ? error.message : 'GlobiGuard request failed.';
  return message
    .replace(/\b(?:ggsk|sk|pk)_(?:test_|live_)?[A-Za-z0-9_-]+\b/g, '[REDACTED_KEY]')
    .replace(
      /(?:authorization|cookie|x-api-key|x-globiguard-secret-key)\s*[:=]\s*(?:bearer\s+)?\S+/gi,
      '[REDACTED_CREDENTIAL]'
    )
    .slice(0, 512);
}
