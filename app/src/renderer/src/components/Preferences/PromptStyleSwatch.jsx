// Mini preview of a prompt style preset. Three stub "segments" laid out with
// the preset's separator/edge shape, rendered at miniature scale.
//
// Note: inner preview colors intentionally use fixed theme-variable references
// so the swatch reflects whatever theme is active.

function Segment({ color, radius, slantRight, triangleRight }) {
  return (
    <div
      style={{
        position: 'relative',
        height: '14px',
        minWidth: '18px',
        padding: '0 5px',
        background: color,
        borderRadius: radius,
        clipPath: slantRight
          ? 'polygon(0 0, calc(100% - 4px) 0, 100% 100%, 0 100%)'
          : undefined,
      }}
    >
      {triangleRight && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: '-7px',
            width: 0,
            height: 0,
            borderTop: '7px solid transparent',
            borderBottom: '7px solid transparent',
            borderLeft: `7px solid ${color}`,
          }}
        />
      )}
    </div>
  )
}

function miniPreview(preset) {
  const { group, separator } = preset
  const colors = ['var(--accent)', 'var(--bg-elevated)', 'var(--border)']

  // Resolve preview radius from the preset spec.
  let radius = 0
  if (group.radius === 'pill') radius = 9999
  else if (group.radius === 'dynamic') radius = 4
  else radius = group.radius

  // Minimal: no segment bg; just mono "dots" between text-ish blocks.
  if (separator === 'dot') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        {colors.map((c, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {i > 0 && <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>·</span>}
            <div style={{ width: '16px', height: '3px', background: c, borderRadius: '2px' }} />
          </div>
        ))}
      </div>
    )
  }

  // Pill: independent rounded segments, no separator.
  if (!group.connected) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        {colors.map((c, i) => (
          <Segment key={i} color={c} radius={radius} />
        ))}
      </div>
    )
  }

  // Connected (Wave / Powerline / Slant)
  const items = []
  colors.forEach((c, i) => {
    items.push(
      <Segment
        key={`s-${i}`}
        color={c}
        slantRight={separator === 'slash' && i === colors.length - 1}
        triangleRight={separator === 'triangle' && i === colors.length - 1}
      />,
    )
    if (separator === 'triangle' && i < colors.length - 1) {
      items.push(
        <div
          key={`sep-${i}`}
          style={{
            width: 0,
            height: 0,
            borderTop: '7px solid transparent',
            borderBottom: '7px solid transparent',
            borderLeft: `7px solid ${c}`,
            marginLeft: '-1px',
          }}
        />,
      )
    }
    if (separator === 'slash' && i < colors.length - 1) {
      items.push(
        <div
          key={`sep-${i}`}
          style={{
            width: '6px',
            height: '14px',
            background: c,
            clipPath: 'polygon(0 0, 100% 0, 0 100%)',
            marginLeft: '-1px',
          }}
        />,
      )
    }
  })

  // Rounded right cap for Wave: use overflow:hidden on the wrapper.
  const wrapper = {
    display: 'flex',
    alignItems: 'center',
    borderRadius: separator === 'wave' ? `0 ${radius}px ${radius}px 0` : undefined,
    overflow: separator === 'wave' ? 'hidden' : 'visible',
  }

  return (
    <div style={wrapper}>
      {items}
      {separator === 'wave' && (
        <div style={{ width: '18px', height: '2px', background: 'var(--text-muted)', marginLeft: '3px', opacity: 0.6 }} />
      )}
    </div>
  )
}

export default function PromptStyleSwatch({ preset, isActive, onSelect }) {
  return (
    <button
      onClick={onSelect}
      style={{
        background: 'none',
        border: `2px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
        borderRadius: '8px',
        padding: '3px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: '4px',
        outline: 'none',
      }}
    >
      <div
        style={{
          borderRadius: '5px',
          border: '1px solid var(--border)',
          background: 'var(--bg-base)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '58px',
          padding: '0 8px',
        }}
      >
        {miniPreview(preset)}
      </div>
      <span
        style={{
          fontSize: '11px',
          color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
          textAlign: 'center',
          fontWeight: isActive ? 600 : 400,
          fontFamily: 'var(--font-ui)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {preset.name}
      </span>
    </button>
  )
}
