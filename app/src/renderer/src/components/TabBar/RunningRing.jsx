import loadingUrl from '../../assets/loading.png'

export default function RunningRing({ children, running, size = 18 }) {
  if (running) {
    return (
      <span className="inline-flex items-center justify-center shrink-0" style={{ width: 22, height: 22 }}>
        <img
          src={loadingUrl}
          alt=""
          aria-hidden="true"
          width={size}
          height={size}
          className="tab-icon-spin"
          style={{ width: size, height: size, objectFit: 'contain' }}
        />
      </span>
    )
  }
  return (
    <span className="inline-flex items-center justify-center shrink-0" style={{ width: 22, height: 22 }}>
      {children}
    </span>
  )
}
