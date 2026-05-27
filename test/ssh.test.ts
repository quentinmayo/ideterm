import { describe, expect, it } from 'vitest'
import { buildSshCommand } from '../src/main/services/ssh'

describe('buildSshCommand', () => {
  it('builds a basic user@host command', () => {
    const { command, warnings } = buildSshCommand({ host: 'example.com', user: 'deploy', port: 22 })
    expect(command).toBe('ssh deploy@example.com')
    expect(warnings).toHaveLength(0)
  })

  it('omits the default port but includes a custom one', () => {
    expect(buildSshCommand({ host: 'h', user: 'u', port: 22 }).command).toBe('ssh u@h')
    expect(buildSshCommand({ host: 'h', user: 'u', port: 2222 }).command).toBe('ssh -p 2222 u@h')
  })

  it('adds identity file (quoted when spaced) and warns if missing', () => {
    const res = buildSshCommand({ host: 'h', user: 'u', identityFile: 'C:\\My Keys\\id_ed25519' })
    expect(res.command).toContain('-i "C:\\My Keys\\id_ed25519"')
    expect(res.warnings.some((w) => w.includes('Identity file not found'))).toBe(true)
  })

  it('adds -A for agent forwarding and appends a remote command', () => {
    const res = buildSshCommand({ host: 'h', user: 'u', forwardAgent: true, remoteCommand: 'docker ps' })
    expect(res.command).toBe('ssh -A u@h docker ps')
  })

  it('warns when the host is missing', () => {
    const res = buildSshCommand({ host: '' })
    expect(res.command).toContain('<host>')
    expect(res.warnings).toContain('Host is required.')
  })

  it('warns when no user is given', () => {
    const res = buildSshCommand({ host: 'example.com' })
    expect(res.command).toBe('ssh example.com')
    expect(res.warnings.some((w) => w.toLowerCase().includes('no user'))).toBe(true)
  })

  it('warns about spaces in the host', () => {
    expect(buildSshCommand({ host: 'bad host', user: 'u' }).warnings.some((w) => w.includes('spaces'))).toBe(
      true
    )
  })
})
