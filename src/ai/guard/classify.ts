// The cheap topic classifier.
//
// Only reached when the heuristic is unsure, so the cost is a handful of tokens
// on a minority of messages. It fails closed: if no key is configured, or the
// call errors, an uncertain message is treated as off-topic rather than being
// sent to the expensive model on a guess.
import { generateText } from 'ai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { getAiConfig, getProviderKey } from '../config'

/** Answers are cached by normalised text, so a repeat costs nothing at all. */
const cache = new Map<string, boolean>()
const CACHE_LIMIT = 500

export async function isAboutTheApp(normalizedMessage: string): Promise<boolean> {
  const cached = cache.get(normalizedMessage)
  if (cached !== undefined) return cached

  const config = getAiConfig()
  if (!config.hasKey) return false

  let apiKey: string
  try {
    const key = getProviderKey()
    if (!key) return false
    apiKey = key
  } catch {
    return false
  }

  const provider = createOpenAICompatible({
    name: config.provider || 'openai-compatible',
    baseURL: config.baseUrl,
    apiKey,
  })

  try {
    const result = await generateText({
      model: provider(config.model),
      system: [
        'You classify a message sent to a restaurant POS assistant.',
        'Reply with exactly one word: APP if it concerns the restaurant (sales, orders, stock, menu, prices, staff, shifts, delivery, reports) or is a short follow-up.',
        'Reply OFF otherwise (small talk, general knowledge, coding, news, anything unrelated).',
        'No explanation.',
      ].join(' '),
      prompt: normalizedMessage.slice(0, 300),
      maxOutputTokens: 4,
      temperature: 0,
    })
    const answer = String(result.text ?? '').trim().toUpperCase()
    const decision = answer.startsWith('APP')
    remember(normalizedMessage, decision)
    return decision
  } catch {
    // Fail closed: an unclassifiable message is not worth a paid turn.
    return false
  }
}

function remember(key: string, value: boolean): void {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(key, value)
}
