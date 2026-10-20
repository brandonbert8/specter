import type { ProcessInfo } from "@/lib/types";

type ProcessTableProps = {
  title: string;
  processes: ProcessInfo[];
  metric: "cpu" | "ram";
};

export function ProcessTable({ title, processes, metric }: ProcessTableProps) {
  return (
    <section className="rounded-xl border border-black/[.07] bg-white dark:border-white/[.09] dark:bg-[#0b0b0b]">
      <header className="flex items-center justify-between px-5 py-4">
        <h2 className="text-sm font-medium">{title}</h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400 dark:text-zinc-500">
          Top 5
        </span>
      </header>

      {processes.length === 0 ? (
        <p className="border-t border-black/[.06] px-5 py-8 text-center text-sm text-zinc-500 dark:border-white/[.07] dark:text-zinc-400">
          Sin datos de procesos.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-y border-black/[.06] font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400 dark:border-white/[.07] dark:text-zinc-500">
              <th className="px-5 py-2 text-left font-medium">Proceso</th>
              <th className="px-2 py-2 text-right font-medium">PID</th>
              <th className="px-5 py-2 text-right font-medium">
                {metric === "cpu" ? "CPU" : "RAM"}
              </th>
            </tr>
          </thead>
          <tbody>
            {processes.map((process) => {
              const value =
                metric === "cpu"
                  ? process.cpu_percent
                  : process.memory_percent;

              return (
                <tr
                  key={`${process.pid}-${process.name}`}
                  className="border-b border-black/[.04] last:border-0 hover:bg-black/[.02] dark:border-white/[.05] dark:hover:bg-white/[.03]"
                >
                  <td className="max-w-0 truncate px-5 py-2.5 font-medium">
                    {process.name}
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono text-xs text-zinc-400 dark:text-zinc-500">
                    {process.pid}
                  </td>
                  <td className="whitespace-nowrap px-5 py-2.5 text-right tabular-nums text-zinc-600 dark:text-zinc-300">
                    {value.toFixed(1)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
