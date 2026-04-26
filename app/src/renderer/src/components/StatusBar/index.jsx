export default function StatusBar() {
  return (
    <div
      className="flex items-center gap-2 p-1 opacity-0
    text-sm text-[var(--text-muted)] b-g-[var(--bg-base)] border-t border-[var(--border)]"
    >
      <span className="font-medium text-[var(--text-primary)]">Ready</span>
    </div>
  );
}
