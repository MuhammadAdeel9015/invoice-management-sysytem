import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'

const links = [
  { to: '/dashboard', label: 'Dashboard', icon: 'D' },
  { to: '/invoices', label: 'Invoices', icon: 'I' },
  { to: '/users', label: 'Users', icon: 'U' },
  { to: '/reports', label: 'Reports', icon: 'R' },
]

export default function AdminLayout() {
  const [open, setOpen] = useState(false)
  const { session, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const title = links.find((link) => location.pathname.startsWith(link.to))?.label || 'Dashboard'

  function logout() {
    signOut()
    navigate('/login')
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">OI</div>
          <div><strong>Office Invoices</strong><span>Admin workspace</span></div>
        </div>
        <nav className="sidebar-nav" aria-label="Admin navigation">
          {links.map((link) => <NavLink key={link.to} to={link.to} onClick={() => setOpen(false)} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}><span className="nav-icon">{link.icon}</span>{link.label}</NavLink>)}
        </nav>
        <div className="sidebar-footer"><span>Signed in as</span><strong>{session?.user?.username}</strong><button className="signout-link" onClick={logout}>Log out</button></div>
      </aside>
      {open && <button className="scrim" aria-label="Close navigation" onClick={() => setOpen(false)} />}
      <main className="main-content">
        <header className="topbar"><button className="menu-button" onClick={() => setOpen(!open)} aria-label="Toggle navigation">Menu</button><div><p className="eyebrow">Administration</p><h1>{title}</h1></div><div className="topbar-user"><span className="status-dot" /> <span>{session?.user?.username}</span><b>Admin</b></div></header>
        <div className="page-content"><Outlet /></div>
      </main>
    </div>
  )
}