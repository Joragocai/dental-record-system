import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Layout from "../components/Layout";
import TreatmentHistoryTable from "../components/TreatmentHistoryTable";
import { getExportUrl, getPatient, getTreatmentsByPatient } from "../lib/api";

export default function PatientTreatmentHistoryPage() {
  const { patientId } = useParams();
  const [patient, setPatient] = useState(null);
  const [treatments, setTreatments] = useState([]);

  useEffect(() => {
    getPatient(patientId).then(setPatient).catch(() => setPatient(null));
    getTreatmentsByPatient(patientId).then(setTreatments).catch(() => setTreatments([]));
  }, [patientId]);

  return (
    <Layout>
      <section className="page-card">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Treatment History</h1>
            <p className="text-sm text-slate-600">
              {patient ? `${patient.display_name} | ${patient.patient_id}` : "Loading patient"} 
            </p>
          </div>
          <div className="no-print flex flex-wrap gap-3">
            <Link className="button-secondary" to={`/print/patients/${patientId}/treatments`}>
              Print Full History
            </Link>
            <a className="button-secondary" href={getExportUrl(`/api/export/patients/${patientId}/treatments`)}>
              Export Treatments
            </a>
          </div>
        </div>
        <div className="mt-4">
          <TreatmentHistoryTable treatments={treatments} />
        </div>
      </section>
    </Layout>
  );
}
