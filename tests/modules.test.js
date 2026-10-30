import { describe, expect, it } from 'vitest'
import { addInterval, dueOccurrences, firstDue, matchesSearch, validateBackup } from '../src/utils'
import { buildImport, parseCsv, toCsv } from '../src/csv'
import { decryptBackup, encryptBackup, isEncryptedBackup } from '../src/crypto'
import { derToRaw, verifyAssertion } from '../src/lock'
import { categoryChanges, forecastMonth, monthlyTrend, topPayees, upcomingRecurring } from '../src/insights'

const b64 = (buf) => Buffer.from(buf).toString('base64')
const b64url = (buf) => b64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

describe('recurrence', () => {
  it('keeps the anchor day across short months', () => {
    expect(addInterval('2026-01-31', 'monthly', 31)).toBe('2026-02-28')
    expect(addInterval('2026-02-28', 'monthly', 31)).toBe('2026-03-31')
    expect(addInterval('2026-12-15', 'monthly')).toBe('2027-01-15')
    expect(addInterval('2026-03-01', 'weekly')).toBe('2026-03-08')
    expect(addInterval('2028-02-29', 'yearly', 29)).toBe('2029-02-28')
  })
  it('firstDue never back-fills', () => {
    expect(firstDue('2026-01-05', 'monthly', '2026-03-10')).toBe('2026-04-05')
    expect(firstDue('2026-05-01', 'monthly', '2026-03-10')).toBe('2026-06-01')
  })
  it('lists occurrences due by today', () => {
    const r = dueOccurrences({ date: '2026-01-31', frequency: 'monthly', nextDue: '2026-02-28' }, '2026-04-01')
    expect(r.dates).toEqual(['2026-02-28', '2026-03-31'])
    expect(r.nextDue).toBe('2026-04-30')
  })
})

describe('csv', () => {
  const accounts = [{ id: 1, name: 'HDFC' }]
  const categories = ['Food', 'Salary', 'Other']
  it('round-trips quotes and commas', () => {
    const csv = toCsv([{ date: '2026-01-02', accountId: 1, category: 'Food', description: 'Lunch, "big"', amount: 120, flow: 'OUT', transactionType: 'EXPENSE', paymentMethod: 'UPI' }], () => 'HDFC')
    const rows = parseCsv(csv)
    expect(rows[1][3]).toBe('Lunch, "big"')
    const out = buildImport(rows, { accounts, defaultAccountId: 1, categories, existing: [] })
    expect(out.records).toHaveLength(1)
    expect(out.records[0]).toMatchObject({ amount: 120, flow: 'OUT', category: 'Food', accountId: 1 })
  })
  it('handles debit/credit columns, dd/mm/yyyy and duplicates against existing', () => {
    const rows = parseCsv('Txn Date;Narration;Withdrawal Amt;Deposit Amt\r\n05/03/2026;Coffee;150.00;\r\n06/03/2026;Pay;;50,000.00\r\n31/02/2026;Bad;1;')
    const existing = [{ date: '2026-03-05', amount: 150, flow: 'OUT', accountId: 1, description: 'coffee' }]
    const out = buildImport(rows, { accounts, defaultAccountId: 1, categories, existing })
    expect(out.duplicates).toBe(1)
    expect(out.invalid).toHaveLength(1)
    expect(out.records).toHaveLength(1)
    expect(out.records[0]).toMatchObject({ date: '2026-03-06', amount: 50000, flow: 'IN' })
  })
  it('keeps repeated identical rows that are not already stored', () => {
    const rows = parseCsv('date,amount,description\n2026-01-01,-10,tea\n2026-01-01,-10,tea')
    expect(buildImport(rows, { accounts, defaultAccountId: 1, categories, existing: [] }).records).toHaveLength(2)
  })
  it('re-imports exported transfers as linked transfers, not income/expense', () => {
    const two = [{ id: 1, name: 'HDFC' }, { id: 2, name: 'Cash' }]
    const base = { date: '2026-03-05', category: 'Transfer', amount: 500, transactionType: 'TRANSFER', paymentMethod: 'Bank Transfer' }
    const csv = toCsv([{ ...base, accountId: 1, flow: 'OUT' }, { ...base, accountId: 2, flow: 'IN' }], id => two.find(a => a.id === id).name)
    const [out, inn] = buildImport(parseCsv(csv), { accounts: two, defaultAccountId: 1, categories, existing: [] }).records
    expect(out).toMatchObject({ category: 'Transfer', transactionType: 'TRANSFER', flow: 'OUT', accountId: 1 })
    expect(inn).toMatchObject({ category: 'Transfer', transactionType: 'TRANSFER', flow: 'IN', accountId: 2 })
    expect(out.transferId).toBeTruthy()
    expect(inn.transferId).toBe(out.transferId)
  })
  it('files unknown incoming categories under Other income', () => {
    const rows = parseCsv('date,amount,category\n2026-01-01,250,Mystery')
    expect(buildImport(rows, { accounts, defaultAccountId: 1, categories, existing: [] }).records[0]).toMatchObject({ category: 'Other income', transactionType: 'INCOME' })
  })
})

