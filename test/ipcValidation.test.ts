import { describe, expect, it } from 'vitest'
import { externalUrl, validateIpc } from '../src/main/services/ipcValidation'
import { profileSchema, parseSnapshot } from '../src/shared/validation'
describe('IPC boundary', () => {
  it('preserves mode IDs and environment overrides', () => {
    expect(validateIpc('launch:tool', ['tool', '/repo', 'review', { PORT: '3000' }])).toEqual([
      'tool',
      '/repo',
      'review',
      { PORT: '3000' }
    ])
  })
  it('rejects malformed terminal sizes, environment and unsafe URLs', () => {
    expect(() => validateIpc('pty:resize', ['id', -1, 20])).toThrow()
    expect(() => validateIpc('launch:tool', ['tool', '/repo', undefined, { 'BAD=NAME': 'x' }])).toThrow()
    expect(() => externalUrl('file:///etc/passwd')).toThrow()
    expect(() => externalUrl('javascript:alert(1)')).toThrow()
    expect(externalUrl('https://github.com/quentinmayo/ideterm')).toContain('https://github.com/')
  })
  it('rejects unsupported snapshots and invalid profiles', () => {
    expect(() => parseSnapshot({ version: 99 })).toThrow()
    expect(() => profileSchema.parse({ id: 'p', name: 'Develop', steps: [] })).toThrow()
    expect(() =>
      profileSchema.parse({
        id: 'p',
        name: 'Develop',
        steps: [{ id: 's', name: 'server', folderId: 'f', kind: 'command' }]
      })
    ).toThrow()
  })
})
