import type { FastifyInstance } from 'fastify'
import type { Backend } from '../backend'

export function registerAnalysisRoutes(app: FastifyInstance, backend: Backend) {
  app.get('/analysis/schema', async () => ({
    ok: true,
    tables: await backend.analysis.schema(),
  }))

  app.post('/analysis/query', async (request) => {
    const sql = (request.body as { sql?: unknown } | undefined)?.sql
    if (typeof sql !== 'string' || !sql.trim()) {
      const error: any = new Error('ابعت { sql: "SELECT ..." }')
      error.statusCode = 400
      throw error
    }
    return { ok: true, ...(await backend.analysis.query(sql)) }
  })

  app.post('/analysis/refresh', async () => ({
    ok: true,
    createdAt: await backend.analysis.refresh(),
  }))
}
