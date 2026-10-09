import { z } from 'zod'
import type { SessionSnapshot } from './types'

export const text = z
  .string()
  .max(32_768)
  .regex(/^[^\0]*$/, 'NUL is not allowed')
export const pathValue = text.min(1)
const id = text.min(1)
const finite = z.number().finite()
export const envSchema = z.record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/), text)
const toolType = z.enum(['ide', 'terminal', 'ai-agent', 'custom'])
const launchMode = z.enum(['external', 'shell', 'command'])
const folderPosition = z.enum(['append', 'prepend', 'none'])
export const toolSchema = z.object({
  id,
  name: text.min(1),
  type: toolType,
  path: pathValue,
  args: z.array(text).max(256),
  icon: text.optional(),
  builtin: z.boolean().optional(),
  launchMode: launchMode.optional(),
  folderArgPosition: folderPosition.optional(),
  modes: z
    .array(
      z.object({
        id,
        label: text,
        args: z.array(text).max(256),
        type: toolType.optional(),
        launchMode: launchMode.optional(),
        folderArgPosition: folderPosition.optional()
      })
    )
    .max(100)
    .optional()
})
export const profileSchema = z
  .object({
    id,
    name: text.min(1),
    steps: z
      .array(
        z
          .object({
            id,
            name: text.min(1),
            folderId: id,
            kind: z.enum(['tool', 'command']),
            toolId: id.optional(),
            modeId: id.optional(),
            command: text.min(1).optional(),
            env: envSchema.optional(),
            readyPort: z.number().int().min(1).max(65535).optional(),
            timeoutSeconds: z.number().int().min(1).max(120).optional()
          })
          .superRefine((step, ctx) => {
            if (step.kind === 'tool' ? !step.toolId : !step.command?.trim()) {
              ctx.addIssue({ code: 'custom', message: 'Select a tool or enter a command' })
            }
          })
      )
      .min(1)
      .max(30)
  })
  .refine((p) => new Set(p.steps.map((s) => s.id)).size === p.steps.length, 'Duplicate step IDs')
export const projectSchema = z.object({
  id,
  name: text,
  color: text.optional(),
  icon: text.optional(),
  createdAt: finite,
  lastAccessedAt: finite.optional(),
  folders: z.array(z.object({ id, path: pathValue, name: text })).max(1000),
  launchProfiles: z.array(profileSchema).max(100).optional()
})
export const terminalSchema = z.object({
  cwd: text,
  shell: text.optional(),
  shellArgs: z.array(text).max(256).optional(),
  title: text.optional(),
  initialCommand: text.optional(),
  toolId: text.optional(),
  env: envSchema.optional(),
  cols: z.number().int().min(1).max(1000).optional(),
  rows: z.number().int().min(1).max(1000).optional()
})
const file = z.object({ path: pathValue, name: text })
const leaf = z.object({
  kind: z.literal('leaf'),
  cwd: text,
  shell: text,
  title: text,
  toolId: text.optional()
})
function tile(depth: number): z.ZodTypeAny {
  return depth === 0
    ? leaf
    : z.union([
        leaf,
        z.object({
          kind: z.literal('split'),
          dir: z.enum(['row', 'col']),
          children: z
            .array(tile(depth - 1))
            .min(2)
            .max(8)
        })
      ])
}
export const snapshotSchema = z.object({
  version: z.literal(1),
  name: text,
  createdAt: finite,
  updatedAt: finite,
  projects: z.array(projectSchema).max(1000),
  ui: z.object({
    activeView: z.enum(['projects', 'favorites', 'tools', 'sessions', 'files', 'settings']),
    selectedProjectId: text.nullable(),
    filesTarget: file.nullable(),
    openFiles: z.array(file).max(1000),
    editorDrafts: z.record(pathValue, z.string().max(5 * 1024 * 1024)).optional(),
    terminals: z.array(z.object({ name: text, tree: tile(64) })).max(100),
    floating: z
      .array(z.object({ cwd: text, shell: text, title: text, x: finite, y: finite, w: finite, h: finite }))
      .max(100),
    dockVisible: z.boolean(),
    dockHeight: finite
  })
})
export function parseSnapshot(value: unknown): SessionSnapshot {
  return snapshotSchema.parse(value) as SessionSnapshot
}
