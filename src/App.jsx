import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  KeyRound, Info, ShieldAlert, ListChecks, Type as TextIcon, Activity, Archive, ArrowDownLeft, ArrowUpRight, Banknote, BarChart3, Bell, Cake, CalendarDays,
  Calculator as CalculatorIcon, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Download, FileText, Filter,
  ArrowLeftRight, Bus, Clapperboard, CreditCard, Globe, Smartphone, Delete, Fingerprint, HeartPulse, Home, Landmark, ShoppingBag, UtensilsCrossed, Zap, GraduationCap, TrendingUp, CircleDollarSign, Ellipsis, ImagePlus, LayoutDashboard, LockKeyhole, Menu, MoreVertical, NotebookPen, Pencil,
  ShoppingCart, Wrench, Plane, Car, Fuel, Dumbbell, Store, Users, UserRound, PartyPopper, Vote, HandHeart, HandHelping, HardHat, Repeat, HandCoins, Gift, Briefcase, Sprout, BadgePercent, CirclePlus, ChartLine, ChartPie, ChartCandlestick, CalendarClock, Hourglass, ScrollText, Coins, Building2, Bitcoin, Umbrella,
  Heart, Pin, Plus, Search, Settings, ShieldCheck, SlidersHorizontal, Star, Sun, Moon, Eye, Lightbulb, PiggyBank, Target, Trash2, TriangleAlert, Undo2, Upload, Wallet, X
} from 'lucide-react'
import { createPortal } from 'react-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { db, todayISO } from './db'
import { biometricsSupported, clearAttempts, disableBiometrics, enableBiometrics, getAttempts, getLockConfig, recordFailure, removeLock, setPin, verifyBiometrics, verifyPin } from './lock'
import { CURRENCIES, CURRENCY_NAMES, FREQUENCIES, currencySymbol, dateDMY, dateLabel, downloadJson, compressImage, matchesSearch, downloadText, addInterval, dueOccurrences, firstDue, getCurrency, imageToDataUrl, isTransfer, money, setCurrency, sum, symbolFor, validateBackup } from './utils'
import { buildImport, parseCsv, toCsv } from './csv'
import { ALL_CATEGORIES, EXPENSE_GROUPS, INCOME_CATEGORIES, INVESTMENT_GROUPS, groupCategories, groupOf, OPENING_CATEGORY, isExpenseCategory, isIncomeCategory, isInvestmentCategory, setCustomIncomeCategories } from './categories'
import { categoryChanges, forecastMonth, monthlyTrend, topPayees, upcomingRecurring } from './insights'
import { decryptBackup, encryptBackup, isEncryptedBackup } from './crypto'
import { EVENT_TYPES, eventsInMonth, ordinal, upcomingEvents } from './events'
import { autoBackupSupported, ensurePermission, getHandle, linkFile, readExisting, unlinkFile, writeBackup } from './autosave'

const NAV = [
  ['Dashboard', LayoutDashboard], ['Transactions', FileText], ['Accounts', Wallet], ['Budgets', Target], ['Goals', PiggyBank], ['Insights', Lightbulb],
  ['Calendar', CalendarDays], ['Calculator', CalculatorIcon], ['Notes', NotebookPen], ['Backup & Restore', ShieldCheck], ['Config', Settings]
]
const CATEGORY_STYLE = {
  Food: [UtensilsCrossed, '#f97316'], Medical: [HeartPulse, '#ef4444'], Shopping: [ShoppingBag, '#a855f7'],
  Transport: [Bus, '#0ea5e9'], Utilities: [Zap, '#eab308'], Entertainment: [Clapperboard, '#ec4899'],
  Salary: [CircleDollarSign, '#10b981'], Investment: [TrendingUp, '#2877f5'], Education: [GraduationCap, '#6366f1'], Transfer: [ArrowLeftRight, '#14b8a6'], 'Opening balance': [Wallet, '#0ea5e9'], Other: [Ellipsis, '#64748b']
}
const GROUP_STYLE = {
  Living: [Home, '#f97316'], Transport: [Bus, '#0ea5e9'], Health: [HeartPulse, '#ef4444'], Shopping: [ShoppingBag, '#a855f7'],
  Social: [Clapperboard, '#ec4899'], Giving: [Landmark, '#14b8a6'], Growth: [GraduationCap, '#6366f1'], Lending: [Banknote, '#84cc16'],
  Income: [CircleDollarSign, '#10b981'], Other: [Ellipsis, '#64748b']
}
const CATEGORY_ICON = {
  Rent: Home, Utilities: Zap, Groceries: ShoppingCart, Food: UtensilsCrossed, Maintenance: Wrench,
  Travel: Plane, 'Vehicle repairs': Car, Fuel: Fuel, Transport: Bus,
  Fitness: Dumbbell, Medical: HeartPulse, Insurance: ShieldCheck,
  Shopping: ShoppingBag, 'Online shopping': Globe, 'Offline shopping': Store,
  Entertainment: Clapperboard, Party: PartyPopper, 'Self outing': UserRound, 'Friends outing': Users, 'Family outing': Home, Politics: Vote,
  Charity: HandHeart, 'Helping hands': HandHelping, Temple: Landmark, 'Workers salary': HardHat,
  Education: GraduationCap, Subscriptions: Repeat,
  'Lent to friend': HandCoins, 'Lent to family': HandCoins, 'Personal loan given': Banknote, Other: Ellipsis,
  Salary: CircleDollarSign, Bonus: Gift, Business: Briefcase, Agriculture: Sprout, Commission: BadgePercent, Interest: BadgePercent, 'Supplementary credits': CirclePlus, 'Other income': Ellipsis, 'Opening balance': Wallet,
  Investment: TrendingUp, Savings: PiggyBank, Stocks: ChartLine, 'Mutual funds': ChartPie, ETF: ChartCandlestick,
  'Fixed deposit': Landmark, 'Recurring deposit': CalendarClock, PPF: Hourglass, NPS: Hourglass, EPF: Hourglass,
  Bonds: ScrollText, Gold: Coins, Silver: Coins, 'Real estate': Building2, Crypto: Bitcoin, 'Other investment': Ellipsis, Transfer: ArrowLeftRight
}
const styleFor = name => {
  const base = CATEGORY_STYLE[name] || GROUP_STYLE[groupOf(name)] || (isInvestmentCategory(name) ? CATEGORY_STYLE.Investment : CATEGORY_STYLE.Other)
  return [CATEGORY_ICON[name] || base[0], base[1]]
}
function CatIcon({ name, size = 15 }) {
  const [Icon, color] = styleFor(name)
  return <span className="cat-icon" style={{ background: color + '22', color }}><Icon size={size}/></span>
}
const ALL_KEY = '__all__'
function CategoryCombobox({ value, names, onChange, otherName = 'Other', allLabel = '', placeholder = 'Search or select a category…', required = false, label = 'Category', kind }) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState(''), [active, setActive] = useState(0), ref = useRef(null)
  const q = query.trim().toLowerCase()
  const matches = names.filter(n => !q || n.toLowerCase().includes(q) || groupOf(n).toLowerCase().includes(q))
  const flat = matches.length || !otherName ? matches : [otherName]
  const groups = groupCategories(flat, kind)
  const showAll = !!allLabel && (!q || allLabel.toLowerCase().includes(q))
  const order = [...(showAll ? [ALL_KEY] : []), ...groups.flatMap(g => g.items)]
  const pick = n => { onChange(n === ALL_KEY ? 'all' : n); setOpen(false); setQuery('') }
  useEffect(() => { setActive(0) }, [query])
  useEffect(() => {
    if (!open) return
    const off = e => { if (!ref.current?.contains(e.target)) { setOpen(false); setQuery('') } }
    document.addEventListener('mousedown', off); return () => document.removeEventListener('mousedown', off)
  }, [open])
  const onKey = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(i => Math.min(i + 1, order.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter' && open) { e.preventDefault(); if (order[active]) pick(order[active]) }
    else if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); setQuery('') }
  }
  const isAll = value === 'all' || (!value && !!allLabel)
  const text = isAll ? allLabel : value || ''
  const lead = !open && !isAll && value
  return <div className="combo" ref={ref}>
    {lead && <span className="combo-lead"><CatIcon name={value} size={14}/></span>}
    <input className={lead ? 'has-lead' : ''} required={required && !value} role="combobox" aria-expanded={open} aria-autocomplete="list" aria-label={label} autoComplete="off" placeholder={placeholder} value={open ? query : text} onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onChange={e => { setQuery(e.target.value); setOpen(true) }} onKeyDown={onKey}/>
    <ChevronDown size={15} className="combo-chevron"/>
    {open && <div className="combo-list" role="listbox">
      {!matches.length && !showAll && <div className="combo-empty">{otherName ? `No match — choose “${otherName}”` : 'No match'}</div>}
      {showAll && <button type="button" role="option" aria-selected={isAll} className={`combo-item ${order[active] === ALL_KEY ? 'active' : ''} ${isAll ? 'selected' : ''}`} onMouseEnter={() => setActive(0)} onMouseDown={e => e.preventDefault()} onClick={() => pick(ALL_KEY)}><span className="cat-icon" style={{ background: '#64748b22', color: '#64748b' }}><Filter size={14}/></span>{allLabel}</button>}
      {groups.map(g => <div key={g.label}><div className="combo-group">{g.label}</div>{g.items.map(n => <button type="button" role="option" aria-selected={n === value} key={n} className={`combo-item ${order[active] === n ? 'active' : ''} ${n === value ? 'selected' : ''}`} onMouseEnter={() => setActive(order.indexOf(n))} onMouseDown={e => e.preventDefault()} onClick={() => pick(n)}><CatIcon name={n} size={14}/>{n}</button>)}</div>)}
    </div>}
  </div>
}
function CurrencySelect({ value, onChange, label = 'Currency' }) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    setActive(Math.max(0, CURRENCIES.indexOf(value)))
    const off = e => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', off); return () => document.removeEventListener('mousedown', off)
  }, [open])
  const pick = c => { if (c !== value) onChange(c); setOpen(false) }
  const onKey = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) setOpen(true); else setActive(i => Math.min(i + 1, CURRENCIES.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)) }
    else if ((e.key === 'Enter' || e.key === ' ') && open) { e.preventDefault(); pick(CURRENCIES[active]) }
    else if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false) }
  }
  const badge = c => <span className="currency-badge" aria-hidden="true">{symbolFor(c)}</span>
  return <div className="combo currency-select" ref={ref}>
    <button type="button" className="currency-trigger" aria-haspopup="listbox" aria-expanded={open} aria-label={`${label}: ${value} ${CURRENCY_NAMES[value] || ''}`} onClick={() => setOpen(o => !o)} onKeyDown={onKey}>
      {badge(value)}<b>{value}</b><span className="currency-name">{CURRENCY_NAMES[value]}</span>
    </button>
    <ChevronDown size={15} className="combo-chevron"/>
    {open && <div className="combo-list" role="listbox" aria-label={label}>
      {CURRENCIES.map((c, i) => <button type="button" role="option" aria-selected={c === value} key={c} className={`combo-item ${i === active ? 'active' : ''} ${c === value ? 'selected' : ''}`} onMouseEnter={() => setActive(i)} onMouseDown={e => e.preventDefault()} onClick={() => pick(c)}>
        {badge(c)}<b>{c}</b><span className="currency-name">{CURRENCY_NAMES[c]}</span>{c === value && <Check size={15} className="currency-check"/>}
      </button>)}
    </div>}
  </div>
}
function PaymentSelect({ value, onChange }) {
  const [open, setOpen] = useState(false), [active, setActive] = useState(0), ref = useRef(null)
  useEffect(() => {
    if (!open) return
    setActive(Math.max(0, PAYMENT_METHODS.indexOf(value)))
    const off = e => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', off); return () => document.removeEventListener('mousedown', off)
  }, [open])
  const pick = m => { onChange(m); setOpen(false) }
  const onKey = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) setOpen(true); else setActive(i => Math.min(i + 1, PAYMENT_METHODS.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)) }
    else if ((e.key === 'Enter' || e.key === ' ') && open) { e.preventDefault(); pick(PAYMENT_METHODS[active]) }
    else if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false) }
  }
  const icon = m => { const Icon = PAYMENT_ICONS[m] || Ellipsis; return <span className="currency-badge" aria-hidden="true"><Icon size={16}/></span> }
  return <div className="combo currency-select pay-select" ref={ref}>
    <button type="button" className="currency-trigger" aria-haspopup="listbox" aria-expanded={open} aria-label={`Payment method: ${value}`} onClick={() => setOpen(o => !o)} onKeyDown={onKey}>{icon(value)}<b>{value}</b></button>
    <ChevronDown size={15} className="combo-chevron"/>
    {open && <div className="combo-list" role="listbox" aria-label="Payment method">
      {PAYMENT_METHODS.map((m, i) => <button type="button" role="option" aria-selected={m === value} key={m} className={`combo-item ${i === active ? 'active' : ''} ${m === value ? 'selected' : ''}`} onMouseEnter={() => setActive(i)} onMouseDown={e => e.preventDefault()} onClick={() => pick(m)}>{icon(m)}<b>{m}</b>{m === value && <Check size={15} className="currency-check"/>}</button>)}
    </div>}
  </div>
}
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const parseISO = v => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v || ''); return m ? new Date(+m[1], m[2] - 1, +m[3]) : null }
function DatePicker({ value, onChange, label = 'Date', placeholder = 'Select date', clearable = false, compact = false }) {
  const selected = parseISO(value), today = isoOf(new Date())
  const [open, setOpen] = useState(false), [view, setView] = useState('days'), [cursor, setCursor] = useState(() => selected || new Date()), [pos, setPos] = useState(null)
  const btnRef = useRef(null), popRef = useRef(null)
  const place = () => {
    const r = btnRef.current?.getBoundingClientRect(); if (!r) return
    const w = 296, h = 352, left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8))
    setPos({ left, top: r.bottom + 6 + h > window.innerHeight && r.top - h - 6 > 0 ? r.top - h - 6 : r.bottom + 6 })
  }
  const show = () => { setCursor(selected || new Date()); setView('days'); place(); setOpen(true) }
  const close = () => { setOpen(false); btnRef.current?.focus() }
  const pick = d => { onChange(isoOf(d)); close() }
  useEffect(() => {
    if (!open) return
    const off = e => { if (!popRef.current?.contains(e.target) && !btnRef.current?.contains(e.target)) setOpen(false) }
    const reflow = e => { if (!popRef.current?.contains(e.target)) place() }
    document.addEventListener('mousedown', off); window.addEventListener('resize', place); window.addEventListener('scroll', reflow, true)
    requestAnimationFrame(() => popRef.current?.querySelector('[data-focus="true"]')?.focus())
    return () => { document.removeEventListener('mousedown', off); window.removeEventListener('resize', place); window.removeEventListener('scroll', reflow, true) }
  }, [open])
  useEffect(() => { if (open) popRef.current?.querySelector('[data-focus="true"]')?.focus() }, [cursor, view])
  const y = cursor.getFullYear(), m = cursor.getMonth()
  const lead = (new Date(y, m, 1).getDay() + 6) % 7
  const days = Array.from({ length: 42 }, (_, i) => new Date(y, m, i - lead + 1))
  const shift = (n, unit = 'm') => setCursor(c => unit === 'd' ? new Date(c.getFullYear(), c.getMonth(), c.getDate() + n) : new Date(c.getFullYear() + (unit === 'y' ? n : 0), c.getMonth() + (unit === 'm' ? n : 0), Math.min(c.getDate(), 28)))
  const onKey = e => {
    const k = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key]
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() }
    else if (view === 'days' && k) { e.preventDefault(); shift(k, 'd') }
    else if (view === 'days' && e.key === 'PageUp') { e.preventDefault(); shift(-1) }
    else if (view === 'days' && e.key === 'PageDown') { e.preventDefault(); shift(1) }
  }
  return <div className={`datepicker${compact ? ' compact' : ''}`}>
    <button type="button" ref={btnRef} className="datepicker-trigger" aria-label={`${label}: ${selected ? dateLabel(value) : 'not set'}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => open ? setOpen(false) : show()}>
      <CalendarDays size={16}/><span className={selected ? '' : 'datepicker-placeholder'}>{selected ? selected.toLocaleDateString(undefined, compact ? { day: 'numeric', month: 'short', year: 'numeric' } : { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : placeholder}</span><ChevronDown size={15} className="datepicker-chevron"/>
    </button>
    {open && pos && createPortal(<div ref={popRef} className="datepicker-pop" role="dialog" aria-label={`Choose ${label.toLowerCase()}`} style={pos} onKeyDown={onKey}>
      <div className="datepicker-head">
        <button type="button" className="datepicker-title" onClick={() => setView(v => v === 'days' ? 'months' : 'days')}>{view === 'days' ? `${MONTHS[m]} ${y}` : y}<ChevronDown size={14} className={view === 'months' ? 'flip' : ''}/></button>
        <div><button type="button" className="datepicker-nav" aria-label={view === 'days' ? 'Previous month' : 'Previous year'} onClick={() => shift(-1, view === 'days' ? 'm' : 'y')}><ChevronLeft size={17}/></button><button type="button" className="datepicker-nav" aria-label={view === 'days' ? 'Next month' : 'Next year'} onClick={() => shift(1, view === 'days' ? 'm' : 'y')}><ChevronRight size={17}/></button></div>
      </div>
      {view === 'days' ? <div className="datepicker-grid" role="grid">
        {WEEKDAYS.map(w => <span key={w} className="datepicker-dow">{w}</span>)}
        {days.map(d => { const iso = isoOf(d), focus = iso === isoOf(cursor); return <button type="button" key={iso} tabIndex={focus ? 0 : -1} data-focus={focus} aria-pressed={iso === value} aria-label={dateLabel(iso)} className={`datepicker-day${d.getMonth() !== m ? ' outside' : ''}${iso === today ? ' today' : ''}${iso === value ? ' selected' : ''}`} onClick={() => pick(d)}>{d.getDate()}</button> })}
      </div> : <div className="datepicker-months">
        {MONTHS.map((n, i) => <button type="button" key={n} data-focus={i === m} className={`datepicker-month${i === m ? ' selected' : ''}`} onClick={() => { setCursor(new Date(y, i, 1)); setView('days') }}>{n.slice(0, 3)}</button>)}
      </div>}
      <div className="datepicker-foot">
        {clearable && value ? <button type="button" onClick={() => { onChange(''); close() }}>Clear</button> : <button type="button" onClick={() => { const t = new Date(); setCursor(t); setView('days') }}>Go to current month</button>}
        <button type="button" className="datepicker-today" onClick={() => pick(new Date())}>Today</button>
      </div>
    </div>, document.body)}
  </div>
}
const BUDGET_CATEGORIES = ['Food', 'Medical', 'Shopping', 'Transport', 'Utilities', 'Entertainment', 'Education', 'Other']
const BANKS = [
  [/hdfc/i, 'HDFC', '#004c8f'], [/sbi|state bank/i, 'SBI', '#22409a'], [/icici/i, 'ICICI', '#f37e20'],
  [/axis/i, 'AXIS', '#97144d'], [/kotak/i, 'KOTAK', '#ed1c24'], [/pnb|punjab national/i, 'PNB', '#a20a3a'],
  [/canara/i, 'CANARA', '#0072bc'], [/baroda|bob/i, 'BoB', '#f26a21'], [/union/i, 'UBI', '#d4202c'],
  [/idfc/i, 'IDFC', '#9c1d26'], [/yes bank/i, 'YES', '#00539f'], [/indusind/i, 'IND', '#8b1c3f'],
  [/federal/i, 'FED', '#f7a823'], [/paytm/i, 'PAYTM', '#00b9f1'], [/bank of india|\bboi\b/i, 'BOI', '#0057a8'],
  [/indian bank/i, 'IB', '#1b3f8f'], [/idbi/i, 'IDBI', '#00814a'],
  [/telangana grameena/i, 'TGB', '#0b6b3a'], [/andhra pradesh grameena (?!vikas)/i, 'APGB', '#c2410c']
]
const INDIAN_BANKS = ['State Bank of India', 'HDFC Bank', 'ICICI Bank', 'Axis Bank', 'Kotak Mahindra Bank', 'Punjab National Bank', 'Bank of Baroda', 'Canara Bank', 'Union Bank of India', 'Bank of India', 'Indian Bank', 'Central Bank of India', 'Indian Overseas Bank', 'UCO Bank', 'Bank of Maharashtra', 'Punjab & Sind Bank', 'IDBI Bank', 'IDFC FIRST Bank', 'Yes Bank', 'IndusInd Bank', 'Federal Bank', 'RBL Bank', 'South Indian Bank', 'Karur Vysya Bank', 'City Union Bank', 'Tamilnad Mercantile Bank', 'Karnataka Bank', 'Jammu & Kashmir Bank', 'Bandhan Bank', 'CSB Bank', 'DCB Bank', 'Dhanlaxmi Bank', 'Nainital Bank', 'AU Small Finance Bank', 'Equitas Small Finance Bank', 'Ujjivan Small Finance Bank', 'Jana Small Finance Bank', 'Suryoday Small Finance Bank', 'ESAF Small Finance Bank', 'Utkarsh Small Finance Bank', 'Capital Small Finance Bank', 'Fincare Small Finance Bank', 'North East Small Finance Bank', 'Shivalik Small Finance Bank', 'Airtel Payments Bank', 'India Post Payments Bank', 'Paytm Payments Bank', 'Fino Payments Bank', 'Jio Payments Bank', 'NSDL Payments Bank', 'Citibank', 'HSBC', 'Standard Chartered Bank', 'Deutsche Bank', 'DBS Bank India', 'Barclays Bank', 'Saraswat Co-operative Bank', 'Cosmos Co-operative Bank', 'Bharat Co-operative Bank', 'SVC Co-operative Bank', 'Andhra Pradesh Grameena Vikas Bank', 'Kerala Gramin Bank', 'Karnataka Gramin Bank', 'Telangana Grameena Bank', 'Andhra Pradesh Grameena Bank'].sort((a, b) => a.localeCompare(b))
function bankBrand(name) {
  const hit = BANKS.find(([re]) => re.test(name))
  return hit ? { label: hit[1], color: hit[2] } : null
}
const PAYMENT_METHODS = ['UPI','Cash','Debit Card','Credit Card','Bank Transfer','Net Banking','Other']
const PAYMENT_ICONS = { UPI: Smartphone, Cash: Banknote, 'Debit Card': CreditCard, 'Credit Card': CreditCard, 'Bank Transfer': Landmark, 'Net Banking': Globe, Other: Ellipsis }
const isCashAccount = a => !!a && (a.type === 'cash' || /wallet/i.test(a.name || ''))
const PAYMENT_ICON = { UPI: Smartphone, Cash: Banknote, 'Debit Card': CreditCard, 'Credit Card': CreditCard, 'Bank Transfer': ArrowLeftRight, 'Net Banking': Globe, Other: Ellipsis }
const PERIODS = ['Today', 'Week', 'Month', 'Year', 'Custom', 'All']
const isoOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
function periodRange(period, from, to) {
  const now = new Date(), today = isoOf(now)
  if (period === 'Today') return [today, today]
  if (period === 'Week') { const d = new Date(now); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return [isoOf(d), today] }
  if (period === 'Month') return [isoOf(new Date(now.getFullYear(), now.getMonth(), 1)), today]
  if (period === 'Year') return [`${now.getFullYear()}-01-01`, today]
  if (period === 'Custom') return [from || '', to || '']
  return ['', '']
}
function CategoryTick({ x, y, payload }) {
  const [Icon, color] = styleFor(payload.value)
  return <g><circle cx={x} cy={y + 16} r={13} fill={color} fillOpacity={0.14}/><Icon x={x - 8} y={y + 8} width={16} height={16} color={color}/><text x={x} y={y + 42} textAnchor="middle" fontSize={10} fill="#64748b" className="cat-tick-label">{payload.value}</text></g>
}
const COLORS = ['#fb4545', '#08b981', '#2877f5', '#f6a800']
const CATEGORIES = ALL_CATEGORIES
const lastAccountId = () => { try { return Number(localStorage.getItem('finora-last-account')) || '' } catch { return '' } }
const blankTransaction = () => ({ date: todayISO(), transactionType: 'EXPENSE', category: '', accountId: lastAccountId(), amount: '', flow: 'OUT', paymentMethod: 'UPI', description: '', recurrence: false, frequency: 'monthly' })
const EMPTY = []
const LAST_BACKUP_KEY = 'finora-last-backup'
const getLastBackup = () => { try { return localStorage.getItem(LAST_BACKUP_KEY) || '' } catch { return '' } }
const OPENING_DESC = 'Opening balance'
const isOpeningTx = (t, accountId) => t.accountId === accountId && t.flow === 'IN' && t.description === OPENING_DESC && !t.recurrence
const daysSince = iso =>iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : Infinity

const ConfirmContext = createContext(() => Promise.resolve(true))
const useConfirm = () => useContext(ConfirmContext)
const ERROR_TOAST = /^(Enter|An account|The default|PINs|PIN must|Import failed|Could not|Fingerprint not|Wrong password|Choose|That category|Please|You can attach|.* is larger than)/
const popToast = msg => window.dispatchEvent(new CustomEvent('finora:toast', { detail: msg }))
// onTop: the modal opens over another one (e.g. a confirmation), so Escape closes only it.
function useModalA11y(onClose, onTop = false) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') { if (onTop) e.stopPropagation(); onClose() } }
    const prev = document.body.style.overflow
    const target = onTop ? window : document
    target.addEventListener('keydown', onKey, onTop)
    document.body.style.overflow = 'hidden'
    return () => { target.removeEventListener('keydown', onKey, onTop); document.body.style.overflow = prev }
  }, [onClose, onTop])
}
function ConfirmDialog({ opts, onClose }) {
  const cancelRef = useRef(null)
  useModalA11y(() => onClose(false), true)
  useEffect(() => { cancelRef.current?.focus() }, [])
  return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose(false)}>
    <div className="modal small-modal confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-msg">
      <div className={`confirm-icon ${opts.danger ? 'danger' : ''}`}><TriangleAlert size={24}/></div>
      <h2 id="confirm-title">{opts.title || 'Are you sure?'}</h2>
      <p id="confirm-msg">{opts.message}</p>
      <div className="confirm-actions">
        <button ref={cancelRef} className="btn btn-outline" onClick={() => onClose(false)}>Cancel</button>
        <button className={`btn ${opts.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => onClose(true)}>{opts.confirmLabel || 'Confirm'}</button>
      </div>
      {opts.altLabel && <button className="btn btn-danger-outline confirm-alt" onClick={() => onClose('alt')}>{opts.altLabel}</button>}
    </div>
  </div>
}

