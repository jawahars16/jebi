export default function StatusBar() {
    return (
        <div className="flex items-center gap-2 px-3 text-sm text-[var(--text-muted)] bg-[var(--accent)]">
            <span className="font-medium text-[var(--text-primary)]">Ready</span>
        </div>
    )
}