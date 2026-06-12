import { describe, it, expect } from 'vitest'
import {
  compareSemver,
  isNewer,
  parseReleasesAtom,
  pickLatestRelease,
  dmgAssetName,
  buildUpdateInfo,
  type AtomRelease
} from '@shared/release'

// Trimmed, structurally-faithful sample of github.com/<owner>/<repo>/releases.atom.
const ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Release notes from loop</title>
  <updated>2026-06-12T16:22:59Z</updated>
  <entry>
    <id>tag:github.com,2008:Repository/1/v0.1.4</id>
    <updated>2026-06-12T16:25:03Z</updated>
    <link rel="alternate" type="text/html" href="https://github.com/maxi-scala/loop/releases/tag/v0.1.4"/>
    <title>v0.1.4</title>
  </entry>
  <entry>
    <id>tag:github.com,2008:Repository/1/v0.1.3</id>
    <updated>2026-06-12T15:16:23Z</updated>
    <link rel="alternate" type="text/html" href="https://github.com/maxi-scala/loop/releases/tag/v0.1.3"/>
    <title>v0.1.3</title>
  </entry>
</feed>`

describe('compareSemver / isNewer', () => {
  it('treats equal versions as equal', () => {
    expect(compareSemver('0.1.3', '0.1.3')).toBe(0)
    expect(isNewer('0.1.3', '0.1.3')).toBe(false)
  })

  it('orders by major, minor, patch', () => {
    expect(compareSemver('0.2.0', '0.1.9')).toBe(1)
    expect(compareSemver('1.0.0', '0.9.9')).toBe(1)
    expect(compareSemver('0.1.2', '0.1.3')).toBe(-1)
  })

  it('compares multi-digit segments numerically (not lexically)', () => {
    expect(isNewer('0.10.0', '0.9.0')).toBe(true)
    expect(compareSemver('0.10.0', '0.2.0')).toBe(1)
  })

  it('tolerates a leading v and pre-release suffixes', () => {
    expect(isNewer('v0.2.0', '0.1.0')).toBe(true)
    expect(compareSemver('0.2.0-rc.1', '0.2.0')).toBe(0)
  })
})

describe('parseReleasesAtom', () => {
  it('extracts tags + release URLs from the feed', () => {
    const releases = parseReleasesAtom(ATOM)
    expect(releases).toEqual([
      {
        tag: 'v0.1.4',
        version: '0.1.4',
        releaseUrl: 'https://github.com/maxi-scala/loop/releases/tag/v0.1.4'
      },
      {
        tag: 'v0.1.3',
        version: '0.1.3',
        releaseUrl: 'https://github.com/maxi-scala/loop/releases/tag/v0.1.3'
      }
    ])
  })

  it('returns an empty array when there are no releases', () => {
    expect(parseReleasesAtom('<feed><title>none</title></feed>')).toEqual([])
  })
})

describe('pickLatestRelease', () => {
  it('returns the highest-versioned release regardless of feed order', () => {
    const releases: AtomRelease[] = [
      { tag: 'v0.1.3', version: '0.1.3', releaseUrl: 'u3' },
      { tag: 'v0.10.0', version: '0.10.0', releaseUrl: 'u10' },
      { tag: 'v0.9.0', version: '0.9.0', releaseUrl: 'u9' }
    ]
    expect(pickLatestRelease(releases)?.version).toBe('0.10.0')
  })

  it('returns null for an empty list', () => {
    expect(pickLatestRelease([])).toBeNull()
  })
})

describe('dmgAssetName', () => {
  it('matches the electron-builder artifactName', () => {
    expect(dmgAssetName('0.1.4', 'arm64')).toBe('Loop-0.1.4-arm64.dmg')
    expect(dmgAssetName('0.1.4', 'x64')).toBe('Loop-0.1.4-x64.dmg')
  })
})

describe('buildUpdateInfo', () => {
  const latest = pickLatestRelease(parseReleasesAtom(ATOM))
  const at = '2026-06-12T00:00:00.000Z'

  it('reports available and derives the .dmg download URL from the tag', () => {
    const info = buildUpdateInfo(latest, '0.1.3', 'arm64', at)
    expect(info.available).toBe(true)
    expect(info.latestVersion).toBe('0.1.4')
    expect(info.releaseUrl).toBe('https://github.com/maxi-scala/loop/releases/tag/v0.1.4')
    expect(info.assetName).toBe('Loop-0.1.4-arm64.dmg')
    expect(info.assetUrl).toBe(
      'https://github.com/maxi-scala/loop/releases/download/v0.1.4/Loop-0.1.4-arm64.dmg'
    )
    expect(info.checkedAt).toBe(at)
  })

  it('is not available when current version is the latest', () => {
    expect(buildUpdateInfo(latest, '0.1.4', 'arm64', at).available).toBe(false)
  })

  it('handles no releases', () => {
    const info = buildUpdateInfo(null, '0.1.3', 'arm64', at)
    expect(info.available).toBe(false)
    expect(info.latestVersion).toBeNull()
    expect(info.assetUrl).toBeNull()
  })
})
