import { describe, it, expect } from 'vitest'
import { permissionArgs } from '@core/claude-runner'

describe('permissionArgs', () => {
  it('maps bypass to --dangerously-skip-permissions (the unattended default)', () => {
    expect(permissionArgs('bypass')).toEqual(['--dangerously-skip-permissions'])
  })

  it('maps acceptEdits to --permission-mode acceptEdits', () => {
    expect(permissionArgs('acceptEdits')).toEqual(['--permission-mode', 'acceptEdits'])
  })

  it('maps default to --permission-mode default', () => {
    expect(permissionArgs('default')).toEqual(['--permission-mode', 'default'])
  })
})
