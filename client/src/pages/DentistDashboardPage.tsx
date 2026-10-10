import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext.js";
import { authenticatedV2Fetch } from "../auth/authApi.js";
import { getSchedulingBootstrap, type SchedulingBranch } from "../appointments/appointmentApi.js";
import {
  clinicLocalClock, dentistAppointmentListPath, parseDentistAccess, permittedDentistBranches,
  summarizeDentistDay, visibleDentistSummary,
  type DentistDashboardAccess, type DentistSummaryEnvelope
} from "../dashboard/dentistDashboardData.js";
import DentistDashboardView from "./DentistDashboardView.js";

export default function DentistDashboardPage() {
  const auth = useAuth();
  const options = useMemo(() => auth.providerSession?.accessToken && auth.apiBaseUrl
    ? { accessToken: auth.providerSession.accessToken, apiBaseUrl: auth.apiBaseUrl }
    : null, [auth.providerSession?.accessToken, auth.apiBaseUrl]);
  const [access, setAccess] = useState<DentistDashboardAccess | null>(null);
  const [branches, setBranches] = useState<SchedulingBranch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [date, setDate] = useState(() => clinicLocalClock().date);
  const [snapshot, setSnapshot] = useState<DentistSummaryEnvelope | null>(null);
  const [verifying, setVerifying] = useState(true);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [authorizationRefresh, setAuthorizationRefresh] = useState(0);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      setAccess(null); setBranches([]); setSnapshot(null);
      setLoading(false); setVerifying(true);
      setAuthorizationRefresh((count) => count + 1);
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  useEffect(() => {
    let active = true;
    setAccess(null); setBranches([]); setSnapshot(null); setNotice(""); setVerifying(true);
    if (!options) { setVerifying(false); return () => { active = false; }; }
    const verify = async () => {
      try {
        const response = await authenticatedV2Fetch("/dashboard/context", { cache: "no-store" }, options);
        if (!response.ok) throw new Error("Authorization unavailable");
        const dentist = parseDentistAccess(await response.json());
        if (!active) return;
        const scheduling = await getSchedulingBootstrap(options);
        const assigned = permittedDentistBranches(scheduling, dentist);
        if (!active) return;
        setAccess(dentist);
        setBranches(assigned);
        setBranchId((existing) => assigned.some((branch) => branch.id === existing) ? existing : "");
      } catch {
        if (active) {
          setAccess(null); setBranches([]); setBranchId(""); setSnapshot(null);
          setNotice("Dentist permissions or scheduling branches could not be verified.");
        }
      } finally {
        if (active) setVerifying(false);
      }
    };
    void verify();
    return () => { active = false; };
  }, [options, authorizationRefresh]);

  useEffect(() => {
    let active = true;
    setSnapshot(null);
    if (!options || !access || !branchId || !branches.some((branch) => branch.id === branchId)) {
      setLoading(false);
      return () => { active = false; };
    }
    setLoading(true); setNotice("");
    const load = async () => {
      try {
        const response = await authenticatedV2Fetch(
          dentistAppointmentListPath(branchId, date, access.selfUserId),
          { cache: "no-store" }, options
        );
        if (!response.ok) throw new Error("Schedule unavailable");
        const summary = summarizeDentistDay(await response.json(), branchId, date, access.selfUserId);
        const fresh = await authenticatedV2Fetch("/dashboard/context", { cache: "no-store" }, options);
        if (!fresh.ok) throw new Error("Dentist role no longer available");
        const verified = parseDentistAccess(await fresh.json());
        if (verified.selfUserId !== access.selfUserId || !verified.branchIds.includes(branchId)) {
          throw new Error("Dentist branch access changed");
        }
        if (active) setSnapshot({ branchId, date, selfUserId: access.selfUserId, summary });
      } catch {
        if (active) {
          setSnapshot(null);
          setNotice("Your selected schedule could not be verified. Refresh your permissions and try again.");
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [options, access, branches, branchId, date]);

  return <DentistDashboardView
    access={access} branches={branches} branchId={branchId} businessDate={date}
    summary={visibleDentistSummary(snapshot, branchId, date, access?.selfUserId ?? "", Boolean(access) && !verifying && !loading)}
    verifying={verifying} loading={loading} notice={notice}
    setBranch={(id) => { setBranchId(id); setSnapshot(null); }}
    setBusinessDate={(day) => { setDate(day); setSnapshot(null); }}
  />;
}
