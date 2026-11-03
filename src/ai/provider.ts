// One place that turns the stored provider config into a model factory.
//
// `supportsStructuredOutputs` is requested here rather than at each call site:
// the chat loop and the settings-screen ping must behave the same way, and a
// provider that rejects it is handled by the retry in activities/modelStep.
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { LanguageModel } from 'ai'

export interface ProviderConfig {
  provider: string
  baseUrl: string
  apiKey: string
}

export type ModelFactory = (modelId: string) => LanguageModel

/** Turns the stored provider config into a factory for one turn. */
export type ProviderFactory = (config: ProviderConfig) => ModelFactory

export function createProvider(config: ProviderConfig): ModelFactory {
  const provider = createOpenAICompatible({
    name: config.provider || 'openai-compatible',
    baseURL: config.baseUrl,
    apiKey: config.apiKey,
    supportsStructuredOutputs: true,
  })

  return (modelId: string) => provider(modelId)
}
