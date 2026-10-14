// Backup / restore / export over HTTP. The desktop versions use OS save/open
// dialogs; there is no UI on the server, so download streams a fresh snapshot
// and restore accepts the .db bytes as a raw upload.
import { createReadStream, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { FastifyInstance } from 'fastify'
import type { Backend } from '../backend'
import { rowsToCsv } from '../backend/backup'
import { getSqlite } from '../db/client'

const stamp = () => new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)

export function registerBackupRoutes(app: FastifyInstance, backend: Backend) {
  app.post('/backup', async () => backend.backup.triggerBackup())

  app.get('/backup/status', async () => ({ status: await backend.backup.getBackupStatus() }))

  // A consistent snapshot streamed straight to the phone.
  app.get('/backup/download', async (_req, reply) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'ct-backup-'))
    const file = path.join(dir, `crunch-time-${stamp()}.db`)
    await getSqlite().backup(file)
    const stream = createReadStream(file)
    stream.on('close', () => {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        // temp cleanup is best-effort
      }
    })
    reply.header('content-type', 'application/octet-stream')
    reply.header('content-disposition', `attachment; filename="crunch-time-${stamp()}.db"`)
    return reply.send(stream)
  })

  // Restore from an uploaded .db (raw body). The file is validated and swapped
  // by the shared restore path, which then relaunches the app.
  app.post('/backup/restore', { bodyLimit: 512 * 1024 * 1024 }, async (req, reply) => {
    const body = req.body
    if (!Buffer.isBuffer(body) || body.length === 0) {
      return reply.code(400).send({ ok: false, error: 'ارفع ملف قاعدة البيانات (.db)' })
    }
    const dir = mkdtempSync(path.join(tmpdir(), 'ct-restore-'))
    const file = path.join(dir, 'upload.db')
    writeFileSync(file, body)
    const res = await backend.backup.restoreFromFile(file)
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      // restored copy already in place
    }
    if (!res.ok) return reply.code(400).send(res)
    return res
  })

  // Table export as a downloadable CSV (instead of the desktop save dialog).
  app.post('/export/csv', async (req, reply) => {
    const body = (req.body || {}) as any
    const rows = Array.isArray(body.rows) ? body.rows : []
    const name = String(body.name || 'table')
    reply.header('content-type', 'text/csv; charset=utf-8')
    reply.header('content-disposition', `attachment; filename="${name}-${stamp()}.csv"`)
    return reply.send(rowsToCsv(rows))
  })
}