export default function App() {
  const [locked, setLocked] = useState(() => !!getLockConfig()?.hash)
  const [page, setPage] = useState('Dashboard')
  const [userName, setUserName] = useState(() => { try { return localStorage.getItem('finora-user-name') || '' } catch { return '' } })
  const [userPhoto, setUserPhoto] = useState(() => { try { return localStorage.getItem('finora-user-photo') || '' } catch { return '' } })
  const saveUserPhoto = (data) => { setUserPhoto(data || ''); try { data ? localStorage.setItem('finora-user-photo', data) : localStorage.removeItem('finora-user-photo') } catch {} }
  const saveUserName = (name) => { setUserName(name); try { localStorage.setItem('finora-user-name', name) } catch {} }
  // Live queries keep every view in sync with IndexedDB, including writes from other tabs.
  const accountsQ = useLiveQuery(() => db.accounts.toArray())
  const transactionsQ = useLiveQuery(() => db.transactions.orderBy('date').reverse().toArray())
  const accounts = accountsQ ?? EMPTY
  const allTransactions = transactionsQ ?? EMPTY
  // Failed recurring attempts are kept for display only; they never count toward balances, totals or reports.
  const transactions = useMemo(() => allTransactions.filter(t => t.status !== 'failed'), [allTransactions])
  const failedTransactions = useMemo(() => allTransactions.filter(t => t.status === 'failed'), [allTransactions])
  const notes = useLiveQuery(() => db.notes.toArray()) ?? EMPTY
  const budgets = useLiveQuery(() => db.budgets.toArray()) ?? EMPTY
  const goals = useLiveQuery(() => db.goals.toArray()) ?? EMPTY
  const customCategories = useLiveQuery(() => db.categories.toArray()) ?? EMPTY
  const events = useLiveQuery(() => db.events.toArray()) ?? EMPTY
  const loaded = accountsQ !== undefined && transactionsQ !== undefined
  const [onboarded, setOnboarded] = useState(() => { try { return !!localStorage.getItem('finora-onboarded') } catch { return true } })
  const [auto, setAuto] = useState({ status: 'off', last: '' })
  const autoRef = useRef({ handle: null, pass: '' })
  const [csvModal, setCsvModal] = useState(false)
  const [undo, setUndo] = useState(null)
  const [noteQuery, setNoteQuery] = useState('')
  const [, setCurrencyTick] = useState(0)
  const [transferModal, setTransferModal] = useState(false)
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState('')
  const [mobileNav, setMobileNav] = useState(false)
  const [transactionModal, setTransactionModal] = useState(false)
  const [accountModal, setAccountModal] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState(null)
  const [editingAccount, setEditingAccount] = useState(null)
  const [confirmState, setConfirmState] = useState(null)
  const confirmFn = useCallback((message, opts = {}) => new Promise(resolve => setConfirmState({ message, ...opts, resolve })), [])
  const closeConfirm = v => { confirmState?.resolve(v); setConfirmState(null) }

  // Views update themselves through live queries; kept so existing call sites stay valid.
  async function refresh() {}
  useEffect(() => { (async () => {
    // Remove only the unmistakable legacy demo dataset created by the starter project.
    const welcome = await db.notes.where('title').equals('Welcome to Finora').first().catch(() => null)
    if (welcome && String(welcome.content || '').startsWith('Your finance data and notes are stored in this browser.')) {
      await db.transaction('rw', db.accounts, db.transactions, db.notes, async () => { await db.accounts.clear(); await db.transactions.clear(); await db.notes.clear() })
    }
    // Older opening-balance entries were filed under "Other income"; give them their own category.
    await db.transactions.filter(t => t.description === OPENING_DESC && t.flow === 'IN' && t.category === 'Other income' && !t.recurrence).modify({ category: OPENING_CATEGORY }).catch(() => {})
    const { posted, failed } = await postDueRecurring()
    const dueNotes = await db.notes.filter(n => !n.deleted && !n.archived && n.dueDate && n.dueDate <= todayISO()).count()
    const parts = []
    if (posted) parts.push(`${posted} recurring transaction${posted === 1 ? '' : 's'} posted.`)
    if (failed) parts.push(`${failed} recurring transaction${failed === 1 ? '' : 's'} failed: insufficient balance. Recurrence stopped.`)
    if (dueNotes) parts.push(`${dueNotes} note${dueNotes === 1 ? ' is' : 's are'} due.`)
    const todays = upcomingEvents(await db.events.toArray().catch(() => []), todayISO(), 0)
    if (todays.length) parts.push(`Today: ${todays.map(o => o.event.title).join(', ')}.`)
    if (parts.length) notify(parts.join(' '))
    navigator.storage?.persist?.().catch(() => {})
    const handle = await getHandle().catch(() => null)
    if (handle) { autoRef.current.handle = handle; setAuto({ status: 'paused', last: (() => { try { return localStorage.getItem('finora-auto-last') || '' } catch { return '' } })() }) }
  })() }, [])
  // A stopped series is retried whenever the data changes (new income, edits, deletes, transfers, imports).
  useEffect(() => {
    if (!failedTransactions.length) return
    postDueRecurring().then(({ posted }) => { if (posted) notify(`${posted} recurring transaction${posted === 1 ? '' : 's'} resumed and posted.`) }).catch(() => {})
  }, [allTransactions, accounts])
  // Post recurring transactions that fall due while the app stays open past midnight.
  useEffect(() => {
    let day = todayISO()
    const check = async () => {
      if (todayISO() === day) return
      day = todayISO()
      const { posted, failed } = await postDueRecurring().catch(() => ({ posted: 0, failed: 0 }))
      if (posted || failed) notify([posted && `${posted} recurring transaction${posted === 1 ? '' : 's'} posted.`, failed && `${failed} recurring transaction${failed === 1 ? '' : 's'} failed: insufficient balance. Recurrence stopped.`].filter(Boolean).join(' '))
    }
    const timer = setInterval(check, 60000)
    document.addEventListener('visibilitychange', check)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', check) }
  }, [])
  // Debounced auto-backup to the linked file whenever data changes.
  useEffect(() => {
    if (auto.status !== 'active') return
    const timer = setTimeout(runAutoBackup, 3000)
    return () => clearTimeout(timer)
  }, [accounts, transactions, notes, budgets, goals, customCategories, events, auto.status])
  // Press N for a new transaction when nothing is being typed.
  useEffect(() => {
    const onKey = e => {
      if (e.key.toLowerCase() !== 'n' || e.ctrlKey || e.metaKey || e.altKey) return
      const el = document.activeElement
      if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) return
      if (document.querySelector('.modal-backdrop, .lock-screen')) return
      setEditingTransaction(null); setTransactionModal(true)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => { if (page !== 'Transactions') setSearch('') }, [page])
  useEffect(() => {
    const onHide = () => { if (document.hidden && getLockConfig()?.hash) setLocked(true) }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [])
  useEffect(() => {
    const onPop = e => { setToast(e.detail); setUndo(null) }
    window.addEventListener('finora:toast', onPop)
    return () => window.removeEventListener('finora:toast', onPop)
  }, [])
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => { setToast(''); setUndo(null) }, undo ? 7000 : 2800)
    return () => clearTimeout(timer)
  }, [toast, undo])

  // Transfers move money between accounts, so they count toward balances but not income/expense.
  const allIncome = sum(transactions, t => t.flow === 'IN' && !isTransfer(t))
  const allExpense = sum(transactions, t => t.flow === 'OUT' && !isTransfer(t))
  const allInvestment = sum(transactions, t => t.transactionType === 'INVESTMENT')
  const balances = useMemo(() => {
    const m = new Map(accounts.map(a => [a.id, Number(a.openingBalance || 0)]))
    transactions.forEach(t => { if (m.has(t.accountId)) m.set(t.accountId, m.get(t.accountId) + (t.flow === 'IN' ? 1 : -1) * Number(t.amount || 0)) })
    return m
  }, [accounts, transactions])
  const balanceFor = (account) => balances.get(account.id) ?? Number(account.openingBalance || 0)
  // Registered during render so every child sees custom income categories as income.
  setCustomIncomeCategories(customCategories.filter(c => c.kind === 'income').map(c => c.name))
  const categories = useMemo(() => [...CATEGORIES, ...customCategories.map(c => c.name).filter(n => !CATEGORIES.includes(n))], [customCategories])
  const totalBalance = accounts.reduce((n, a) => n + balanceFor(a), 0)
  const notify = (msg, undoFn = null) => { setToast(msg); setUndo(undoFn ? { run: undoFn } : null) }

  async function saveTransaction(form) {
    if (!form.category) { notify('Please choose a category.'); return }
    const payload = { ...form, amount: Number(form.amount), accountId: Number(form.accountId), updatedAt: new Date().toISOString() }
    if (!payload.date || !payload.accountId || !(payload.amount > 0)) { notify('Enter a date, account, and amount greater than zero.'); return }
    if (payload.recurrence) {
      const same = editingTransaction?.nextDue && editingTransaction.frequency === payload.frequency && editingTransaction.date === payload.date
      payload.frequency = payload.frequency || 'monthly'
      // The saved date is the first occurrence; the next one follows it, so past dates back-fill up to today.
      const anchor = Number(payload.date.split('-')[2])
      if (payload.endDate && payload.endDate < payload.date) { notify('The end date must be on or after the start date.'); return }
      if (!payload.endDate) payload.endDate = null
      const sameSchedule = editingTransaction?.id && editingTransaction.frequency === payload.frequency && editingTransaction.date === payload.date
      // An ended series (nextDue null) that gets a later end date resumes after its last posted copy.
      const lastDate = sameSchedule && !editingTransaction.nextDue ? transactions.filter(t => t.recurringFrom === editingTransaction.id).reduce((m, t) => t.date > m ? t.date : m, editingTransaction.date) : ''
      payload.stoppedReason = null
      payload.nextDue = same ? editingTransaction.nextDue : sameSchedule ? addInterval(lastDate, payload.frequency, anchor) : addInterval(payload.date, payload.frequency, anchor)
    } else { payload.frequency = null; payload.nextDue = null; payload.endDate = null }
    if (payload.flow === 'OUT') {
      const acct = accounts.find(a => a.id === payload.accountId)
      const prior = editingTransaction?.id && editingTransaction.accountId === payload.accountId ? (editingTransaction.flow === 'IN' ? -1 : 1) * Number(editingTransaction.amount || 0) : 0
      const available = (balances.get(payload.accountId) ?? 0) + prior
      if (acct && payload.amount > available) { notify(`Insufficient balance in ${acct.name}. Available: ${money(available)}.`); return }
    }
    try { localStorage.setItem('finora-last-account', String(payload.accountId)) } catch {}
    if (editingTransaction?.id) await db.transactions.update(editingTransaction.id, payload)
    else await db.transactions.add({ ...payload, createdAt: new Date().toISOString() })
    const { posted, failed } = payload.recurrence ? await postDueRecurring().catch(() => ({ posted: 0, failed: 0 })) : { posted: 0, failed: 0 }
    setTransactionModal(false); setEditingTransaction(null); await refresh()
    notify(`${editingTransaction ? 'Transaction updated.' : 'Transaction added.'}${posted ? ` ${posted} recurring occurrence${posted === 1 ? '' : 's'} posted up to today.` : ''}${failed ? ' A recurring payment failed for insufficient balance and the recurrence was stopped.' : ''}`)
  }
  async function deleteTransaction(id) {
    const tx = allTransactions.find(t => t.id === id)
    if (!tx) return
    const linked = tx?.transferId
    // A recurring series is the template plus every auto-posted copy; offer to remove all of it.
    const rootId = tx?.recurrence ? tx.id : tx?.recurringFrom
    const series = rootId ? allTransactions.filter(t => t.id === rootId || t.recurringFrom === rootId) : []
    let removed = linked ? transactions.filter(t => t.transferId === linked) : [tx]
    if (series.length > 1) {
      const answer = await confirmFn(tx.recurrence ? 'Deleting only this one removes the schedule, so nothing new is posted. Posted copies stay.' : 'Only this posted entry is removed; the recurring schedule keeps running.', { title: 'Delete recurring transaction?', confirmLabel: 'Delete this one', altLabel: `Delete all ${series.length} in this series`, danger: true })
      if (!answer) return
      if (answer === 'alt') removed = series
    } else if (!await confirmFn(linked ? 'This transfer has two linked entries; both will be deleted and balances recalculated.' : 'The account balance will be recalculated. This cannot be undone.', { title: linked ? 'Delete transfer?' : 'Delete transaction?', confirmLabel: 'Delete', danger: true })) return
    await db.transactions.bulkDelete(removed.map(t => t.id))
    await refresh(); notify(linked ? 'Transfer deleted.' : removed.length > 1 ? `${removed.length} recurring transactions deleted.` : 'Transaction deleted.', async () => { await db.transactions.bulkAdd(removed); await refresh() })
  }
  async function bulkDelete(ids) {
    const picked = new Set(ids), links = new Set(transactions.filter(t => picked.has(t.id) && t.transferId).map(t => t.transferId))
    const removed = transactions.filter(t => picked.has(t.id) || (t.transferId && links.has(t.transferId)))
    if (!removed.length) return false
    if (!await confirmFn(`${removed.length} transaction${removed.length === 1 ? '' : 's'} will be deleted${links.size ? ' (linked transfer entries are removed together)' : ''}. Balances are recalculated.`, { title: 'Delete selected?', confirmLabel: 'Delete', danger: true })) return false
    await db.transactions.bulkDelete(removed.map(t => t.id))
    await refresh(); notify(`${removed.length} transactions deleted.`, async () => { await db.transactions.bulkAdd(removed); await refresh() })
    return true
  }
  // Keeps transactionType in step with the new category, as the edit form does. Money never changes direction:
  // income only moves to income categories and outflows only to expense/investment categories.
  async function bulkCategory(ids, category) {
    const income = isIncomeCategory(category)
    const picked = transactions.filter(t => ids.includes(t.id) && !isTransfer(t))
    const rows = picked.filter(t => (t.flow === 'IN') === income)
    const transactionType = income ? 'INCOME' : isInvestmentCategory(category) ? 'INVESTMENT' : 'EXPENSE'
    await db.transaction('rw', db.transactions, () => Promise.all(rows.map(t => db.transactions.update(t.id, { category, transactionType, updatedAt: new Date().toISOString() }))))
    const skipped = picked.length - rows.length
    await refresh(); notify(`${rows.length} transactions moved to ${category}.${skipped ? ` ${skipped} skipped: ${income ? 'expenses' : 'income'} can't go in ${income ? 'an income' : 'an expense'} category.` : ''}`)
  }
  async function postDueRecurring() {
    const today = todayISO(), now = new Date().toISOString()
    let posted = 0, failed = 0
    // Query inside the write transaction so overlapping runs cannot post the same occurrence twice.
    await db.transaction('rw', db.transactions, db.accounts, async () => {
      const balances = new Map()
      const balanceOf = async accountId => {
        if (!balances.has(accountId)) {
          const acct = await db.accounts.get(accountId)
          const rows = await db.transactions.filter(t => t.accountId === accountId && t.status !== 'failed').toArray()
          balances.set(accountId, rows.reduce((n, t) => n + (t.flow === 'IN' ? 1 : -1) * Number(t.amount || 0), Number(acct?.openingBalance || 0)))
        }
        return balances.get(accountId)
      }
      // Series stopped for insufficient balance restart by themselves once the account can cover the payment again.
      for (const t of await db.transactions.filter(t => t.recurrence && t.stoppedReason).toArray()) {
        if (t.flow === 'OUT' && Number(t.amount) > await balanceOf(t.accountId)) continue
        const rows = await db.transactions.filter(r => r.recurringFrom === t.id).toArray()
        const failedRows = rows.filter(r => r.status === 'failed').sort((a, b) => a.date.localeCompare(b.date))
        const lastOk = rows.filter(r => r.status !== 'failed').reduce((m, r) => r.date > m ? r.date : m, t.date)
        const resume = failedRows[0]?.date || addInterval(lastOk, t.frequency, Number(t.date.split('-')[2]))
        await db.transactions.bulkDelete(failedRows.map(r => r.id))
        await db.transactions.update(t.id, { nextDue: resume, stoppedReason: null })
      }
      const templates = await db.transactions.filter(t => t.recurrence && t.frequency && t.nextDue && t.nextDue <= today).toArray()
      for (const t of templates) {
        const { dates, nextDue } = dueOccurrences(t, today)
        const { id, frequency, nextDue: _skip, endDate: _end, stoppedReason: _stop, createdAt, updatedAt, ...rest } = t
        const base = { ...rest, recurrence: false, recurringFrom: id, recurringFrequency: frequency, createdAt: now, updatedAt: now }
        let stopped = false
        for (const date of dates) {
          const balance = await balanceOf(t.accountId)
          // An outflow the account cannot cover is recorded as a failure and ends the series.
          if (t.flow === 'OUT' && Number(t.amount) > balance) {
            await db.transactions.add({ ...base, date, status: 'failed', failureReason: 'Insufficient balance' })
            await db.transactions.update(id, { nextDue: null, stoppedReason: 'insufficient-balance' })
            failed++; stopped = true; break
          }
          balances.set(t.accountId, balance + (t.flow === 'IN' ? 1 : -1) * Number(t.amount || 0))
          await db.transactions.add({ ...base, date }); posted++
        }
        if (!stopped) await db.transactions.update(id, { nextDue })
      }
    })
    return { posted, failed }
  }
  async function importTransactions(records) {
    const now = new Date().toISOString()
    const ids = await db.transactions.bulkAdd(records.map(r => ({ ...r, createdAt: now, updatedAt: now })), { allKeys: true })
    setCsvModal(false); await refresh()
    notify(`${records.length} transactions imported.`, async () => { await db.transactions.bulkDelete(ids); await refresh() })
  }
  async function saveTransfer({ fromId, toId, amount, date, note }) {
    const amt = Number(amount)
    if (!fromId || !toId || fromId === toId) { notify('Enter two different accounts for the transfer.'); return }
    if (!date || !(amt > 0)) { notify('Enter a date and an amount greater than zero.'); return }
    const from = accounts.find(a => a.id === Number(fromId)), to = accounts.find(a => a.id === Number(toId))
    const available = balances.get(Number(fromId)) ?? Number(from?.openingBalance || 0)
    if (from && amt > available) { notify(`Insufficient balance in ${from.name}. Available: ${money(available)}.`); return }
    const transferId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    const now = new Date().toISOString()
    const base = { date, amount: amt, transactionType: 'TRANSFER', category: 'Transfer', paymentMethod: 'Bank Transfer', recurrence: false, transferId, createdAt: now, updatedAt: now }
    await db.transaction('rw', db.transactions, async () => {
      await db.transactions.add({ ...base, accountId: from.id, flow: 'OUT', description: note || `Transfer to ${to.name}` })
      await db.transactions.add({ ...base, accountId: to.id, flow: 'IN', description: note || `Transfer from ${from.name}` })
    })
    setTransferModal(false); await refresh(); notify('Transfer recorded.')
  }
  async function saveBudget({ category, limit }) {
    const value = Number(limit)
    if (!category || !(value > 0)) { notify('Enter a budget amount greater than zero.'); return false }
    const existing = await db.budgets.where('category').equals(category).first()
    if (existing) await db.budgets.update(existing.id, { limit: value })
    else await db.budgets.add({ category, limit: value })
    await refresh(); notify('Budget saved.'); return true
  }
  async function deleteBudget(budget) {
    if (!await confirmFn(`The ${budget.category} budget will be removed. Transactions are not affected.`, { title: 'Delete budget?', confirmLabel: 'Delete', danger: true })) return
    await db.budgets.delete(budget.id); await refresh(); notify('Budget deleted.')
  }
  async function addCategory(raw, kind = 'expense') {
    const name = raw.trim().replace(/\s+/g, ' ')
    if (!name || name.length > 24) { notify('Enter a category name of up to 24 characters.'); return false }
    if ([...categories, 'Transfer'].some(c => c.toLowerCase() === name.toLowerCase())) { notify('That category already exists.'); return false }
    await db.categories.add({ name, kind }); await refresh(); notify(`${kind === 'income' ? 'Income' : 'Expense'} category added.`); return true
  }
  async function deleteCategory(cat) {
    // Failed recurring attempts are filed under the category too, so look at every stored row.
    const used = allTransactions.filter(t => t.category === cat.name)
    const message = used.length
      ? `Warning: ${used.length} transaction${used.length === 1 ? '' : 's'} entered under "${cat.name}" will be permanently removed along with the category, and account balances will be recalculated.`
      : 'This category is not used by any transaction.'
    if (!await confirmFn(message, { title: `Delete ${cat.name}?`, confirmLabel: used.length ? `Delete category & ${used.length} transaction${used.length === 1 ? '' : 's'}` : 'Delete', danger: true })) return
    const budgets = await db.budgets.where('category').equals(cat.name).toArray()
    await db.transaction('rw', db.categories, db.budgets, db.transactions, async () => {
      await db.transactions.bulkDelete(used.map(t => t.id))
      await db.categories.delete(cat.id); await db.budgets.where('category').equals(cat.name).delete()
    })
    await refresh()
    notify(used.length ? `Category and ${used.length} transaction${used.length === 1 ? '' : 's'} deleted.` : 'Category deleted.', async () => {
      await db.categories.add({ name: cat.name, kind: cat.kind }); await db.transactions.bulkAdd(used); await db.budgets.bulkAdd(budgets.map(({ id, ...x }) => x)); await refresh()
    })
  }
  async function saveGoal(form) {
    const name = form.name.trim(), target = Number(form.target), saved = Number(form.saved || 0)
    if (!name || !(target > 0) || !(saved >= 0)) { notify('Enter a goal name and a target amount greater than zero.'); return false }
    await db.goals.add({ name, target, saved, deadline: form.deadline || '', createdAt: new Date().toISOString() })
    await refresh(); notify('Goal added.'); return true
  }
  async function contributeGoal(goal, amount) {
    const value = Number(amount)
    if (!Number.isFinite(value) || value === 0) { notify('Enter an amount to add or remove.'); return false }
    await db.goals.update(goal.id, { saved: Math.max(0, Number(goal.saved || 0) + value) })
    await refresh(); notify(value > 0 ? 'Funds added to goal.' : 'Funds removed from goal.'); return true
  }
  async function deleteGoal(goal) {
    if (!await confirmFn('Your account balances are not affected.', { title: `Delete goal "${goal.name}"?`, confirmLabel: 'Delete', danger: true })) return
    await db.goals.delete(goal.id); await refresh(); notify('Goal deleted.')
  }
  async function saveEvent(form) {
    const title = form.title.trim()
    if (!title || !form.date) { notify('Enter a title and a date.'); return false }
    const record = { title, type: form.type, date: form.date, yearly: !!form.yearly, note: (form.note || '').trim() }
    if (form.id) await db.events.update(form.id, record)
    else await db.events.add({ ...record, createdAt: new Date().toISOString() })
    notify(form.id ? 'Date updated.' : 'Date added to your calendar.'); return true
  }
  async function deleteEvent(event) {
    if (!await confirmFn('It will be removed from your calendar.', { title: `Delete "${event.title}"?`, confirmLabel: 'Delete', danger: true })) return false
    await db.events.delete(event.id); notify('Date deleted.'); return true
  }
  // Returns whether the file was written.
  async function runAutoBackup() {
    const { handle, pass } = autoRef.current
    if (!handle || !pass) return false
    try {
      await writeBackup(handle, await encryptBackup(await snapshot(), pass))
      const last = new Date().toISOString()
      try { localStorage.setItem('finora-auto-last', last); localStorage.setItem(LAST_BACKUP_KEY, last) } catch {}
      setAuto({ status: 'active', last })
      return true
    } catch (e) { setAuto(a => ({ ...a, status: 'error', message: e.message })); return false }
  }
  async function linkAutoBackup(pass) {
    if (pass.length < 8) { notify('Enter a passphrase of at least 8 characters.'); return false }
    try { autoRef.current = { handle: await linkFile(), pass } } catch (e) { if (e?.name !== 'AbortError') notify('Could not link that file.'); return false }
    if (!await runAutoBackup()) { notify('Could not write the backup file. See the status below.'); return false }
    notify('Auto-backup linked.'); return true
  }
  async function resumeAutoBackup(pass) {
    const handle = autoRef.current.handle
    if (!handle) return false
    if (!await ensurePermission(handle, true)) { notify('Could not get permission to write the backup file.'); return false }
    try {
      const existing = await readExisting(handle)
      if (isEncryptedBackup(existing)) await decryptBackup(existing, pass)
    } catch (e) { notify(e.message); return false }
    autoRef.current.pass = pass
    if (!await runAutoBackup()) { notify('Could not write the backup file. See the status below.'); return false }
    notify('Auto-backup resumed.'); return true
  }
  async function unlinkAutoBackup() {
    await unlinkFile(); autoRef.current = { handle: null, pass: '' }; setAuto({ status: 'off', last: '' }); notify('Auto-backup turned off.')
  }
  // A positive opening balance is recorded as an income transaction so it shows up in income totals and history.
  // A negative one (overdrawn account) stays on the account itself so it is not counted as an expense.
  async function addAccountWithOpening(payload, opening) {
    const amount = Number(opening || 0)
    const id = await db.accounts.add({ ...payload, openingBalance: amount < 0 ? amount : 0 })
    if (amount > 0) {
      const now = new Date().toISOString()
      await db.transactions.add({ date: todayISO(), transactionType: 'INCOME', category: OPENING_CATEGORY, accountId: id, amount, flow: 'IN', paymentMethod: 'Other', description: OPENING_DESC, recurrence: false, createdAt: now, updatedAt: now })
    }
  }
  async function finishOnboarding({ photo, name, currency, account, addCash }) {
    if (name) saveUserName(name)
    if (photo) saveUserPhoto(photo)
    setCurrency(currency); setCurrencyTick(n => n + 1)
    const now = new Date().toISOString()
    if (account) await addAccountWithOpening({ name: account.name.trim(), type: account.type, createdAt: now }, account.openingBalance)
    if (addCash && !(account?.type === 'cash')) await db.accounts.add({ name: 'Cash', type: 'cash', openingBalance: 0, createdAt: now })
    try { localStorage.setItem('finora-onboarded', '1') } catch {}
    setOnboarded(true); notify('You are all set. Add your first transaction when you are ready.')
  }
  const skipOnboarding = () => { try { localStorage.setItem('finora-onboarded', '1') } catch {}; setOnboarded(true) }
  async function deleteNoteForever(note) {
    await db.notes.delete(note.id); await refresh(); notify('Note deleted permanently.')
  }
  async function saveAccount(form) {
    const name = form.name.trim()
    if (!name) { notify('Enter an account name.'); return }
    const duplicate = accounts.some(a => a.name.toLowerCase() === name.toLowerCase() && a.id !== editingAccount?.id)
    if (duplicate) { notify('An account with this name already exists.'); return }
    const payload = { name, type: form.type, openingBalance: Number(form.openingBalance || 0), createdAt: editingAccount?.createdAt || new Date().toISOString() }
    if (editingAccount?.id) await db.accounts.update(editingAccount.id, payload)
    else await addAccountWithOpening({ name, type: form.type, createdAt: payload.createdAt }, form.openingBalance)
    setAccountModal(false); setEditingAccount(null); await refresh(); notify(editingAccount ? 'Account updated.' : 'Account added.')
  }
  async function deleteAccount(account) {
    if (!await confirmFn('This also deletes all of its transactions. Export a backup first if you need a copy.', { title: `Delete ${account.name}?`, confirmLabel: 'Delete account', danger: true })) return
    await db.transaction('rw', db.accounts, db.transactions, async () => {
      await db.transactions.where('accountId').equals(account.id).delete()
      await db.accounts.delete(account.id)
    })
    await refresh(); notify('Account and associated transactions deleted.')
  }
  async function saveNote(note) {
    const now = new Date().toISOString()
    if (note.id) await db.notes.update(note.id, { ...note, updatedAt: now })
    else await db.notes.add({ ...note, createdAt: now, updatedAt: now, pinned: false, archived: false, deleted: false, images: note.images || [], labels: note.labels || [], color: note.color || 'white' })
    await refresh(); notify('Note saved.')
  }
  async function removeNote(note) {
    await db.notes.update(note.id, { deleted: true, updatedAt: new Date().toISOString() })
    await refresh(); notify('Moved to Trash.')
  }
  async function exportBackup(password = '') {
    const data = await snapshot()
    downloadJson(password ? `finora-backup-${todayISO()}.encrypted.json` : `finora-backup-${todayISO()}.json`, password ? await encryptBackup(data, password) : data)
    try { localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString()) } catch {}
    notify(password ? 'Encrypted backup exported.' : 'Backup exported.')
  }
  async function snapshot() {
    const [a, t, n, b, g, c, e] = await Promise.all([db.accounts.toArray(), db.transactions.toArray(), db.notes.toArray(), db.budgets.toArray(), db.goals.toArray(), db.categories.toArray(), db.events.toArray()])
    return { app: 'Finora', version: 4, exportedAt: new Date().toISOString(), accounts: a, transactions: t, notes: n, budgets: b, goals: g, categories: c, events: e }
  }
  async function importBackup(file, password = '') {
    try {
      let parsed = JSON.parse(await file.text())
      if (isEncryptedBackup(parsed)) {
        if (!password) throw new Error('This backup is encrypted. Enter its password first.')
        parsed = await decryptBackup(parsed, password)
      }
      const data = validateBackup(parsed)
      if (!await confirmFn('Importing replaces all current Finora data in this browser. A snapshot of your current data will be downloaded first as finora-pre-import-*.json.', { title: 'Replace all data?', confirmLabel: 'Import backup', danger: true })) return
      downloadJson(`finora-pre-import-${todayISO()}.json`, await snapshot())
      await db.transaction('rw', [db.accounts, db.transactions, db.notes, db.budgets, db.goals, db.categories, db.events], async () => {
        await db.accounts.clear(); await db.transactions.clear(); await db.notes.clear(); await db.budgets.clear(); await db.goals.clear(); await db.categories.clear(); await db.events.clear()
        await db.events.bulkAdd(data.events.map(({ id, ...x }) => x))
        await db.budgets.bulkAdd(data.budgets.map(({ id, ...x }) => x))
        await db.goals.bulkAdd(data.goals.map(({ id, ...x }) => x))
        await db.categories.bulkAdd(data.categories.map(({ id, ...x }) => x))
        await db.accounts.bulkAdd(data.accounts.map(({ id, ...x }) => x), { allKeys: false })
        const importedAccounts = await db.accounts.toArray()
        const oldToNew = new Map(data.accounts.map((a, i) => [a.id, importedAccounts[i]?.id]))
        await db.transactions.bulkAdd(data.transactions.map(({ id, ...x }) => ({ ...x, accountId: oldToNew.get(x.accountId) })))
        await db.notes.bulkAdd(data.notes.map(({ id, ...x }) => x))
      })
      await refresh(); notify('Backup imported.')
    } catch (e) { notify(`Import failed: ${e.message}`) }
  }

  const openTransfer = () => { if (accounts.length < 2) { notify('Could not start a transfer: add at least two accounts first.'); return } setTransferModal(true) }
  const shared = { accounts, transactions, notes, openTransfer, balanceFor, totalBalance, allIncome, allExpense, allInvestment, notify, refresh }
  if (locked) return <LockScreen onUnlock={() => setLocked(false)} />
  return <ConfirmContext.Provider value={confirmFn}><div className="app-shell">
    <a className="skip-link" href="#main">Skip to content</a>
    <Sidebar userName={userName} userPhoto={userPhoto} page={page} setPage={setPage} mobileNav={mobileNav} setMobileNav={setMobileNav} onLock={getLockConfig()?.hash ? () => setLocked(true) : null} />
    <main className="main-area" id="main">
      <Topbar setMobileNav={setMobileNav} hasLock={!!getLockConfig()?.hash} onLock={() => setLocked(true)} onSetupLock={() => { setPage('Config'); notify('Set a PIN under App lock to enable locking.') }} />
      <div className="page-content">
        {page === 'Dashboard' && <Dashboard {...shared} events={events} goals={goals} categories={categories} setPage={setPage} onAddTransaction={() => { setEditingTransaction(null); setTransactionModal(true) }} onAddAccount={() => { setEditingAccount(null); setAccountModal(true) }} />}
        {page === 'Transactions' && <TransactionsPage {...shared} failed={failedTransactions} categories={categories} search={search} onImportCsv={() => setCsvModal(true)} onBulkDelete={bulkDelete} onBulkCategory={bulkCategory} onAdd={() => { setEditingTransaction(null); setTransactionModal(true) }} onEdit={t => { setEditingTransaction(t); setTransactionModal(true) }} onDelete={deleteTransaction} />}
        {page === 'Accounts' && <AccountsPage {...shared} onAdd={() => { setEditingAccount(null); setAccountModal(true) }} onEdit={a => { setEditingAccount(a); setAccountModal(true) }} onDelete={deleteAccount} />}
        {page === 'Calendar' && <CalendarPage events={events} goals={goals} onOpenGoal={() => setPage('Goals')} saveEvent={saveEvent} deleteEvent={deleteEvent} />}
        {page === 'Calculator' && <CalculatorPage />}
        {page === 'Budgets' && <BudgetsPage transactions={transactions} budgets={budgets} saveBudget={saveBudget} deleteBudget={deleteBudget} categories={categories} customCategories={customCategories} addCategory={addCategory} deleteCategory={deleteCategory} />}
        {page === 'Insights' && <InsightsPage transactions={transactions} />}
        {page === 'Goals' && <GoalsPage goals={goals} saveGoal={saveGoal} contributeGoal={contributeGoal} deleteGoal={deleteGoal} />}
        {page === 'Notes' && <NotesPage initialQuery={noteQuery} notes={notes} saveNote={saveNote} removeNote={removeNote} deleteNoteForever={deleteNoteForever} />}
        {page === 'Config' && <SecurityPage userName={userName} saveUserName={saveUserName} userPhoto={userPhoto} saveUserPhoto={saveUserPhoto} notify={notify} onLockNow={() => setLocked(true)} onCurrency={code => { setCurrency(code); setCurrencyTick(n => n + 1) }} />}
        {page === 'Backup & Restore' && <BackupPage exportBackup={exportBackup} importBackup={importBackup} auto={auto} onLinkAuto={linkAutoBackup} onResumeAuto={resumeAutoBackup} onUnlinkAuto={unlinkAutoBackup} />}
      </div>
    </main>
    {transactionModal && <TransactionModal accounts={accounts} balances={balances} categories={categories} initial={editingTransaction || blankTransaction()} onClose={() => { setTransactionModal(false); setEditingTransaction(null) }} onSave={saveTransaction} />}
    {loaded && !onboarded && accounts.length === 0 && transactions.length === 0 && <OnboardingWizard initialName={userName} initialCurrency={getCurrency()} onFinish={finishOnboarding} onSkip={skipOnboarding} />}
    {csvModal && <ImportCsvModal accounts={accounts} categories={categories} existing={transactions} onClose={() => setCsvModal(false)} onImport={importTransactions} />}
    {transferModal && <TransferModal accounts={accounts} balances={balances} onClose={() => setTransferModal(false)} onSave={saveTransfer} />}
    {accountModal && <AccountModal initial={editingAccount} openingTx={editingAccount ? transactions.find(t => isOpeningTx(t, editingAccount.id)) : null} onClose={() => { setAccountModal(false); setEditingAccount(null) }} onSave={saveAccount} />}
    {(page === 'Dashboard' || page === 'Transactions') && accounts.length > 0 && <button className="fab" aria-label="Add transaction" onClick={() => { setEditingTransaction(null); setTransactionModal(true) }}><Plus size={24}/></button>}
    {confirmState && <ConfirmDialog opts={confirmState} onClose={closeConfirm} />}
    {toast && <div className={`toast ${ERROR_TOAST.test(toast) ? 'toast-error' : ''}`} role="status" aria-live="polite">{ERROR_TOAST.test(toast) ? <TriangleAlert size={17}/> : <Check size={17}/>}{toast}{undo && <button className="toast-undo" onClick={async () => { const fn = undo.run; setToast(''); setUndo(null); await fn() }}><Undo2 size={15}/> Undo</button>}</div>}
  </div></ConfirmContext.Provider>
}

