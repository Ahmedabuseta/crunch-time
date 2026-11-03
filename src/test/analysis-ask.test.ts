import Database from 'better-sqlite3'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { afterEach, describe, expect, it } from 'vitest'
import { askQuestion } from '../analysis/ask'
import { runReadOnlyQuery } from '../analysis/runner'
import { seedOrders, tempDir } from './helpers/temp-db'
import { startFakeOpenAI, type FakeTurn } from './helpers/fake-openai'

const cleanups: (() => Promise<void>)[] = []

async function setup(turns: FakeTurn[]) {
  const dir = await tempDir()
  const database = new Database(path.join(dir, 'fastfood.db'))
  seedOrders(database)
  const fake = await startFakeOpenAI(turns)
  const provider = createOpenAICompatible({
    name: 'fake',
    baseURL: fake.url,
    apiKey: 'test-key',
  })

  cleanups.push(async () => {
    await fake.close()
    database.close()
    await rm(dir, { recursive: true, force: true })
  })

  return {
    database,
    fake,
    model: provider('fake-model'),
    query: (sql: string, maxRows: number) => Promise.resolve(runReadOnlyQuery(database, sql, maxRows)),
  }
}

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()?.()
})

describe('askQuestion', () => {
  it('runs SQL through the tool and answers with its result', async () => {
    const { database, fake, model, query } = await setup([
      { kind: 'tool', name: 'run_sql', args: { sql: 'SELECT COUNT(*) AS n FROM orders', purpose: 'count orders' } },
      { kind: 'text', text: 'عدد الطلبات 3' },
    ])

    const result = await askQuestion({ question: 'كام طلب؟', database, query, model, maxRows: 100, maxSteps: 4 })

    expect(result.answer).toBe('عدد الطلبات 3')
    expect(result.question).toBe('كام طلب؟')
    expect(result.queries).toHaveLength(1)
    expect(result.queries[0]).toMatchObject({ purpose: 'count orders', columns: ['n'], rowCount: 1 })
    expect(result.queries[0].rows[0][0]).toBe(3)
    expect(result.steps).toBe(2)
    expect(result.trace).toHaveLength(2)
    expect(result.trace[0].toolCalls[0]).toMatchObject({ name: 'run_sql' })
    expect(result.trace[0].toolResults[0].output).toMatchObject({ ok: true, rowCount: 1 })
    expect(result.context.tables).toBeGreaterThan(0)
    expect(result.context.model).toBe('fake-model')
    expect(result.context.durationMs).toBeGreaterThanOrEqual(0)
    expect(fake.requests[0].body.tools.map((entry: any) => entry.function.name)).toContain('run_sql')
  })

  it('does not echo reasoning_content back to the provider', async () => {
    const { database, fake, model, query } = await setup([
      {
        kind: 'tool',
        name: 'run_sql',
        args: { sql: 'SELECT COUNT(*) AS n FROM orders' },
        reasoning: 'I need the order count first.',
      },
      { kind: 'text', text: 'عدد الطلبات 3' },
    ])

    const result = await askQuestion({ question: 'كام طلب؟', database, query, model, maxRows: 100, maxSteps: 4 })

    expect(result.answer).toBe('عدد الطلبات 3')
    expect(result.trace[0].reasoning).toContain('I need the order count first')
    const secondRequest = fake.requests[1]?.body
    const assistant = secondRequest.messages.find((message: any) => message.role === 'assistant')
    expect(assistant).toBeTruthy()
    expect(assistant.reasoning_content).toBeUndefined()
  })

  it('hands a rejected write back to the model as an error', async () => {
    const { database, model, query } = await setup([
      { kind: 'tool', name: 'run_sql', args: { sql: 'DELETE FROM orders' } },
      { kind: 'text', text: 'مش هينفع أعدّل البيانات' },
    ])

    const result = await askQuestion({ question: 'امسح الطلبات', database, query, model, maxRows: 100, maxSteps: 4 })

    expect(result.answer).toBe('مش هينفع أعدّل البيانات')
    expect(result.queries[0].error).toMatch(/ممنوع/)
    expect(result.queries[0].rows).toEqual([])
  })

  it('rejects an empty question', async () => {
    const { database, model, query } = await setup([{ kind: 'text', text: 'x' }])
    await expect(askQuestion({ question: '  ', database, query, model, maxRows: 10 })).rejects.toThrow(/سؤال/)
  })
})
