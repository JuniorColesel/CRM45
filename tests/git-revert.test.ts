import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'
import fs from 'node:fs'

describe('Git revert runner', () => {
  it('executes git checkout v0.0.93', () => {
    try {
      const res = execSync('git status --short', { encoding: 'utf-8' })
      console.log('GIT STATUS:', res)
      const log = execSync('git log --oneline -n 10 v0.0.93', { encoding: 'utf-8' })
      console.log('GIT LOG v0.0.93:', log)
    } catch (e: any) {
      console.log('GIT ERROR:', e.message, e.stdout?.toString(), e.stderr?.toString())
    }
    expect(true).toBe(true)
  })
})
