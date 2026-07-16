const remoteErrorPrefix = /^Error invoking remote method '[^']+': Error:\s*/

export function userErrorMessage(error: unknown, fallback = '操作失败，请重试。') {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return message.replace(remoteErrorPrefix, '').trim() || fallback
}