function LockScreen({ onUnlock }) {
  const cfg = getLockConfig()
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [until, setUntil] = useState(() => getAttempts().until)
  const [now, setNow] = useState(Date.now())
  const busy = useRef(false)
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t) }, [])
  const locked = until > now
  async function tryBio() {
    if (busy.current) return
    busy.current = true
    if (await verifyBiometrics()) { clearAttempts(); onUnlock() } else setError('Fingerprint not recognised. Use your PIN.')
    busy.current = false
  }
  useEffect(() => { if (cfg?.credId) tryBio() }, [])
  async function submit(value) {
    if (await verifyPin(value)) { clearAttempts(); onUnlock(); return }
    const { fails: n, until: wait } = recordFailure()
    setPin('')
    if (wait) { setUntil(wait); setError('Too many attempts. Please wait.') }
    else setError(`Incorrect PIN. ${5 - n} attempt${5 - n === 1 ? '' : 's'} left before a delay.`)
  }
  function press(d) {
    if (locked) return
    setError('')
    const len = cfg?.pinLength || 4
    const next = (pin + d).slice(0, len)
    setPin(next)
    if (next.length === len) submit(next)
  }
  return <main className="lock-screen"><div className="lock-card">
    <div className="auth-mobile-brand" style={{ display: 'flex', justifyContent: 'center' }}><span className="brand-mark"><i/><i/><i/></span> Finora</div>
    <LockKeyhole size={26}/><h2>Enter PIN to unlock</h2>
    <div className="pin-dots" role="img" aria-label={`${pin.length} of ${cfg?.pinLength || 4} digits entered`}>{Array.from({ length: cfg?.pinLength || 4 }, (_, i) => <i key={i} className={i < pin.length ? 'on' : ''}/>)}</div>
    <div className="lock-error" role="alert">{locked ? `Try again in ${Math.ceil((until - now) / 1000)}s` : error}</div>
    <div className="keypad">
      {['1','2','3','4','5','6','7','8','9'].map(d => <button key={d} onClick={() => press(d)}>{d}</button>)}
      {cfg?.credId ? <button onClick={tryBio} title="Use fingerprint" aria-label="Use fingerprint"><Fingerprint size={22}/></button> : <span/>}
      <button onClick={() => press('0')}>0</button>
      <button onClick={() => { setPin(p => p.slice(0, -1)); setError('') }} title="Delete" aria-label="Delete last digit"><Delete size={22}/></button>
    </div>
  </div></main>
}