describe('encrypted backup', () => {
  it('round-trips and rejects a wrong password', async () => {
    const enc = await encryptBackup({ app: 'Finora', accounts: [] }, 'pw-1')
    expect(isEncryptedBackup(enc)).toBe(true)
    expect(await decryptBackup(enc, 'pw-1')).toEqual({ app: 'Finora', accounts: [] })
    await expect(decryptBackup(enc, 'nope')).rejects.toThrow(/Wrong password/)
  })
})

describe('validateBackup', () => {
  const base = { app: 'Finora', accounts: [{ id: 1, name: 'Cash', type: 'cash', openingBalance: 0 }], notes: [], transactions: [{ date: '2026-01-01', amount: 5, flow: 'OUT', accountId: 1 }] }
  it('accepts v1 backups and defaults new collections', () => {
    const v = validateBackup(base)
    expect(v.budgets).toEqual([]); expect(v.goals).toEqual([]); expect(v.categories).toEqual([])
  })
  it('rejects bad records', () => {
    expect(() => validateBackup({ ...base, transactions: [{ ...base.transactions[0], accountId: 9 }] })).toThrow(/missing account/)
    expect(() => validateBackup({ ...base, transactions: [{ ...base.transactions[0], amount: 0 }] })).toThrow(/amount/)
    expect(() => validateBackup({ ...base, goals: [{ name: 'x', target: 0 }] })).toThrow(/Goal/)
  })
})

describe('webauthn assertion', () => {
  async function setup(mutate = (x) => x) {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
    const pubKey = b64(await crypto.subtle.exportKey('spki', kp.publicKey))
    const challenge = crypto.getRandomValues(new Uint8Array(32))
    const clientDataJSON = new TextEncoder().encode(JSON.stringify({ type: 'webauthn.get', challenge: b64url(challenge) }))
    const authData = new Uint8Array(37); authData[32] = mutate(0x05)
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', clientDataJSON))
    const signed = new Uint8Array([...authData, ...hash])
    const raw = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, signed))
    const der = (v) => { let i = 0; while (i < v.length - 1 && v[i] === 0) i++; v = v.slice(i); if (v[0] & 0x80) v = new Uint8Array([0, ...v]); return [0x02, v.length, ...v] }
    const body = [...der(raw.slice(0, 32)), ...der(raw.slice(32))]
    const signature = new Uint8Array([0x30, body.length, ...body])
    return { pubKey, alg: -7, challenge, authenticatorData: authData, clientDataJSON, signature }
  }
  it('verifies a valid ES256 assertion', async () => { expect(await verifyAssertion(await setup())).toBe(true) })
  it('rejects a wrong challenge, a missing UV flag and a tampered signature', async () => {
    const a = await setup()
    expect(await verifyAssertion({ ...a, challenge: new Uint8Array(32) })).toBe(false)
    expect(await verifyAssertion(await setup(() => 0x01))).toBe(false)
    const bad = new Uint8Array(a.signature); bad[bad.length - 1] ^= 1
    expect(await verifyAssertion({ ...a, signature: bad })).toBe(false)
  })
  it('derToRaw pads to 64 bytes', () => { expect(derToRaw(new Uint8Array([0x30, 6, 2, 1, 1, 2, 1, 2])).length).toBe(64) })
})

describe('insights', () => {
  const tx = [
    { date: '2026-09-05', amount: 1000, flow: 'IN', transactionType: 'INCOME', category: 'Salary' },
    { date: '2026-09-10', amount: 200, flow: 'OUT', transactionType: 'EXPENSE', category: 'Food', description: 'Cafe' },
    { date: '2026-10-02', amount: 500, flow: 'OUT', transactionType: 'EXPENSE', category: 'Food', description: 'cafe' },
    { date: '2026-10-03', amount: 900, flow: 'OUT', transactionType: 'TRANSFER', category: 'Transfer' },
    { date: '2026-10-04', amount: 100, flow: 'OUT', transactionType: 'EXPENSE', category: 'Transport', description: 'Bus' },
  ]
  it('builds a trend that ignores transfers and spans year boundaries', () => {
    const t = monthlyTrend(tx, '2026-10-15', 3)
    expect(t.map(r => r.month)).toEqual(['2026-08', '2026-09', '2026-10'])
    expect(t[1]).toMatchObject({ income: 1000, expense: 200, savingsRate: 80 })
    expect(t[2]).toMatchObject({ expense: 600, savingsRate: null })
    expect(monthlyTrend([], '2026-02-01', 3).map(r => r.month)).toEqual(['2025-12', '2026-01', '2026-02'])
  })
  it('compares categories with the previous month', () => {
    const c = categoryChanges(tx, '2026-10-15')
    expect(c[0]).toMatchObject({ category: 'Food', current: 500, previous: 200, pct: 150 })
    expect(c[1]).toMatchObject({ category: 'Transport', previous: 0, pct: null })
  })
  it('forecasts month-end spend', () => {
    expect(forecastMonth(tx, '2026-10-10')).toMatchObject({ spent: 600, projected: 1860, daysInMonth: 31 })
  })
  it('groups payees case-insensitively', () => {
    expect(topPayees(tx)[0]).toMatchObject({ total: 700, count: 2 })
  })
  it('lists upcoming recurring items and monthly cost', () => {
    const r = upcomingRecurring([
      { id: 1, recurrence: true, frequency: 'weekly', date: '2026-10-01', nextDue: '2026-10-20', amount: 52, flow: 'OUT', transactionType: 'EXPENSE' },
      { id: 2, recurrence: true, frequency: 'monthly', date: '2026-10-05', nextDue: '2026-11-05', amount: 100, flow: 'OUT', transactionType: 'EXPENSE' },
    ], '2026-10-15', 30)
    expect(r.items.map(i => i.date)).toEqual(['2026-10-20', '2026-10-27', '2026-11-03', '2026-11-05', '2026-11-10'])
    expect(r.monthlyOut).toBe(Math.round(52 * 52 / 12 + 100))
  })
})

