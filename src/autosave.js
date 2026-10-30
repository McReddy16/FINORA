// Auto-backup to a user-chosen file via the File System Access API (Chromium browsers).
// Point it at a OneDrive / Dropbox / Google Drive folder and the cloud client carries the file between devices.
// The file handle lives in its own tiny database so it is never part of a Finora backup.
import Dexie from 'dexie'

const meta = new Dexie('FinoraSyncMeta')
meta.version(1).stores({ handles: 'key' })

export const autoBackupSupported = () => typeof window !== 'undefined' && 'showSaveFilePicker' in window

export async function linkFile() {
  const handle = await window.showSaveFilePicker({
    suggestedName: 'finora-autobackup.json',
    types: [{ description: 'Finora encrypted backup', accept: { 'application/json': ['.json'] } }]
  })
  await meta.handles.put({ key: 'file', handle })
  return handle
}
export async function getHandle() { return (await meta.handles.get('file'))?.handle || null }
export const unlinkFile = () => meta.handles.delete('file')

export async function ensurePermission(handle, ask) {
  const opts = { mode: 'readwrite' }
  if ((await handle.queryPermission(opts)) === 'granted') return true
  return ask && (await handle.requestPermission(opts)) === 'granted'
}

export async function readExisting(handle) {
  const text = await (await handle.getFile()).text()
  if (!text.trim()) return null
  try { return JSON.parse(text) } catch { return null }
}

export async function writeBackup(handle, data) {
  const writable = await handle.createWritable()
  await writable.write(JSON.stringify(data))
  await writable.close()
}
