/**
 * Top nav — minimal placeholder bar wired to the app's mechanisms:
 * nav.ts-driven links (with role/dev filtering), sign-in via <AuthOverlay>,
 * and sign-out. Restyle or rebuild it freely; keep the data-testid hooks
 * (`app-navigation`, `nav-sign-in-button`, `nav-user-name`, `nav-user-email`)
 * — the shipped tests rely on them. `nav-user-email` is the one that carries
 * an identity the test can check exactly: a display name is optional, the
 * email is the credential the session was opened with.
 */

import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AuthOverlay, useAuthProfileReady, signOut } from 'deepspace'
import { ChevronDown, LogOut, Menu, X } from 'lucide-react'
import { APP_NAME } from '../constants'
import { Logo, TechnoText } from './Logo'
import type { Role } from '../constants'
import { nav } from '../nav'
import { cn } from '../lib/utils'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui'

/** Sign out. In local dev, also pause auto sign-in for this tab (compiled out in production). */
async function signOutAndStayOut() {
  if (import.meta.env.DEV) sessionStorage.setItem('echocity:dev-signed-out', '1')
  await signOut()
}

export default function Navigation() {
  const { isLoaded, isSignedIn, user, userLoading } = useAuthProfileReady({ requireUser: true })
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)

  const profileReady = !isSignedIn || (!userLoading && !!user)
  const userRole = (user?.role ?? 'anonymous') as Role | 'anonymous'

  // Close the mobile menu when navigating
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname])

  const visibleNav = nav.filter((item) => {
    if (item.devOnly && !import.meta.env.DEV) return false
    if (!item.roles) return true
    if (!profileReady) return false
    if (userRole === 'admin') return true
    return item.roles.includes(userRole as Role)
  })

  const navLink = (item: (typeof nav)[number]) => {
    const active = location.pathname.startsWith(item.path)
    return (
      <Link
        key={item.path}
        to={item.path}
        aria-current={active ? 'page' : undefined}
        className={cn('group relative flex h-16 items-center px-4 transition-opacity', active ? '' : 'opacity-60 hover:opacity-100')}
      >
        <TechnoText text={item.label} height={13} colors={[active ? '#ffffff' : '#c3c9ea']} label={item.label} />
        <span className="nav-underline absolute inset-x-4 bottom-4 h-[3px] rounded-full bg-hero shadow-[0_0_10px_var(--color-hero)]" aria-hidden />
      </Link>
    )
  }

  return (
    <>
      <nav data-testid="app-navigation" className="relative z-20 border-b border-white/10 bg-[#070915]">
        <div className="mx-auto grid h-16 max-w-7xl grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 sm:px-6">
          <Link to="/" className="justify-self-start" aria-label={`${APP_NAME} home`}>
            <Logo height={20} />
          </Link>

          <div className="hidden items-center md:flex">{visibleNav.map(navLink)}</div>

          <div className="flex items-center justify-self-end gap-2">

          {!isLoaded ? null : isSignedIn && !profileReady ? (
            /* Signed in, profile still loading — skeleton pill, never the
               Sign in button (that would offer sign-in to a signed-in user). */
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pl-1 pr-3">
              <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
              <div className="hidden h-4 w-20 animate-pulse rounded bg-muted sm:block" />
            </div>
          ) : isSignedIn && user ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    aria-label="Account menu"
                    className="group flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pl-1 pr-3 text-sm font-semibold transition-colors hover:bg-white/10"
                  >
                    <Avatar className="h-8 w-8 overflow-hidden rounded-full bg-white text-[#0b1026]">
                      <AvatarImage src={user.imageUrl ?? undefined} referrerPolicy="no-referrer" />
                      <AvatarFallback className="text-[11px]">
                        {(user.name?.[0] ?? user.email?.[0] ?? '?').toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span
                      data-testid="nav-user-name"
                      className="hidden max-w-[140px] truncate text-foreground sm:inline"
                    >
                      {user.name || user.email}
                    </span>
                    <ChevronDown
                      className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-150 group-data-[popup-open]:rotate-180"
                      aria-hidden
                    />
                  </button>
                }
              />
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="truncate font-medium text-foreground">
                    {user.name || 'Signed in'}
                  </div>
                  <div
                    data-testid="nav-user-email"
                    className="truncate text-xs font-normal text-muted-foreground"
                  >
                    {user.email}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void signOutAndStayOut()}>
                  <LogOut aria-hidden />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <button
              data-testid="nav-sign-in-button"
              onClick={() => setShowAuthModal(true)}
              className="btn-arcade !min-h-9 !py-1.5 !pl-4 !pr-8 !text-[11px] after:!right-3"
            >
              Sign in
            </button>
          )}

          <button
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-white/5 hover:text-foreground md:hidden"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label="Toggle menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="h-4 w-4" aria-hidden /> : <Menu className="h-4 w-4" aria-hidden />}
          </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="flex flex-col border-t border-white/10 px-2 py-2 md:hidden">
            {visibleNav.map(navLink)}
          </div>
        )}
      </nav>

      {showAuthModal && <AuthOverlay onClose={() => setShowAuthModal(false)} />}
    </>
  )
}
