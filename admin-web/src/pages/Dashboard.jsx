import { useEffect, useState } from 'react'
import { getInvoices, getReport, getUsers, isAuthError, errorMessage } from '../services/api'
import { Empty, ErrorState, Loading } from '../components/Feedback'
import { useAuth } from '../auth/AuthContext'
import { useNavigate } from 'react-router-dom'

const money = (value) => `Rs ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const date = (value) => value ? new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'

export default function Dashboard() {
  const [data, setData] = useState(null); const [error, setError] = useState(''); const [loading, setLoading] = useState(true)
  const { signOut } = useAuth(); const navigate = useNavigate()
  async function load() { setLoading(true); setError(''); try { const [invoiceData, users, report] = await Promise.all([getInvoices(), getUsers(), getReport()]); setData({ invoices: invoiceData.invoices || [], totalAmount: invoiceData.totalAmount || 0, users, report: report.report || [] }) } catch (err) { if (isAuthError(err)) { signOut(); navigate('/login') } else setError(errorMessage(err, 'Unable to load dashboard data.')) } finally { setLoading(false) } }
  useEffect(() => { load() }, [])
  if (loading) return <Loading label="Loading live dashboard data..." />
  if (error) return <ErrorState message={error} onRetry={load} />
  const admins = data.users.filter((user) => user.role === 'admin').length
  const recent = [...data.invoices].sort((a, b) => new Date(b.created_at || b.invoice_date) - new Date(a.created_at || a.invoice_date)).slice(0, 5)
  return <div className="content-stack"><div className="page-intro"><div><p className="eyebrow">Overview</p><h2>Good to see you, administrator.</h2><p className="muted">A live snapshot of your invoice operation.</p></div><button className="button button-secondary" onClick={load}>Refresh data</button></div><div className="metric-grid"><Metric label="Total invoices" value={data.invoices.length} note="Across all users" tone="blue" /><Metric label="Invoice value" value={money(data.totalAmount)} note="Current records" tone="green" /><Metric label="Total users" value={data.users.length} note={`${admins} administrator${admins === 1 ? '' : 's'}`} tone="orange" /><Metric label="Today activity" value={data.report.reduce((sum, row) => sum + Number(row.invoiceCount || 0), 0)} note="Invoices reported today" tone="pink" /></div><section className="panel"><div className="panel-heading"><div><h3>Recent invoices</h3><p className="muted">The latest records from the backend.</p></div><button className="text-button" onClick={() => navigate('/invoices')}>View all →</button></div>{recent.length ? <div className="table-wrap"><table><thead><tr><th>Invoice</th><th>Vendor</th><th>Added by</th><th>Date</th><th className="align-right">Amount</th></tr></thead><tbody>{recent.map((invoice) => <tr key={invoice.id}><td><strong>{invoice.title}</strong><span className="table-sub">{invoice.category}</span></td><td>{invoice.vendor}</td><td>{invoice.user_name || 'Unknown'}</td><td>{date(invoice.invoice_date)}</td><td className="align-right amount">{money(invoice.amount)}</td></tr>)}</tbody></table></div> : <Empty title="No invoices yet" />}</section></div>
}

function Metric({ label, value, note, tone }) { return <article className={`metric-card tone-${tone}`}><div className="metric-mark" /><p>{label}</p><strong>{value}</strong><span>{note}</span></article> }