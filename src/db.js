import Dexie from "dexie";

export const db = new Dexie("FinoraLocalDB");

db.version(1).stores({
  accounts: "++id, name, type, createdAt",
  transactions:
    "++id, date, accountId, transactionType, category, flow, createdAt",
  notes: "++id, title, updatedAt, pinned, archived, deleted",
});

// v2: monthly category budgets and linked account-to-account transfers (transferId).
db.version(2).stores({
  accounts: "++id, name, type, createdAt",
  transactions:
    "++id, date, accountId, transactionType, category, flow, transferId, createdAt",
  notes: "++id, title, updatedAt, pinned, archived, deleted",
  budgets: "++id, &category",
});

// v3: savings goals and user-defined categories.
db.version(3).stores({
  accounts: "++id, name, type, createdAt",
  transactions:
    "++id, date, accountId, transactionType, category, flow, transferId, createdAt",
  notes: "++id, title, updatedAt, pinned, archived, deleted",
  budgets: "++id, &category",
  goals: "++id, name",
  categories: "++id, &name",
});

// v4: calendar events (birthdays, anniversaries and other important dates).
db.version(4).stores({
  accounts: "++id, name, type, createdAt",
  transactions:
    "++id, date, accountId, transactionType, category, flow, transferId, createdAt",
  notes: "++id, title, updatedAt, pinned, archived, deleted",
  budgets: "++id, &category",
  goals: "++id, name",
  categories: "++id, &name",
  events: "++id, date, type",
});

// Returns today's date in YYYY-MM-DD format
export function todayISO() {
  const date = new Date();

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}