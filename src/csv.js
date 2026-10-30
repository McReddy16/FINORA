import { isInvestmentCategory } from './categories'
// CSV export and bank-statement import helpers.
export const CSV_COLUMNS = ['date', 'account', 'category', 'description', 'amount', 'flow', 'transactionType', 'paymentMethod']

const quote = (v) => {
  const s = String(v ?? '')
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
// DD-MMM-YYYY (05-Mar-2026) is read as the same date by Excel in every locale, unlike 05/03/2026 or 2026-03-05.
const csvDate = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${m[3]}-${MONTHS[Number(m[2]) - 1]}-${m[1]}` : iso }

export function toCsv(transactions, accountName) {
  const rows = transactions.map(t => [csvDate(t.date), accountName(t.accountId), t.category, t.description || '', t.amount, t.flow, t.transactionType, t.paymentMethod || ''])
  return [CSV_COLUMNS, ...rows].map(r => r.map(quote).join(',')).join('\r\n')
}

export function parseCsv(text) {
  const src = text.replace(/^﻿/, '')
  const first = src.split(/\r?\n/, 1)[0]
  const delimiter = [',', ';', '\t'].map(d => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0]
  const rows = []
  let row = [], cell = '', inQuotes = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inQuotes) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') inQuotes = false
      else cell += c
    } else if (c === '"') inQuotes = true
    else if (c === delimiter) { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some(x => x.trim() !== '')) rows.push(row)
      row = []
    } else cell += c
  }
  row.push(cell)
  if (row.some(x => x.trim() !== '')) rows.push(row)
  return rows
}

const ALIASES = {
  date: ['date', 'txn date', 'transaction date', 'value date', 'posting date'],
  description: ['description', 'narration', 'details', 'particulars', 'remarks', 'memo'],
  amount: ['amount', 'amt'],
  debit: ['debit', 'withdrawal', 'withdrawal amt', 'withdrawals', 'dr'],
  credit: ['credit', 'deposit', 'deposit amt', 'deposits', 'cr'],
  flow: ['flow', 'type', 'dr/cr', 'cr/dr'],
  category: ['category'],
  account: ['account', 'account name'],
  paymentMethod: ['paymentmethod', 'payment method', 'mode'],
  transactionType: ['transactiontype', 'transaction type']
}

export function parseDate(value) {
  const s = String(value || '').trim()
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  let y, mo, d
  if (m) [, y, mo, d] = m
  else if ((m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/.exec(s))) {
    [, d, mo, y] = m
    if (y.length === 2) y = `20${y}`
  } else if ((m = /^(\d{1,2})[ -]([A-Za-z]{3})[a-z]*[ ,-]*(\d{2}|\d{4})$/.exec(s)) && MONTHS.some(x => x.toLowerCase() === m[2].toLowerCase())) {
    [, d, mo, y] = m
    mo = MONTHS.findIndex(x => x.toLowerCase() === mo.toLowerCase()) + 1
    if (y.length === 2) y = `20${y}`
  } else return null
  const date = new Date(Number(y), Number(mo) - 1, Number(d))
  if (date.getFullYear() !== Number(y) || date.getMonth() !== Number(mo) - 1 || date.getDate() !== Number(d)) return null
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function parseAmount(value) {
  let s = String(value ?? '').trim()
  if (!s) return null
  const negative = /^\(.*\)$/.test(s) || s.startsWith('-')
  s = s.replace(/[^\d.]/g, '')
  const n = Number(s)
  if (!s || !Number.isFinite(n)) return null
  return negative ? -n : n
}

const flowOf = (v) => {
  const s = String(v || '').trim().toLowerCase()
  if (['in', 'cr', 'credit', 'income', 'deposit'].includes(s)) return 'IN'
  if (['out', 'dr', 'debit', 'expense', 'withdrawal'].includes(s)) return 'OUT'
  return null
}

export const duplicateKey = (t) => `${t.date}|${Number(t.amount).toFixed(2)}|${t.flow}|${t.accountId}|${String(t.description || '').trim().toLowerCase()}`

// rows: output of parseCsv (first row is the header).
// Returns new records, rows skipped as duplicates of existing data, and invalid rows with reasons.
export function buildImport(rows, { accounts, defaultAccountId, categories, existing }) {
  if (rows.length < 2) return { records: [], duplicates: 0, invalid: [{ line: 1, reason: 'No data rows found.' }] }
  const header = rows[0].map(h => h.trim().toLowerCase())
  const col = Object.fromEntries(Object.entries(ALIASES).map(([k, names]) => [k, header.findIndex(h => names.includes(h))]))
  if (col.date < 0 || (col.amount < 0 && col.debit < 0 && col.credit < 0)) {
    return { records: [], duplicates: 0, invalid: [{ line: 1, reason: 'Need a date column and an amount (or debit/credit) column.' }] }
  }
  const seen = new Map()
  existing.forEach(t => seen.set(duplicateKey(t), (seen.get(duplicateKey(t)) || 0) + 1))
  const records = [], invalid = []
  let duplicates = 0
  rows.slice(1).forEach((r, idx) => {
    const line = idx + 2
    const get = k => (col[k] >= 0 ? (r[col[k]] ?? '').trim() : '')
    const date = parseDate(get('date'))
    if (!date) return invalid.push({ line, reason: 'Unrecognised date.' })
    let amount, flow
    const debit = parseAmount(get('debit')), credit = parseAmount(get('credit'))
    if (debit || credit) { flow = credit ? 'IN' : 'OUT'; amount = Math.abs(credit || debit) }
    else {
      const raw = parseAmount(get('amount'))
      if (raw === null || raw === 0) return invalid.push({ line, reason: 'Missing or zero amount.' })
      flow = flowOf(get('flow')) || (raw < 0 ? 'OUT' : 'IN')
      amount = Math.abs(raw)
    }
    const acct = accounts.find(a => a.name.toLowerCase() === get('account').toLowerCase())
    const accountId = acct?.id ?? defaultAccountId
    // Transfers (e.g. from a Finora export) stay transfers so they never count as income or expense.
    const transfer = get('transactionType').toUpperCase() === 'TRANSFER' || get('category').toLowerCase() === 'transfer'
    const category = transfer ? 'Transfer' : categories.find(c => c.toLowerCase() === get('category').toLowerCase()) || (flow === 'IN' ? 'Other income' : 'Other')
    const t = {
      date, amount, flow, accountId, category,
      transactionType: transfer ? 'TRANSFER' : isInvestmentCategory(category) ? 'INVESTMENT' : flow === 'IN' ? 'INCOME' : 'EXPENSE',
      paymentMethod: get('paymentMethod') || 'Bank Transfer',
      description: get('description').split(/\s+/).filter(Boolean).slice(0, 30).join(' '),
      recurrence: false
    }
    const key = duplicateKey(t)
    if (seen.get(key) > 0) { seen.set(key, seen.get(key) - 1); duplicates++; return }
    records.push(t)
  })
  // Link each outgoing transfer leg to a matching incoming one so they are deleted together.
  const open = records.filter(t => t.transactionType === 'TRANSFER' && t.flow === 'IN')
  records.filter(t => t.transactionType === 'TRANSFER' && t.flow === 'OUT').forEach((out, i) => {
    const j = open.findIndex(t => t.date === out.date && t.amount === out.amount && t.accountId !== out.accountId)
    if (j < 0) return
    out.transferId = open[j].transferId = `${Date.now().toString(36)}-csv${i}`
    open.splice(j, 1)
  })
  return { records, duplicates, invalid }
}
