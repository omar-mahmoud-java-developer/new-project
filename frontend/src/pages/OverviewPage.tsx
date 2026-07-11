const panels = [
  {
    title: "Module launchpad",
    body: "Future ERP areas are staged here as placeholders with a clear path to business implementation.",
  },
  {
    title: "Release readiness",
    body: "Build, lint, test, and container orchestration hooks are prepared for a clean delivery pipeline.",
  },
  {
    title: "Accessibility first",
    body: "Semantic structure, contrast-safe tokens, and RTL/LTR support are already part of the shell.",
  },
];

export function OverviewPage() {
  return (
    <section className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
      <div className="grid gap-6">
        <div className="grid gap-4 md:grid-cols-3">
          {panels.map((panel) => (
            <article
              key={panel.title}
              className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <h3 className="text-lg font-semibold">{panel.title}</h3>
              <p className="mt-3 text-sm leading-6 text-zinc-500 dark:text-zinc-400">{panel.body}</p>
            </article>
          ))}
        </div>

        <article className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-zinc-500 dark:text-zinc-400">Module roadmap</p>
              <h3 className="mt-2 text-2xl font-semibold">Foundation-only view</h3>
            </div>
            <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              No business screens
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[
              "Authentication",
              "Users",
              "Roles",
              "Permissions",
              "HR",
              "Payroll",
              "Accounting",
              "Inventory",
              "Reports",
            ].map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{item}</div>
                <div className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Placeholder folder ready for implementation.</div>
              </div>
            ))}
          </div>
        </article>
      </div>

      <aside className="space-y-6">
        <article className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-500 dark:text-zinc-400">System health</p>
          <div className="mt-4 space-y-3">
            {[
              ["Backend", "Ready"],
              ["Database", "Provisioned"],
              ["Redis", "Provisioned"],
              ["RabbitMQ", "Provisioned"],
            ].map(([label, value]) => (
              <div
                key={label}
                className="flex items-center justify-between rounded-2xl bg-zinc-50 px-4 py-3 dark:bg-zinc-950"
              >
                <span className="text-sm text-zinc-600 dark:text-zinc-300">{label}</span>
                <span className="text-sm font-medium text-emerald-600 dark:text-emerald-300">{value}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-500 dark:text-zinc-400">Project notes</p>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            <li>Clean Architecture and modular monolith boundaries are scaffolded.</li>
            <li>Frontend supports RTL/LTR direction switching and theme persistence.</li>
            <li>Docker, Maven Wrapper, ESLint, Prettier, Checkstyle, and Spotless are prepared.</li>
          </ul>
        </article>
      </aside>
    </section>
  );
}
