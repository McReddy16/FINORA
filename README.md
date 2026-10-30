# Finora — React + IndexedDB

A local-first finance and notes app built with React, Vite, Dexie.js (IndexedDB), Recharts, and Lucide icons.

## Requirements
- Node.js LTS (includes npm)
- Windows, macOS, or Linux

## Run on Windows
1. Extract `Finora-React-Project.zip`.
2. Open Command Prompt in the extracted `finora-react` folder.
3. Run:

```bat
npm install
npm run dev
```

4. Open the local URL printed by Vite, usually `http://localhost:5173`.

## Other commands
```bat
npm run build
npm run preview
```

## Data and backup
- Accounts, transactions, notes, and note images are stored locally in your browser using IndexedDB.
- Use **Backup & Restore** in the sidebar to export a JSON backup or import a previous backup.
- Keep backups in a safe place. Clearing browser site data may erase locally stored data.
- This version has **no backend and no cloud sync**. Each browser/device has its own local database. Use backup/export and import to move data between devices.
- This is a prototype, not a bank-connected application. It does not connect to banks or store bank credentials.

## Notes
- The sample starts with demo account and transaction data on first run. You can remove the demo data from the app or use a fresh browser profile.
- Local data is not encrypted by this app. Do not store passwords, OTPs, PINs, or full bank credentials in notes.
