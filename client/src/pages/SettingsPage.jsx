import { useState } from "react";
import Layout from "../components/Layout";
import { createBackup } from "../lib/api";

export default function SettingsPage() {
  const [status, setStatus] = useState("");

  async function handleBackup() {
    try {
      const data = await createBackup();
      setStatus(`Backup created: ${data.filename}`);
    } catch (error) {
      setStatus(error.response?.data?.message || "Unable to create backup.");
    }
  }

  return (
    <Layout>
      <section className="page-card max-w-3xl">
        <h1 className="text-2xl font-bold text-slate-900">Backup</h1>
        <p className="mt-2 text-sm text-slate-600">
          Create a timestamped copy of the SQLite database in the local backups folder.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button className="button-primary" onClick={handleBackup}>
            Create Backup
          </button>
        </div>
        {status && <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">{status}</p>}
      </section>
    </Layout>
  );
}
