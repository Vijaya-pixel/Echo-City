/**
 * Gated routes. Any file under src/pages/(app)/(protected)/ requires sign-in.
 * The `(protected)` folder is a Generouted route group — parentheses mean
 * it doesn't appear in the URL. For a dynamic page that does NOT require
 * sign-in, put it directly under src/pages/(app)/; for a static page, put it
 * at the top level of src/pages/.
 *
 * Children may call data hooks like `useUser()` safely because the parent
 * (app)/_layout.tsx mounts <RecordProvider> above this layout.
 *
 * The `fallback` keeps signed-out visitors inside the app's own chrome
 * (without it, AuthGate shows the SDK's full-screen, non-dismissible
 * overlay). The sign-in overlay opens on demand and can be dismissed.
 */

import { SignInOverlay } from '@/components/SignInOverlay'
import { useState } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { AuthGate } from 'deepspace'
import { Button } from '@/components/ui'

export default function ProtectedLayout() {
  return (
    // Signing out on a protected page lands on HQ's sign-in prompt
    // (the SDK default jumps to the static homepage, which felt broken).
    <AuthGate fallback={<SignedOutPanel />} redirectOnSignOut="/home">
      <Outlet />
    </AuthGate>
  )
}

function SignedOutPanel() {
  const [showAuthModal, setShowAuthModal] = useState(false)

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6 py-20">
      <div className="px-panel px-panel-hero w-full max-w-sm p-8 text-center">
        <h1 className="text-sm text-foreground">SIGN IN TO JOIN</h1>
        <p className="mt-3 text-muted-foreground">
          Sign in with Google or GitHub to join this room and play.
        </p>
        <Button className="mt-6 w-full" onClick={() => setShowAuthModal(true)}>
          Sign in
        </Button>
        <Link
          to="/"
          className="mt-4 inline-block text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Back to home
        </Link>
      </div>

      {showAuthModal && <SignInOverlay onClose={() => setShowAuthModal(false)} />}
    </div>
  )
}
