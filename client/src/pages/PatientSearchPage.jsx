import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import PatientSearchResults from "../components/PatientSearchResults";
import { listPatients, searchPatients } from "../lib/api";

export default function PatientSearchPage() {
  const [query, setQuery] = useState("");
  const [patients, setPatients] = useState([]);

  useEffect(() => {
    const load = async () => {
      const data = query.trim() ? await searchPatients(query.trim()) : await listPatients();
      setPatients(data);
    };
    load().catch(() => setPatients([]));
  }, [query]);

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
        <PatientSearchResults patients={patients} />
      </section>
    </Layout>
  );
}
