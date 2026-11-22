/**
 * Local-dev auto sign-in — skips the sign-in screen while testing features.
 *
 * Active only when `import.meta.env.DEV` is true AND VITE_DEV_PLAYERS is set
 * (in the gitignored .env.development.local). Production builds never include
 * the credentials and keep the normal sign-in flow.
 *
 * Pick a player with `?player=bob` in the URL. The
 * choice is remembered per tab (sessionStorage); the session cookie is shared
 * per browser, so to play as several heroes at once use separate browser
 * profiles / Incognito windows.
 */
import { useEffect, useRef, useState } from 'react'
import { signIn, signOut, useAuthStatus, useAuthUser } from 'deepspace'

export interface DevPlayer {
  name: string
  email: string
  password: string
}

const STORAGE_KEY = 'echocity:dev-player'

export const DEV_PLAYERS: DevPlayer[] = import.meta.env.DEV
  ? String(import.meta.env.VITE_DEV_PLAYERS ?? '')
      .split(',')
      .map((entry) => entry.trim().split(':'))
      .filter((parts) => parts.length >= 3)
      .map(([name, email, ...pw]) => ({ name, email, password: pw.join(':') }))
  : []

export const DEV_AUTO_SIGNIN = DEV_PLAYERS.length > 0

function findPlayer(name: string | null): DevPlayer | undefined {
  if (!name) return undefined
  return DEV_PLAYERS.find((p) => p.name.toLowerCase() === name.toLowerCase())
}

/** The player this tab should be signed in as. */
function desiredPlayer(): DevPlayer {
  const fromUrl = findPlayer(new URLSearchParams(window.location.search).get('player'))
  if (fromUrl) {
    sessionStorage.setItem(STORAGE_KEY, fromUrl.name)
    return fromUrl
  }
  return findPlayer(sessionStorage.getItem(STORAGE_KEY)) ?? DEV_PLAYERS[0]
}

/**
 * Signs the desired dev player in (or swaps to them) once auth has loaded.
 * Returns true while that is still in progress, so callers can hold the UI.
 */
export function useDevAutoSignIn(): { pending: boolean; error: string | null } {
  const { isLoaded, isSignedIn } = useAuthStatus()
  const { user } = useAuthUser()
  const email = user?.primaryEmailAddress?.emailAddress
  const [error, setError] = useState<string | null>(null)
  const busy = useRef(false)

  const target = DEV_AUTO_SIGNIN ? desiredPlayer() : undefined
  const wrongUser = !!(isSignedIn && email && target && email !== target.email)
  const pending = !!target && isLoaded && !error && (!isSignedIn || wrongUser)

  useEffect(() => {
    if (!pending || !target || busy.current) return
    busy.current = true
    void (async () => {
      try {
        if (wrongUser) await signOut()
        const res = await signIn.email({ email: target.email, password: target.password })
        if (res.error) setError(res.error.message ?? 'Dev auto sign-in failed')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Dev auto sign-in failed')
      } finally {
        busy.current = false
      }
    })()
  }, [pending, target?.email, wrongUser])

  return { pending, error }
}
