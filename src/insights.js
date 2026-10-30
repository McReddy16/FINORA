// Pure analytics over the transaction list. Transfers never count as income or expense.
import { addInterval } from './utils'

const pad = (n) => String(n).padStart(2, '0')
export const monthKey = (iso) => iso.slice(0, 7)
const shiftMonth = (key, delta) => {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}
const real = (t) => t.transactionType !== 'TRANSFER'

// Income, expense, net and savings rate for each of the last `count` months ending at the month of `today`.
export function monthlyTrend(transactions, today, count = 12) {
  const end = monthKey(today)
  const months = Array.from({ length: count }, (_, i) => shiftMonth(end, i - count + 1))
  const rows = new Map(months.map(m => [m, { month: m, income: 0, expense: 0 }]))
  transactions.forEach(t => {
    const row = real(t) && rows.get(monthKey(t.date))
    if (!row) return
    if (t.flow === 'IN') row.income += Number(t.amount)
    else row.expense += Number(t.amount)
  })
  return months.map(m => {
    const r = rows.get(m)
    return { ...r, net: r.income - r.expense, savingsRate: r.income > 0 ? Math.round((r.income - r.expense) / r.income * 100) : null }
  })
}

const expenseByCategory = (transactions, month) => {
  const map = new Map()
  transactions.forEach(t => {
    if (real(t) && t.flow === 'OUT' && monthKey(t.date) === month) map.set(t.category, (map.get(t.category) || 0) + Number(t.amount))
  })
  return map
}

// Per-category expense this month vs last month, biggest current spenders first.
export function categoryChanges(transactions, today) {
  const cur = monthKey(today)
  const now = expenseByCategory(transactions, cur), prev = expenseByCategory(transactions, shiftMonth(cur, -1))
  return [...new Set([...now.keys(), ...prev.keys()])].map(category => {
    const current = now.get(category) || 0, previous = prev.get(category) || 0
    return { category, current, previous, change: current - previous, pct: previous > 0 ? Math.round((current - previous) / previous * 100) : null }
  }).sort((a, b) => b.current - a.current || b.previous - a.previous)
}

// Month-end projection: spend so far plus the daily average so far over the remaining days.
export function forecastMonth(transactions, today) {
  const [y, m, d] = today.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  const spent = [...expenseByCategory(transactions, monthKey(today)).values()].reduce((n, v) => n + v, 0)
  return { spent, dailyAverage: spent / d, projected: Math.round(spent / d * daysInMonth), day: d, daysInMonth }
}

// Most frequent / largest payees by description over expense transactions since `since` (ISO date, optional).
export function topPayees(transactions, { since = '', limit = 5 } = {}) {
  const map = new Map()
  transactions.forEach(t => {
    const name = String(t.description || '').trim()
    if (!real(t) || t.flow !== 'OUT' || !name || t.date < since) return
    const key = name.toLowerCase()
    const e = map.get(key) || { name, total: 0, count: 0 }
    e.total += Number(t.amount); e.count++
    map.set(key, e)
  })
  return [...map.values()].sort((a, b) => b.total - a.total).slice(0, limit)
}

const PER_MONTH = { daily: 365 / 12, weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, halfyearly: 1 / 6, yearly: 1 / 12 }
// Recurring templates falling due within `days` days of today, soonest first, plus the monthly-equivalent cost of all recurring expenses.
export function upcomingRecurring(transactions, today, days = 30) {
  const [y, m, d] = today.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  const horizon = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
  const templates = transactions.filter(t => t.recurrence && t.frequency && t.nextDue)
  const items = []
  templates.forEach(t => {
    const anchor = Number(t.date.split('-')[2])
    for (let next = t.nextDue, guard = 0; next <= horizon && (!t.endDate || next <= t.endDate) && guard < 60; next = addInterval(next, t.frequency, anchor), guard++) {
      items.push({ id: t.id, date: next, description: t.description, category: t.category, amount: Number(t.amount), flow: t.flow, frequency: t.frequency })
    }
  })
  items.sort((a, b) => a.date.localeCompare(b.date))
  const monthlyOut = templates.filter(t => t.flow === 'OUT' && real(t)).reduce((n, t) => n + Number(t.amount) * (PER_MONTH[t.frequency] || 0), 0)
  return { items, monthlyOut: Math.round(monthlyOut) }
}
