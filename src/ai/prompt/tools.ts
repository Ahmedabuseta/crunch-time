// The tool guide is generated, never hand-written: if a tool is not exposed
// this step it must not appear here, and if its description changes the guide
// changes with it. The old static list named all 45 tools while the router
// exposed ~10, which cost tokens and invited the model to call tools it could
// not see.
import type { ToolDef } from '../tools/types'

export function toolGuideSection(tools: ToolDef[]): string[] {
  const reads = tools.filter((tool) => !tool.write)
  const writes = tools.filter((tool) => tool.write)

  const lines = [
    '## الأدوات المتاحة في الدور ده',
    'دي الأدوات المسموح تناديها دلوقتي. لو اللي محتاجه مش موجود، نادي find_tools الأول بكلمات وصفية.',
  ]

  if (reads.length > 0) {
    lines.push('', 'قراءة:')
    for (const tool of reads) lines.push(`• ${tool.name} — ${oneLine(tool.description)}`)
  }

  if (writes.length > 0) {
    lines.push('', 'تغيير (بتعمل كارت تأكيد، ومبتغيّرش حاجة لوحدها):')
    for (const tool of writes) lines.push(`• ${tool.name} — ${oneLine(tool.description)}`)
  }

  return lines
}

/** Descriptions are one line by contract, but a stray newline must not break the list. */
function oneLine(text: string): string {
  return String(text ?? '').replace(/\s+/g, ' ').trim()
}
