import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext.js";
import { authenticatedV2Fetch } from "../auth/authApi.js";
import { getSchedulingBootstrap, listCalendarAppointments, type SchedulingBranch } from "../appointments/appointmentApi.js";
import {
  assignedSchedulingBranches, clinicBusinessDate, createLatestRequestGuard,
  parsePersonnelAccess, parsePersonnelFinance, pendingRequestCount,
  summarizeAppointments, validateExpenseDraft, visiblePersonnelSnapshot,
  type ExpenseDraft, type PersonnelAccess, type PersonnelSnapshotEnvelope
} from "../dashboard/personnelDashboardData.js";
import PersonnelDashboardView from "./PersonnelDashboardView.js";

const emptyDraft: ExpenseDraft = { categoryCode: "", description: "", amount: "" };

export default function PersonnelDashboardPage() {
  const auth = useAuth();
  const options = useMemo(() => auth.providerSession?.accessToken && auth.apiBaseUrl
    ? { accessToken: auth.providerSession.accessToken, apiBaseUrl: auth.apiBaseUrl }
    : null, [auth.providerSession?.accessToken, auth.apiBaseUrl]);
  const [access, setAccess] = useState<PersonnelAccess | null>(null);
  const [branches, setBranches] = useState<SchedulingBranch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [date, setDate] = useState(clinicBusinessDate);
  const [snapshot, setSnapshot] = useState<PersonnelSnapshotEnvelope | null>(null);
  const [verifying, setVerifying] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState("");
  const [expenseDraft, setExpenseDraft] = useState<ExpenseDraft>(emptyDraft);
  const [expenseNotice, setExpenseNotice] = useState("");
  const [expenseSaving, setExpenseSaving] = useState(false);
  const summaryGuard = useRef(createLatestRequestGuard());
  const contextGuard = useRef(createLatestRequestGuard());
  const selectedBranchRef = useRef(branchId);
  selectedBranchRef.current = branchId;

  useEffect(() => {
    const valid = contextGuard.current.begin();
    summaryGuard.current.cancel();
    setAccess(null); setBranches([]); setBranchId(""); setSnapshot(null);
    setVerifying(true); setNotice(""); setExpenseNotice("");
    if (!options) { setVerifying(false); return () => { contextGuard.current.cancel(); }; }
    const verify = async () => {
      try {
        const response = await authenticatedV2Fetch("/dashboard/context", { cache: "no-store" }, options);
        if (!response.ok) throw new Error("Access denied");
        const permissions = parsePersonnelAccess(await response.json());
        if (!valid()) return;
        const bootstrap = await getSchedulingBootstrap(options);
        const allowedBranches = assignedSchedulingBranches(bootstrap, permissions);
        if (!valid()) return;
        setAccess(permissions);
        setBranches(allowedBranches);
      } catch {
        if (valid()) {
          setNotice("Personnel access or branch assignments could not be verified.");
          setAccess(null); setBranches([]); setBranchId(""); setSnapshot(null);
        }
      } finally { if (valid()) setVerifying(false); }
    };
    const onFocus = () => {
      const retainedBranch = selectedBranchRef.current;
      contextGuard.current.cancel();
      summaryGuard.current.cancel();
      setSnapshot(null); setAccess(null); setBranches([]); setBranchId("");
      setVerifying(true);
      const next = contextGuard.current.begin();
      void (async () => {
        try {
          const response = await authenticatedV2Fetch("/dashboard/context", { cache: "no-store" }, options);
          if (!response.ok) throw new Error("Access denied");
          const permissions = parsePersonnelAccess(await response.json());
          const bootstrap = await getSchedulingBootstrap(options);
          if (!next()) return;
          const allowed = assignedSchedulingBranches(bootstrap, permissions);
          setAccess(permissions); setBranches(allowed);
          setBranchId(allowed.some((branch) => branch.id === retainedBranch) ? retainedBranch : "");
          setNotice("");
        } catch {
          if (next()) setNotice("Personnel access or branch assignments could not be verified.");
        } finally { if (next()) setVerifying(false); }
      })();
    };
    void verify();
    window.addEventListener("focus", onFocus);
    return () => {
      contextGuard.current.cancel(); summaryGuard.current.cancel();
      window.removeEventListener("focus", onFocus);
    };
  }, [options]);

  useEffect(() => {
    const valid = summaryGuard.current.begin();
    setSnapshot(null);
    if (!options || !access || !branchId || !branches.some((branch) => branch.id === branchId)) {
      setRefreshing(false);
      return () => { summaryGuard.current.cancel(); };
    }
    setRefreshing(true); setNotice("");
    const load = async () => {
      const [appointments, pending, finance] = await Promise.allSettled([
        listCalendarAppointments({ branchId, date }, options).then((data) => summarizeAppointments(data, branchId, date)),
        access.requestReview
          ? authenticatedV2Fetch("/patient-appointment-reviews?branchId=" + encodeURIComponent(branchId), { cache: "no-store" }, options)
              .then(async (response) => {
                if (!response.ok) throw new Error("Request review unavailable");
                return pendingRequestCount(await response.json());
              })
          : Promise.resolve(null),
        access.dailyFinanceRead
          ? authenticatedV2Fetch("/finance/daily-summary?branchId=" + encodeURIComponent(branchId) +
              "&businessDate=" + encodeURIComponent(date), { cache: "no-store" }, options)
              .then(async (response) => {
                if (!response.ok) throw new Error("Finance unavailable");
                return parsePersonnelFinance(await response.json(), branchId, date);
              })
          : Promise.resolve(null)
      ]);
      if (!valid()) return;
      setSnapshot({
        branchId,
        date,
        data: {
          appointments: appointments.status === "fulfilled" ? appointments.value : null,
          pending: pending.status === "fulfilled" ? pending.value : null,
          finance: finance.status === "fulfilled" ? finance.value : null
        }
      });
      if (appointments.status !== "fulfilled") setNotice("Appointment totals could not be verified for the selected branch and date.");
      setRefreshing(false);
    };
    void load().catch(() => {
      if (valid()) { setNotice("Unable to verify branch summaries."); setRefreshing(false); }
    });
    return () => { summaryGuard.current.cancel(); };
  }, [options, access, branches, branchId, date]);

  async function submitExpense() {
    if (!options || !access?.expenseCreate || !branchId ||
        !branches.some((branch) => branch.id === branchId) || !validateExpenseDraft(expenseDraft) ||
        expenseSaving || verifying) {
      setExpenseNotice("Select an authorized branch and provide a valid category, description and amount.");
      return;
    }
    setExpenseSaving(true); setExpenseNotice("");
    const currentBranch = branchId;
    try {
      const check = await authenticatedV2Fetch("/dashboard/context", { cache: "no-store" }, options);
      if (!check.ok) throw new Error("Authorization changed");
      const current = parsePersonnelAccess(await check.json());
      if (!current.expenseCreate || !current.branchIds.includes(currentBranch)) throw new Error("Permission revoked");
      const response = await authenticatedV2Fetch("/finance-operations/expenses", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId: currentBranch, expenseDate: date, categoryCode: expenseDraft.categoryCode,
          description: expenseDraft.description.trim(), amount: expenseDraft.amount.trim()
        })
      }, options);
      if (!response.ok) throw new Error("Expense rejected");
      setExpenseDraft(emptyDraft);
      setExpenseNotice("Pending expense submitted for clinic approval; no payment was recorded.");
    } catch {
      setExpenseNotice("Expense submission was not confirmed. Refresh permissions and verify before retrying.");
    } finally { setExpenseSaving(false); }
  }

  return <PersonnelDashboardView access={access} branches={branches} branchId={branchId}
    businessDate={date} snapshot={visiblePersonnelSnapshot(snapshot, branchId, date, Boolean(access) && !verifying && !refreshing)} verifying={verifying} refreshing={refreshing}
    notice={notice} expenseDraft={expenseDraft} expenseSaving={expenseSaving} expenseNotice={expenseNotice}
    setBranch={(value) => { setBranchId(value); setExpenseNotice(""); }}
    setBusinessDate={setDate} setExpenseDraft={setExpenseDraft} submitExpense={() => void submitExpense()} />;
}
