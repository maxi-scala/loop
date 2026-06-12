// shared/release.ts — pure helpers for the assisted updater. We read the public
// `releases.atom` feed (github.com) rather than the REST API (api.github.com),
// because the unauthenticated REST API is rate-limited to 60 req/hr per IP — easily
// exhausted behind a shared/corporate NAT (it returns 403). The atom feed isn't
// subject to that limit. Asset URLs are derived deterministically from the tag, so
// no API call is needed. No node/electron imports → unit-testable under vitest.
import type { UpdateInfo } from './types'

/** Strip a leading "v" and parse "X.Y.Z" into numeric parts (pre-release suffix ignored). */
function parts(version: string): number[] {
  const core = version.trim().replace(/^v/i, '').split(/[-+]/)[0]
  return core.split('.').map((n) => {
    const v = Number.parseInt(n, 10)
    return Number.isFinite(v) ? v : 0
  })
}

/** Compare two "X.Y.Z" versions: -1 if a<b, 0 if equal, 1 if a>b. */
export function compareSemver(a: string, b: string): number {
  const pa = parts(a)
  const pb = parts(b)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x !== y) {
      return x > y ? 1 : -1
    }
  }
  return 0
}

/** True when `latest` is a strictly newer version than `current`. */
export function isNewer(latest: string, current: string): boolean {
  return compareSemver(latest, current) > 0
}

/** Node's process.arch values we ship DMGs for. */
export type AppArch = 'arm64' | 'x64'

/** A release entry parsed out of the GitHub releases.atom feed. */
export type AtomRelease = {
  /** Git tag, e.g. "v0.1.4". */
  tag: string
  /** Tag without the leading "v", e.g. "0.1.4". */
  version: string
  /** Release page URL (…/releases/tag/<tag>). */
  releaseUrl: string
}

/**
 * Parse the GitHub releases.atom feed. Each release shows up as a
 * `<link … href="https://github.com/<owner>/<repo>/releases/tag/<tag>"/>`; we pull
 * the tag out of those hrefs (more reliable than the human `<title>`).
 */
export function parseReleasesAtom(xml: string): AtomRelease[] {
  const out: AtomRelease[] = []
  const seen = new Set<string>()
  const re = /href="([^"]*\/releases\/tag\/([^"]+))"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    const releaseUrl = m[1]
    const tag = decodeURIComponent(m[2])
    if (seen.has(tag)) {
      continue
    }
    seen.add(tag)
    out.push({ tag, version: tag.replace(/^v/i, ''), releaseUrl })
  }
  return out
}

/** Pick the highest-versioned release (atom order isn't guaranteed to be sorted). */
export function pickLatestRelease(releases: AtomRelease[]): AtomRelease | null {
  return releases.reduce<AtomRelease | null>((best, r) => {
    return !best || compareSemver(r.version, best.version) > 0 ? r : best
  }, null)
}

/** DMG filename for a version + arch — matches config/electron-builder.config.cjs artifactName. */
export function dmgAssetName(version: string, arch: AppArch): string {
  return `Loop-${version}-${arch}.dmg`
}

/**
 * Build an UpdateInfo from the latest atom release. `available` is true only when
 * the release is strictly newer than `currentVersion`. The .dmg download URL is
 * derived from the release tag URL (…/releases/tag/<tag> → …/releases/download/
 * <tag>/<assetName>), which 302-redirects to the signed asset CDN. `checkedAt` is
 * supplied by the caller so this stays pure/deterministic for tests.
 */
export function buildUpdateInfo(
  latest: AtomRelease | null,
  currentVersion: string,
  arch: AppArch,
  checkedAt: string
): UpdateInfo {
  if (!latest) {
    return {
      currentVersion,
      latestVersion: null,
      available: false,
      releaseUrl: null,
      assetUrl: null,
      assetName: null,
      notes: null,
      checkedAt
    }
  }
  const available = isNewer(latest.version, currentVersion)
  const assetName = dmgAssetName(latest.version, arch)
  const assetUrl = `${latest.releaseUrl.replace('/releases/tag/', '/releases/download/')}/${assetName}`
  return {
    currentVersion,
    latestVersion: latest.version,
    available,
    releaseUrl: latest.releaseUrl,
    assetUrl,
    assetName,
    notes: null,
    checkedAt
  }
}
