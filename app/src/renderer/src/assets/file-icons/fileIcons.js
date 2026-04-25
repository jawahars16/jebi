// Auto-loads every PNG/SVG dropped into this folder via Vite's import.meta.glob.
// Adding a new icon = drop a file. No code change.
//
// Lookup priority for files:
//   1. exact filename match (e.g. 'package.json' → package.json.png)
//   2. extension match     (e.g. 'index.js'    → js.png)
//   3. 'file' fallback     (whatever sits at file.png)
//
// Folders use 'folder' if present, otherwise null.

const modules = import.meta.glob('./*.{png,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
})

// { 'js': '/asset-url.png', 'package.json': '...', 'folder': '...' }
const iconMap = {}
for (const path in modules) {
  const key = path.replace('./', '').replace(/\.(png|svg)$/i, '').toLowerCase()
  iconMap[key] = modules[path]
}

export function getFolderIconUrl() {
  return iconMap['folder'] || null
}

export function getFileIconUrl(name) {
  if (!name) return iconMap['file'] || null
  const lower = name.toLowerCase()
  if (iconMap[lower]) return iconMap[lower]
  const dot = lower.lastIndexOf('.')
  if (dot > 0) {
    const ext = lower.slice(dot + 1)
    if (iconMap[ext]) return iconMap[ext]
  }
  return iconMap['file'] || null
}
