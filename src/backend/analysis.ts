import { app } from 'electron'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { mkdirSync, readdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { askQuestion, type AskResult } from '../analysis/ask'
import { AnalysisService } from '../analysis/service'
import type { QueryResult } from '../analysis/runner'
import type { TableInfo } from '../analysis/schema'
import { getAiConfig, getAiConfigWithKey } from '../ai/config'
import { recordUsage, withinBudget } from '../ai/guard/budget'
import { getSqlite } from '../db/client'
import { requireAdmin } from './session'

let service: AnalysisService | null = null
let asking = false

function snapshotWorkDir(): string {
  const dir = path.join(app.getPath('userData'), 'analysis')
  try {
    mkdirSync(dir, { recursive: true })
    for (const entry of readdirSync(dir)) {
      if (!entry.startsWith('snapshot-')) continue
      rmSync(path.join(dir, entry), { recursive: true, force: true })
    }
  } catch {
    // best effort — a stale snapshot must not block analysis
  }
  return dir
}

function getService(): AnalysisService {
  if (!service) {
    service = new AnalysisService(() => getSqlite().name, { workDir: snapshotWorkDir() })
  }
  return service
}

export async function query(sql: string): Promise<QueryResult> {
  requireAdmin()
  return getService().query(sql)
}

export async function schema(): Promise<TableInfo[]> {
  requireAdmin()
  return getService().schema()
}

export async function refresh(): Promise<number> {
  requireAdmin()
  return getService().refresh()
}

export async function ask(question: string): Promise<AskResult> {
  requireAdmin()

  const text = String(question ?? '').trim()
  if (!text) throw new Error('اكتب سؤال تحليلي')
  if (text.length > 500) throw new Error('السؤال طويل — اختصره لـ 500 حرف')
  if (asking) throw new Error('في تحليل شغال بالفعل — استنى يخلص')

  const config = getAiConfig()
  if (!config.enabled) throw new Error('المساعد غير مفعّل — فعّله من الإعدادات')
  if (!withinBudget(config.dailyTokenLimit)) {
    throw new Error('وصلت لحد الاستخدام اليومي — جرّب تاني بكرة أو ارفع الحد من الإعدادات')
  }

  const withKey = getAiConfigWithKey()
  const provider = createOpenAICompatible({
    name: withKey.provider || 'openai-compatible',
    baseURL: withKey.baseUrl,
    apiKey: withKey.apiKey,
  })

  asking = true
  try {
    const result = await getService().withSnapshot((snapshot) =>
      askQuestion({
        question: text,
        database: snapshot.database,
        query: snapshot.query,
        model: provider(withKey.model),
        maxRows: 100,
        maxSteps: 5,
        dataAsOf: snapshot.createdAt,
      }),
    )
    try {
      recordUsage({ promptTokens: result.usage.inputTokens, completionTokens: result.usage.outputTokens })
    } catch {
      // Usage accounting must never fail a finished analysis.
    }
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : 'تعذّر تشغيل المحلل'
    throw new Error(message.slice(0, 300))
  } finally {
    asking = false
  }
}

export async function close(): Promise<void> {
  const current = service
  service = null
  asking = false
  await current?.close()
}
