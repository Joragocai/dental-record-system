import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import PatientSearchResults from "../components/PatientSearchResults";
import { listPatients, searchPatients } from "../lib/api";

export default function PatientSearchPage() {
  const [query, setQuery] = useState("");
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    const load = async () => {
      try {
        const search = query.trim();
        const data = search ? await searchPatients(search) : await listPatients();
        // Ignore an outdated response after the user changes the search text.
        if (active) setPatients(data);
      } catch {
        if (active) {
          setPatients([]);
          setError("Unable to search patient records. Check your connection and retry.");
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [query, retryCount]);

  return (
    <Layout>
      <section className="page-card min-w-0 space-y-4">
        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900">Patient Search</h1>
            <p className="text-sm text-slate-600">Search by last name, first name, patient ID, or mobile number.</p>
          </div>
          <div className="w-full min-w-0 max-w-xl">
            <label className="label-text" htmlFor="patient-search">
              Search
            </label>
            <input
              id="patient-search"
              className="text-input min-h-11 min-w-0 text-base sm:text-sm"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Type Del, P-2026-0001, or a mobile number"
            />
          </div>
        </div>
        {error ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <span>{error}</span>
            <button type="button" onClick={() => setRetryCount((count) => count + 1)} className="min-h-10 font-semibold underline underline-offset-2">
              Retry
            </button>
          </div>
        ) : loading ? (
          <p role="status" className="ui-loading py-4 text-sm text-slate-500">
            {query.trim() ? "Searching patient records…" : "Loading patient records…"}
          </p>
        ) : (
          <PatientSearchResults patients={patients} />
        )}
      </section>
    </Layout>
  );
}
