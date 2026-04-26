// Pure functions for managing the pane layout tree.
// No React, no side effects — all functions return new tree objects.
//
// Tree node shapes:
//   { type: 'leaf', paneId: string }
//   { type: 'split', direction: 'horizontal' | 'vertical', ratio: number, first: Node, second: Node }
//
// direction: 'horizontal' = side-by-side (split right)
//            'vertical'   = stacked top/bottom (split down)

function generateId() {
  return crypto.randomUUID()
}

export function createLeaf() {
  return { type: 'leaf', paneId: generateId() }
}

// Replaces the leaf matching targetPaneId with a split node.
// The original pane stays in `first`; a new pane is created in `second`.
// Returns { tree, newPaneId } — newPaneId is the ID of the freshly created pane.
export function splitLeaf(node, targetPaneId, direction) {
  if (node.type === 'leaf') {
    if (node.paneId !== targetPaneId) return { tree: node, newPaneId: null }
    const newPaneId = generateId()
    return {
      tree: {
        type: 'split',
        direction,
        ratio: 0.5,
        first: node,
        second: { type: 'leaf', paneId: newPaneId },
      },
      newPaneId,
    }
  }

  // Split node — recurse into both children
  const { tree: newFirst, newPaneId: idFromFirst } = splitLeaf(node.first, targetPaneId, direction)
  if (idFromFirst !== null) {
    return { tree: { ...node, first: newFirst }, newPaneId: idFromFirst }
  }
  const { tree: newSecond, newPaneId: idFromSecond } = splitLeaf(node.second, targetPaneId, direction)
  return { tree: { ...node, second: newSecond }, newPaneId: idFromSecond }
}

// Removes the leaf matching targetPaneId.
// "Bubble up": when a split node loses one child (it returns null), the
// surviving child is promoted to replace the split node entirely. This
// keeps the tree balanced without leaving empty split nodes behind.
// Returns null if the entire tree was removed (i.e. last leaf removed).
export function removeLeaf(node, targetPaneId) {
  if (node.type === 'leaf') {
    return node.paneId === targetPaneId ? null : node
  }

  const newFirst = removeLeaf(node.first, targetPaneId)
  const newSecond = removeLeaf(node.second, targetPaneId)

  if (newFirst === null) return newSecond
  if (newSecond === null) return newFirst
  return { ...node, first: newFirst, second: newSecond }
}

// Returns all paneIds present in the tree (depth-first).
export function collectPaneIds(node) {
  if (node.type === 'leaf') return [node.paneId]
  return [...collectPaneIds(node.first), ...collectPaneIds(node.second)]
}

// Returns { [paneId]: { left, top, width, height } } as percentages (0–100).
// Used to render panes as flat siblings with absolute positioning — this
// prevents React from remounting components when the layout tree changes.
//
// Algorithm: recursive descent. Each call owns a sub-rectangle defined by
// (x, y, w, h). Split nodes divide that rectangle along the split axis using
// the stored ratio, then recurse into each half.
export function computePaneRects(node, x = 0, y = 0, w = 100, h = 100) {
  if (node.type === 'leaf') {
    return { [node.paneId]: { left: x, top: y, width: w, height: h } }
  }
  const ratio = node.ratio ?? 0.5
  if (node.direction === 'horizontal') {
    return {
      ...computePaneRects(node.first,  x,           y, w * ratio,       h),
      ...computePaneRects(node.second, x + w * ratio, y, w * (1 - ratio), h),
    }
  } else {
    return {
      ...computePaneRects(node.first,  x, y,           w, h * ratio),
      ...computePaneRects(node.second, x, y + h * ratio, w, h * (1 - ratio)),
    }
  }
}

// Returns an array of divider descriptors for rendering split lines.
// Each descriptor includes ratio + parentOffset/parentSize so drag handlers
// can compute the new local ratio from pixel deltas without knowing the tree depth.
//
// Divider id format: "${firstPaneId}|${secondPaneId}" — the first leaf id from
// each child subtree, joined by "|". This is a stable key that uniquely identifies
// which split node the divider belongs to, and is the same key used by updateSplitRatio.
export function computeDividers(node, x = 0, y = 0, w = 100, h = 100) {
  if (node.type === 'leaf') return []
  const ratio = node.ratio ?? 0.5
  const firstId  = collectPaneIds(node.first)[0]
  const secondId = collectPaneIds(node.second)[0]
  if (node.direction === 'horizontal') {
    const sx = x + w * ratio
    return [
      { id: `${firstId}|${secondId}`, x: sx, y, w: 0, h, vertical: true, ratio, parentOffset: x, parentSize: w },
      ...computeDividers(node.first,  x,  y, w * ratio,       h),
      ...computeDividers(node.second, sx, y, w * (1 - ratio), h),
    ]
  } else {
    const sy = y + h * ratio
    return [
      { id: `${firstId}|${secondId}`, x, y: sy, w, h: 0, vertical: false, ratio, parentOffset: y, parentSize: h },
      ...computeDividers(node.first,  x, y,  w, h * ratio),
      ...computeDividers(node.second, x, sy, w, h * (1 - ratio)),
    ]
  }
}

// Updates the ratio of the split node identified by dividerId.
// dividerId format: "${firstPaneId}|${secondPaneId}" (matches computeDividers ids).
export function updateSplitRatio(node, dividerId, ratio) {
  if (node.type === 'leaf') return node
  const firstId  = collectPaneIds(node.first)[0]
  const secondId = collectPaneIds(node.second)[0]
  if (`${firstId}|${secondId}` === dividerId) {
    return { ...node, ratio: Math.max(0.1, Math.min(0.9, ratio)) }
  }
  return {
    ...node,
    first:  updateSplitRatio(node.first,  dividerId, ratio),
    second: updateSplitRatio(node.second, dividerId, ratio),
  }
}
