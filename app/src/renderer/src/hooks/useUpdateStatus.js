import { useState, useEffect } from 'react'

const listeners = new Set()
let currentStatus = {
  available: false,
  currentVersion: '',
  latestVersion: '',
  releaseUrl: '',
  error: false,
  checking: false,
}

function notifyListeners(status) {
  currentStatus = status
  listeners.forEach(cb => cb(status))
}

export function useUpdateStatus() {
  const [status, setStatus] = useState(currentStatus)
  useEffect(() => {
    listeners.add(setStatus)
    return () => listeners.delete(setStatus)
  }, [])
  return status
}

let listenerInitialized = false
export function initUpdateStatusListener() {
  if (listenerInitialized) return
  listenerInitialized = true
  window.electron.update.onStatus((data) => {
    notifyListeners({ ...currentStatus, ...data, checking: false })
  })
}

export async function checkForUpdates() {
  notifyListeners({ ...currentStatus, checking: true })
  await window.electron.update.check()
}
