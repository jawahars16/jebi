const registry = new Map()
export const registerCopy = (paneId, fn) => registry.set(paneId, fn)
export const unregisterCopy = (paneId) => registry.delete(paneId)
export const triggerCopy = (paneId) => registry.get(paneId)?.()
