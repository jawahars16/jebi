import { useRef } from 'react'

// Manages command history navigation (up/down arrows).
// Uses refs so history changes never cause re-renders.
export function useCommandHistory() {
  const historyRef = useRef([])   // submitted commands, oldest first
  const indexRef = useRef(-1)     // -1 = not navigating (at the live input)
  const draftRef = useRef('')     // saves in-progress input before navigating up

  // Call on every successful submit to record the command.
  function push(command) {
    const trimmed = command.trim()
    if (trimmed) {
      // Avoid consecutive duplicates
      const prev = historyRef.current
      if (prev.length === 0 || prev[prev.length - 1] !== trimmed) {
        historyRef.current = [...prev, trimmed]
      }
    }
    indexRef.current = -1
    draftRef.current = ''
  }

  // Navigate up (older) or down (newer).
  // Returns the string to put in the textarea, or null if nothing should change.
  function navigate(direction, currentValue) {
    const history = historyRef.current
    const index = indexRef.current

    if (direction === 'up') {
      if (history.length === 0) return null
      if (index === -1) {
        draftRef.current = currentValue  // save what the user was typing
        indexRef.current = history.length - 1
      } else if (index > 0) {
        indexRef.current = index - 1
      }
      return history[indexRef.current]
    }

    if (direction === 'down') {
      if (index === -1) return null
      if (index < history.length - 1) {
        indexRef.current = index + 1
        return history[indexRef.current]
      }
      // Reached the bottom — restore the draft
      indexRef.current = -1
      return draftRef.current
    }

    return null
  }

  return { push, navigate }
}
