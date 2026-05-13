import { Link, useLocation } from '@tanstack/react-router';

// Global top-of-page navigation. Rendered above the route outlet by rootRoute.
//
// "Encounter builder" is intentionally absent — it's scoped to a campaign id
// and has no sensible link target without one.

type NavLink = { to: string; label: string; matchPrefix?: string };

const LINKS: NavLink[] = [
  { to: '/', label: 'Home' },
  { to: '/campaigns', label: 'Campaigns', matchPrefix: '/campaigns' },
  { to: '/characters', label: 'Characters', matchPrefix: '/characters' },
  { to: '/foes', label: 'Foes', matchPrefix: '/foes' },
];

export function Nav() {
  const { pathname } = useLocation();

  const isActive = (link: NavLink): boolean => {
    if (link.matchPrefix) return pathname.startsWith(link.matchPrefix);
    // Plain Home is only active on the exact root path (otherwise it'd
    // light up everywhere because "/" is a prefix of every other route).
    return pathname === link.to;
  };

  return (
    <nav className="border-b border-neutral-800 bg-neutral-950">
      <div className="mx-auto max-w-6xl flex items-center gap-6 px-4 sm:px-6 h-14">
        <Link
          to="/"
          className="text-lg font-semibold tracking-tight text-neutral-100 hover:text-white"
        >
          Ironyard
        </Link>
        <ul className="flex items-center gap-1 sm:gap-2">
          {LINKS.map((link) => {
            const active = isActive(link);
            return (
              <li key={`${link.label}-${link.to}`}>
                <Link
                  to={link.to}
                  className={`inline-flex items-center min-h-11 px-3 rounded-md text-sm transition-colors ${
                    active
                      ? 'bg-neutral-800 text-neutral-100'
                      : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
                  }`}
                  aria-current={active ? 'page' : undefined}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
