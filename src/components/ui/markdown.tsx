import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type Block =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; level: number; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'code'; text: string; lang: string | null }
  | { type: 'quote'; text: string }
  | { type: 'table'; header: string[]; rows: string[][] }
  | { type: 'rule' }

/** Splits one GFM row on unescaped pipes, trimming the optional outer pipes. */
export function splitRow(line: string): string[] {
  let text = line.trim()
  if (text.startsWith('|')) text = text.slice(1)
  if (text.endsWith('|')) text = text.slice(0, -1)
  return text.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|'))
}

export function isSeparator(line: string): boolean {
  const cells = splitRow(line)
  return cells.length > 0 && cells.every((cell) => /^:?-{1,}:?$/.test(cell))
}

function isTableStart(lines: string[], index: number): boolean {
  return Boolean(lines[index]?.includes('|') && index + 1 < lines.length && isSeparator(lines[index + 1]))
}

function isBlockStart(lines: string[], index: number): boolean {
  const line = lines[index]
  return (
    /^```/.test(line)
    || /^(#{1,6})\s+/.test(line)
    || /^\s*>\s?/.test(line)
    || /^\s*[-*+]\s+/.test(line)
    || /^\s*\d+[.)]\s+/.test(line)
    || /^\s*([-*_])\1{2,}\s*$/.test(line)
    || isTableStart(lines, index)
  )
}

export function parseBlocks(source: string): Block[] {
  const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) {
      index += 1
      continue
    }

    const fence = line.match(/^```([\w-]*)\s*$/)
    if (fence) {
      const body: string[] = []
      index += 1
      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        body.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      blocks.push({ type: 'code', text: body.join('\n'), lang: fence[1] || null })
      continue
    }

    if (isTableStart(lines, index)) {
      const header = splitRow(line)
      const rows: string[][] = []
      index += 2
      while (index < lines.length && lines[index].trim() && lines[index].includes('|')) {
        rows.push(splitRow(lines[index]))
        index += 1
      }
      blocks.push({ type: 'table', header, rows })
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] })
      index += 1
      continue
    }

    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      blocks.push({ type: 'rule' })
      index += 1
      continue
    }

    if (/^\s*>\s?/.test(line)) {
      const body: string[] = []
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        body.push(lines[index].replace(/^\s*>\s?/, ''))
        index += 1
      }
      blocks.push({ type: 'quote', text: body.join(' ') })
      continue
    }

    const ordered = /^\s*\d+[.)]\s+/.test(line)
    if (ordered || /^\s*[-*+]\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length) {
        const match = ordered
          ? lines[index].match(/^\s*\d+[.)]\s+(.*)$/)
          : lines[index].match(/^\s*[-*+]\s+(.*)$/)
        if (!match) break
        items.push(match[1])
        index += 1
      }
      blocks.push({ type: 'list', ordered, items })
      continue
    }

    const paragraph: string[] = [line.trim()]
    index += 1
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines, index)) {
      paragraph.push(lines[index].trim())
      index += 1
    }
    blocks.push({ type: 'paragraph', text: paragraph.join(' ') })
  }

  return blocks
}

const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*]+\*|_[^_]+_)/g

function inline(text: string, key: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern = new RegExp(INLINE.source, 'g')
  let last = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index))
    const token = match[0]
    const tokenKey = `${key}-${match.index}`

    if (token.startsWith('**') || token.startsWith('__')) {
      nodes.push(<strong key={tokenKey} className="font-black">{token.slice(2, -2)}</strong>)
    } else if (token.startsWith('`')) {
      nodes.push(
        <code key={tokenKey} className="rounded bg-secondary px-1 py-0.5 font-mono text-[0.9em]" dir="ltr">
          {token.slice(1, -1)}
        </code>,
      )
    } else {
      nodes.push(<em key={tokenKey} className="italic">{token.slice(1, -1)}</em>)
    }

    last = match.index + token.length
  }

  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

const HEADING_CLASS = ['text-xl', 'text-lg', 'text-base', 'text-sm', 'text-sm', 'text-sm']

export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks = parseBlocks(text)

  return (
    <div className={cn('space-y-3 text-sm leading-relaxed', className)} dir="auto">
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'paragraph':
            return <p key={index}>{inline(block.text, `p${index}`)}</p>

          case 'heading':
            return (
              <p key={index} className={cn('font-black', HEADING_CLASS[block.level - 1] || 'text-sm')}>
                {inline(block.text, `h${index}`)}
              </p>
            )

          case 'list': {
            const items = block.items.map((item, itemIndex) => (
              <li key={itemIndex}>{inline(item, `l${index}-${itemIndex}`)}</li>
            ))
            return block.ordered
              ? <ol key={index} className="list-decimal space-y-1 ps-5">{items}</ol>
              : <ul key={index} className="list-disc space-y-1 ps-5">{items}</ul>
          }

          case 'code':
            return (
              <pre
                key={index}
                dir="ltr"
                className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-secondary/60 p-2.5 text-left font-mono text-[11px] leading-relaxed"
              >
                <code>{block.text}</code>
              </pre>
            )

          case 'quote':
            return (
              <blockquote key={index} className="border-s-2 border-primary/40 ps-3 text-muted-foreground">
                {inline(block.text, `q${index}`)}
              </blockquote>
            )

          case 'rule':
            return <hr key={index} className="border-border" />

          case 'table':
            return (
              <div key={index} className="overflow-x-auto rounded-xl border">
                <table className="w-full border-collapse text-[12px]" dir="auto">
                  <thead className="bg-secondary/80">
                    <tr>
                      {block.header.map((cell, cellIndex) => (
                        <th
                          key={cellIndex}
                          scope="col"
                          className="whitespace-nowrap border-b border-border px-3 py-2 text-start font-black"
                        >
                          {inline(cell, `th${index}-${cellIndex}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr key={rowIndex} className="transition-colors hover:bg-secondary/35">
                        {block.header.map((_, cellIndex) => (
                          <td
                            key={cellIndex}
                            className="whitespace-nowrap border-b border-border/40 px-3 py-1.5 text-start tabular-nums"
                          >
                            {inline(row[cellIndex] ?? '', `td${index}-${rowIndex}-${cellIndex}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
        }
      })}
    </div>
  )
}
