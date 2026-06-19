export const DEFAULT_AZURE_OPENAI_API_VERSION = '2024-02-15-preview'

export interface AzureOpenAiPayload {
  provider_mode: 'azure_openai'
  azure_openai_endpoint?: string
  azure_openai_api_key?: string
  azure_openai_deployment?: string
  azure_openai_api_version?: string
}

export function parseJsonStringSetting(rawValue: string | undefined, fallback = ''): string {
  try {
    const parsed = JSON.parse(rawValue || 'null') as unknown
    return typeof parsed === 'string' ? parsed : fallback
  } catch {
    return fallback
  }
}

export function buildAzureOpenAiPayload(rawSettings?: Record<string, string>): AzureOpenAiPayload {
  const endpoint = parseJsonStringSetting(rawSettings?.azure_openai_endpoint, '').trim()
  const deployment = parseJsonStringSetting(rawSettings?.azure_openai_deployment, '').trim()
  const apiVersion = parseJsonStringSetting(rawSettings?.azure_openai_api_version, DEFAULT_AZURE_OPENAI_API_VERSION).trim()

  return {
    provider_mode: 'azure_openai',
    ...(endpoint ? { azure_openai_endpoint: endpoint } : {}),
    ...(deployment ? { azure_openai_deployment: deployment } : {}),
    azure_openai_api_version: apiVersion || DEFAULT_AZURE_OPENAI_API_VERSION,
  }
}

export function getAzureOpenAiValidationError(payload: {
  azure_openai_endpoint?: string
  azure_openai_api_key?: string
  azure_openai_deployment?: string
}): string | null {
  if (!String(payload.azure_openai_endpoint || '').trim()) {
    return 'Azure OpenAI endpoint is required.'
  }
  if (!String(payload.azure_openai_deployment || '').trim()) {
    return 'Azure OpenAI deployment is required.'
  }
  if (!String(payload.azure_openai_api_key || '').trim()) {
    return 'Azure OpenAI API key is required.'
  }
  return null
}
