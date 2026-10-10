// Guards the release/auto-update wiring.
//
// The auto-updater polls GitHub Releases for the repo named here, and the
// release workflow publishes to whatever repo the push lands in — if these
// ever drift apart, updates silently 404 (that exact bug shipped once:
// package.json pointed at `fastfood/cashier` while releases went to
// `Ahmedabuseta/crunch-time`).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const pkg = JSON.parse(readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'))

const FEED_OWNER = 'Ahmedabuseta'
const FEED_REPO = 'crunch-time'

describe('release & auto-update config', () => {
  it('keeps the packaged app name — DB and updater data paths depend on it', () => {
    expect(pkg.name).toBe('fastfood-cashier')
  })

  it('points the update feed at the repo releases are published to', () => {
    expect(pkg.build.publish).toEqual(
      expect.objectContaining({ provider: 'github', owner: FEED_OWNER, repo: FEED_REPO }),
    )
    expect(pkg.homepage).toContain(`${FEED_OWNER}/${FEED_REPO}`)
    expect(pkg.repository.url).toContain(`${FEED_OWNER}/${FEED_REPO}`)
  })

  it('never deletes user data on uninstall', () => {
    expect(pkg.build.nsis?.deleteAppDataOnUninstall).toBeFalsy()
  })
})
