import { promises as fs } from 'node:fs'
import { createConnection } from 'node:net'
import type { LaunchProfile, Project } from '@shared/types'
import { profileSchema, projectSchema } from '../../shared/validation'
import { allowedPath } from './fileAccess'
import { getActiveRoots } from './session'
import { listTools } from './tools'
import { effectiveTool, resolveLaunchMode } from './launchCommand'
import { ptyManager } from './pty'

export function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port })
    const finish = (open: boolean): void => {
      socket.destroy()
      resolve(open)
    }
    socket.setTimeout(300)
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
    socket.once('timeout', () => finish(false))
  })
}

/** Validate every step before any command is started. */
export async function validateProfile(project: Project, profile: LaunchProfile): Promise<void> {
  projectSchema.parse(project)
  profileSchema.parse(profile)
  const tools = await listTools()
  const ports = new Set<number>()
  for (const step of profile.steps) {
    const folder = project.folders.find((folder) => folder.id === step.folderId)
    if (!folder) throw new Error(`${step.name}: folder no longer exists in this project`)
    const path = await allowedPath(folder.path, getActiveRoots())
    if (!(await fs.stat(path)).isDirectory())
      throw new Error(`${step.name}: working directory does not exist`)
    if (step.kind === 'tool') {
      const tool = tools.find((tool) => tool.id === step.toolId)
      if (!tool) throw new Error(`${step.name}: tool no longer exists`)
      if (step.modeId && !tool.modes?.some((mode) => mode.id === step.modeId))
        throw new Error(`${step.name}: tool mode no longer exists`)
      if (step.readyPort && resolveLaunchMode(effectiveTool(tool, step.modeId)) === 'external') {
        throw new Error(`${step.name}: readiness checks require an embedded terminal`)
      }
    }
    if (step.readyPort) {
      if (ports.has(step.readyPort) || (await portOpen(step.readyPort)))
        throw new Error(`${step.name}: port ${step.readyPort} is already in use`)
      ports.add(step.readyPort)
    }
  }
}

export async function waitReady(port: number, timeoutSeconds: number, sessionId: string): Promise<void> {
  const deadline = Date.now() + timeoutSeconds * 1000
  while (Date.now() < deadline) {
    if (!ptyManager.list().some((session) => session.id === sessionId && session.alive))
      throw new Error('Terminal stopped before the service was ready')
    if (await portOpen(port)) return
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error(`Timed out waiting for 127.0.0.1:${port}`)
}
