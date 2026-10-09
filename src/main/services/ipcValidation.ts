import { z } from 'zod'
import {
  envSchema,
  pathValue,
  profileSchema,
  projectSchema,
  snapshotSchema,
  terminalSchema,
  text,
  toolSchema
} from '../../shared/validation'

const optText = text.optional()
const files = z.array(text).max(10000)
const searchOptions = z.object({ regex: z.boolean().optional(), caseSensitive: z.boolean().optional() })
const schemas: Record<string, z.ZodTypeAny> = {}
const add = (names: string, args: z.ZodTypeAny[]): void => {
  for (const name of names.split(' ')) schemas[name] = z.tuple(args as [z.ZodTypeAny, ...z.ZodTypeAny[]])
}
add(
  'store:getState tools:list tools:detect session:state session:tempPath session:recent session:openDialog dialog:pickFolder dialog:pickExecutable pty:list recents:clear app:version updates:check',
  []
)
add('tools:remove commands:remove favs:remove pty:restart pty:kill', [text])
add(
  'session:read session:setDir fs:list fs:read fs:delete fs:reveal fs:openExternal git:status git:changes git:pull git:push git:fetch git:branches git:remote git:inspect-path',
  [pathValue]
)
add('app:openExternal session:saveDialog', [text])
add('session:setRestoreMode', [z.enum(['ask', 'last'])])
add('store:setSettings', [
  z.object({
    theme: z.enum(['dark', 'light']).optional(),
    defaultShell: text.optional(),
    terminalFontSize: z.number().min(6).max(72).optional(),
    terminalDockVisible: z.boolean().optional()
  })
])
add('tools:save', [toolSchema])
add('session:write', [snapshotSchema, pathValue])
add('session:setRoots', [z.array(projectSchema)])
add('git:stage git:unstage', [pathValue, files])
add('git:commit git:diff git:github-clone git:create-branch-from-main fs:rename fs:move', [pathValue, text])
add('git:github-list', [z.number().int().min(1).max(1000).optional()])
add('git:github-search', [text, z.number().int().min(1).max(1000).optional()])
add('launch:tool', [text, optText, optText, envSchema.optional()])
add('launch:command', [text, optText, optText, envSchema.optional()])
add('launch:externalCommand', [text, optText])
add('launch:validateProfile', [projectSchema, profileSchema])
add('launch:waitReady', [z.number().int().min(1).max(65535), z.number().int().min(1).max(120), text])
add('pty:create', [terminalSchema])
add('pty:rename', [text, text])
add('pty:write', [text, z.string().max(5 * 1024 * 1024)])
add('pty:resize', [text, z.number().int().min(1).max(1000), z.number().int().min(1).max(1000)])
add('commands:save', [z.object({ id: text, label: text, command: text })])
add('favs:save', [
  z.object({
    id: text,
    label: text,
    icon: optText,
    cwd: text,
    command: text,
    target: z.enum(['embedded', 'external'])
  })
])
add('recents:add', [
  z.object({
    id: text,
    label: text,
    icon: optText,
    cwd: optText,
    at: z.number().finite(),
    kind: z.enum(['tool', 'fav']),
    toolId: optText,
    modeId: optText,
    command: optText,
    target: z.enum(['embedded', 'external']).optional()
  })
])
add('fs:write', [pathValue, z.string().max(5 * 1024 * 1024)])
add('fs:create', [pathValue, z.enum(['file', 'directory'])])
add('fs:search', [pathValue, text, searchOptions])
add('fs:replace', [pathValue, text, text, searchOptions])
add('ssh:build', [
  z.object({
    host: text,
    user: optText,
    port: z.number().int().min(1).max(65535).optional(),
    identityFile: optText,
    forwardAgent: z.boolean().optional(),
    extraFlags: optText,
    remoteCommand: optText
  })
])
add('dialog:closeFile', [text])

export function validateIpc(channel: string, args: unknown[]): unknown[] {
  const schema = schemas[channel]
  if (!schema) throw new Error(`Unknown IPC channel: ${channel}`)
  // Electron preserves omitted trailing arguments; normalize optional tuple members.
  const length = (schema as z.ZodTuple<[z.ZodTypeAny]>).items.length
  return schema.parse(Array.from({ length: Math.max(length, args.length) }, (_, i) => args[i]))
}
export function externalUrl(url: string): string {
  const parsed = new URL(url)
  if (!['http:', 'https:'].includes(parsed.protocol))
    throw new Error('Only HTTP and HTTPS links are supported')
  return parsed.href
}