describe('transaction search', () => {
  const rows = [
    { id: 1, date: '2026-04-15', amount: 500, description: 'Grocery run', category: 'Food', transactionType: 'EXPENSE', paymentMethod: 'UPI' },
    { id: 2, date: '2026-04-01', amount: 2026, description: 'Rent', category: 'Housing', transactionType: 'EXPENSE', paymentMethod: 'Bank Transfer', recurrence: true, frequency: 'monthly' },
    { id: 3, date: '2025-12-15', amount: 1250.5, description: 'Salary bonus', category: 'Salary', transactionType: 'INCOME', paymentMethod: 'Net Banking' },
    { id: 4, date: '2026-01-09', amount: 80, description: 'Market snacks', category: 'Food', transactionType: 'EXPENSE', paymentMethod: 'Cash' }
  ]
  const ids = q => rows.filter(t => matchesSearch(t, q, 'HDFC Bank')).map(t => t.id)
  it('matches day, month and year on their own', () => {
    expect(ids('15')).toEqual([1, 3])
    expect(ids('9')).toEqual([4])
    expect(ids('04')).toEqual([1, 2])
    expect(ids('2025')).toEqual([3])
    expect(ids('dec')).toEqual([3])
  })
  it('matches day-month, month-year and exact dates', () => {
    expect(ids('15-4')).toEqual([1])
    expect(ids('15/04/2026')).toEqual([1])
    expect(ids('2026-04-01')).toEqual([2])
    expect(ids('12-2025')).toEqual([3])
  })
  it('matches exact amounts, including year-like ones', () => {
    expect(ids('500')).toEqual([1])
    expect(ids('₹1,250.50')).toEqual([3])
    expect(ids('2026')).toEqual([1, 2, 4])
  })
  it('matches recurrence and text, and ANDs all terms', () => {
    expect(ids('recurring')).toEqual([2])
    expect(ids('one-time')).toEqual([1, 3, 4])
    expect(ids('monthly')).toEqual([2])
    expect(ids('food 04')).toEqual([1])
    expect(ids('mar')).toEqual([4])
    expect(ids('hdfc')).toEqual([1, 2, 3, 4])
    expect(ids('')).toEqual([1, 2, 3, 4])
  })
})

describe('calendar events', async () => {
  const { eventsInMonth, occurrenceIn, ordinal, upcomingEvents } = await import('../src/events')
  const bday = { title: 'Asha', type: 'Birthday', date: '1996-11-02', yearly: true }
  const leap = { title: 'Leap', type: 'Birthday', date: '2024-02-29', yearly: true }
  const once = { title: 'Interview', type: 'Important', date: '2026-11-10', yearly: false }
  it('repeats yearly events and keeps one-off events to their year', () => {
    expect(occurrenceIn(bday, 2026)).toBe('2026-11-02')
    expect(occurrenceIn(bday, 1990)).toBe(null)
    expect(occurrenceIn(leap, 2027)).toBe('2027-02-28')
    expect(occurrenceIn(once, 2027)).toBe(null)
    expect(Object.keys(eventsInMonth([bday, once], 2026, 11))).toEqual(['2026-11-02', '2026-11-10'])
  })
  it('lists upcoming dates with age, across the year end', () => {
    const r = upcomingEvents([once, bday, { title: 'NY', date: '2020-01-05', yearly: true }], '2026-10-30', 70)
    expect(r.map(x => [x.event.title, x.date, x.daysAway, x.years])).toEqual([
      ['Asha', '2026-11-02', 3, 30], ['Interview', '2026-11-10', 11, 0], ['NY', '2027-01-05', 67, 7]
    ])
    expect([1, 2, 3, 11, 22, 113].map(ordinal)).toEqual(['1st', '2nd', '3rd', '11th', '22nd', '113th'])
  })
})

describe('recurring end date', () => {
  it('stops posting after endDate and ends the series', () => {
    const r = dueOccurrences({ date: '2026-10-28', frequency: 'daily', nextDue: '2026-10-29', endDate: '2026-10-30' }, '2026-11-05')
    expect(r.dates).toEqual(['2026-10-29', '2026-10-30'])
    expect(r.nextDue).toBeNull()
  })
})
