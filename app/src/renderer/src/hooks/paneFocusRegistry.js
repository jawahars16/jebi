const registry = new Map()
export const registerFocus = (paneId, fn) => registry.set(paneId, fn)
export const unregisterFocus = (paneId) => registry.delete(paneId)
export const triggerFocus = (paneId) => registry.get(paneId)?.()
