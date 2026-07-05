import { useState } from "react";
import Layout from "../components/Layout";
import { createBackup } from "../lib/api";

export default function SettingsPage() {
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState("info");

  async function handleBackup() {
    try {
      const data = await createBackup();
      setStatus(data.message || `Backup completed successfully. Database and uploaded files were copied to ${data.backup_path}.`);
      setStatusTone("success");
    } catch (error) {
      setStatus(error.response?.data?.message || "Unable to create backup.");
      setStatusTone("error");
    }
  }

  return (
    <Layout>
      <section className="mx-auto max-w-3xl">
        <div className="page-card">
          <div className="max-w-2xl">
            <p className="text-sm uppercase tracking-[0.2em] text-clinic-700">System Maintenance</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">Backup</h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              Create a timestamped backup of patient records, treatment records, and uploaded patient/treatment attachments.
            </p>
          </div>
          <div className="mt-6 no-print">
            <button className="button-primary" onClick={handleBackup}>
              Create Backup
            </button>
          </div>
        {status && (
          <p
            className={`feedback-message mt-5 rounded-xl px-4 py-3 text-sm ${
              statusTone === "success"
                ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                : "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
            }`}
          >
            {status}
          </p>
        )}
        </div>
      </section>
    </Layout>
  );
}
