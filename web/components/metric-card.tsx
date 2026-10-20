import { clamp, pressureBar, pressureDot } from "@/lib/format";

type MetricCardProps = {
  label: string;
  value: string;
  unit?: string;
  detail: string;
  percent?: number;
};

export function MetricCard({
  label,
  value,
  unit,
  detail,
  percent,
}: MetricCardProps) {
  return (
    <div className="rounded-xl border border-black/[.07] bg-white p-5 transition-colors hover:border-black/[.14] dark:border-white/[.09] dark:bg-[#0b0b0b] dark:hover:border-white/[.18]">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
          {label}
        </span>
        {percent !== undefined ? (
          <span
            aria-hidden
            className={`size-1.5 shrink-0 rounded-full ${pressureDot(percent)}`}
          />
        ) : null}
      </div>

      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-[28px] font-semibold leading-none tracking-tight tabular-nums">
          {value}
        </span>
        {unit ? (
          <span className="text-sm font-medium text-zinc-400 dark:text-zinc-500">
            {unit}
          </span>
        ) : null}
      </div>

      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{detail}</p>

      <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div
          className={`h-full rounded-full transition-[width] duration-700 ease-out ${
            percent !== undefined
              ? pressureBar(percent)
              : "bg-zinc-200 dark:bg-zinc-700"
          }`}
          style={{ width: `${clamp(percent ?? 0)}%` }}
        />
      </div>
    </div>
  );
}
