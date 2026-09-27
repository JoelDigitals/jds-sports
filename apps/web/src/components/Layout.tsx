import { useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.tsx';

const icons: Record<string, ReactNode> = {
  dashboard: (
    <path d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
  ),
  calendar: (
    <path d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
  ),
  upload: (
    <path d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
  ),
  receipt: (
    <path d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.697.05-.943.076M2.25 6.108c0-1.135.845-2.098 1.976-2.192a48.424 48.424 0 011.123-.08m0 0c.065.21.1.433.1.664 0 .414-.336.75-.75.75H4.5a.75.75 0 01-.75-.75 2.25 2.25 0 01.1-.664m0 0a48.44 48.44 0 011.123-.08M5.25 7.5h13.5v11.25H5.25z" />
  ),
  chart: (
    <path d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
  ),
  settings: (
    <path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.353.644.7.706a7.977 7.977 0 01.803.19c.334.1.708-.003.949-.262l.958-1.062c.36-.398.966-.426 1.36-.079l1.736 1.524c.394.347.422.953.079 1.36l-1.062.958c-.254.238-.357.611-.262.945.088.304.16.61.215.922.056.35.326.64.7.703l1.275.212c.543.09.94.56.94 1.11v2.593c0 .55-.397 1.02-.94 1.11l-1.275.212c-.374.063-.644.353-.706.7a7.958 7.958 0 01-.19.803c-.1.334.003.708.262.949l1.062.958c.398.36.426.966.079 1.36l-1.524 1.736c-.347.394-.953.422-1.36.079l-.958-1.062c-.238-.254-.611-.357-.945-.262a7.94 7.94 0 01-.922.215c-.35.056-.64.326-.703.7l-.212 1.275c-.09.543-.56.94-1.11.94h-2.593c-.55 0-1.02-.397-1.11-.94l-.212-1.275c-.063-.374-.353-.644-.7-.706a7.963 7.963 0 01-.803-.19c-.334-.1-.708.003-.949.262l-.958 1.062c-.36.398-.966.426-1.36.079l-1.736-1.524c-.394-.347-.422-.953-.079-1.36l1.062-.958c.254-.238.357-.611.262-.945a7.922 7.922 0 01-.215-.922c-.056-.35-.326-.64-.7-.703l-1.275-.212c-.543-.09-.94-.56-.94-1.11v-2.593c0-.55.397-1.02.94-1.11l1.275-.212c.374-.063.644-.353.706-.7.054-.27.115-.538.19-.803.1-.334-.003-.708-.262-.949l-1.062-.958c-.398-.36-.426-.966-.079-1.36l1.524-1.736c.347-.394.953-.422 1.36-.079l.958 1.062c.238.254.611.357.945.262a7.94 7.94 0 01.922-.215c.35-.056.64-.326.703-.7l.212-1.275z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  ),
  flag: (
    <path d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" stroke-linecap="round" stroke-linejoin="round" />
  ),
  logout: (
    <path d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
  ),
};

function Icon({ name }: { name: keyof typeof icons }) {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke-width="1.7" stroke="currentColor" aria-hidden="true">
      {icons[name]}
    </svg>
  );
}

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: 'dashboard', end: true },
  { to: '/einsaetze', label: 'Einsätze', icon: 'calendar', end: false },
  { to: '/import', label: 'Kalender-Import', icon: 'upload', end: false },
  { to: '/quittungen', label: 'Quittungen', icon: 'receipt', end: false },
  { to: '/auswertung', label: 'Auswertung', icon: 'chart', end: false },
  { to: '/einstellungen', label: 'Einstellungen', icon: 'settings', end: false },
] as const;

const ADMIN_NAV_ITEM = { to: '/flags', label: 'Feature-Flags', icon: 'flags', end: false } as const;

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
      isActive ? 'bg-orange-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
    }`;

  return (
    <div className="flex min-h-screen">
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-slate-900 transition-transform lg:static lg:translate-x-0 ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-600 font-black text-white">JDS</div>
          <div>
            <div className="text-sm font-bold text-white">JDS Sports</div>
            <div className="text-xs text-slate-400">Schiedsrichter-Spesen</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={navClass} onClick={() => setMenuOpen(false)}>
              <Icon name={item.icon} />
              {item.label}
            </NavLink>
          ))}
          {(user?.is_admin ?? 0) === 1 && (
            <NavLink to={ADMIN_NAV_ITEM.to} end={ADMIN_NAV_ITEM.end} className={navClass} onClick={() => setMenuOpen(false)}>
              <Icon name={ADMIN_NAV_ITEM.icon} />
              {ADMIN_NAV_ITEM.label}
            </NavLink>
          )}
        </nav>
        <div className="border-t border-slate-800 p-3">
          <div className="mb-2 px-3 text-xs text-slate-400">
            {user ? `${user.first_name} ${user.last_name}` : ''} · {user?.season}
          </div>
          <button
            onClick={() => {
              logout();
              navigate('/login');
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <Icon name="logout" />
            Abmelden
          </button>
        </div>
      </aside>

      {menuOpen && <div className="fixed inset-0 z-30 bg-slate-900/50 lg:hidden" onClick={() => setMenuOpen(false)} />}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
          <button
            onClick={() => setMenuOpen(true)}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
            aria-label="Menü öffnen"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="1.7" stroke="currentColor">
              <path d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" stroke-linecap="round" />
            </svg>
          </button>
          <div className="text-sm font-bold text-slate-900">JDS Sports</div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
        <footer className="px-6 py-4 text-center text-xs text-slate-400">
          JDS Sports · MVP Spesenabrechnung HVSaar · Regelwerk-Version wird in den Einstellungen angezeigt
        </footer>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
