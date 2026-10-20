export function SpecterMark({ className = "size-8" }: { className?: string }) {
  return <span className={`inline-flex shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm shadow-emerald-600/15 ${className}`}>
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="size-[58%]"><path d="M3 12h4l2.5-6 5 12 2.5-6H21" /></svg>
  </span>;
}

export function Spinner({ className = "size-4" }: { className?: string }) {
  return <svg aria-hidden viewBox="0 0 24 24" fill="none" className={`animate-spin motion-reduce:animate-none ${className}`}><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity=".2" /><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
}
