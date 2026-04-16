// tokenizeShell — lightweight regex-based shell tokenizer.
// Returns an array of { text, color } tokens for a single command line.
// Used by both the Prompt decoration (colored spans) and the InputBar
// CodeMirror highlight style (shared color constants).

export const SHELL_COLORS = {
  command:   'var(--text-primary)',
  flag:      'var(--text-secondary)',
  string:    '#a8d8a8',   // soft green — consistent across themes
  variable:  '#f0c674',   // yellow
  operator:  'var(--text-secondary)',
  comment:   'var(--text-muted)',
  default:   'var(--text-primary)',
}

// Ordered token patterns — first match wins.
const PATTERNS = [
  // Comment — must come before anything else to avoid false positives
  { re: /^(#.*)$/,                         color: SHELL_COLORS.comment },
  // Double-quoted string
  { re: /^("(?:[^"\\]|\\.)*")/,            color: SHELL_COLORS.string },
  // Single-quoted string
  { re: /^('(?:[^'\\]|\\.)*')/,            color: SHELL_COLORS.string },
  // Backtick string
  { re: /^(`(?:[^`\\]|\\.)*`)/,            color: SHELL_COLORS.string },
  // Variable: $VAR or ${VAR}
  { re: /^(\$\{[^}]*\}|\$[A-Za-z_]\w*)/,  color: SHELL_COLORS.variable },
  // Operator / redirect
  { re: /^(&&|\|\||>>|[|><&;])/,           color: SHELL_COLORS.operator },
  // Long flag
  { re: /^(--[A-Za-z][-A-Za-z0-9_=.]*)/,  color: SHELL_COLORS.flag },
  // Short flag (only after whitespace — avoid matching e.g. "-" in filenames mid-token)
  { re: /^(-[A-Za-z][A-Za-z0-9]*)/,        color: SHELL_COLORS.flag },
]

/**
 * Tokenizes a single shell command line into colored segments.
 * @param {string} text
 * @returns {{ text: string, color: string }[]}
 */
export function tokenizeShell(text) {
  if (!text) return []

  const tokens = []
  let pos = 0
  let isFirstWord = true

  while (pos < text.length) {
    // Consume leading whitespace as-is (no color needed)
    const wsMatch = text.slice(pos).match(/^(\s+)/)
    if (wsMatch) {
      tokens.push({ text: wsMatch[1], color: SHELL_COLORS.default })
      pos += wsMatch[1].length
      continue
    }

    // After whitespace, first non-whitespace token is the command name
    if (isFirstWord) {
      const wordMatch = text.slice(pos).match(/^([^\s|><&;'"$`#]+)/)
      if (wordMatch) {
        tokens.push({ text: wordMatch[1], color: SHELL_COLORS.command })
        pos += wordMatch[1].length
        isFirstWord = false
        continue
      }
      isFirstWord = false
    }

    // Try each pattern in order
    let matched = false
    for (const { re, color } of PATTERNS) {
      const m = text.slice(pos).match(re)
      if (m) {
        tokens.push({ text: m[1], color })
        pos += m[1].length
        matched = true
        break
      }
    }

    if (!matched) {
      // Consume until the next whitespace or special character
      const chunk = text.slice(pos).match(/^([^\s|><&;'"$`#\\]+)/)
      if (chunk) {
        tokens.push({ text: chunk[1], color: SHELL_COLORS.default })
        pos += chunk[1].length
      } else {
        // Single unmatched character — advance to avoid infinite loop
        tokens.push({ text: text[pos], color: SHELL_COLORS.default })
        pos++
      }
    }
  }

  return tokens
}
