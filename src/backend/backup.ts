// Backup / restore / export — the only backend domain that touches
// the filesystem and the app lifecycle, all via injected Electron bits.
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { closeSqlite, getSqlite } from '../db/client'
import { getElectron } from './electron'

const backupStamp = () => new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)

export async function triggerBackup() {
  try {
    const backupsDir = path.join(getElectron().app.getPath('userData'), 'backups')
    mkdirSync(backupsDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)
    const dest = path.join(backupsDir, `fastfood-${stamp}.db`)
    await getSqlite().backup(dest)
    return { ok: true, path: dest, message: 'تم إنشاء النسخة الاحتياطية بنجاح' }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'فشل النسخ الاحتياطي' }
  }
}

export function getBackupStatus() {
  try {
    const backupsDir = path.join(getElectron().app.getPath('userData'), 'backups')
    const files = readdirSync(backupsDir)
      .filter(f => f.startsWith('fastfood-') && f.endsWith('.db'))
      .sort()
    return { lastBackup: files.length ? files[files.length - 1] : null, backupCount: files.length }
  } catch {
    return { lastBackup: null, backupCount: 0 }
  }
}

// Save a consistent single-file snapshot anywhere the user picks
// (USB stick, network share, another PC).
export async function exportBackup() {
  try {
    const { canceled, filePath } = await getElectron().dialogs.showSaveDialog({
      title: 'تصدير نسخة احتياطية',
      defaultPath: `crunch-time-backup-${backupStamp()}.db`,
      filters: [{ name: 'قاعدة بيانات', extensions: ['db'] }],
    })
    if (canceled || !filePath) return { ok: false, canceled: true }
    await getSqlite().backup(filePath)
    return { ok: true, path: filePath, message: 'تم تصدير النسخة الاحتياطية' }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'فشل تصدير النسخة' }
  }
}

// Excel-friendly CSV. The UTF-8 BOM makes Excel detect the Arabic text
// correctly (without it Excel mangles the Arabic glyphs). Shared by the
// desktop save dialog and the server's download route.
export function rowsToCsv(rows: string[][]): string {
  const esc = (v: unknown) => {
    const s = String(v ?? '')
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n')
}

// Export any table to a CSV file that opens directly in Excel.
export async function exportCsv(name: string, rows: string[][]) {
  try {
    const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)
    const { canceled, filePath } = await getElectron().dialogs.showSaveDialog({
      title: 'تصدير إلى إكسل',
      defaultPath: `${name || 'table'}-${stamp}.csv`,
      filters: [{ name: 'ملف إكسل (CSV)', extensions: ['csv'] }],
    })
    if (canceled || !filePath) return { ok: false, canceled: true }
    writeFileSync(filePath, rowsToCsv(rows), 'utf-8')
    return { ok: true, path: filePath, message: 'تم تصدير الجدول إلى إكسل' }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'فشل تصدير الجدول' }
  }
}

// Validates a .db file, snapshots the current one, swaps it in and restarts.
// Shared by the desktop picker (restoreBackup) and the server's upload route.
export async function restoreFromFile(src: string) {
  // 1. Validate the pick BEFORE touching the live database.
  const header = Buffer.alloc(16)
  const fd = openSync(src, 'r')
  try {
    readSync(fd, header, 0, 16, 0)
  } finally {
    closeSync(fd)
  }
  if (header.toString('latin1', 0, 15) !== 'SQLite format 3') {
    return { ok: false, error: 'الملف ده مش قاعدة بيانات صحيحة' }
  }
  const probe = new Database(src, { readonly: true, fileMustExist: true })
  try {
    const integrity = probe.pragma('integrity_check', { simple: true })
    if (integrity !== 'ok') return { ok: false, error: 'الملف تالف — فحص السلامة فشل' }
    const tables = probe.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('users', 'settings')",
    ).all() as { name: string }[]
    if (tables.length < 2) return { ok: false, error: 'الملف ده مش نسخة من التطبيق' }
  } finally {
    probe.close()
  }

  const dbPath = path.join(getElectron().app.getPath('userData'), 'fastfood.db')
  if (path.resolve(src) === path.resolve(dbPath)) {
    return { ok: false, error: 'الملف المختار هو نفسه قاعدة البيانات الحالية' }
  }

  // 2. Safety snapshot of whatever is on this machine right now.
  const backupsDir = path.join(getElectron().app.getPath('userData'), 'backups')
  mkdirSync(backupsDir, { recursive: true })
  await getSqlite().backup(path.join(backupsDir, `fastfood-pre-restore-${backupStamp()}.db`))

  // 3. Swap: close (WAL checkpointed), drop stale side files, copy in.
  closeSqlite()
  for (const suffix of ['', '-wal', '-shm']) {
    const p = dbPath + suffix
    if (existsSync(p)) rmSync(p)
  }
  copyFileSync(src, dbPath)

  // 4. Restart on the next tick so the renderer gets this response first.
  //    On boot: migrations run on the restored file, seeding is skipped
  //    because the backup carries its own users.
  setTimeout(() => {
    getElectron().app.relaunch()
    getElectron().app.exit(0)
  }, 400)
  return { ok: true, restarting: true, message: 'تمت الاستعادة — سيتم إعادة تشغيل التطبيق' }
}

// Replace the live database with a picked .db file.
export async function restoreBackup() {
  try {
    const { canceled, filePaths } = await getElectron().dialogs.showOpenDialog({
      title: 'اختار نسخة احتياطية',
      filters: [{ name: 'قاعدة بيانات', extensions: ['db'] }],
      properties: ['openFile'],
    })
    if (canceled || !filePaths?.length) return { ok: false, canceled: true }
    return await restoreFromFile(filePaths[0])
  } catch (err: any) {
    return { ok: false, error: err?.message || 'فشل استعادة النسخة' }
  }
}
