// Display currency only: amounts are not converted when it changes.
export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'AUD', 'CAD', 'SGD', 'JPY', 'CNY', 'HKD', 'NZD', 'CHF', 'SEK', 'NOK', 'DKK', 'KRW', 'THB', 'MYR', 'IDR', 'PHP', 'VND', 'PKR', 'BDT', 'LKR', 'NPR', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR', 'ILS', 'TRY', 'ZAR', 'NGN', 'KES', 'EGP', 'BRL', 'MXN', 'ARS', 'CLP', 'COP', 'RUB', 'PLN', 'CZK', 'HUF']
let currency = (() => { try { return localStorage.getItem('finora-currency') || 'INR' } catch { return 'INR' } })()
if (!CURRENCIES.includes(currency)) currency = 'INR'
export const getCurrency = () => currency
export function setCurrency(code) {
  if (!CURRENCIES.includes(code)) return
  currency = code
  try { localStorage.setItem('finora-currency', code) } catch {}
}
export const CURRENCY_NAMES = { INR: 'Indian Rupee', USD: 'US Dollar', EUR: 'Euro', GBP: 'British Pound', AED: 'UAE Dirham', AUD: 'Australian Dollar', CAD: 'Canadian Dollar', SGD: 'Singapore Dollar', JPY: 'Japanese Yen', CNY: 'Chinese Yuan', HKD: 'Hong Kong Dollar', NZD: 'New Zealand Dollar', CHF: 'Swiss Franc', SEK: 'Swedish Krona', NOK: 'Norwegian Krone', DKK: 'Danish Krone', KRW: 'South Korean Won', THB: 'Thai Baht', MYR: 'Malaysian Ringgit', IDR: 'Indonesian Rupiah', PHP: 'Philippine Peso', VND: 'Vietnamese Dong', PKR: 'Pakistani Rupee', BDT: 'Bangladeshi Taka', LKR: 'Sri Lankan Rupee', NPR: 'Nepalese Rupee', SAR: 'Saudi Riyal', QAR: 'Qatari Riyal', KWD: 'Kuwaiti Dinar', BHD: 'Bahraini Dinar', OMR: 'Omani Rial', ILS: 'Israeli Shekel', TRY: 'Turkish Lira', ZAR: 'South African Rand', NGN: 'Nigerian Naira', KES: 'Kenyan Shilling', EGP: 'Egyptian Pound', BRL: 'Brazilian Real', MXN: 'Mexican Peso', ARS: 'Argentine Peso', CLP: 'Chilean Peso', COP: 'Colombian Peso', RUB: 'Russian Ruble', PLN: 'Polish Zloty', CZK: 'Czech Koruna', HUF: 'Hungarian Forint' }
const SYMBOL_OVERRIDES = { AED: 'د.إ', AUD: 'A$', CAD: 'C$', SGD: 'S$', NZD: 'NZ$', HKD: 'HK$', MXN: 'MX$', ARS: 'AR$', CLP: 'CL$', COP: 'CO$', CNY: 'CN¥' }
// Currencies shown without decimals.
const ZERO_DECIMAL = ['JPY', 'INR', 'KRW', 'VND', 'IDR', 'CLP', 'HUF', 'PKR']
export const symbolFor = (code) => SYMBOL_OVERRIDES[code] || new Intl.NumberFormat(code === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' }).formatToParts(0).find(p => p.type === 'currency')?.value || code
export const currencySymbol = () => new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).formatToParts(0).find(p => p.type === 'currency')?.value || currency
export const money = (value) => new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
  style: 'currency', currency, maximumFractionDigits: ZERO_DECIMAL.includes(currency) ? 0 : 2
}).format(Number(value || 0))