function SecurityPage({ userName, saveUserName, userPhoto, saveUserPhoto, notify, onLockNow, onCurrency }) {
  const [nameInput, setNameInput] = useState(userName)
  const [cfg, setCfg] = useState(getLockConfig())
  const [bioOk, setBioOk] = useState(false)
  const [step, setStep] = useState(null)
  const [first, setFirst] = useState('')
  const [pin, setPinValue] = useState('')
  useEffect(() => { biometricsSupported().then(setBioOk) }, [])
  const reload = () => setCfg(getLockConfig())
  const [currency, setCurrencyChoice] = useState(getCurrency())
  async function submitPin(e) {
    e.preventDefault()
    if (!/^\d{4,6}$/.test(pin)) { notify('PIN must be 4 to 6 digits.'); return }
    if (step === 'new') { setFirst(pin); setPinValue(''); setStep('confirm'); return }
    if (pin !== first) { notify('PINs did not match. Start again.'); setStep('new'); setFirst(''); setPinValue(''); return }
    await setPin(pin)
    setStep(null); setFirst(''); setPinValue(''); reload(); notify('PIN saved.')
  }
  async function toggleBio() {
    if (cfg?.credId) { disableBiometrics(); reload(); notify('Fingerprint unlock turned off.'); return }
    try { await enableBiometrics(); reload(); notify('Fingerprint unlock enabled.') }
    catch { notify('Could not set up fingerprint. It may have been cancelled.') }
  }
  const confirmFn = useConfirm()
  async function remove() {
    if (!await confirmFn('The app will open without unlocking.', { title: 'Remove app lock?', confirmLabel: 'Remove lock', danger: true })) return
    removeLock(); reload(); notify('Lock removed.')
  }
  return <><PageHeading title="Config" subtitle="Your profile, display currency and app lock."/>
    <div className="config-grid">
    <section className="panel security-card profile-card">
      <div className="config-card-head"><span className="backup-icon blue"><UserRound size={20}/></span><div><h2>Profile</h2><p>Your name and picture, shown in the sidebar and greetings.</p></div></div>
      <div className="profile-row">
      <ProfilePhotoField value={userPhoto} name={userName} onChange={data => { saveUserPhoto(data); notify(data ? 'Profile picture updated.' : 'Profile picture removed.') }}/>
      <form className="pin-form config-inline" onSubmit={e => { e.preventDefault(); saveUserName(nameInput.trim()); notify('User name saved.') }}>
        <label>Your name<input style={{ letterSpacing: 'normal' }} type="text" maxLength={40} placeholder="Enter your name" value={nameInput} onChange={e => setNameInput(e.target.value)}/></label>
        <button className="btn btn-primary" type="submit" disabled={nameInput.trim() === (userName || '')}>Save name</button>
      </form>
      </div>
    </section>
    <section className="panel security-card currency-card">
      <div className="config-card-head"><span className="backup-icon blue"><Coins size={20}/></span><div><h2>Display currency</h2><p>Changes how amounts are shown. Existing amounts are not converted.</p></div></div>
      <div className="pin-form"><span className="field-label">Currency</span><CurrencySelect value={currency} onChange={c => { setCurrencyChoice(c); onCurrency(c); notify('Currency updated.') }}/></div>
    </section>
    <section className="panel security-card lock-card">
      <div className="config-card-head"><span className="backup-icon blue"><LockKeyhole size={20}/></span><div><h2>App lock <span className={`status-pill ${cfg?.hash ? 'on' : ''}`}>{cfg?.hash ? 'On' : 'Off'}</span></h2><p>Lock Finora with a PIN or your device fingerprint.</p></div></div>
      <div className={`lock-status ${cfg?.hash ? 'on' : ''}`}>{cfg?.hash ? <ShieldCheck size={22}/> : <ShieldAlert size={22}/>}<div><b>{cfg?.hash ? 'Finora is protected' : 'Finora is not protected'}</b><small>{cfg?.hash ? `PIN set${cfg.credId ? ' · Fingerprint on' : ' · Fingerprint off'}` : 'Anyone using this browser can open your data. Set a PIN to lock it.'}</small></div></div>
      {step ? <form onSubmit={submitPin} className="pin-form">
        <label>{step === 'new' ? 'Choose a 4–6 digit PIN' : 'Confirm your PIN'}<input autoFocus type="password" inputMode="numeric" maxLength={6} value={pin} onChange={e => setPinValue(e.target.value.replace(/\D/g, ''))}/></label>
        <button className="btn btn-primary" type="submit">{step === 'new' ? 'Next' : 'Save PIN'}</button>
        <button className="btn btn-outline" type="button" onClick={() => { setStep(null); setPinValue(''); setFirst('') }}>Cancel</button>
      </form> : <div className="security-actions lock-actions">
        <button className="btn btn-primary" onClick={() => setStep('new')}><KeyRound size={16}/> {cfg?.hash ? 'Change PIN' : 'Set up PIN'}</button>
        {cfg?.hash && cfg.credId && !cfg.pubKey && <small>Fingerprint was set up with an older version. Turn it off and on again to re-enable it.</small>}
        {cfg?.hash && (bioOk
          ? <button className="btn btn-outline" onClick={toggleBio}><Fingerprint size={17}/> {cfg.credId ? 'Turn off fingerprint' : 'Enable fingerprint'}</button>
          : <small>Fingerprint unlock isn't available on this device or browser.</small>)}
        {cfg?.hash && <button className="btn btn-outline" onClick={onLockNow}><LockKeyhole size={16}/> Lock now</button>}
        {cfg?.hash && <button className="btn btn-danger-outline" onClick={remove}><Trash2 size={16}/> Remove lock</button>}
      </div>}
      <p className="config-note"><Info size={16}/><span>The lock hides the app on this device. Data stays in this browser's storage and isn't encrypted; use a password when exporting backups. If you forget your PIN, clearing site data resets it but also erases your data, so keep a backup.</span></p>
    </section>
    </div></>
}


// Downsizes the chosen image to a small square JPEG so it stays light in localStorage.
function resizePhoto(file, size = 160) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image()
    img.onload = () => {
      const side = Math.min(img.width, img.height), canvas = document.createElement('canvas')
      canvas.width = canvas.height = size
      canvas.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size)
      URL.revokeObjectURL(url); resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Not an image')) }
    img.src = url
  })
}
function ProfilePhotoField({ value, name, onChange }) {
  const [error, setError] = useState('')
  async function pick(file) {
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('Please choose an image file.'); return }
    try { onChange(await resizePhoto(file)); setError('') } catch { setError('Could not read that image.') }
  }
  return <div className="photo-field"><div className="avatar photo-preview">{value ? <img src={value} alt="Profile preview"/> : (name || 'F').charAt(0).toUpperCase()}</div>
    <div className="photo-actions"><label className="btn btn-outline btn-small">{value ? 'Change picture' : 'Add picture'}<input type="file" accept="image/*" hidden onChange={e => { pick(e.target.files?.[0]); e.target.value = '' }}/></label>{value && <button type="button" className="btn btn-ghost btn-small" onClick={() => onChange('')}>Remove</button>}<small>Optional</small>{error && <small className="balance-warning" role="alert">{error}</small>}</div></div>
}
function Sidebar({ userName, userPhoto, page, setPage, mobileNav, setMobileNav, onLock }) {
  return <>
    {mobileNav && <div className="mobile-backdrop" onClick={() => setMobileNav(false)} />}
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`} aria-label="Sidebar">
      <div className="brand"><span className="brand-mark"><i/><i/><i/></span><span>Finora</span></div>
      <div className="brand-subtitle">FINANCE & NOTES</div>
      <nav aria-label="Main">{NAV.map(([name, Icon]) => <button key={name} aria-current={page === name ? 'page' : undefined} className={`nav-item ${page === name ? 'active' : ''}`} onClick={() => { setPage(name); setMobileNav(false) }}><Icon size={19}/><span>{name}</span></button>)}</nav>
      <div className="sidebar-bottom"><div className="avatar">{userPhoto ? <img src={userPhoto} alt="Profile"/> : (userName || 'F').charAt(0).toUpperCase()}</div><div className="profile-label"><b>{userName || 'My Finora'}</b><small>Local device data</small>{onLock && <button className="local-logout" onClick={onLock}>Lock now</button>}</div></div>
    </aside>
  </>
}
function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'light')
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0b1220' : '#1677f8')
    try { localStorage.setItem('finora-theme', theme) } catch {}
  }, [theme])
  return [theme, () => setTheme(t => t === 'dark' ? 'light' : 'dark')]
}
function Topbar({ setMobileNav, hasLock, onLock, onSetupLock }) {
  const [theme, toggleTheme] = useTheme()
  return <header className="topbar">
    <button className="icon-btn mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu size={21}/></button>
    <button className="icon-btn theme-toggle" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>{theme === 'dark' ? <Sun size={19}/> : <Moon size={19}/>}</button>
    <button className="icon-btn" onClick={hasLock ? onLock : onSetupLock} aria-label={hasLock ? 'Lock app' : 'Set up app lock'} title={hasLock ? 'Lock now' : 'Set up app lock'}><LockKeyhole size={19}/></button>
  </header>
}
function PageHeading({ title, subtitle, action }) {
  return <div className="page-heading"><div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{action}</div>
}
// Recurring bills/income and calendar dates (events + goal deadlines) merged into one compact timeline.
function UpcomingCombined({ transactions, events, goals, setPage }) {
  const today = isoOf(new Date())
  const items = useMemo(() => {
    const dayMs = 86400000, toDay = iso => Date.parse(`${iso}T00:00:00Z`) / dayMs
    const seenDaily = new Set()
    // A daily item repeats every day, so only its next occurrence is listed.
    const recurring = upcomingRecurring(transactions, today, 30).items.filter(u => u.frequency !== 'daily' || (!seenDaily.has(u.id) && seenDaily.add(u.id))).map((u, i) => ({ key: `r-${u.id}-${u.date}-${i}`, date: u.date, title: u.description || u.category, sub: 'Recurring', Icon: Repeat, color: u.flow === 'IN' ? '#10b981' : '#ef4444', amount: `${u.flow === 'IN' ? '+' : '−'}${money(u.amount)}`, positive: u.flow === 'IN', page: 'Transactions' }))
    const goalEvents = goals.filter(g => g.deadline).map(g => ({ id: `goal-${g.id}`, goal: true, title: `Goal: ${g.name}`, type: 'Goal', date: g.deadline, yearly: false }))
    const dates = upcomingEvents([...events, ...goalEvents], today, 30).map(o => { const [Icon, color] = eventStyle(o.event.type); return { key: `e-${o.event.id}-${o.date}`, date: o.date, title: o.event.title, sub: milestone(o) || o.event.type, Icon, color, amount: whenLabel(o.daysAway), page: o.event.goal ? 'Goals' : 'Calendar' } })
    return [...recurring, ...dates].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 7)
  }, [transactions, events, goals, today])
  return <section className="panel upcoming-panel"><div className="panel-heading"><div><h2>Upcoming</h2><p>Recurring payments and calendar dates · next 30 days</p></div><button className="text-button" onClick={() => setPage('Calendar')}>Calendar →</button></div>
    {items.length === 0 ? <div className="up-empty">Nothing due in the next 30 days.</div> : <div className="up-list">{items.map(it => <button type="button" key={it.key} className="up-row" onClick={() => setPage(it.page)}><span className="up-icon" style={{ color: it.color, background: `${it.color}1a` }}><it.Icon size={14}/></span><span className="up-title">{it.title}</span><small>{dateDMY(it.date)} · {it.sub}</small><b className={it.positive === undefined ? 'up-when' : it.positive ? 'positive' : 'negative'}>{it.amount}</b></button>)}</div>}
  </section>
}
function Dashboard({ events = [], goals = [], categories = CATEGORIES, accounts, transactions, balanceFor, totalBalance, allIncome, allExpense, allInvestment, setPage, onAddTransaction, onAddAccount }) {
  const [period, setPeriod] = useState('All')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [selectedType, setSelectedType] = useState(null)
  const [chartAccount, setChartAccount] = useState('all')
  const [categoryAccount, setCategoryAccount] = useState('all')
  const [pStart, pEnd] = periodRange(period, customFrom, customTo)
  const inPeriod = t => (!pStart || t.date >= pStart) && (!pEnd || t.date <= pEnd)
  const filtered = transactions.filter(t => inPeriod(t) && (chartAccount === 'all' || String(t.accountId) === chartAccount))
  const types = [
    { key: 'EXPENSE', name: 'Expense', value: sum(filtered, t => t.transactionType === 'EXPENSE'), color: COLORS[0] },
    { key: 'INCOME', name: 'Income', value: sum(filtered, t => t.transactionType === 'INCOME'), color: COLORS[1] },
    { key: 'INVESTMENT', name: 'Investment', value: sum(filtered, t => t.transactionType === 'INVESTMENT'), color: COLORS[2] }
  ]
  const toggleType = key => setSelectedType(cur => cur === key ? null : key)
  const selectedName = types.find(t => t.key === selectedType)?.name
  const categoryTx = transactions.filter(t => inPeriod(t) && (selectedType ? t.transactionType === selectedType : t.flow === 'OUT' && !isTransfer(t)) && (categoryAccount === 'all' || String(t.accountId) === categoryAccount))
  const catNames = selectedType ? [...new Set(categoryTx.map(t => t.category))] : categories.filter(isExpenseCategory)
  const cats = catNames.map(name => ({ name, amount: sum(categoryTx, t => t.category === name) })).filter(c => c.amount > 0).sort((a, b) => b.amount - a.amount)
  const latest = [...transactions].sort((a,b) => b.date.localeCompare(a.date)).slice(0,5)
  const txName = id => accounts.find(a => a.id === id)?.name || 'Unknown account'
  return <>
    <PageHeading title="Finance Dashboard" subtitle="Your money, accounts, and activity at a glance." action={<div className="heading-actions"><button className="btn btn-outline" onClick={onAddAccount}><Plus size={17}/> Add account</button><button className="btn btn-primary" onClick={onAddTransaction}><Plus size={17}/> Add transaction</button></div>} />
    {accounts.length === 0 && <section className="panel onboarding"><div className="stat-icon blue"><Wallet size={22}/></div><div><h2>Welcome to Finora</h2><p>Start by adding a bank account or your cash in hand. Then record transactions to see balances and charts here.</p></div><button className="btn btn-primary" onClick={onAddAccount}><Plus size={17}/> Add your first account</button></section>}
    <section className="stats-grid">
      <StatCard label="Total balance" value={money(totalBalance)} note={`${accounts.length} accounts`} icon={Wallet} tone="blue"/>
      <StatCard label="Total income" value={money(allIncome)} note="Recorded inflows" icon={ArrowDownLeft} tone="green"/>
      <StatCard label="Total expenses" value={money(allExpense)} note="Recorded outflows" icon={ArrowUpRight} tone="red"/>
      <StatCard label="Investments" value={money(allInvestment)} note="Tracked transactions" icon={Activity} tone="purple"/>
    </section>
    <section className="panel accounts-panel">
      <div className="panel-heading"><div className="panel-title"><LandmarkIcon/><div><h2>My Accounts</h2><p>Balances are calculated from your opening balance and transactions.</p></div></div><button className="text-button" onClick={() => setPage('Accounts')}>Manage accounts <span>→</span></button></div>
      <div className="account-cards">{accounts.map(a => <AccountCard key={a.id} account={a} balance={balanceFor(a)} income={sum(transactions,t=>t.accountId===a.id&&t.flow==='IN'&&!isTransfer(t))} expense={sum(transactions,t=>t.accountId===a.id&&t.flow==='OUT'&&!isTransfer(t))} />)}<button className="add-account-card" onClick={onAddAccount}><span><Plus size={22}/></span><b>Add account</b><small>Bank or cash</small></button></div>
    </section>
    <div className="charts-grid">
      <section className="panel chart-panel"><div className="panel-heading"><div><h2>Transaction Type Breakdown</h2><p>Recorded transaction amounts by type</p></div><select value={chartAccount} onChange={e=>setChartAccount(e.target.value)}><option value="all">All accounts</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
        <div className="period-tabs">{PERIODS.map(p=><button key={p} className={period===p?'active':''} onClick={()=>setPeriod(p)}>{p}</button>)}{period==='Custom'&&<span className="period-custom"><DatePicker compact clearable label="From date" placeholder="From" value={customFrom} onChange={setCustomFrom}/><DatePicker compact clearable label="To date" placeholder="To" value={customTo} onChange={setCustomTo}/></span>}</div>
        <div className="donut-layout type-breakdown"><div className="donut-chart"><ResponsiveContainer width="100%" height={160}><PieChart><Pie data={types} dataKey="value" nameKey="name" innerRadius={44} outerRadius={68} paddingAngle={3} onClick={d=>toggleType(d.key)} style={{cursor:'pointer'}}>{types.map(t=><Cell key={t.name} fill={t.color} fillOpacity={selectedType&&selectedType!==t.key?0.3:1}/>)}</Pie><Tooltip formatter={v=>money(v)}/></PieChart></ResponsiveContainer></div><div className="legend-list">{types.map(t=><div className={`legend-row clickable ${selectedType===t.key?'selected':''}`} key={t.name} onClick={()=>toggleType(t.key)}><span className="legend-dot" style={{background:t.color}}/><span>{t.name}</span><b>{money(t.value)}</b></div>)}</div></div>
      </section>
      <section className="panel chart-panel"><div className="panel-heading"><div><h2>{selectedType?`Category Wise ${selectedName}`:'Category Wise Expenses'}</h2><p>{selectedType?<>Showing {selectedName.toLowerCase()} transactions · <button className="text-button" onClick={()=>setSelectedType(null)}>Show expenses</button></>:'Where your money is going · click a transaction type to filter'}</p></div><select value={categoryAccount} onChange={e=>setCategoryAccount(e.target.value)}><option value="all">All accounts</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
        <div className="bar-wrap"><ResponsiveContainer width="100%" height={280}><BarChart data={cats} margin={{top:18,right:4,left:0,bottom:4}}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="name" tick={<CategoryTick/>} interval={0} height={56} tickLine={false}/><YAxis tick={{fontSize:11}}/><Tooltip formatter={v=>money(v)}/><Bar dataKey="amount" name="Expenses" radius={[6,6,0,0]}>{cats.map(c=><Cell key={c.name} fill={styleFor(c.name)[1]}/>)}</Bar></BarChart></ResponsiveContainer></div>
      </section>
    </div>
    <UpcomingCombined transactions={transactions} events={events} goals={goals} setPage={setPage}/>
    <section className="panel recent-panel"><div className="panel-heading"><div><h2>Recent Transactions</h2><p>Your latest financial activity</p></div><button className="text-button" onClick={()=>setPage('Transactions')}>View all →</button></div>
      <TransactionTable transactions={latest} accounts={accounts} compact />
    </section>
  </>
}
function LandmarkIcon(){return <span className="landmark-icon"><Banknote size={22}/></span>}
function StatCard({label,value,note,icon:Icon,tone}){return <div className="stat-card"><div className={`stat-icon ${tone}`}><Icon size={21}/></div><div className="stat-copy"><span>{label}</span><strong>{value}</strong><small>{note}</small></div></div>}
function AccountCard({account,balance,income,expense}) {
  const brand = bankBrand(account.name)
  return <div className="account-card"><div className={`bank-logo ${account.type==='cash'?'cash-logo':''}`} style={brand?{background:brand.color,color:'#fff',fontSize:brand.label.length>4?8:10}:undefined}>{account.type==='cash'?<Banknote size={25}/>:brand?brand.label:<Landmark size={22}/>}</div><div className="account-info"><b>{account.name}</b><strong>{money(balance)}</strong><small>Income {money(income)} · Expense {money(expense)}</small></div></div>
}
function TransactionsPage({accounts,transactions,failed=[],categories,search,onAdd,onEdit,onDelete,openTransfer,onImportCsv,onBulkDelete,onBulkCategory}) {
  const [filterAccount,setFilterAccount]=useState('all'),[filterFlow,setFilterFlow]=useState('all'),[filterCategory,setFilterCategory]=useState('all'),[filterPayment,setFilterPayment]=useState('all'),[start,setStart]=useState(''),[end,setEnd]=useState(''),[localSearch,setLocalSearch]=useState(''),[selected,setSelected]=useState(()=>new Set()),[bulkCategory,setBulkCategory]=useState(''),[pageNo,setPageNo]=useState(1),[pageSize,setPageSize]=useState(25)
  const cashAccountSelected=isCashAccount(accounts.find(a=>String(a.id)===filterAccount))
  const shown=[...transactions,...failed].sort((a,b)=>b.date.localeCompare(a.date)).filter(t=>(filterAccount==='all'||String(t.accountId)===filterAccount)&&(filterFlow==='all'||t.flow===filterFlow)&&(cashAccountSelected||filterPayment==='all'||t.paymentMethod===filterPayment)&&(filterCategory==='all'||t.category===filterCategory)&&(!start||t.date>=start)&&(!end||t.date<=end)&&matchesSearch(t,`${search} ${localSearch}`,`${accounts.find(a=>a.id===t.accountId)?.name||''} ${groupOf(t.category)}`))
  const pageCount=Math.max(1,Math.ceil(shown.length/pageSize)),curPage=Math.min(pageNo,pageCount)
  const pageRows=shown.slice((curPage-1)*pageSize,curPage*pageSize)
  useEffect(()=>{setPageNo(1)},[filterAccount,filterFlow,filterPayment,filterCategory,start,end,localSearch,search,pageSize])
  // Bulk actions only ever touch rows the filters still show.
  useEffect(()=>{setSelected(cur=>{if(!cur.size)return cur;const ids=new Set(shown.map(t=>t.id)),n=new Set([...cur].filter(id=>ids.has(id)));return n.size===cur.size?cur:n})},[transactions,filterAccount,filterFlow,filterPayment,filterCategory,start,end,localSearch,search])
  return <><PageHeading title="Transactions" subtitle="Search, filter, and manage your financial activity." action={<div className="heading-actions"><button className="btn btn-outline" onClick={openTransfer}><ArrowLeftRight size={17}/> Transfer</button><button className="btn btn-primary" onClick={onAdd}><Plus size={17}/> Add transaction</button></div>}/>
    <section className="panel"><div className="filter-bar"><label className="field-search"><Search size={16}/><input placeholder="Search… e.g. rent, 15-4, apr, 2026, 500" title="Combine terms with spaces. 1–31 = day · 01–09 or a month name = month · 2026 = year · 15-4 = day & month · 15-4-2026 = exact date · numbers = amount · recurring, monthly, one-time" aria-label="Search transactions" value={localSearch} onChange={e=>setLocalSearch(e.target.value)}/></label><DatePicker compact clearable label="From date" placeholder="From date" value={start} onChange={setStart}/><DatePicker compact clearable label="To date" placeholder="To date" value={end} onChange={setEnd}/><select value={filterAccount} onChange={e=>setFilterAccount(e.target.value)}><option value="all">All accounts</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select><CategoryCombobox label="Filter by category" allLabel="All categories" otherName="" placeholder="All categories" value={filterCategory} names={[...categories,'Transfer',...transactions.map(t=>t.category)]} onChange={setFilterCategory}/><select value={filterFlow} onChange={e=>setFilterFlow(e.target.value)}><option value="all">All flows</option><option value="IN">Income</option><option value="OUT">Expense</option></select><select aria-label="Filter by payment type" value={cashAccountSelected?'all':filterPayment} disabled={cashAccountSelected} title={cashAccountSelected?'Cash accounts are always paid in cash':undefined} onChange={e=>setFilterPayment(e.target.value)}><option value="all">{cashAccountSelected?'Cash':'All payment types'}</option>{PAYMENT_METHODS.map(m=><option key={m} value={m}>{m}</option>)}</select></div>
    <div className="table-topline"><div><h2>All transactions</h2><span>{shown.length} records</span></div><div className="heading-actions"><button className="btn btn-outline btn-small" onClick={onImportCsv}><Upload size={15}/> Import CSV</button><button className="btn btn-outline btn-small" disabled={!shown.length} title={`Export the ${shown.length} filtered records`} onClick={()=>downloadText(`finora-transactions-${todayISO()}.csv`,toCsv(shown.filter(t=>t.status!=='failed'),id=>accounts.find(a=>a.id===id)?.name||''),'text/csv')}><Download size={15}/> Export CSV</button><button className="btn btn-outline btn-small" disabled={!shown.length} title={`Export the ${shown.length} filtered records`} onClick={()=>downloadJson(`finora-transactions-${todayISO()}.json`,shown)}><Download size={15}/> Export JSON</button></div></div>
    {selected.size>0&&<div className="bulk-bar" role="region" aria-label="Bulk actions"><b>{selected.size} selected</b><CategoryCombobox label="New category" otherName="" placeholder="Move to category…" value={bulkCategory} names={categories} onChange={setBulkCategory}/><button className="btn btn-outline btn-small" disabled={!bulkCategory} onClick={async()=>{await onBulkCategory([...selected],bulkCategory);setSelected(new Set());setBulkCategory('')}}>Apply</button><button className="btn btn-danger-outline btn-small" onClick={async()=>{if(await onBulkDelete([...selected]))setSelected(new Set())}}><Trash2 size={14}/> Delete</button><button className="btn btn-ghost btn-small" onClick={()=>setSelected(new Set())}>Clear</button></div>}
    <TransactionTable transactions={pageRows} all={transactions} accounts={accounts} onEdit={onEdit} onDelete={onDelete} selected={selected} onToggle={id=>setSelected(cur=>{const n=new Set(cur);n.has(id)?n.delete(id):n.add(id);return n})} onToggleAll={all=>setSelected(cur=>{const n=new Set(cur);pageRows.forEach(t=>all?n.add(t.id):n.delete(t.id));return n})}/>
    {shown.length>0&&<div className="pager" role="navigation" aria-label="Pagination"><span>Showing {(curPage-1)*pageSize+1}–{Math.min(curPage*pageSize,shown.length)} of {shown.length}</span><div className="pager-controls"><label>Rows<select value={pageSize} onChange={e=>setPageSize(Number(e.target.value))}>{[10,25,50,100].map(n=><option key={n} value={n}>{n}</option>)}</select></label><button className="btn btn-outline btn-small" disabled={curPage<=1} onClick={()=>setPageNo(curPage-1)}>‹ Prev</button><span>Page {curPage} of {pageCount}</span><button className="btn btn-outline btn-small" disabled={curPage>=pageCount} onClick={()=>setPageNo(curPage+1)}>Next ›</button></div></div>}
    </section></>
}
function CategoryBadge({name}) {
  const [Icon, color] = styleFor(name)
  return <span className="cat-cell"><span className="cat-icon" style={{background:color+'22',color}}><Icon size={15}/></span>{name}</span>
}
function PaymentBadge({method}) {
  if (!method) return '—'
  const Icon = PAYMENT_ICON[method] || Ellipsis
  return <span className="pay-cell"><Icon size={15}/>{method}</span>
}
function TransactionTable({transactions,all=transactions,accounts,onEdit,onDelete,compact=false,selected,onToggle,onToggleAll}) {
  const pick=!!onToggle
  const byId=new Map(all.map(x=>[x.id,x]))
  const autoTip=t=>{const freq=t.recurringFrequency||byId.get(t.recurringFrom)?.frequency;return `Auto-posted on ${dateDMY(t.date)} · ${String(t.transactionType||'').charAt(0)+String(t.transactionType||'').slice(1).toLowerCase()}${freq?` · ${FREQUENCIES[freq]} recurring`:' · recurring'}`}
  if(!transactions.length)return <div className="empty-state"><FileText size={28}/><b>No transactions found</b><span>Add a transaction or adjust your filters.</span></div>
  return <div className="table-scroll"><table className="data-table"><thead><tr>{pick&&<th className="select-cell"><input type="checkbox" aria-label="Select all" checked={transactions.every(t=>t.status==='failed'||selected.has(t.id))} onChange={e=>onToggleAll(e.target.checked)}/></th>}<th>Date</th><th>Account</th><th>Category</th><th>Description</th><th>Type</th><th>Payment</th><th className="align-right">Amount</th>{!compact&&<th>Manage</th>}</tr></thead><tbody>{transactions.map(t=><tr key={t.id} className={`${pick&&selected.has(t.id)?'row-selected':''}${t.status==='failed'?' row-failed':''}`}>{pick&&<td className="select-cell">{t.status!=='failed'&&<input type="checkbox" aria-label="Select transaction" checked={selected.has(t.id)} onChange={()=>onToggle(t.id)}/>}</td>}<td data-label="Date" className="date-cell">{dateDMY(t.date)}</td><td data-label="Account"><b>{accounts.find(a=>a.id===t.accountId)?.name||'Unknown'}</b></td><td data-label="Category"><CategoryBadge name={t.category}/></td><td data-label="Description">{t.description||'—'}{t.recurrence&&<span className="recurring-label" title={t.endDate?`Repeats until ${dateDMY(t.endDate)}`:undefined}>Recurring{t.frequency?` · ${FREQUENCIES[t.frequency]}`:''}{t.endDate?` · until ${dateDMY(t.endDate)}`:''}</span>}{t.recurringFrom&&t.status!=='failed'&&<span className="recurring-label" title={autoTip(t)}>Auto-posted</span>}{t.status==='failed'&&<span className="failed-label" title={`Recurring payment due ${dateDMY(t.date)} was not made: ${t.failureReason||'insufficient balance'}. The recurrence was stopped.`}>Failed · {t.failureReason||'Insufficient balance'}</span>}{t.stoppedReason&&<span className="failed-label" title="Recurrence stopped automatically after a failed payment. Edit and save to resume.">Recurrence stopped</span>}</td><td data-label="Type">{t.transactionType}</td><td data-label="Payment"><PaymentBadge method={t.paymentMethod}/></td><td data-label="Amount" className={`align-right amount-cell ${t.flow==='IN'?'positive':'negative'}${t.status==='failed'?' amount-failed':''}`}>{t.flow==='IN'?'+':'−'}{money(t.amount)}</td>{!compact&&<td data-label="Actions" className="actions-cell"><div className="row-actions">{!isTransfer(t)&&t.status!=='failed'&&<button className="icon-btn mini" title="Edit" aria-label="Edit transaction" onClick={()=>onEdit(t)}><Pencil size={15}/></button>}<button className="icon-btn mini danger" title="Delete" aria-label="Delete transaction" onClick={()=>onDelete(t.id)}><Trash2 size={15}/></button></div></td>}</tr>)}</tbody></table></div>
}
function AccountsPage({accounts,transactions,balanceFor,onAdd,onEdit,onDelete,openTransfer}) {
  return <><PageHeading title="My Accounts" subtitle="Manage your bank accounts and Cash (In Hand)." action={<div className="heading-actions"><button className="btn btn-outline" onClick={openTransfer}><ArrowLeftRight size={17}/> Transfer</button><button className="btn btn-primary" onClick={onAdd}><Plus size={17}/> Add account</button></div>}/>
    <div className="stats-grid three"><StatCard label="Combined balance" value={money(accounts.reduce((s,a)=>s+balanceFor(a),0))} note="All bank and cash accounts" icon={Wallet} tone="blue"/><StatCard label="Account count" value={accounts.length} note="Registered accounts" icon={Banknote} tone="green"/><StatCard label="Transactions" value={transactions.length} note="Across all accounts" icon={FileText} tone="purple"/></div>
    <section className="panel"><div className="panel-heading"><div><h2>Accounts overview</h2><p>Opening balance + income − outflows.</p></div></div><div className="account-list">{accounts.map(a=>{const inc=sum(transactions,t=>t.accountId===a.id&&t.flow==='IN'&&!isTransfer(t)),out=sum(transactions,t=>t.accountId===a.id&&t.flow==='OUT'&&!isTransfer(t));return <div className="account-list-row" key={a.id}><AccountCard account={a} balance={balanceFor(a)} income={inc} expense={out}/><div className="account-actions"><button className="btn btn-outline btn-small" onClick={()=>onEdit(a)}><Pencil size={14}/> Edit</button><button className="btn btn-danger-outline btn-small" onClick={()=>onDelete(a)}><Trash2 size={14}/> Delete</button></div></div>})}</div></section>
  </>
}
function CalculatorPage(){
  const [display,setDisplay]=useState('0'),[previous,setPrevious]=useState(null),[operator,setOperator]=useState(null),[fresh,setFresh]=useState(true)
  const [history,setHistory]=useState(()=>{try{const h=JSON.parse(localStorage.getItem('finora-calc-history'));return Array.isArray(h)?h:[]}catch{return []}})
  const saveHistory=h=>{setHistory(h);try{localStorage.setItem('finora-calc-history',JSON.stringify(h))}catch{}}
  // Returns the result string, or null after showing a divide-by-zero message.
  const compute=(a,op,b)=>{if(op==='÷'&&b===0){setDisplay('Cannot divide by zero');setPrevious(null);setOperator(null);setFresh(true);return null}const n=op==='+'?a+b:op==='−'?a-b:op==='×'?a*b:a/b;return String(Number(n.toFixed(8)))}
  const press=(v)=>{const num=Number(display),ok=display!==''&&Number.isFinite(num)
    if(['+','−','×','÷'].includes(v)){if(!ok)return;if(previous!==null&&operator){if(fresh){setOperator(v);return}const res=compute(previous,operator,num);if(res===null)return;setDisplay(res);setPrevious(Number(res))}else setPrevious(num);setOperator(v);setFresh(true);return}
    if(v==='C'){setDisplay('0');setPrevious(null);setOperator(null);setFresh(true);return}
    if(v==='⌫'){const s=display.slice(0,-1);setDisplay(ok&&s&&s!=='-'?s:'0');return}
    if(v==='='){if(previous===null||!operator||!ok)return;const res=compute(previous,operator,num);if(res===null)return;saveHistory([{expr:`${previous} ${operator} ${num}`,result:res,at:Date.now()},...history].slice(0,50));setDisplay(res);setPrevious(null);setOperator(null);setFresh(true);return}
    if(v==='%'){setDisplay(ok?String(num/100):'0');return}
    if(v==='±'){setDisplay(ok?String(-num):'0');return}
    if(v==='.'){if(fresh||!ok){setDisplay('0.');setFresh(false)}else if(!display.includes('.'))setDisplay(display+'.');return}
    setDisplay(fresh||!ok||display==='0'?v:display+v);setFresh(false)}
  const [mode,setMode]=useState('basic')
  return <><PageHeading title="Calculator" subtitle="A handy calculator for everyday financial calculations."/><div className="segmented" style={{marginBottom:16,width:'fit-content'}}><button className={mode==='basic'?'selected':''} onClick={()=>setMode('basic')}>Basic</button><button className={mode==='emi'?'selected':''} onClick={()=>setMode('emi')}>EMI</button><button className={mode==='simple'?'selected':''} onClick={()=>setMode('simple')}>Simple Interest</button><button className={mode==='compound'?'selected':''} onClick={()=>setMode('compound')}>Compound Interest</button><button className={mode==='diminishing'?'selected':''} onClick={()=>setMode('diminishing')}>Diminishing Interest</button></div>{mode==='emi'?<EmiCalculator/>:mode==='simple'?<SimpleCalculator/>:mode==='compound'?<CompoundCalculator/>:mode==='diminishing'?<DiminishingCalculator/>:<div className="calculator-layout"><section className="panel calculator-card"><div className="calculator-label"><CalculatorIcon size={19}/> Finora Calculator</div><div className="calculator-display"><small>{previous!==null?`${previous} ${operator}`:' '}</small><strong>{display}</strong></div><div className="calculator-keys">{['C','⌫','%','÷','7','8','9','×','4','5','6','−','1','2','3','+','±','0','.','='].map(k=><button key={k} className={`${['+','−','×','÷','='].includes(k)?'operator-key':''} ${k==='C'?'clear-key':''}`} onClick={()=>press(k)}>{k}</button>)}</div></section><section className="panel calc-history"><div className="calc-history-head"><h2>History</h2>{history.length>0&&<button className="text-button" onClick={()=>saveHistory([])}>Clear</button>}</div>{history.length===0?<div className="empty-state"><b>No calculations yet</b><span>Results appear here after you press =.</span></div>:<ul>{history.map(h=><li key={h.at}><button type="button" title="Use this result" onClick={()=>{setDisplay(h.result);setFresh(true);setPrevious(null);setOperator(null)}}><small>{h.expr} =</small><b>{h.result}</b></button></li>)}</ul>}</section></div>}</>
}
const calcMoney=v=>v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})
function CalcInputs({title,inputs,children}){
  return <section className="panel emi-inputs"><div className="calculator-label"><CalculatorIcon size={19}/> {title}</div>
    {inputs.map(([label,val,set,min,max,step])=><div className="emi-field" key={label}><div className="emi-field-head"><span>{label}</span><input type="number" min={min} step={step} value={val} onChange={e=>set(e.target.value)}/></div><input type="range" min={min} max={max} step={step} value={Math.min(Math.max(Number(val)||min,min),max)} onChange={e=>set(Number(e.target.value))}/></div>)}
    {children}
  </section>
}
function CalcResult({caption,main,pct,aLabel,bLabel,rows,schedule,scheduleHead}){
  return <section className="panel emi-result"><span className="emi-caption">{caption}</span><strong className="emi-amount">{main}</strong>
    <div className="emi-bar"><i style={{width:`${pct}%`}}/></div>
    <div className="emi-legend"><span><b className="dot principal"/>{aLabel} {pct}%</span><span><b className="dot interest"/>{bLabel} {100-pct}%</span></div>
    <dl className="emi-rows">{rows.map(([k,v,t])=><div key={k} className={t?'total':''}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    {schedule&&<div className="emi-table-wrap"><table className="emi-table"><thead><tr>{scheduleHead.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{schedule.map(r=><tr key={r[0]}>{r.map((c,i)=><td key={i}>{i===0?c:calcMoney(c)}</td>)}</tr>)}</tbody></table></div>}
  </section>
}
function SimpleCalculator(){
  const [amount,setAmount]=useState(100000),[rate,setRate]=useState(8),[years,setYears]=useState(5)
  const P=Number(amount),R=Number(rate)/100,Y=Number(years),valid=P>0&&Y>0&&R>=0
  const interest=valid?P*R*Y:0,total=P+interest,pct=valid?Math.round(P/total*100):0
  const schedule=valid?Array.from({length:Math.ceil(Y)},(_,i)=>{const t=Math.min(i+1,Y),open=P+P*R*i;return[`Year ${i+1}`,open,P*R*(t-i),P+P*R*t]}):null
  return <div className="emi-layout">
    <CalcInputs title="Simple Interest" inputs={[['Principal',amount,setAmount,0,10000000,10000],['Interest rate (% p.a.)',rate,setRate,0,30,0.1],['Time (years)',years,setYears,1,40,1]]}/>
    <CalcResult caption="Maturity amount" main={valid?calcMoney(total):'—'} pct={pct} aLabel="Principal" bLabel="Interest"
      rows={[['Principal',valid?calcMoney(P):'—'],['Interest earned (P × R × T)',valid?calcMoney(interest):'—'],['Total value',valid?calcMoney(total):'—',1]]}
      schedule={schedule} scheduleHead={['Year','Opening','Interest','Closing']}/>
  </div>
}
function CompoundCalculator(){
  const [amount,setAmount]=useState(100000),[rate,setRate]=useState(8),[years,setYears]=useState(10),[freq,setFreq]=useState(12)
  const P=Number(amount),R=Number(rate)/100,Y=Number(years),valid=P>0&&Y>0&&R>=0
  const at=t=>P*Math.pow(1+R/freq,freq*t)
  const total=valid?at(Y):0,interest=total-P,pct=valid?Math.round(P/total*100):0
  const schedule=valid?Array.from({length:Math.ceil(Y)},(_,i)=>{const t=Math.min(i+1,Y),open=at(i);return[`Year ${i+1}`,open,at(t)-open,at(t)]}):null
  return <div className="emi-layout">
    <CalcInputs title="Compound Interest" inputs={[['Principal',amount,setAmount,0,10000000,10000],['Interest rate (% p.a.)',rate,setRate,0,30,0.1],['Time (years)',years,setYears,1,40,1]]}>
      <div className="emi-field"><div className="emi-field-head"><span>Compounding</span><select value={freq} onChange={e=>setFreq(Number(e.target.value))}><option value={1}>Yearly</option><option value={2}>Half-yearly</option><option value={4}>Quarterly</option><option value={12}>Monthly</option><option value={365}>Daily</option></select></div></div>
    </CalcInputs>
    <CalcResult caption="Maturity amount" main={valid?calcMoney(total):'—'} pct={pct} aLabel="Principal" bLabel="Interest"
      rows={[['Principal',valid?calcMoney(P):'—'],['Interest earned',valid?calcMoney(interest):'—'],['Total value',valid?calcMoney(total):'—',1]]}
      schedule={schedule} scheduleHead={['Year','Opening','Interest','Closing']}/>
  </div>
}
function DiminishingCalculator(){
  const [amount,setAmount]=useState(500000),[rate,setRate]=useState(10),[years,setYears]=useState(5)
  const P=Number(amount),r=Number(rate)/1200,n=Math.round(Number(years)*12),valid=P>0&&n>0&&Number(rate)>=0
  const emi=!valid?0:r===0?P/n:P*r*Math.pow(1+r,n)/(Math.pow(1+r,n)-1)
  const total=emi*n,interest=Math.max(0,total-P),flat=P*Number(rate)/100*Number(years)
  const pct=valid?Math.round(P/total*100):0
  let schedule=null
  if(valid){let bal=P;schedule=[];for(let y=0;y*12<n;y++){let ti=0,tp=0;const open=bal;for(let m=0;m<12&&y*12+m<n;m++){const i=bal*r,pr=emi-i;ti+=i;tp+=pr;bal-=pr}schedule.push([`Year ${y+1}`,open,ti,tp,Math.max(0,bal)])}}
  return <div className="emi-layout">
    <CalcInputs title="Diminishing Interest" inputs={[['Loan amount',amount,setAmount,0,10000000,10000],['Interest rate (% p.a.)',rate,setRate,0,30,0.1],['Tenure (years)',years,setYears,0.5,30,0.5]]}>
      <p className="emi-note">Interest is charged only on the outstanding balance, which falls with every payment. A flat rate charges on the full amount throughout.</p>
    </CalcInputs>
    <CalcResult caption="Monthly payment" main={valid?calcMoney(emi):'—'} pct={pct} aLabel="Principal" bLabel="Interest"
      rows={[['Total interest (diminishing)',valid?calcMoney(interest):'—'],['Total interest (flat rate)',valid?calcMoney(flat):'—'],['You save vs flat',valid?calcMoney(Math.max(0,flat-interest)):'—'],['Total payment',valid?calcMoney(total):'—',1]]}
      schedule={schedule} scheduleHead={['Year','Opening','Interest','Principal','Balance']}/>
  </div>
}
function EmiCalculator(){
  const [amount,setAmount]=useState(500000),[rate,setRate]=useState(9),[years,setYears]=useState(5)
  const P=Number(amount),r=Number(rate)/12/100,n=Math.round(Number(years)*12)
  const valid=P>0&&n>0&&Number(rate)>=0
  const emi=!valid?0:r===0?P/n:P*r*Math.pow(1+r,n)/(Math.pow(1+r,n)-1)
  const total=emi*n,interest=Math.max(0,total-P),pct=valid?Math.round(P/total*100):0
  const money=v=>v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})
  const inputs=[
    ['Loan amount',amount,setAmount,0,10000000,10000],
    ['Interest rate (% p.a.)',rate,setRate,0,30,0.1],
    ['Tenure (years)',years,setYears,0.5,30,0.5]
  ]
  return <div className="emi-layout"><section className="panel emi-inputs"><div className="calculator-label"><CalculatorIcon size={19}/> EMI Calculator</div>
    {inputs.map(([label,val,set,min,max,step])=><div className="emi-field" key={label}><div className="emi-field-head"><span>{label}</span><input type="number" min={min} step={step} value={val} onChange={e=>set(e.target.value)}/></div><input type="range" min={min} max={max} step={step} value={Math.min(Math.max(Number(val)||min,min),max)} onChange={e=>set(Number(e.target.value))}/></div>)}
  </section><section className="panel emi-result"><span className="emi-caption">Monthly EMI</span><strong className="emi-amount">{valid?money(emi):'—'}</strong>
    <div className="emi-bar"><i style={{width:`${pct}%`}}/></div>
    <div className="emi-legend"><span><b className="dot principal"/>Principal {valid?`${pct}%`:''}</span><span><b className="dot interest"/>Interest {valid?`${100-pct}%`:''}</span></div>
    <dl className="emi-rows"><div><dt>Principal amount</dt><dd>{valid?money(P):'—'}</dd></div><div><dt>Total interest</dt><dd>{valid?money(interest):'—'}</dd></div><div className="total"><dt>Total payment</dt><dd>{valid?money(total):'—'}</dd></div><div><dt>Number of months</dt><dd>{valid?n:'—'}</dd></div></dl>
  </section></div>
}
function NotesPage({initialQuery='',notes,saveNote,removeNote,deleteNoteForever}) {
  const [query,setQuery]=useState(initialQuery),[showArchived,setShowArchived]=useState(false),[showTrash,setShowTrash]=useState(false),[editor,setEditor]=useState(null),[labelFilter,setLabelFilter]=useState('all')
  const allNotes=notes.filter(n=>showTrash?n.deleted:showArchived?n.archived:!n.archived&&!n.deleted)
  const visible=allNotes.filter(n=>`${n.title} ${n.content} ${(n.checklist||[]).map(c=>c.text).join(' ')} ${(n.labels||[]).join(' ')} ${(n.pdfs||[]).map(f=>f.name).join(' ')}`.toLowerCase().includes(query.toLowerCase())&&(labelFilter==='all'||(n.labels||[]).includes(labelFilter)))
  const labels=[...new Set(notes.flatMap(n=>n.labels||[]))]
  const blank={title:'',content:'',images:[],labels:[],color:'white',pinned:false,archived:false,deleted:false}
  const [menuOpen,setMenuOpen]=useState(false),menuRef=useRef(null),imgRef=useRef(null)
  useEffect(()=>{
    if(!menuOpen)return
    const off=e=>{if(!menuRef.current?.contains(e.target))setMenuOpen(false)},esc=e=>e.key==='Escape'&&setMenuOpen(false)
    document.addEventListener('mousedown',off);document.addEventListener('keydown',esc)
    return()=>{document.removeEventListener('mousedown',off);document.removeEventListener('keydown',esc)}
  },[menuOpen])
  const openNew=mode=>{setMenuOpen(false);if(mode==='image')imgRef.current?.click();else setEditor({...blank,mode})}
  async function pickImages(files){
    const chosen=Array.from(files||[]).filter(f=>f.type.startsWith('image/'))
    if(!chosen.length)return
    if(chosen.length>8){popToast('Please add up to 8 images at a time.');return}
    try{setEditor({...blank,mode:'image',images:await Promise.all(chosen.map(f=>compressImage(f)))})}catch{popToast('Could not read one of the images.')}
  }
  const flip=async(note,key)=>saveNote({...note,[key]:!note[key]})
  return <><PageHeading title="Notes" subtitle="Capture ideas, lists, and image notes — like a digital pinboard." action={<div className="new-note-menu" ref={menuRef}><button className="btn btn-primary" aria-haspopup="menu" aria-expanded={menuOpen} onClick={()=>setMenuOpen(o=>!o)}><Plus size={17}/> New note <ChevronDown size={15}/></button>{menuOpen&&<div className="new-note-list" role="menu">{[['text','Text note',TextIcon],['list','List',ListChecks],['image','Image',ImagePlus]].map(([k,l,Icon])=><button type="button" role="menuitem" key={k} onClick={()=>openNew(k)}><Icon size={17}/>{l}</button>)}</div>}<input ref={imgRef} hidden type="file" accept="image/*" multiple onChange={e=>{pickImages(e.target.files);e.target.value=''}}/></div>}/>
    <div className="notes-toolbar"><label className="notes-search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search your notes..."/></label><div className="segmented"><button className={!showArchived&&!showTrash?'selected':''} onClick={()=>{setShowArchived(false);setShowTrash(false)}}>Notes</button><button className={showArchived?'selected':''} onClick={()=>{setShowArchived(true);setShowTrash(false)}}><Archive size={14}/> Archive</button><button className={showTrash?'selected':''} onClick={()=>{setShowTrash(true);setShowArchived(false)}}><Trash2 size={14}/> Trash</button></div></div>
    {labels.length>0&&<div className="label-filter"><span>Labels</span><button className={labelFilter==='all'?'selected':''} onClick={()=>setLabelFilter('all')}>All</button>{labels.map(l=><button key={l} className={labelFilter===l?'selected':''} onClick={()=>setLabelFilter(l)}>{l}</button>)}</div>}
    {visible.filter(n=>n.pinned).length>0&&!showArchived&&!showTrash&&<><div className="notes-section-title"><Pin size={15}/> PINNED</div><div className="notes-grid">{visible.filter(n=>n.pinned).map(n=><NoteCard key={n.id||n.title} note={n} onEdit={()=>setEditor(n)} onPin={()=>flip(n,'pinned')} onArchive={()=>flip(n,'archived')} onDelete={()=>removeNote(n)} onRestore={()=>saveNote({...n,deleted:false})} onPermanentDelete={()=>deleteNoteForever(n)} onToggleItem={i=>db.notes.update(n.id,{checklist:n.checklist.map((x,j)=>j===i?{...x,done:!x.done}:x),updatedAt:new Date().toISOString()})} showTrash={showTrash}/>)}</div><div className="notes-section-title">OTHERS</div></>}
    <div className="notes-grid">{visible.filter(n=>showArchived||showTrash||!n.pinned).map(n=><NoteCard key={n.id||n.title} note={n} onEdit={()=>setEditor(n)} onPin={()=>flip(n,'pinned')} onArchive={()=>flip(n,'archived')} onDelete={()=>removeNote(n)} onRestore={()=>saveNote({...n,deleted:false})} onPermanentDelete={()=>deleteNoteForever(n)} onToggleItem={i=>db.notes.update(n.id,{checklist:n.checklist.map((x,j)=>j===i?{...x,done:!x.done}:x),updatedAt:new Date().toISOString()})} showTrash={showTrash}/>)}</div>
    {visible.length===0&&<div className="empty-state notes-empty"><NotebookPen size={30}/><b>No notes here yet</b><span>Create a note, add an image, or try a different search.</span><button className="btn btn-outline" onClick={openNew}><Plus size={16}/> Create note</button></div>}
    {editor&&<NoteEditor note={editor} onClose={()=>setEditor(null)} onSave={async ({mode,...n})=>{await saveNote(n);setEditor(null)}}/>}
  </>
}
const PDF_MAX_MB = 10
const fmtSize = b => b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`
function PdfViewer({ file, onClose }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])
  useEffect(() => {
    let objectUrl = ''
    fetch(file.data).then(r => r.blob()).then(b => { objectUrl = URL.createObjectURL(b); setUrl(objectUrl) }).catch(() => setUrl(''))
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [file])
  return createPortal(<div className="modal-backdrop pdf-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <div className="modal pdf-modal" role="dialog" aria-modal="true" aria-label={`PDF: ${file.name}`}>
      <div className="modal-header"><div><span className="eyebrow">PDF ATTACHMENT</span><h2>{file.name}</h2></div>
        <div className="pdf-actions">
          {url && <a className="btn btn-outline btn-small" href={url} download={file.name}><Download size={15}/> Download</a>}
          <button className="icon-btn" aria-label="Close viewer" onClick={onClose}><X size={20}/></button>
        </div></div>
      {url ? <iframe className="pdf-frame" src={url} title={file.name}/> : <div className="empty-state"><FileText size={28}/><b>Loading PDF…</b></div>}
    </div>
  </div>, document.body)
}
function ImageViewer({ images, start = 0, onClose }) {
  const [i, setI] = useState(start)
  const n = images.length
  const go = d => setI(c => (c + d + n) % n)
  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
      else if (e.key === 'ArrowLeft') { e.stopPropagation(); go(-1) }
      else if (e.key === 'ArrowRight') { e.stopPropagation(); go(1) }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [n, onClose])
  return createPortal(<div className="modal-backdrop image-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()} onClick={e => e.stopPropagation()}>
    <div className="image-viewer" role="dialog" aria-modal="true" aria-label={`Image ${i + 1} of ${n}`}>
      <div className="image-viewer-bar"><span>{i + 1} / {n}</span><div>
        <a className="btn btn-outline btn-small" href={images[i]} download={`note-image-${i + 1}`}><Download size={15}/> Download</a>
        <button className="icon-btn" aria-label="Close preview" onClick={onClose}><X size={20}/></button></div></div>
      <div className="image-viewer-stage">
        {n > 1 && <button className="image-nav prev" aria-label="Previous image" onClick={() => go(-1)}>‹</button>}
        <img src={images[i]} alt={`Attachment ${i + 1}`}/>
        {n > 1 && <button className="image-nav next" aria-label="Next image" onClick={() => go(1)}>›</button>}
      </div>
    </div>
  </div>, document.body)
}
function PdfChips({ pdfs, onOpen }) {
  if (!pdfs?.length) return null
  return <div className="pdf-chips">{pdfs.map((f, i) => <button key={i} type="button" className="pdf-chip" title={`View ${f.name}`} onClick={e => { e.stopPropagation(); onOpen(f) }}><FileText size={14}/><span>{f.name}</span></button>)}</div>
}
function NoteCard({note,onEdit,onPin,onArchive,onDelete,onRestore,onPermanentDelete,onToggleItem,showTrash}) {
  const confirmFn=useConfirm()
  const [viewPdf,setViewPdf]=useState(null),[viewImg,setViewImg]=useState(null)
  return <article className={`note-card note-${note.color||'white'}`}><div className="note-card-actions"><button className={`icon-btn mini ${note.pinned?'pin-active':''}`} title={note.pinned?'Unpin note':'Pin note'} aria-label={note.pinned?'Unpin note':'Pin note'} aria-pressed={!!note.pinned} onClick={onPin}><Pin size={15}/></button><button className="icon-btn mini" title="Edit note" aria-label="Edit note" onClick={onEdit}><MoreVertical size={16}/></button></div><div className="note-card-content" onClick={onEdit} onKeyDown={e=>(e.key==='Enter'||e.key===' ')&&(e.preventDefault(),onEdit())} role="button" tabIndex={0}><h3>{note.title||'Untitled note'}</h3>{note.images?.length>0&&<div className="note-image-grid">{note.images.slice(0,3).map((src,i)=><img key={i} src={src} alt="Note attachment" className="zoomable" title="Preview image" onClick={e=>{e.stopPropagation();setViewImg(i)}}/>)}{note.images.length>3&&<span>+{note.images.length-3}</span>}</div>}{note.content&&<p>{note.content}</p>}{note.dueDate&&<span className={`note-due ${note.dueDate<=todayISO()&&!note.deleted?'overdue':''}`}>Due {dateDMY(note.dueDate)}</span>}<PdfChips pdfs={note.pdfs} onOpen={setViewPdf}/>{note.labels?.length>0&&<div className="note-labels">{note.labels.map(l=><span key={l}>{l}</span>)}</div>}</div>{note.checklist?.length>0&&<ul className="note-checklist">{note.checklist.slice(0,6).map((it,i)=><li key={i}><label><input type="checkbox" checked={!!it.done} disabled={showTrash} onChange={()=>onToggleItem(i)}/><span className={it.done?'done':''}>{it.text}</span></label></li>)}{note.checklist.length>6&&<li className="more">+{note.checklist.length-6} more</li>}</ul>}<div className="note-card-footer"><small>{new Date(note.updatedAt||note.createdAt||Date.now()).toLocaleDateString('en-GB',{day:'2-digit',month:'short'})}</small><div>{showTrash?<><button className="icon-btn mini" title="Restore" aria-label="Restore note" onClick={onRestore}><Upload size={14}/></button><button className="icon-btn mini danger" title="Delete permanently" aria-label="Delete note permanently" onClick={async()=>(await confirmFn('This note and its images will be removed for good.',{title:'Delete note forever?',confirmLabel:'Delete forever',danger:true}))&&onPermanentDelete()}><Trash2 size={14}/></button></>:<><button className="icon-btn mini" title="Archive" aria-label="Archive note" onClick={onArchive}><Archive size={14}/></button><button className="icon-btn mini danger" title="Move to trash" aria-label="Move note to trash" onClick={onDelete}><Trash2 size={14}/></button></>}</div></div>{viewPdf&&<PdfViewer file={viewPdf} onClose={()=>setViewPdf(null)}/>}{viewImg!==null&&<ImageViewer images={note.images} start={viewImg} onClose={()=>setViewImg(null)}/>}</article>
}
function NoteEditor({note,onClose,onSave}) {
  useModalA11y(onClose)
  const [form,setForm]=useState({...note,images:note.images||[],pdfs:note.pdfs||[],labels:note.labels||[],checklist:note.checklist||[]}),[labelText,setLabelText]=useState((note.labels||[]).join(', '))
  // Text / list / image: decides which parts of the note are shown first; existing notes show whatever they contain.
  const kind=note.mode||(note.checklist?.length&&!note.content?'list':'text')
  const fileRef=useRef(null),pdfRef=useRef(null),[viewPdf,setViewPdf]=useState(null),[viewImg,setViewImg]=useState(null),[newItem,setNewItem]=useState('')
  const addItem=()=>{const text=newItem.trim();if(!text)return;set('checklist',[...form.checklist,{text,done:false}]);setNewItem('')}
  const set=(k,v)=>setForm(p=>({...p,[k]:v}))
  async function addImages(files){const chosen=Array.from(files||[]).filter(f=>f.type.startsWith('image/'));if(chosen.length>8){popToast('Please add up to 8 images at a time.');return}try{const urls=await Promise.all(chosen.map(f=>compressImage(f)));set('images',[...form.images,...urls].slice(0,12))}catch{popToast('Could not read one of the images.')} }
  async function addPdfs(files){const chosen=Array.from(files||[]).filter(f=>f.type==='application/pdf'||/\.pdf$/i.test(f.name));if(!chosen.length){popToast('Please choose PDF files.');return}const tooBig=chosen.filter(f=>f.size>PDF_MAX_MB*1048576);if(tooBig.length){popToast(`${tooBig[0].name} is larger than ${PDF_MAX_MB} MB.`);return}if(form.pdfs.length+chosen.length>10){popToast('You can attach up to 10 PDFs per note.');return}try{const added=await Promise.all(chosen.map(async f=>({name:f.name,size:f.size,type:'application/pdf',data:await imageToDataUrl(f)})));set('pdfs',[...form.pdfs,...added])}catch{popToast('Could not read one of the PDFs.')} }
  return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className="modal note-editor-modal" role="dialog" aria-modal="true" aria-label={note.id?'Edit note':'Create a note'}><div className="modal-header"><div><span className="eyebrow">FINORA NOTES</span><h2>{note.id?'Edit note':kind==='list'?'New list':kind==='image'?'New image note':'New note'}</h2></div><button className="icon-btn" aria-label="Close dialog" onClick={onClose}><X size={20}/></button></div>
    <div className={`note-editor-body note-${form.color||'white'}`}><input className="note-title-input" value={form.title} onChange={e=>set('title',e.target.value)} placeholder="Title"/>{(kind!=='list'||form.content)&&<textarea value={form.content} onChange={e=>set('content',e.target.value)} placeholder={kind==='image'?'Add a caption...':'Write your note...'} rows={kind==='image'?3:6}/>}{(kind==='list'||form.checklist.length>0)&&<div className="checklist-editor" aria-label="Checklist">{form.checklist.map((it,i)=><div className="check-row" key={i}><input type="checkbox" aria-label="Done" checked={!!it.done} onChange={()=>set('checklist',form.checklist.map((x,j)=>j===i?{...x,done:!x.done}:x))}/><input className={it.done?'done':''} value={it.text} onChange={e=>set('checklist',form.checklist.map((x,j)=>j===i?{...x,text:e.target.value}:x))}/><button type="button" className="icon-btn mini" aria-label="Remove item" onClick={()=>set('checklist',form.checklist.filter((_,j)=>j!==i))}><X size={14}/></button></div>)}<div className="check-row"><Plus size={16}/><input autoFocus={kind==='list'&&!note.id} value={newItem} onChange={e=>setNewItem(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addItem()}}} placeholder="Add a checklist item and press Enter"/><button type="button" className="btn btn-outline btn-small" onClick={addItem}>Add</button></div></div>}{form.images.length>0&&<div className="editor-image-grid">{form.images.map((src,i)=><div key={i}><img src={src} alt={`Attachment ${i+1}`} className="zoomable" title="Preview image" onClick={()=>setViewImg(i)}/><button type="button" onClick={()=>set('images',form.images.filter((_,idx)=>idx!==i))}><X size={14}/></button></div>)}</div>}
    {form.pdfs.length>0&&<div className="pdf-list">{form.pdfs.map((f,i)=><div key={i} className="pdf-row"><FileText size={18}/><div><b>{f.name}</b><small>{fmtSize(f.size)}</small></div><button type="button" className="btn btn-outline btn-small" onClick={()=>setViewPdf(f)}><Eye size={14}/> View</button><button type="button" className="icon-btn mini danger" aria-label={`Remove ${f.name}`} onClick={()=>set('pdfs',form.pdfs.filter((_,idx)=>idx!==i))}><X size={15}/></button></div>)}</div>}
    </div><div className="editor-options"><label>Note color<select value={form.color||'white'} onChange={e=>set('color',e.target.value)}><option value="white">White</option><option value="blue">Soft blue</option><option value="green">Soft green</option><option value="yellow">Soft yellow</option><option value="pink">Soft pink</option><option value="purple">Soft purple</option></select></label><div className="date-field"><span>Due date</span><DatePicker clearable label="Due date" placeholder="No due date" value={form.dueDate||''} onChange={v=>set('dueDate',v)}/></div><label>Labels<input value={labelText} onChange={e=>{setLabelText(e.target.value);set('labels',e.target.value.split(',').map(x=>x.trim()).filter(Boolean))}} placeholder="Personal, Work, Ideas"/></label></div>
    <div className="modal-footer"><div className="editor-tools"><button className="btn btn-outline btn-small" onClick={()=>fileRef.current?.click()}><ImagePlus size={16}/> Add images</button><input ref={fileRef} hidden type="file" accept="image/*" multiple onChange={e=>{addImages(e.target.files);e.target.value=''}}/><button className="btn btn-outline btn-small" type="button" onClick={()=>pdfRef.current?.click()}><FileText size={16}/> Attach PDF</button><input ref={pdfRef} hidden type="file" accept="application/pdf,.pdf" multiple onChange={e=>{addPdfs(e.target.files);e.target.value=''}}/><button className={`icon-btn ${form.pinned?'pin-active':''}`} title="Pin note" onClick={()=>set('pinned',!form.pinned)}><Pin size={17}/></button></div><div><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={()=>onSave(form)}>Save note</button></div></div>
  {viewPdf&&<PdfViewer file={viewPdf} onClose={()=>setViewPdf(null)}/>}
  {viewImg!==null&&<ImageViewer images={form.images} start={viewImg} onClose={()=>setViewImg(null)}/>}
  </div></div>
}
function BackupPage({exportBackup,importBackup,auto,onLinkAuto,onResumeAuto,onUnlinkAuto}) {
  const ref=useRef(null),[password,setPassword]=useState(''),[storage,setStorage]=useState(null),[persisted,setPersisted]=useState(null)
  useEffect(()=>{navigator.storage?.estimate?.().then(e=>setStorage(e)).catch(()=>{});navigator.storage?.persisted?.().then(setPersisted).catch(()=>{})},[])
  const mb=n=>`${(n/1048576).toFixed(1)} MB`,last=getLastBackup()
  return <><PageHeading title="Backup & Restore" subtitle="Keep a portable copy of your Finora data."/><div className="backup-grid"><section className="panel backup-card"><div className="backup-icon blue"><Download size={23}/></div><h2>Export backup</h2><p>Download accounts, transactions, budgets, goals, notes, and attached images in a JSON file. Keep this file somewhere safe.</p><ul><li>All accounts and opening balances</li><li>All transactions, budgets, goals and categories</li><li>Notes, labels, colors, and images</li></ul><label className="backup-password">Backup password (optional, encrypts the file)<input type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Leave empty for a plain file"/></label><button className="btn btn-primary" onClick={()=>exportBackup(password)}><Download size={17}/> {password?'Export encrypted backup':'Export all data'}</button><small className="backup-status">{last?`Last backup: ${new Date(last).toLocaleString()}`:'No backup exported yet.'}{password&&' If you lose the password the file cannot be recovered.'}</small></section><section className="panel backup-card"><div className="backup-icon green"><Upload size={23}/></div><h2>Import backup</h2><p>Restore data from a Finora backup created on this or another device.</p><div className="warning-box"><ShieldCheck size={18}/><span>Import replaces all existing local Finora data. Export your current data first if you may need it.</span></div><input ref={ref} type="file" accept=".json,application/json" hidden onChange={e=>{if(e.target.files?.[0])importBackup(e.target.files[0],password);e.target.value=''}}/><small className="backup-status">Importing an encrypted backup uses the password typed in the export card.</small><button className="btn btn-outline" onClick={()=>ref.current?.click()}><Upload size={17}/> Choose backup file</button></section></div><AutoBackupCard auto={auto} onLink={onLinkAuto} onResume={onResumeAuto} onUnlink={onUnlinkAuto}/><section className="panel local-notice"><div className="stat-icon blue"><LockKeyhole size={21}/></div><div><h2>Local-first storage</h2>{storage?.usage!=null&&<p><b>Storage used: {mb(storage.usage)}</b>{storage.quota?` of ${mb(storage.quota)} available`:''}{persisted===true?' · protected from automatic clean-up':persisted===false?' · the browser may clear it under storage pressure':''}</p>}<p>Finora stores data in this browser's IndexedDB. This version has no cloud synchronization, no account sign-in, and no automatic sharing between devices. Use export/import to move data between your laptop and mobile device.</p></div></section></>
}
function TransactionModal({accounts,balances,categories=CATEGORIES,initial,onClose,onSave}) {
  useModalA11y(onClose)
  const [form,setForm]=useState({frequency:'monthly',...initial,accountId:initial.accountId||accounts[0]?.id||''})
  const set=(k,v)=>setForm(p=>({...p,[k]:v}))
  // Two-way toggle: Expense = money out (investments are an expense category), Income = money in.
  const isIncome=form.transactionType==='INCOME'
  // Cash / wallet accounts can only be paid in cash, so the payment method is fixed for them.
  const cashOnly=isCashAccount(accounts.find(a=>String(a.id)===String(form.accountId)))
  const changeAccount=id=>setForm(p=>{const cash=isCashAccount(accounts.find(a=>String(a.id)===String(id)));return {...p,accountId:id,paymentMethod:cash?'Cash':p.paymentMethod==='Cash'?'UPI':p.paymentMethod}})
  // Balance available to spend; when editing, the transaction's own effect is backed out first.
  const acct=accounts.find(a=>String(a.id)===String(form.accountId))
  const sameAcct=initial.id&&String(initial.accountId)===String(form.accountId)
  const available=acct?(balances?.get(acct.id)??Number(acct.openingBalance||0))+(sameAcct?(initial.flow==='IN'?-1:1)*Number(initial.amount||0):0):0
  const overspend=!isIncome&&acct&&Number(form.amount)>available
  const changeType=v=>setForm(p=>({...p,transactionType:v,flow:v==='INCOME'?'IN':'OUT',category:''}))
  // Income can also be credited to an investment category (e.g. returns or a sale), so those are offered alongside the income ones.
  const catOptions=[...new Set([...(isIncome?[...categories.filter(isIncomeCategory),...categories.filter(isInvestmentCategory)]:categories.filter(c=>!isIncomeCategory(c))),form.category].filter(Boolean))]
  const submit=e=>{e.preventDefault();if(overspend){alert(`Insufficient balance in ${acct.name}. Available: ${money(available)}.`);return};const income=form.transactionType==='INCOME';onSave({...form,...(cashOnly?{paymentMethod:'Cash'}:{}),flow:income?'IN':'OUT',transactionType:income?'INCOME':isInvestmentCategory(form.category)?'INVESTMENT':'EXPENSE'})}
  return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className="modal" role="dialog" aria-modal="true" aria-label={initial.id?'Edit transaction':'Add transaction'}><div className="modal-header"><div><span className="eyebrow">FINORA TRANSACTIONS</span><h2>{initial.id?'Edit transaction':'Add transaction'}</h2></div><button className="icon-btn" aria-label="Close dialog" onClick={onClose}><X size={20}/></button></div><form onSubmit={submit}><div className="form-grid"><div className="date-field"><span>Date *</span><DatePicker value={form.date} onChange={v=>set('date',v)}/></div><div className="full-field type-field"><span>Transaction type *</span><div className="segmented type-toggle" role="group" aria-label="Transaction type"><button type="button" aria-pressed={!isIncome} className={!isIncome?'selected expense':''} onClick={()=>isIncome&&changeType('EXPENSE')}><ArrowUpRight size={15}/> Expense</button><button type="button" aria-pressed={isIncome} className={isIncome?'selected income':''} onClick={()=>!isIncome&&changeType('INCOME')}><ArrowDownLeft size={15}/> Income</button></div></div><div className="field-block"><span>Category *</span><CategoryCombobox required kind={isIncome?'income':'expense'} value={form.category} names={catOptions} otherName={isIncome?'Other income':'Other'} onChange={v=>set('category',v)}/></div><label>Account *<select required value={form.accountId} onChange={e=>changeAccount(e.target.value)}>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select>{acct&&<small className="balance-hint">Available balance: <b>{money(available)}</b></small>}</label><label>Amount ({currencySymbol()}) *<input required autoFocus min="0.01" step="0.01" type="number" value={form.amount} onChange={e=>set('amount',e.target.value)} placeholder="0.00"/>{overspend&&<small className="balance-warning" role="alert">Amount exceeds available balance of {money(available)}.</small>}</label>{cashOnly?<div className="field-block"><span>Payment method</span><div className="fixed-field" aria-live="polite"><Banknote size={16}/> Cash</div></div>:<div className="field-block"><span>Payment method</span><PaymentSelect value={form.paymentMethod} onChange={v=>set('paymentMethod',v)}/></div>}<label className="checkbox-field"><input type="checkbox" checked={!!form.recurrence} onChange={e=>set('recurrence',e.target.checked)}/> Repeat automatically</label>{form.recurrence&&<label>Repeats<select value={form.frequency||'monthly'} onChange={e=>set('frequency',e.target.value)}>{Object.entries(FREQUENCIES).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>}{form.recurrence&&<div className="date-field"><span>Stop repeating after (optional)</span><DatePicker value={form.endDate||''} onChange={v=>set('endDate',v)} clearable placeholder="Never stops"/></div>}<label className="full-field">Description (maximum 30 words)<textarea rows="3" value={form.description} onChange={e=>set('description',e.target.value.split(/\s+/).filter(Boolean).slice(0,30).join(' '))} placeholder="Add a short description..."/></label></div><div className="modal-footer"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button type="submit" className="btn btn-primary"><Check size={16}/> Save transaction</button></div></form></div></div>
}
function TransferModal({accounts,balances,onClose,onSave}) {
  useModalA11y(onClose)
  const [form,setForm]=useState({fromId:accounts[0]?.id||'',toId:accounts[1]?.id||'',amount:'',date:todayISO(),note:''})
  const set=(k,v)=>setForm(p=>({...p,[k]:v}))
  const from=accounts.find(a=>a.id===Number(form.fromId))
  const available=from?(balances?.get(from.id)??Number(from.openingBalance||0)):0
  const overspend=!!from&&Number(form.amount)>available
  const submit=e=>{e.preventDefault();if(overspend){alert(`Insufficient balance in ${from.name}. Available: ${money(available)}.`);return};onSave(form)}
  return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className="modal small-modal" role="dialog" aria-modal="true" aria-label="Transfer between accounts"><div className="modal-header"><div><span className="eyebrow">FINORA TRANSFERS</span><h2>Transfer between accounts</h2></div><button className="icon-btn" aria-label="Close dialog" onClick={onClose}><X size={20}/></button></div><form onSubmit={submit}><div className="form-grid one-column"><label>From account *<select required value={form.fromId} onChange={e=>set('fromId',Number(e.target.value))}>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select>{from&&<small className="balance-hint">Available balance: <b>{money(available)}</b></small>}</label><label>To account *<select required value={form.toId} onChange={e=>set('toId',Number(e.target.value))}>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label>Amount ({currencySymbol()}) *<input required autoFocus min="0.01" step="0.01" type="number" value={form.amount} onChange={e=>set('amount',e.target.value)} placeholder="0.00"/>{overspend&&<small className="balance-warning" role="alert">Amount exceeds the available balance of {money(available)}.</small>}</label><div className="date-field"><span>Date *</span><DatePicker value={form.date} onChange={v=>set('date',v)}/></div><label>Note<input value={form.note} maxLength={80} onChange={e=>set('note',e.target.value)} placeholder="Optional"/></label></div><p className="muted-note">A transfer moves money between your accounts. It changes balances but is not counted as income or expense.</p><div className="modal-footer"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button type="submit" className="btn btn-primary"><Check size={16}/> Record transfer</button></div></form></div></div>
}
function BudgetsPage({transactions,budgets,saveBudget,deleteBudget,categories,customCategories,addCategory,deleteCategory}) {
  const budgetable=categories.filter(isExpenseCategory)
  const [category,setCategory]=useState('Food'),[limit,setLimit]=useState(''),[newCat,setNewCat]=useState(''),[newKind,setNewKind]=useState('expense')
  const [from,to]=periodRange('Month')
  const month=new Date().toLocaleDateString('en-GB',{month:'long',year:'numeric'})
  const spent=c=>sum(transactions,t=>t.category===c&&t.flow==='OUT'&&!isTransfer(t)&&t.date>=from&&t.date<=to)
  const rows=[...budgets].sort((a,b)=>a.category.localeCompare(b.category)).map(b=>{const s=spent(b.category);return {...b,spent:s,pct:Math.round(s/b.limit*100)}})
  const totalLimit=rows.reduce((n,r)=>n+r.limit,0),totalSpent=rows.reduce((n,r)=>n+r.spent,0)
  const tone=p=>p>=100?'#ef4444':p>=80?'#f59e0b':'#10b981'
  return <><PageHeading title="Budgets" subtitle={`Monthly spending limits by category — ${month}.`}/>
    <div className="stats-grid three"><StatCard label="Total budgeted" value={money(totalLimit)} note={`${rows.length} categories`} icon={Target} tone="blue"/><StatCard label="Spent this month" value={money(totalSpent)} note="Within budgeted categories" icon={ArrowUpRight} tone="red"/><StatCard label="Remaining" value={money(totalLimit-totalSpent)} note={totalLimit-totalSpent<0?'Over budget':'Left to spend'} icon={Wallet} tone="green"/></div>
    <section className="panel"><div className="panel-heading"><div><h2>Set a budget</h2><p>Saving a category that already has a budget updates its limit.</p></div></div>
      <form className="filter-bar" onSubmit={async e=>{e.preventDefault();if(await saveBudget({category,limit}))setLimit('')}}><CategoryCombobox otherName="" value={category} names={budgetable} onChange={setCategory}/><input type="number" min="1" step="1" value={limit} onChange={e=>setLimit(e.target.value)} placeholder={`Monthly limit (${currencySymbol()})`} aria-label="Monthly limit"/><button className="btn btn-primary" type="submit"><Plus size={17}/> Save budget</button></form></section>
    <section className="panel"><div className="panel-heading"><div><h2>Progress</h2><p>Warns at 80% and turns red when a limit is exceeded.</p></div></div>
      {rows.length===0?<div className="empty-state"><Target size={28}/><b>No budgets yet</b><span>Pick a category above and set a monthly limit.</span></div>:<div className="budget-list">{rows.map(r=><div className="budget-row" key={r.id}><div className="budget-head"><CategoryBadge name={r.category}/><span>{money(r.spent)} of {money(r.limit)}{r.pct>=100?' · over budget':r.pct>=80?' · nearing limit':''}</span><button className="icon-btn mini danger" aria-label={`Delete ${r.category} budget`} onClick={()=>deleteBudget(r)}><Trash2 size={15}/></button></div><div className="budget-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(r.pct,100)} aria-label={`${r.category} budget used`}><i style={{width:`${Math.min(r.pct,100)}%`,background:tone(r.pct)}}/></div><small>{r.pct}% used</small></div>)}</div>}
    </section>
    <section className="panel"><div className="panel-heading"><div><h2>Custom categories</h2><p>Add your own categories for transactions and budgets.</p></div></div>
      <form className="filter-bar" onSubmit={async e=>{e.preventDefault();if(await addCategory(newCat,newKind))setNewCat('')}}><div className="segmented" role="group" aria-label="Category type">{[['expense','Expense'],['income','Income']].map(([k,l])=><button type="button" key={k} aria-pressed={newKind===k} className={newKind===k?'selected':''} onClick={()=>setNewKind(k)}>{l}</button>)}</div><input value={newCat} maxLength={24} onChange={e=>setNewCat(e.target.value)} placeholder="e.g. Pets" aria-label="New category name"/><button className="btn btn-outline" type="submit"><Plus size={17}/> Add category</button></form>
      {customCategories.length>0&&<div className="chip-list">{customCategories.map(c=><span className="chip" key={c.id}>{c.name}<small className="chip-kind">{c.kind==='income'?'Income':'Expense'}</small><button aria-label={`Delete ${c.name}`} onClick={()=>deleteCategory(c)}><X size={13}/></button></span>)}</div>}
    </section></>
}
function InsightsPage({transactions}) {
  const today=todayISO()
  const trend=useMemo(()=>monthlyTrend(transactions,today),[transactions,today])
  const changes=useMemo(()=>categoryChanges(transactions,today),[transactions,today])
  const forecast=useMemo(()=>forecastMonth(transactions,today),[transactions,today])
  const payees=useMemo(()=>topPayees(transactions,{since:trend[0].month+'-01'}),[transactions,trend])
  const upcoming=useMemo(()=>upcomingRecurring(transactions,today,30),[transactions,today])
  const label=m=>new Date(`${m}-01T00:00:00`).toLocaleDateString('en-GB',{month:'short',year:'2-digit'})
  const cur=trend[trend.length-1],prev=trend[trend.length-2]
  const withIncome=trend.filter(r=>r.income>0)
  const avgRate=withIncome.length?Math.round(withIncome.reduce((n,r)=>n+(r.income-r.expense),0)/withIncome.reduce((n,r)=>n+r.income,0)*100):null
  const delta=prev.expense>0?Math.round((cur.expense-prev.expense)/prev.expense*100):null
  const monthName=new Date().toLocaleDateString('en-GB',{month:'long',year:'numeric'})
  if(!transactions.length)return <><PageHeading title="Insights" subtitle="Trends, forecasts and upcoming bills from your transactions."/><section className="panel"><div className="empty-state"><Lightbulb size={28}/><b>No data yet</b><span>Add a few transactions and insights will appear here.</span></div></section></>
  return <><PageHeading title="Insights" subtitle={`Trends, forecasts and upcoming bills — ${monthName}.`}/>
    <div className="stats-grid">
      <StatCard label="Spent this month" value={money(cur.expense)} note={delta===null?'No spending last month':`${delta>0?'+':''}${delta}% vs last month`} icon={ArrowUpRight} tone="red"/>
      <StatCard label="Projected month-end" value={money(forecast.projected)} note={`${money(Math.round(forecast.dailyAverage))} per day so far`} icon={TrendingUp} tone="purple"/>
      <StatCard label="Savings rate (12 mo)" value={avgRate===null?'—':`${avgRate}%`} note="Share of income not spent" icon={PiggyBank} tone="green"/>
      <StatCard label="Recurring bills" value={money(upcoming.monthlyOut)} note="Monthly equivalent" icon={CalendarDays} tone="blue"/>
    </div>
    <section className="panel chart-panel"><div className="panel-heading"><div><h2>Income vs expenses</h2><p>Last 12 months, transfers excluded</p></div></div>
      <div className="bar-wrap"><ResponsiveContainer width="100%" height={280}><BarChart data={trend.map(r=>({...r,name:label(r.month)}))} margin={{top:10,right:4,left:0,bottom:4}}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="name" tick={{fontSize:11}} tickLine={false}/><YAxis tick={{fontSize:11}}/><Tooltip formatter={v=>money(v)}/><Legend/><Bar dataKey="income" name="Income" fill="#08b981" radius={[4,4,0,0]}/><Bar dataKey="expense" name="Expenses" fill="#fb4545" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></div>
    </section>
    <div className="charts-grid">
      <section className="panel"><div className="panel-heading"><div><h2>Category changes</h2><p>This month vs last month</p></div></div>
        {changes.length===0?<div className="empty-state"><b>No expenses in the last two months</b></div>:<div className="insight-list">{changes.slice(0,8).map(c=><div className="insight-row" key={c.category}><CategoryBadge name={c.category}/><span>{money(c.current)} <small>was {money(c.previous)}</small></span><b className={c.change>0?'negative':c.change<0?'positive':''}>{c.pct===null?'new':`${c.pct>0?'+':''}${c.pct}%`}</b></div>)}</div>}
      </section>
      <section className="panel"><div className="panel-heading"><div><h2>Top payees</h2><p>Largest expenses by description, last 12 months</p></div></div>
        {payees.length===0?<div className="empty-state"><b>No described expenses yet</b><span>Add descriptions to transactions to see them here.</span></div>:<div className="insight-list">{payees.map(p=><div className="insight-row" key={p.name}><b>{p.name}</b><span>{p.count}×</span><b>{money(p.total)}</b></div>)}</div>}
      </section>
    </div>
    <section className="panel"><div className="panel-heading"><div><h2>Upcoming recurring</h2><p>Due in the next 30 days</p></div></div>
      {upcoming.items.length===0?<div className="empty-state"><CalendarDays size={28}/><b>Nothing due</b><span>Mark a transaction as recurring to see it here.</span></div>:<div className="insight-list">{upcoming.items.slice(0,10).map((u,i)=><div className="insight-row" key={`${u.id}-${u.date}-${i}`}><span>{dateLabel(u.date)}</span><b>{u.description||u.category}</b><b className={u.flow==='IN'?'positive':'negative'}>{u.flow==='IN'?'+':'−'}{money(u.amount)}</b></div>)}</div>}
    </section></>
}
function GoalsPage({goals,saveGoal,contributeGoal,deleteGoal}) {
  const [form,setForm]=useState({name:'',target:'',saved:'',deadline:''}),[amounts,setAmounts]=useState({})
  const set=(k,v)=>setForm(p=>({...p,[k]:v}))
  const totalTarget=goals.reduce((n,g)=>n+Number(g.target),0),totalSaved=goals.reduce((n,g)=>n+Math.min(Number(g.saved||0),Number(g.target)),0)
  const monthsLeft=g=>{if(!g.deadline)return null;const d=new Date(`${g.deadline}T00:00:00`),n=new Date();return Math.max(0,(d.getFullYear()-n.getFullYear())*12+d.getMonth()-n.getMonth())}
  return <><PageHeading title="Savings goals" subtitle="Track what you are saving for. Goal amounts are tracked here and do not change account balances."/>
    <div className="stats-grid three"><StatCard label="Total target" value={money(totalTarget)} note={`${goals.length} goals`} icon={PiggyBank} tone="blue"/><StatCard label="Saved so far" value={money(totalSaved)} note="Toward all goals" icon={Wallet} tone="green"/><StatCard label="Still to save" value={money(Math.max(0,totalTarget-totalSaved))} note="Across all goals" icon={Target} tone="purple"/></div>
    <section className="panel"><div className="panel-heading"><div><h2>New goal</h2><p>For example an emergency fund, a trip, or a down payment.</p></div></div>
      <form className="filter-bar" onSubmit={async e=>{e.preventDefault();if(await saveGoal(form))setForm({name:'',target:'',saved:'',deadline:''})}}><input value={form.name} maxLength={40} onChange={e=>set('name',e.target.value)} placeholder="Goal name" aria-label="Goal name"/><input type="number" min="1" value={form.target} onChange={e=>set('target',e.target.value)} placeholder={`Target (${currencySymbol()})`} aria-label="Target amount"/><input type="number" min="0" value={form.saved} onChange={e=>set('saved',e.target.value)} placeholder={`Already saved (${currencySymbol()})`} aria-label="Already saved"/><DatePicker compact clearable label="Target date" placeholder="Target date" value={form.deadline} onChange={v=>set('deadline',v)}/><button className="btn btn-primary" type="submit"><Plus size={17}/> Add goal</button></form></section>
    <section className="panel"><div className="panel-heading"><div><h2>Your goals</h2></div></div>
      {goals.length===0?<div className="empty-state"><PiggyBank size={28}/><b>No goals yet</b><span>Add a goal above to start tracking progress.</span></div>:<div className="budget-list">{goals.map(g=>{const saved=Number(g.saved||0),pct=Math.round(saved/Number(g.target)*100),left=Math.max(0,Number(g.target)-saved),m=monthsLeft(g);return <div className="budget-row" key={g.id}><div className="budget-head"><b>{g.name}</b><span>{money(saved)} of {money(g.target)}{pct>=100?' · reached 🎉':m!==null?m>0?` · about ${money(left/m)}/month for ${m} month${m===1?'':'s'}`:' · target date reached':''}</span><button className="icon-btn mini danger" aria-label={`Delete ${g.name}`} onClick={()=>deleteGoal(g)}><Trash2 size={15}/></button></div><div className="budget-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(pct,100)} aria-label={`${g.name} progress`}><i style={{width:`${Math.min(pct,100)}%`,background:pct>=100?'#10b981':'#2877f5'}}/></div><div className="goal-actions"><small>{pct}% saved{g.deadline?` · target ${dateDMY(g.deadline)}`:''}</small><span><input type="number" step="any" value={amounts[g.id]||''} onChange={e=>setAmounts(p=>({...p,[g.id]:e.target.value}))} placeholder="Amount" aria-label={`Amount for ${g.name}`}/><button className="btn btn-outline btn-small" onClick={async()=>{if(await contributeGoal(g,amounts[g.id]))setAmounts(p=>({...p,[g.id]:''}))}}>Add</button><button className="btn btn-outline btn-small" onClick={async()=>{if(await contributeGoal(g,-Math.abs(Number(amounts[g.id]||0))))setAmounts(p=>({...p,[g.id]:''}))}}>Remove</button></span></div></div>})}</div>}
    </section></>
}
const EVENT_STYLE = { Birthday: [Cake, '#ec4899'], Anniversary: [Heart, '#ef4444'], Important: [Star, '#f59e0b'], Other: [CalendarDays, '#2877f5'], Goal: [Target, '#10b981'] }
const eventStyle = type => EVENT_STYLE[type] || EVENT_STYLE.Other
const whenLabel = n => n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : `In ${n} days`
const milestone = o => !o.years ? '' : o.event.type === 'Birthday' ? `Turns ${o.years}` : o.event.type === 'Anniversary' ? `${ordinal(o.years)} anniversary` : `${o.years} year${o.years === 1 ? '' : 's'}`
function CalendarPage({events:ownEvents,goals=[],onOpenGoal,saveEvent,deleteEvent}) {
  const now=new Date(),today=isoOf(now)
  const [cursor,setCursor]=useState(()=>new Date(now.getFullYear(),now.getMonth(),1)),[editor,setEditor]=useState(null)
  const y=cursor.getFullYear(),m=cursor.getMonth()
  // Goals with a deadline appear on the calendar as read-only, one-off dates.
  const events=useMemo(()=>[...ownEvents,...goals.filter(g=>g.deadline).map(g=>({id:`goal-${g.id}`,goal:true,title:`Goal: ${g.name}`,type:'Goal',date:g.deadline,yearly:false}))],[ownEvents,goals])
  const openEvent=e=>e.goal?onOpenGoal?.():setEditor(e)
  const byDate=useMemo(()=>eventsInMonth(events,y,m+1),[events,y,m])
  const upcoming=useMemo(()=>upcomingEvents(events,today,60),[events,today])
  const start=new Date(y,m,1-(new Date(y,m,1).getDay()+6)%7),cells=Array.from({length:42},(_,i)=>new Date(start.getFullYear(),start.getMonth(),start.getDate()+i))
  const openNew=(date=today)=>setEditor({title:'',type:'Birthday',date,yearly:true,note:''})
  const shift=n=>setCursor(new Date(y,m+n,1))
  const years=useMemo(()=>{const lo=Math.min(now.getFullYear()-100,y),hi=Math.max(now.getFullYear()+20,y);return Array.from({length:hi-lo+1},(_,i)=>hi-i)},[y])
  return <><PageHeading title="Calendar" subtitle="Birthdays, anniversaries and other dates worth remembering." action={<button className="btn btn-primary" onClick={()=>openNew()}><Plus size={17}/> Add date</button>}/>
    <div className="calendar-layout">
      <section className="panel calendar-panel"><div className="panel-heading"><div><h2>{MONTHS[m]} {y}</h2><p>Click a day to add a date, or a date to edit it.</p></div><div className="calendar-nav"><select aria-label="Month" value={m} onChange={e=>setCursor(new Date(y,+e.target.value,1))}>{MONTHS.map((n,i)=><option key={n} value={i}>{n}</option>)}</select><select aria-label="Year" value={y} onChange={e=>setCursor(new Date(+e.target.value,m,1))}>{years.map(v=><option key={v} value={v}>{v}</option>)}</select><button className="icon-btn" aria-label="Previous month" onClick={()=>shift(-1)}><ChevronLeft size={18}/></button><button className="btn btn-outline btn-small" onClick={()=>setCursor(new Date(now.getFullYear(),now.getMonth(),1))}>Today</button><button className="icon-btn" aria-label="Next month" onClick={()=>shift(1)}><ChevronRight size={18}/></button></div></div>
        <div className="calendar-grid">{WEEKDAYS.map(w=><span key={w} className="calendar-dow">{w}</span>)}
          {cells.map(d=>{const iso=isoOf(d),list=d.getMonth()===m?byDate[iso]||[]:[];return <div key={iso} className={`calendar-cell${d.getMonth()!==m?' outside':''}${iso===today?' today':''}${list.length?' has-events':''}`}>
            <button type="button" className="calendar-day" aria-label={`Add a date on ${dateLabel(iso)}`} onClick={()=>openNew(iso)}>{d.getDate()}</button>
            {list.slice(0,2).map(e=>{const[Icon,color]=eventStyle(e.type);return <button type="button" key={e.id} className="calendar-chip" style={{'--chip':color}} title={e.title} onClick={()=>openEvent(e)}><Icon size={11}/><span>{e.title}</span></button>})}
            {list.length>2&&<button type="button" className="calendar-more" onClick={()=>openEvent(list[2])}>+{list.length-2} more</button>}
          </div>})}
        </div>
      </section>
      <section className="panel"><div className="panel-heading"><div><h2>Coming up</h2><p>Next 60 days</p></div></div>
        {upcoming.length===0?<div className="empty-state"><Cake size={28}/><b>Nothing coming up</b><span>Add birthdays, anniversaries and other important days.</span><button className="btn btn-outline btn-small" onClick={()=>openNew()}><Plus size={15}/> Add date</button></div>:<div className="event-list">{upcoming.map(o=>{const[Icon,color]=eventStyle(o.event.type);return <button type="button" key={`${o.event.id}-${o.date}`} className={`event-row${o.daysAway===0?' is-today':''}`} onClick={()=>openEvent(o.event)}><span className="event-icon" style={{color,background:`${color}1a`}}><Icon size={17}/></span><span className="event-copy"><b>{o.event.title}</b><small>{[dateDMY(o.date),milestone(o)||o.event.type].join(' · ')}</small></span><span className="event-when">{whenLabel(o.daysAway)}</span></button>})}</div>}
      </section>
    </div>
    {editor&&<EventModal initial={editor} onClose={()=>setEditor(null)} onSave={async f=>{if(await saveEvent(f))setEditor(null)}} onDelete={async e=>{if(await deleteEvent(e))setEditor(null)}}/>}</>
}
function EventModal({initial,onClose,onSave,onDelete}) {
  useModalA11y(onClose)
  const [form,setForm]=useState(initial)
  const set=(k,v)=>setForm(p=>({...p,[k]:v}))
  const placeholder=form.type==='Birthday'?"e.g. Mom's birthday":form.type==='Anniversary'?'e.g. Wedding anniversary':'e.g. Passport renewal'
  return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className="modal small-modal" role="dialog" aria-modal="true" aria-label={initial.id?'Edit date':'Add a date'}><div className="modal-header"><div><span className="eyebrow">FINORA CALENDAR</span><h2>{initial.id?'Edit date':'Add a date'}</h2></div><button className="icon-btn" aria-label="Close dialog" onClick={onClose}><X size={20}/></button></div>
    <form onSubmit={e=>{e.preventDefault();onSave(form)}}><div className="form-grid one-column">
      <label>Title *<input required autoFocus maxLength={60} value={form.title} onChange={e=>set('title',e.target.value)} placeholder={placeholder}/></label>
      <label>Type<select value={form.type} onChange={e=>{const type=e.target.value;setForm(p=>({...p,type,...(p.id?{}:{yearly:type==='Birthday'||type==='Anniversary'})}))}}>{EVENT_TYPES.map(t=><option key={t}>{t}</option>)}</select></label>
      <div className="date-field"><span>{form.type==='Birthday'?'Date of birth *':form.type==='Anniversary'?'Original date *':'Date *'}</span><DatePicker value={form.date} onChange={v=>set('date',v)}/></div>
      <label className="checkbox-field"><input type="checkbox" checked={!!form.yearly} onChange={e=>set('yearly',e.target.checked)}/> Repeats every year</label>
      <label>Note<textarea rows="2" maxLength={200} value={form.note||''} onChange={e=>set('note',e.target.value)} placeholder="Optional, e.g. gift ideas"/></label>
    </div><div className="modal-footer">{initial.id?<button type="button" className="btn btn-danger-outline" onClick={()=>onDelete(initial)}><Trash2 size={16}/> Delete</button>:<span/>}<div><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button type="submit" className="btn btn-primary"><Check size={16}/> Save date</button></div></div></form>
  </div></div>
}
function AutoBackupCard({auto,onLink,onResume,onUnlink}) {
  const [pass,setPass]=useState(''),supported=autoBackupSupported()
  const status={off:'Not set up',paused:'Paused — enter your passphrase to resume',active:'On — saves a few seconds after every change',error:`Problem: ${auto.message||'could not write the file'}`}[auto.status]
  return <section className="panel backup-card" style={{marginTop:16}}><div className="backup-icon blue"><Upload size={23}/></div><h2>Auto-backup to a folder</h2>
    <p>Keeps an encrypted backup file up to date automatically. Choose a file inside a OneDrive, Dropbox or Google Drive folder and your cloud client carries it to your other devices. This is one-way: restore on another device with <b>Import backup</b>, it does not merge changes.</p>
    {!supported?<div className="warning-box"><ShieldCheck size={18}/><span>This needs a Chromium-based browser (Chrome or Edge) on a computer.</span></div>:<>
      <small className="backup-status">Status: {status}{auto.last?` · last saved ${new Date(auto.last).toLocaleString()}`:''}</small>
      {(auto.status==='off'||auto.status==='paused'||auto.status==='error')&&<label className="backup-password">Passphrase (at least 8 characters, never stored — needed again after a reload)<input type="password" autoComplete="new-password" value={pass} onChange={e=>setPass(e.target.value)}/></label>}
      <div className="security-actions">
        {auto.status==='off'&&<button className="btn btn-primary" onClick={async()=>{if(await onLink(pass))setPass('')}}>Choose file and start</button>}
        {(auto.status==='paused'||auto.status==='error')&&<button className="btn btn-primary" onClick={async()=>{if(await onResume(pass))setPass('')}}>Resume</button>}
        {auto.status!=='off'&&<button className="btn btn-outline" onClick={onUnlink}>Turn off</button>}
      </div></>}
  </section>
}
function OnboardingWizard({initialName,initialCurrency,onFinish,onSkip}) {
  useModalA11y(onSkip)
  const [step,setStep]=useState(0),[name,setName]=useState(initialName||''),[currency,setCurrencyChoice]=useState(initialCurrency),[acct,setAcct]=useState({name:'',type:'bank',openingBalance:''}),[addCash,setAddCash]=useState(true),[photo,setPhoto]=useState('')
  const [pin1,setPin1]=useState(''),[pin2,setPin2]=useState(''),[useBio,setUseBio]=useState(true),[bioOk,setBioOk]=useState(false),[lockError,setLockError]=useState(''),[busy,setBusy]=useState(false)
  useEffect(()=>{biometricsSupported().then(setBioOk)},[])
  const finish=()=>onFinish({photo,name:name.trim(),currency,account:acct.name.trim()?acct:null,addCash})
  async function submitLock(e){
    e.preventDefault()
    if(!/^\d{4,6}$/.test(pin1)){setLockError('PIN must be 4 to 6 digits.');return}
    if(pin1!==pin2){setLockError('PINs do not match.');return}
    setBusy(true)
    try{
      await setPin(pin1)
      if(bioOk&&useBio){try{await enableBiometrics()}catch{}}
    }finally{setBusy(false)}
    finish()
  }
  return <div className="modal-backdrop"><div className="modal small-modal" role="dialog" aria-modal="true" aria-label="Welcome to Finora"><div className="modal-header"><div><span className="eyebrow">WELCOME · STEP {step+1} OF 3</span><h2>{step===0?'Let’s set up Finora':step===1?'Add your first account':'Secure Finora'}</h2></div><button className="icon-btn" aria-label="Skip setup" onClick={onSkip}><X size={20}/></button></div>
    {step===0?<><div className="form-grid one-column"><ProfilePhotoField value={photo} name={name} onChange={setPhoto}/><label>Your name<input autoFocus maxLength={40} value={name} onChange={e=>setName(e.target.value)} placeholder="Optional"/></label><div className="field-block"><span className="field-label">Currency</span><CurrencySelect value={currency} onChange={setCurrencyChoice}/></div><p className="muted-note" style={{margin:0}}>Everything stays on this device. You can change these later in Config.</p></div><div className="modal-footer"><button className="btn btn-ghost" onClick={onSkip}>Skip for now</button><button className="btn btn-primary" onClick={()=>{setCurrency(currency);setStep(1)}}>Next</button></div></>
    :step===1?<form onSubmit={e=>{e.preventDefault();setStep(2)}}><div className="form-grid one-column"><label>Account name<input autoFocus maxLength={40} value={acct.name} onChange={e=>setAcct(p=>({...p,name:e.target.value}))} placeholder="e.g. HDFC Savings"/></label><label>Account type<select value={acct.type} onChange={e=>setAcct(p=>({...p,type:e.target.value}))}><option value="bank">Bank account</option><option value="cash">Cash (In Hand)</option></select></label><label>Current balance ({currencySymbol()})<input type="number" step="0.01" value={acct.openingBalance} onChange={e=>setAcct(p=>({...p,openingBalance:e.target.value}))} placeholder="0.00"/></label><label className="checkbox-field"><input type="checkbox" checked={addCash} onChange={e=>setAddCash(e.target.checked)}/> Also create a Cash (In Hand) account</label></div><div className="modal-footer"><button type="button" className="btn btn-ghost" onClick={()=>setStep(0)}>Back</button><button type="submit" className="btn btn-primary">Next</button></div></form>
    :<form onSubmit={submitLock}><div className="form-grid one-column"><p className="muted-note" style={{margin:0}}>Set a PIN to lock Finora on this device. Every time you open the app you will need to enter it.</p><label>Create PIN (4 to 6 digits)<input autoFocus type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin1} onChange={e=>{setPin1(e.target.value.replace(/\D/g,''));setLockError('')}} placeholder="••••"/></label><label>Confirm PIN<input type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin2} onChange={e=>{setPin2(e.target.value.replace(/\D/g,''));setLockError('')}} placeholder="••••"/></label>{bioOk?<label className="checkbox-field"><input type="checkbox" checked={useBio} onChange={e=>setUseBio(e.target.checked)}/> Also unlock with fingerprint / face</label>:<p className="muted-note" style={{margin:0}}>Fingerprint unlock isn’t available on this device or browser.</p>}{lockError&&<div className="warning-box" role="alert"><TriangleAlert size={18}/><span>{lockError}</span></div>}</div><div className="modal-footer"><button type="button" className="btn btn-ghost" onClick={()=>setStep(1)}>Back</button><div><button type="button" className="btn btn-outline" onClick={finish}>Skip lock</button><button type="submit" className="btn btn-primary" disabled={busy||!pin1}><Check size={16}/> Set PIN &amp; finish</button></div></div></form>}
  </div></div>
}
function ImportCsvModal({accounts,categories,existing,onClose,onImport}) {
  useModalA11y(onClose)
  const [rows,setRows]=useState(null),[fileName,setFileName]=useState(''),[accountId,setAccountId]=useState(accounts[0]?.id||''),[error,setError]=useState('')
  const result=useMemo(()=>rows?buildImport(rows,{accounts,defaultAccountId:Number(accountId),categories,existing}):null,[rows,accountId])
  async function pick(file){
    if(!file)return
    try{setRows(parseCsv(await file.text()));setFileName(file.name);setError('')}catch{setError('Could not read that file.')}
  }
  return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className="modal small-modal" role="dialog" aria-modal="true" aria-label="Import transactions from CSV"><div className="modal-header"><div><span className="eyebrow">FINORA TRANSACTIONS</span><h2>Import from CSV</h2></div><button className="icon-btn" aria-label="Close dialog" onClick={onClose}><X size={20}/></button></div>
    <div className="form-grid one-column">
      <p className="muted-note" style={{margin:0}}>Works with bank statements or a Finora CSV export. Needs a date column and either an amount, or debit and credit columns. Dates can be YYYY-MM-DD or DD/MM/YYYY.</p>
      <label>Statement file<input type="file" accept=".csv,text/csv" onChange={e=>pick(e.target.files?.[0])}/></label>
      <label>Account for rows without an account column<select value={accountId} onChange={e=>setAccountId(e.target.value)}>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      {error&&<div className="warning-box"><TriangleAlert size={18}/><span>{error}</span></div>}
      {result&&<div className="import-summary" aria-live="polite"><b>{fileName}</b><span>{result.records.length} new · {result.duplicates} duplicate{result.duplicates===1?'':'s'} skipped · {result.invalid.length} invalid</span>{result.invalid.slice(0,4).map(i=><small key={i.line}>Line {i.line}: {i.reason}</small>)}{result.invalid.length>4&&<small>…and {result.invalid.length-4} more</small>}</div>}
    </div>
    <div className="modal-footer"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" disabled={!result||!result.records.length} onClick={()=>onImport(result.records)}><Check size={16}/> Import {result?.records.length||0} transactions</button></div>
  </div></div>
}
// openingTx: the account's "Opening balance" transaction, if its opening balance was recorded that way.
// Its amount is edited in Transactions; showing a second editable opening field here would count it twice.
function AccountModal({initial,openingTx,onClose,onSave}) {
  useModalA11y(onClose)
  const [form,setForm]=useState({name:initial?.name||'',type:initial?.type||'bank',openingBalance:initial?.openingBalance??0})
  return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className="modal small-modal" role="dialog" aria-modal="true" aria-label={initial?'Edit account':'Add a new account'}><div className="modal-header"><div><span className="eyebrow">MY ACCOUNTS</span><h2>{initial?'Edit account':'Add a new account'}</h2><p className="modal-subtitle">{form.type==='cash'?'Track the cash you keep in hand.':'Choose your bank and set its current balance.'}</p></div><button className="icon-btn" aria-label="Close dialog" onClick={onClose}><X size={20}/></button></div><form onSubmit={e=>{e.preventDefault();onSave(form)}}><div className="form-grid one-column"><label>Account type *<select autoFocus value={form.type} onChange={e=>{const type=e.target.value;setForm(p=>({...p,type,...(initial?{}:{name:'',other:false})}))}}><option value="bank">Bank account</option><option value="cash">Cash (In Hand)</option></select></label>{form.type==='bank'&&<label>Bank name *<select value={INDIAN_BANKS.includes(form.name)?form.name:form.name||form.other?'__other':''} onChange={e=>{const v=e.target.value;setForm(p=>({...p,name:v==='__other'?'':v,other:v==='__other'}))}} required={!form.other}><option value="" disabled>Select a bank</option>{INDIAN_BANKS.map(b=><option key={b} value={b}>{b}</option>)}<option value="__other">Other (not listed)…</option></select></label>}{(form.type==='cash'||form.other||(form.name&&!INDIAN_BANKS.includes(form.name)))&&<label>{form.type==='cash'?'Account name *':'Bank / account name *'}<input required autoFocus value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder={form.type==='cash'?'e.g. Cash':'Type your bank name'}/></label>}{openingTx&&!Number(initial?.openingBalance)?<div className="field-block"><span>Opening balance</span><p className="muted-note" style={{margin:0}}>{money(openingTx.amount)} — recorded as the “{OPENING_DESC}” transaction on {dateDMY(openingTx.date)}. Edit that transaction in Transactions to change it.</p></div>:<label>Opening balance ({currencySymbol()})<input type="number" step="0.01" value={form.openingBalance} onChange={e=>setForm(p=>({...p,openingBalance:e.target.value}))}/></label>}</div><div className="modal-footer"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button type="submit" className="btn btn-primary"><Check size={16}/> Save account</button></div></form></div></div>
}
