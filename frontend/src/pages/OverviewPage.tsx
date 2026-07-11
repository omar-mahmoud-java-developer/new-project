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
              className="rounded-[1.5rem] border border-white/10 bg-slate-950/40 p-5 shadow-soft backdrop-blur-xl"
            >
              <h3 className="text-lg font-semibold">{panel.title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-400">{panel.body}</p>
            </article>
          ))}
        </div>

        <article className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6 shadow-lift backdrop-blur-xl">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Module roadmap</p>
              <h3 className="mt-2 text-2xl font-semibold">Foundation-only view</h3>
            </div>
            <div className="rounded-full border border-brand-400/30 bg-brand-500/10 px-3 py-2 text-xs font-medium text-brand-200">
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
              <div key={item} className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-4">
                <div className="text-sm font-medium text-slate-100">{item}</div>
                <div className="mt-2 text-sm text-slate-400">Placeholder folder ready for implementation.</div>
              </div>
            ))}
          </div>
        </article>
      </div>

      <aside className="space-y-6">
        <article className="rounded-[1.75rem] border border-white/10 bg-slate-950/40 p-6 shadow-soft backdrop-blur-xl">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">System health</p>
          <div className="mt-4 space-y-3">
            {[
              ["Backend", "Ready"],
              ["Database", "Provisioned"],
              ["Redis", "Provisioned"],
              ["RabbitMQ", "Provisioned"],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                <span className="text-sm text-slate-300">{label}</span>
                <span className="text-sm font-medium text-emerald-200">{value}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6 shadow-soft backdrop-blur-xl">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Project notes</p>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-300">
            <li>Clean Architecture and modular monolith boundaries are scaffolded.</li>
            <li>Frontend supports RTL/LTR direction switching and theme persistence.</li>
            <li>Docker, Maven Wrapper, ESLint, Prettier, Checkstyle, and Spotless are prepared.</li>
          </ul>
        </article>
      </aside>
    </section>
  );
}
