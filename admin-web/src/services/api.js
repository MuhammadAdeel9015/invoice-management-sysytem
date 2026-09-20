import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  timeout: 10000,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export function isAuthError(error) {
  return error?.response?.status === 401 || error?.response?.status === 403
}

export function errorMessage(error, fallback = 'Something went wrong.') {
  return error?.response?.data?.error || error?.response?.data?.message || fallback
}

export async function login(username, password) {
  const { data } = await api.post('/login', { username, password })
  return data
}

export async function getInvoices(params = {}) {
  const { data } = await api.get('/api/invoices', { params })
  return data
}

export async function deleteInvoice(id) {
  return api.delete(`/api/invoices/${id}`)
}

export async function getUsers() {
  const { data } = await api.get('/api/admin/users')
  return data.users || []
}

export async function createUser(payload) {
  const { data } = await api.post('/api/admin/users', payload)
  return data
}

export async function getReport(params = {}) {
  const { data } = await api.get('/api/admin/reports/daily', { params })
  return data
}

export default api