import { useState } from "react";
import { demoRoleCards, demoRoleNames, isStagingDemoEnabled, type DemoRoleName } from "../dashboard/stagingDemoRoles.js";

/** Intentionally does not call an API or navigate to a protected role route. */
export default function StagingDemoRoleSwitcher() {
  const [selected, setSelected] = useState<DemoRoleName>("Owner-Dentist");
  if (!isStagingDemoEnabled(import.meta.env.VITE_APP_ENV, import.meta.env.PROD)) return null;
  const preview = demoRoleCards[selected];
  return <section aria-label="Staging-only fictional dashboard tour" className="space-y-4 rounded-2xl border-2 border-dashed border-indigo-300 bg-indigo-50 p-5">
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-indigo-800">Staging only · Fictional role preview</p>
      <h2 className="mt-1 text-xl font-semibold">Demo role switcher</h2>
      <p className="mt-2 text-sm text-slate-700">Explore role layouts with fictional descriptions. Your real account remains unchanged. These tiles cannot access records, submit requests, or grant permissions.</p>
    </div>
    <div role="group" aria-label="Select fictional dashboard role" className="grid grid-cols-2 gap-2 md:grid-cols-3">
      {demoRoleNames.map(role=><button type="button" key={role} aria-pressed={role===selected} onClick={()=>setSelected(role)} className={`min-h-12 rounded-lg border px-3 py-3 text-left text-sm font-medium focus-visible:outline-2 focus-visible:outline-indigo-600 ${role===selected?"border-indigo-800 bg-indigo-100 text-indigo-950":"border-slate-200 bg-white text-slate-800"}`}>{role}</button>)}
    </div>
    <div className="space-y-3 rounded-xl border border-indigo-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase text-indigo-700">Fictional preview — no backend data</p>
      <h3 className="text-lg font-bold">{selected} dashboard</h3>
      <p className="text-sm text-slate-600">{preview.description}</p>
      <div className="grid gap-3 sm:grid-cols-2">{preview.tiles.map(label=><div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-medium">{label}<p className="mt-2 text-xs font-normal text-slate-500">Preview only · No live records</p></div>)}</div>
    </div>
    <p className="text-xs text-slate-600">For functional and authorization testing, use properly invited, activated test users. This interface never impersonates those users.</p>
  </section>;
}