export const FREQUENCIES = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', halfyearly: 'Half-yearly', yearly: 'Yearly' }
const MONTH_STEP = { monthly: 1, quarterly: 3, halfyearly: 6, yearly: 12 }
const pad = (n) => String(n).padStart(2, '0')
const daysIn = (y, m) => new Date(y, m + 1, 0).getDate()
// Next occurrence after `iso`; anchorDay keeps "the 31st" from drifting to the 28th after February.
export function addInterval(iso, freq, anchorDay) {
  const [y, m, d] = iso.split('-').map(Number)
  const anchor = anchorDay || d
  if (freq === 'daily' || freq === 'weekly') { const dt = new Date(y, m - 1, d + (freq === 'daily' ? 1 : 7)); return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}` }
  const total = (m - 1) + (MONTH_STEP[freq] || 1)
  const ny = y + Math.floor(total / 12), nm = total % 12
  return `${ny}-${pad(nm + 1)}-${pad(Math.min(anchor, daysIn(ny, nm)))}`
}
// First occurrence strictly after today (never back-fills past dates).
export function firstDue(date, freq, today) {
  const anchor = Number(date.split('-')[2])
  let next = date, guard = 0
  do { next = addInterval(next, freq, anchor) } while (next <= today && ++guard < 5000)
  return next
}
// Occurrences that have come due by `today` (capped), plus the next due date after them.
export function dueOccurrences(template, today, cap = template.frequency === 'daily' ? 366 : 60) {
  const anchor = Number(template.date.split('-')[2])
  const dates = []
  let next = template.nextDue
  const end = template.endDate || ''
  while (next && next <= today && (!end || next <= end) && dates.length < cap) { dates.push(next); next = addInterval(next, template.frequency, anchor) }
  if (dates.length === cap) next = firstDue(dates[cap - 1], template.frequency, today)
  // Past the optional end date the series is finished: no further occurrences are scheduled.
  if (end && next > end) next = null
  return { dates, nextDue: next }
}

export const dateLabel = (value) => {
  if (!value) return '—'
  const d = new Date(`${value}T00:00:00`)
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
export const dateDMY = (value) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (value || '—')
}
export const sum = (items, predicate) => items.filter(predicate).reduce((total, item) => total + Number(item.amount || 0), 0)
export function downloadText(filename, text, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
export const isTransfer = (t) => t.transactionType === 'TRANSFER'

// Validates a parsed Finora backup and throws a readable Error on the first bad record.
export function validateBackup(data) {
  const fail = (msg) => { throw new Error(msg) }
  if (!data || data.app !== 'Finora' || !Array.isArray(data.accounts) || !Array.isArray(data.transactions) || !Array.isArray(data.notes)) fail('This is not a valid Finora backup.')
  const budgets = data.budgets === undefined ? [] : data.budgets
  if (!Array.isArray(budgets)) fail('Backup budgets are malformed.')
  const accountIds = new Set()
  data.accounts.forEach((a, i) => {
    if (!a || typeof a.name !== 'string' || !a.name.trim()) fail(`Account #${i + 1} has no name.`)
    if (!['bank', 'cash'].includes(a.type)) fail(`Account "${a.name}" has an unknown type.`)
    if (!Number.isFinite(Number(a.openingBalance ?? 0))) fail(`Account "${a.name}" has an invalid opening balance.`)
    accountIds.add(a.id)
  })
  data.transactions.forEach((t, i) => {
    const n = i + 1
    if (!t || !/^\d{4}-\d{2}-\d{2}$/.test(t.date || '')) fail(`Transaction #${n} has an invalid date.`)
    if (!(Number(t.amount) > 0)) fail(`Transaction #${n} has an invalid amount.`)
    if (!['IN', 'OUT'].includes(t.flow)) fail(`Transaction #${n} has an invalid flow.`)
    if (!accountIds.has(t.accountId)) fail(`Transaction #${n} refers to a missing account.`)
  })
  data.notes.forEach((n, i) => { if (!n || typeof n !== 'object') fail(`Note #${i + 1} is malformed.`) })
  const seen = new Set()
  budgets.forEach((b, i) => {
    if (!b || typeof b.category !== 'string' || !(Number(b.limit) > 0)) fail(`Budget #${i + 1} is invalid.`)
    if (seen.has(b.category)) fail(`Budget category "${b.category}" appears twice.`)
    seen.add(b.category)
  })
  const goals = data.goals === undefined ? [] : data.goals
  const categories = data.categories === undefined ? [] : data.categories
  if (!Array.isArray(goals) || !Array.isArray(categories)) fail('Backup goals or categories are malformed.')
  goals.forEach((g, i) => { if (!g || typeof g.name !== 'string' || !(Number(g.target) > 0) || !Number.isFinite(Number(g.saved ?? 0))) fail(`Goal #${i + 1} is invalid.`) })
  categories.forEach((c, i) => { if (!c || typeof c.name !== 'string' || !c.name.trim()) fail(`Category #${i + 1} is invalid.`) })
  const events = data.events === undefined ? [] : data.events
  if (!Array.isArray(events)) fail('Backup calendar events are malformed.')
  events.forEach((e, i) => { if (!e || typeof e.title !== 'string' || !e.title.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(e.date || '')) fail(`Calendar event #${i + 1} is invalid.`) })
  return { ...data, budgets, goals, categories, events }
}
// Downscales large photos before they go into IndexedDB. Falls back to the original file
// for formats canvas would flatten (GIF/SVG), on any failure, or when re-encoding does not save space.
export async function compressImage(file, maxSide = 1600, quality = 0.82) {
  const original = () => imageToDataUrl(file)
  if (!/^image\/(jpeg|png|webp|bmp)$/.test(file.type)) return original()
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close?.()
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality))
    if (!blob || (scale === 1 && blob.size >= file.size)) return original()
    return await imageToDataUrl(blob)
  } catch { return original() }
}
export function imageToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// Smart transaction search. Every space-separated term must match:
//   1, 9, 12 → day of month · 01, 04 → month · jan, april → month (or text) · 2026 → year (or amount)
//   15-4, 15/04 → day + month · 15-4-2026, 2026-04-15 → exact date · 4-2026 → month + year
//   500, 1,250.50, ₹500 → exact amount · recurring / one-time · daily…yearly → frequency
//   anything else → description, category, type, account or payment method
const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const validDM = (d, m) => d >= 1 && d <= 31 && m >= 1 && m <= 12
export function searchTerm(raw) {
  const s = raw.toLowerCase()
  let m
  if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s)) && validDM(+m[3], +m[2])) return { year: +m[1], month: +m[2], day: +m[3] }
  if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s)) && validDM(+m[1], +m[2])) return { day: +m[1], month: +m[2], year: +m[3] }
  if ((m = /^(\d{1,2})[-/.](\d{4})$/.exec(s)) && +m[1] >= 1 && +m[1] <= 12) return { month: +m[1], year: +m[2] }
  if ((m = /^(\d{1,2})[-/.](\d{1,2})$/.exec(s)) && validDM(+m[1], +m[2])) return { day: +m[1], month: +m[2] }
  if (/^0[1-9]$/.test(s)) return { month: +s }
  if (/^[1-9]$|^[12]\d$|^3[01]$/.test(s)) return { day: +s }
  if (/^(19|20)\d\d$/.test(s)) return { year: +s, amount: +s, text: s }
  const num = s.replace(/^[₹$€£¥]/, '').replace(/,/g, '')
  if (/^\d+(\.\d+)?$/.test(num)) return { amount: +num, text: s }
  if (s === 'recurring') return { recurring: true }
  if (s === 'one-time' || s === 'onetime') return { recurring: false }
  if (FREQUENCIES[s.replace('-', '')]) return { frequency: s.replace('-', ''), text: s }
  const month = s.length >= 3 ? MONTH_NAMES.findIndex(n => n.startsWith(s)) + 1 : 0
  return month ? { month, text: s } : { text: s }
}
const termMatches = (q, t, haystack) => {
  const [y, mo, d] = (t.date || '').split('-').map(Number)
  const date = (q.day == null || q.day === d) && (q.month == null || q.month === mo) && (q.year == null || q.year === y)
  const hasDate = q.day != null || q.month != null || q.year != null
  const isRecurring = !!(t.recurrence || t.recurringFrom)
  if (q.recurring != null) return isRecurring === q.recurring
  if (q.frequency && isRecurring && t.frequency === q.frequency) return true
  if (hasDate && date) return true
  if (q.amount != null && Math.abs(Number(t.amount) - q.amount) < 0.005) return true
  return !!q.text && haystack.includes(q.text)
}
// extraText: anything not stored on the transaction itself (account name, category group).
export function matchesSearch(t, query, extraText = '') {
  const terms = String(query || '').trim().split(/\s+/).filter(Boolean)
  if (!terms.length) return true
  const haystack = `${t.description || ''} ${t.category || ''} ${t.transactionType || ''} ${t.paymentMethod || ''} ${extraText}`.toLowerCase()
  return terms.every(raw => termMatches(searchTerm(raw), t, haystack))
}
