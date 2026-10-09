import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { LaunchProfile, Project } from '@shared/types'
import { useSession } from './Session'
import { useTerminals } from './Terminals'
import { useToast } from '../components/Toast'

export interface StepRun {
  id: string
  name: string
  status: 'pending' | 'starting' | 'ready' | 'launched' | 'failed' | 'skipped' | 'stopped'
  message?: string
  sessionId?: string
}
interface Run {
  busy: boolean
  steps: StepRun[]
  controller: AbortController
}
interface Value {
  runs: Record<string, Run>
  launch: (project: Project, profile: LaunchProfile) => Promise<void>
  stop: (key: string) => void
}
const Context = createContext<Value | null>(null)
export function useLaunchProfiles(): Value {
  return useContext(Context)!
}
export const profileKey = (project: Project, profile: LaunchProfile): string => `${project.id}:${profile.id}`

export function LaunchProfilesProvider({ children }: { children: ReactNode }): JSX.Element {
  const { workspaceId } = useSession()
  const terminals = useTerminals()
  const terminalRef = useRef(terminals)
  terminalRef.current = terminals
  const toast = useToast()
  const [runs, setRuns] = useState<Record<string, Run>>({})
  const current = useRef(runs)
  const update = (key: string, run: Run): void => {
    current.current = { ...current.current, [key]: run }
    setRuns(current.current)
  }
  useEffect(
    () => () => {
      for (const run of Object.values(current.current)) run.controller.abort()
      current.current = {}
      setRuns({})
    },
    [workspaceId]
  )

  const stop = (key: string): void => {
    const run = current.current[key]
    if (!run) return
    run.controller.abort()
    for (const step of run.steps) if (step.sessionId) terminalRef.current.closeSession(step.sessionId)
    for (const step of run.steps)
      step.status = step.sessionId ? 'stopped' : step.status === 'pending' ? 'skipped' : step.status
    update(key, run)
  }
  const launch = async (project: Project, profile: LaunchProfile): Promise<void> => {
    const key = profileKey(project, profile)
    const previous = current.current[key]
    if (
      previous?.busy ||
      previous?.steps.some((s) => s.sessionId && terminalRef.current.sessions[s.sessionId]?.alive)
    ) {
      toast('This profile is running. Stop its terminals before launching again.', 'error')
      return
    }
    const run: Run = {
      busy: true,
      controller: new AbortController(),
      steps: profile.steps.map((s) => ({ id: s.id, name: s.name, status: 'pending' }))
    }
    update(key, run)
    const publish = (): void => {
      if (current.current[key] === run) update(key, run)
    }
    const groupId = crypto.randomUUID()
    try {
      await window.api.launch.validateProfile(project, profile)
      for (let i = 0; i < profile.steps.length; i++) {
        if (run.controller.signal.aborted) break
        const step = profile.steps[i]
        const result = run.steps[i]
        result.status = 'starting'
        publish()
        const cwd = project.folders.find((f) => f.id === step.folderId)!.path
        const launched =
          step.kind === 'tool'
            ? await window.api.launch.tool(step.toolId!, cwd, step.modeId, step.env)
            : await window.api.launch.command(step.command!, cwd, step.name, step.env)
        if (!launched.ok) throw new Error(launched.message)
        if (launched.kind === 'terminal' && launched.session) {
          result.sessionId = launched.session.id
          if (run.controller.signal.aborted) {
            await window.api.pty.kill(launched.session.id)
            result.status = 'stopped'
            break
          }
          terminalRef.current.adoptSession(launched.session, groupId, `${project.name} · ${profile.name}`)
          publish()
          if (step.readyPort)
            await window.api.launch.waitReady(step.readyPort, step.timeoutSeconds ?? 30, launched.session.id)
        }
        if (run.controller.signal.aborted) {
          result.status = 'stopped'
          break
        }
        result.status = step.readyPort ? 'ready' : 'launched'
        result.message = step.readyPort ? `Listening on port ${step.readyPort}` : launched.message
        publish()
      }
    } catch (error) {
      const failed = run.steps.find((s) => s.status === 'starting') ?? run.steps[0]
      failed.status = run.controller.signal.aborted ? 'stopped' : 'failed'
      failed.message = String(error instanceof Error ? error.message : error).replace(
        /^Error invoking remote method '[^']+': (?:Error: )?/,
        ''
      )
      if (!run.controller.signal.aborted) toast(failed.message, 'error')
    } finally {
      for (const step of run.steps) if (step.status === 'pending') step.status = 'skipped'
      run.busy = false
      publish()
    }
  }
  return <Context.Provider value={{ runs, launch, stop }}>{children}</Context.Provider>
}
