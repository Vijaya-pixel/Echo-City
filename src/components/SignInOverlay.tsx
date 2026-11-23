/**
 * The SDK sign-in popup, titled for Echo City, plus a "Play as guest" option.
 *
 * DeepSpace doesn't allow anonymous or self-created accounts, so the guest
 * option opens /guest: a full round against AI players that runs in the
 * browser (nothing saved). The button floats just above the popup's backdrop.
 */

import { AuthOverlay } from 'deepspace'
import { Link } from 'react-router-dom'

export function SignInOverlay({ onClose }: { onClose: () => void }) {
  return (
    <>
      <AuthOverlay onClose={onClose} title="Sign in to Echo City" description="Play with friends and keep your stats. You sign in through DeepSpace, the platform Echo City runs on." />
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[100000] flex justify-center px-4">
        <Link
          to="/guest"
          onClick={onClose}
          className="pointer-events-auto rounded-full border border-white/20 bg-[#0e1233] px-5 py-2.5 text-sm font-semibold text-foreground shadow-[0_10px_30px_-10px_rgb(0_0_0/0.8)] transition-colors hover:border-hero hover:text-hero"
        >
          No account? <span className="text-hero">Play as guest →</span>
        </Link>
      </div>
    </>
  )
}
