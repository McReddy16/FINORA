// Two-level category hierarchy: group -> category. Transactions keep storing only the category (leaf) name,
// so existing data, budgets and CSV files stay valid; the group is always derived from it.
export const EXPENSE_GROUPS = {
  Living: ['Rent', 'Utilities', 'Groceries', 'Food', 'Maintenance'],
  Transport: ['Travel', 'Vehicle repairs', 'Fuel'],
  Health: ['Fitness', 'Medical', 'Insurance'],
  Shopping: ['Shopping', 'Online shopping', 'Offline shopping'],
  Social: ['Entertainment', 'Party', 'Self outing', 'Friends outing', 'Family outing', 'Politics'],
  Giving: ['Charity', 'Helping hands', 'Temple', 'Workers salary'],
  Growth: ['Education', 'Subscriptions'],
  Lending: ['Lent to friend', 'Lent to family', 'Personal loan given'],
  Other: ['Other']
}
export const INCOME_CATEGORIES = ['Salary', 'Bonus', 'Business', 'Agriculture', 'Commission', 'Interest', 'Supplementary credits', 'Other income']
// Used only for the automatic "Opening balance" entry of an account; it is income but not offered in the pickers.
export const OPENING_CATEGORY = 'Opening balance'
export const INVESTMENT_GROUPS = {
  'Investments · General': ['Investment', 'Savings'],
  'Investments · Market': ['Stocks', 'Mutual funds', 'ETF'],
  'Investments · Deposits': ['Fixed deposit', 'Recurring deposit'],
  'Investments · Retirement': ['PPF', 'NPS', 'EPF'],
  'Investments · Bonds': ['Bonds'],
  'Investments · Metals': ['Gold', 'Silver'],
  'Investments · Property': ['Real estate'],
  'Investments · Digital assets': ['Crypto'],
  'Investments · Other': ['Other investment']
}
// Names that older data may contain but that are no longer offered in the picker.
const LEGACY = { Transport: 'Transport' }

const GROUP_OF = new Map()
Object.entries(EXPENSE_GROUPS).forEach(([g, items]) => items.forEach(c => GROUP_OF.set(c, g)))
Object.entries(INVESTMENT_GROUPS).forEach(([g, items]) => items.forEach(c => GROUP_OF.set(c, g)))
INCOME_CATEGORIES.forEach(c => GROUP_OF.set(c, 'Income'))
GROUP_OF.set(OPENING_CATEGORY, 'Income')
Object.entries(LEGACY).forEach(([c, g]) => GROUP_OF.set(c, g))

const INVESTMENT_SET = new Set(Object.values(INVESTMENT_GROUPS).flat())
const INCOME_SET = new Set([...INCOME_CATEGORIES, OPENING_CATEGORY])
export const isInvestmentCategory = c => INVESTMENT_SET.has(c)
// User-defined categories marked as income (kind: 'income'); anything else custom counts as an expense.
let CUSTOM_INCOME = new Set()
export const setCustomIncomeCategories = names => { CUSTOM_INCOME = new Set(names) }
export const isIncomeCategory = c => INCOME_SET.has(c) || CUSTOM_INCOME.has(c)
export const isExpenseCategory = c => !INVESTMENT_SET.has(c) && !isIncomeCategory(c)
export const groupOf = c => GROUP_OF.get(c) || (c === 'Transfer' ? 'Transfer' : 'Custom')

export const ALL_CATEGORIES = [...Object.values(EXPENSE_GROUPS).flat(), 'Transport', ...INCOME_CATEGORIES, ...Object.values(INVESTMENT_GROUPS).flat()]

// [{ label, items }] in display order; names outside the built-in tree (custom, legacy, Transfer) go under "Custom"/their own group.
// `kind` puts that kind's own groups first and the investment groups right after them.
export function groupCategories(names, kind) {
  const expense = [...Object.keys(EXPENSE_GROUPS), 'Transport'], invest = Object.keys(INVESTMENT_GROUPS)
  const order = kind === 'income' ? ['Income', 'Custom', ...invest, ...expense, 'Transfer']
    : kind === 'expense' ? [...expense, 'Custom', ...invest, 'Income', 'Transfer']
    : [...Object.keys(EXPENSE_GROUPS), ...invest, 'Income', 'Transport', 'Custom', 'Transfer']
  const buckets = new Map()
  ;[...new Set(names)].forEach(n => { const g = groupOf(n); buckets.set(g, [...(buckets.get(g) || []), n]) })
  return order.filter(g => buckets.has(g)).map(label => ({ label, items: buckets.get(label) }))
}
