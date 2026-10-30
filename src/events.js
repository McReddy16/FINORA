// Important dates (birthdays, anniversaries, ...). Yearly events repeat on the same day every year.
export const EVENT_TYPES = ['Birthday', 'Anniversary', 'Important', 'Other']

const pad = n => String(n).padStart(2, '0')
const parts = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? [+m[1], +m[2], +m[3]] : null }
const dayCount = iso => { const [y, m, d] = parts(iso); return Date.UTC(y, m - 1, d) / 86400000 }

// The event's date in a given year, or null if it does not occur then. Feb 29 falls back to Feb 28.
export function occurrenceIn(event, year) {
  const p = parts(event?.date)
  if (!p) return null
  if (!event.yearly) return p[0] === year ? event.date : null
  if (year < p[0]) return null
  const last = new Date(Date.UTC(year, p[1], 0)).getUTCDate()
  return `${year}-${pad(p[1])}-${pad(Math.min(p[2], last))}`
}

// Groups events by ISO date for one month (month is 1-12).
export function eventsInMonth(events, year, month) {
  const byDate = {}
  for (const e of events) {
    const iso = occurrenceIn(e, year)
    if (iso && +iso.slice(5, 7) === month) (byDate[iso] ||= []).push(e)
  }
  return byDate
}

// Occurrences from `from` (inclusive) for the next `days` days, soonest first.
// `years` is the age / anniversary count for yearly events, when the start year is known.
export function upcomingEvents(events, from, days = 60) {
  const start = parts(from)[0], base = dayCount(from), out = []
  for (const e of events) {
    for (const year of [start, start + 1]) {
      const iso = occurrenceIn(e, year)
      if (!iso) continue
      const daysAway = dayCount(iso) - base
      if (daysAway >= 0 && daysAway <= days) { out.push({ event: e, date: iso, daysAway, years: e.yearly ? year - parts(e.date)[0] : 0 }); break }
    }
  }
  return out.sort((a, b) => a.daysAway - b.daysAway || a.event.title.localeCompare(b.event.title))
}

export function ordinal(n) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'
  return `${n}${s}`
}
