const registry = new Map()
export const registerSetInput = (paneId, fn) => registry.set(paneId, fn)
export const unregisterSetInput = (paneId) => registry.delete(paneId)
export const triggerSetInput = (paneId, text) => registry.get(paneId)?.(text)
