import type { ChatMessage, ExportedSession, OpenCodePart, ToolActivity } from '../types'

const MAX_HISTORY_PREVIEW_URL_LENGTH = 20 * 1024 * 1024

function filePartToAttachment(part: OpenCodePart, index: number) {
  const mime = part.mime || 'application/octet-stream'
  const dataUrl = part.url?.startsWith(`data:${mime};base64,`) ? part.url : undefined
  const base64Length = dataUrl ? dataUrl.length - dataUrl.indexOf(',') - 1 : 0
  const size = base64Length ? Math.max(0, Math.floor(base64Length * 0.75) - (dataUrl?.endsWith('==') ? 2 : dataUrl?.endsWith('=') ? 1 : 0)) : 0
  const sourceLabel = part.source?.text?.value?.replace(/^@/, '')
  return {
    id: part.id || `attachment-${index}`,
    name: part.filename || sourceLabel?.split(/[\\/]/).pop() || '附件',
    mime,
    size,
    kind: part.source?.path ? 'project' as const : 'upload' as const,
    relativePath: sourceLabel,
    previewUrl: mime.startsWith('image/') && dataUrl && dataUrl.length <= MAX_HISTORY_PREVIEW_URL_LENGTH ? dataUrl : undefined,
  }
}

export function partToTool(part: OpenCodePart): ToolActivity {
  return {
    id: part.id || crypto.randomUUID(),
    tool: part.tool || 'tool',
    title: part.state?.title || part.tool || '使用工具',
    status: part.state?.status === 'completed' ? 'completed' : part.state?.status === 'error' ? 'error' : 'running',
    input: part.state?.input,
    output: part.state?.output || part.state?.error,
  }
}

export function exportedToMessages(session: ExportedSession): ChatMessage[] {
  return session.messages.flatMap((message) => {
    const text = message.parts.filter((part) => part.type === 'text').map((part) => part.text).join('\n\n')
    const tools = message.parts.filter((part) => part.type === 'tool').map(partToTool)
    const attachments = message.parts.filter((part) => part.type === 'file').map(filePartToAttachment)
    if (!text && !tools.length && !attachments.length) return []
    return [{
      id: message.info.id,
      role: message.info.role,
      text,
      createdAt: message.info.time.created,
      tools,
      attachments,
      tokens: message.info.tokens,
    } satisfies ChatMessage]
  })
}
