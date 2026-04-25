// FsIcon — shared file/folder icon backed by PNGs in assets/file-icons/.
// Used by the autocomplete dropdown, CwdSegment, and TabBar so the same
// folder/file glyph appears everywhere.
//
// Props:
//   kind:  'folder' | 'file' | <filename>  (filename is matched against the
//          icon loader's exact-name → extension → 'file' fallback chain)
//   size:  px (default 14)
//
// Returns null if no icon is available — callers can fall back to text.

import { getFileIconUrl, getFolderIconUrl } from '../assets/file-icons/fileIcons'

export default function FsIcon({ kind, size = 14, style }) {
  const url = kind === 'folder' ? getFolderIconUrl() : getFileIconUrl(kind)
  if (!url) return null
  return (
    <img
      src={url}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        objectFit: 'contain',
        ...style,
      }}
    />
  )
}
