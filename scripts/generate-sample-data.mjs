// Generates sample-data/finora-sample-backup.json, importable via Backup & Restore.
// Dates are relative to today so the dashboard, budgets and trends look current.
import { mkdirSync, writeFileSync } from "node:fs";

const now = new Date();
const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
// day `day` of the month `monthsAgo` months back (clamped to the 28th to stay valid)
const on = (monthsAgo, day) => iso(new Date(now.getFullYear(), now.getMonth() - monthsAgo, Math.min(day, 28)));
const stamp = (dateStr) => `${dateStr}T09:00:00.000Z`;

const accounts = [
  { id: 1, name: "HDFC Savings", type: "bank", openingBalance: 50000 },
  { id: 2, name: "ICICI Salary", type: "bank", openingBalance: 20000 },
  { id: 3, name: "Cash", type: "cash", openingBalance: 3000 },
].map((a) => ({ ...a, createdAt: stamp(on(6, 1)) }));

const transactions = [];
const add = (date, accountId, flow, category, amount, description, paymentMethod = "UPI") => {
  const transactionType =
    category === "Investment" ? "INVESTMENT" : flow === "IN" ? "INCOME" : "EXPENSE";
  transactions.push({
    date, accountId, flow, category, amount, description, paymentMethod,
    transactionType, recurrence: false, createdAt: stamp(date), updatedAt: stamp(date),
  });
};

// Six months of history, oldest first; the current month is only filled up to today.
for (let m = 5; m >= 0; m--) {
  const wobble = (n) => n + ((m * 37) % 11) * 40; // deterministic variation
  add(on(m, 1), 2, "IN", "Salary", 85000, "Monthly salary", "Bank Transfer");
  add(on(m, 2), 2, "OUT", "Utilities", 18000, "Rent", "Bank Transfer");
  add(on(m, 5), 1, "OUT", "Investment", 10000, "Index fund SIP", "Bank Transfer");
  add(on(m, 6), 1, "OUT", "Utilities", wobble(1450), "Electricity bill");
  add(on(m, 8), 1, "OUT", "Utilities", 799, "Broadband");
  add(on(m, 9), 1, "OUT", "Food", wobble(2200), "Groceries");
  add(on(m, 12), 3, "OUT", "Transport", wobble(900), "Fuel", "Cash");
  add(on(m, 14), 1, "OUT", "Entertainment", 649, "Streaming subscription", "Card");
  add(on(m, 16), 1, "OUT", "Food", wobble(1100), "Dinner out", "Card");
  add(on(m, 19), 1, "OUT", "Shopping", wobble(2800), "Clothing", "Card");
  add(on(m, 22), 1, "OUT", "Medical", wobble(600), "Pharmacy");
  add(on(m, 25), 3, "OUT", "Food", wobble(750), "Street food & snacks", "Cash");
  if (m % 2 === 0) add(on(m, 20), 1, "IN", "Other", 3500, "Freelance payment", "Bank Transfer");
  if (m === 3) add(on(m, 11), 1, "OUT", "Education", 6500, "Online course", "Card");
}

// Linked transfer between accounts (shares a transferId, one OUT and one IN leg)
const transferDate = on(1, 10);
const transferBase = {
  amount: 15000, transactionType: "TRANSFER", category: "Transfer", paymentMethod: "Bank Transfer",
  recurrence: false, transferId: "sample-transfer-1", date: transferDate,
  createdAt: stamp(transferDate), updatedAt: stamp(transferDate),
};
transactions.push(
  { ...transferBase, accountId: 2, flow: "OUT", description: "Transfer to HDFC Savings" },
  { ...transferBase, accountId: 1, flow: "IN", description: "Transfer from ICICI Salary" },
);

// Monthly recurring template (nextDue in the future so it doesn't auto-post on import)
const nextMonth = iso(new Date(now.getFullYear(), now.getMonth() + 1, 5));
transactions.push({
  date: on(0, 5), accountId: 1, flow: "OUT", category: "Entertainment", amount: 199,
  description: "Cloud storage plan", paymentMethod: "Card", transactionType: "EXPENSE",
  recurrence: true, frequency: "monthly", nextDue: nextMonth,
  createdAt: stamp(on(0, 5)), updatedAt: stamp(on(0, 5)),
});

// Drop anything dated in the future (e.g. day 25 of the current month) and assign ids
const today = iso(now);
const finalTransactions = transactions
  .filter((t) => t.date <= today)
  .sort((a, b) => a.date.localeCompare(b.date))
  .map((t, i) => ({ id: i + 1, ...t }));

const budgets = [
  { id: 1, category: "Food", limit: 6000 },
  { id: 2, category: "Shopping", limit: 3500 },
  { id: 3, category: "Transport", limit: 1500 },
  { id: 4, category: "Entertainment", limit: 1000 },
  { id: 5, category: "Utilities", limit: 22000 },
];

const goals = [
  { id: 1, name: "Emergency fund", target: 300000, saved: 120000, deadline: iso(new Date(now.getFullYear() + 1, 5, 30)), createdAt: stamp(on(5, 1)) },
  { id: 2, name: "Goa trip", target: 40000, saved: 18500, deadline: iso(new Date(now.getFullYear(), now.getMonth() + 5, 15)), createdAt: stamp(on(3, 1)) },
];

const categories = [{ id: 1, name: "Pets" }, { id: 2, name: "Gifts" }];
add(on(1, 18), 1, "OUT", "Pets", 1800, "Vet checkup");
add(on(0, 3), 3, "OUT", "Gifts", 1200, "Birthday gift", "Cash");
const extra = transactions.splice(-2).filter((t) => t.date <= today);
extra.forEach((t) => finalTransactions.push({ id: finalTransactions.length + 1, ...t }));

const notes = [
  {
    id: 1, title: "Monthly review", content: "Check budgets on the 1st and move leftover into the emergency fund.",
    pinned: true, archived: false, deleted: false, images: [], labels: ["finance"], color: "yellow",
    createdAt: stamp(on(2, 1)), updatedAt: stamp(on(2, 1)),
  },
  {
    id: 2, title: "To do", content: "",
    checklist: [
      { id: 1, text: "Pay credit card bill", done: false },
      { id: 2, text: "Renew insurance", done: false },
      { id: 3, text: "File expense report", done: true },
    ],
    pinned: false, archived: false, deleted: false, images: [], labels: ["todo"], color: "white",
    dueDate: iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7)),
    createdAt: stamp(on(0, 1)), updatedAt: stamp(on(0, 1)),
  },
];

const backup = {
  app: "Finora", version: 3, exportedAt: now.toISOString(),
  accounts, transactions: finalTransactions, notes, budgets, goals, categories,
};

mkdirSync("sample-data", { recursive: true });
writeFileSync("sample-data/finora-sample-backup.json", JSON.stringify(backup, null, 2));
console.log(`Wrote ${finalTransactions.length} transactions to sample-data/finora-sample-backup.json`);
