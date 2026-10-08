import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export default function AuthPanel({
  title,
  subtitle,
  children,
  footer
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-12">
      <section className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-clinic-700">Dental Record System</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">{subtitle}</p>
        </div>
        {children}
        {footer ? <div className="mt-6 border-t border-slate-200 pt-5 text-sm text-slate-600">{footer}</div> : null}
        <div className="mt-6 text-center text-xs text-slate-400">
          <Link to={import.meta.env.DEV ? "/" : "/login"} className="hover:text-slate-600">
            {import.meta.env.DEV ? "Return to local clinic workspace" : "Return to sign in"}
          </Link>
        </div>
      </section>
    </main>
  );
}
