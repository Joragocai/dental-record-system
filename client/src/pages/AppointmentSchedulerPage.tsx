import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";
import {
  cancelAppointment,
  checkAppointmentAvailability,
  confirmAppointment,
  createAppointment,
  getSchedulingBootstrap,
  getSchedulingContext,
  listCalendarWeekAppointments,
  rescheduleAppointment,
  runAppointmentAction,
  searchSchedulingPatients,
  updateAppointment,
  type AppointmentRecord,
  type AppointmentStatus,
  type AppointmentUiCapabilities,
  type MinimalAppointmentPatient,
  type SchedulingBranch,
  type SchedulingDentist
} from "../appointments/appointmentApi.js";
import {
  addDays,
  appointmentEndTime,
  appointmentStatusLabels,
  appointmentStatusOptions,
  formatAppointmentTime,
  formatCalendarDate,
  isPendingAppointment,
  manilaToday,
  sortAppointments,
  startOfWeek,
  statusBadgeClass,
  weekDates
} from "../appointments/appointmentUi.js";

type CalendarView = "day" | "week" | "agenda";
type ActionMode = "confirm" | "reschedule" | "cancel" | "edit";

interface ActionState {
  mode: ActionMode;
  appointment: AppointmentRecord;
}

interface ActionFormState {
  branchId: string;
  appointmentDate: string;
  appointmentTime: string;
  durationMinutes: string;
  dentistUserId: string;
  plannedProcedure: string;
  notes: string;
  reason: string;
}

interface CreateFormState extends ActionFormState {
  status: "requested" | "pending_confirmation" | "confirmed";
}

const emptyCapabilities: AppointmentUiCapabilities = {
  create: false,
  update: false,
  confirm: false,
  reschedule: false,
  cancel: false,
  checkIn: false,
  start: false,
  complete: false,
  noShow: false
};

function createRequestOptions(auth: ReturnType<typeof useAuth>) {
  const token = auth.providerSession?.accessToken;
  if (!token || !auth.apiBaseUrl) return null;
  return { accessToken: token, apiBaseUrl: auth.apiBaseUrl };
}

function statusPill(status: AppointmentStatus) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(status)}`}>
      {appointmentStatusLabels[status]}
    </span>
  );
}

function appointmentPatientLabel(record: AppointmentRecord): string {
  return record.patientDisplayName || record.patientCode || record.patientId;
}

function appointmentTimeRange(record: AppointmentRecord): string {
  const end = appointmentEndTime(record.appointmentTime, record.durationMinutes);
  if (!record.appointmentTime) return "Time pending";
  if (!end) return formatAppointmentTime(record.appointmentTime);
  return `${formatAppointmentTime(record.appointmentTime)}–${formatAppointmentTime(end)}`;
}

function CalendarAppointmentCard({
  appointment,
  dentistName,
  onOpen
}: {
  appointment: AppointmentRecord;
  dentistName: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-clinic-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-clinic-200"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-900">{appointmentPatientLabel(appointment)}</p>
          <p className="mt-0.5 text-xs font-medium text-slate-500">{appointmentTimeRange(appointment)}</p>
        </div>
        {statusPill(appointment.status)}
      </div>
      <p className="mt-2 truncate text-xs text-slate-600">
        {appointment.plannedProcedure || "General appointment"}
      </p>
      <p className="mt-1 truncate text-xs text-slate-500">{dentistName}</p>
    </button>
  );
}

function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`max-h-[92vh] w-full overflow-y-auto rounded-3xl bg-white shadow-2xl ${wide ? "max-w-4xl" : "max-w-2xl"}`}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
          </div>
          <button type="button" className="button-secondary px-3 py-1.5" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="p-5">{children}</div>
      </section>
    </div>
  );
}

function LabeledField({
  label,
  children,
  hint
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="label-text">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

export default function AppointmentSchedulerPage() {
  const auth = useAuth();
  const requestOptions = useMemo(() => createRequestOptions(auth), [auth.providerSession?.accessToken, auth.apiBaseUrl]);
  const [branches, setBranches] = useState<SchedulingBranch[]>([]);
  const [capabilities, setCapabilities] = useState<AppointmentUiCapabilities>(emptyCapabilities);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [dentists, setDentists] = useState<SchedulingDentist[]>([]);
  const [selectedDate, setSelectedDate] = useState(manilaToday());
  const [view, setView] = useState<CalendarView>(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches ? "agenda" : "week"
  );
  const [dentistFilter, setDentistFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | "all">("all");
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [loadingBootstrap, setLoadingBootstrap] = useState(true);
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentRecord | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [actionState, setActionState] = useState<ActionState | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);

  const [patientQuery, setPatientQuery] = useState("");
  const [patientResults, setPatientResults] = useState<MinimalAppointmentPatient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<MinimalAppointmentPatient | null>(null);
  const [searchingPatients, setSearchingPatients] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createFeedback, setCreateFeedback] = useState("");
  const [actionFeedback, setActionFeedback] = useState("");
  const submissionLockRef = useRef(false);

  const [createForm, setCreateForm] = useState<CreateFormState>({
    branchId: "",
    appointmentDate: manilaToday(),
    appointmentTime: "09:00",
    durationMinutes: "30",
    dentistUserId: "",
    plannedProcedure: "",
    notes: "",
    reason: "",
    status: "confirmed"
  });

  const [actionForm, setActionForm] = useState<ActionFormState>({
    branchId: "",
    appointmentDate: manilaToday(),
    appointmentTime: "09:00",
    durationMinutes: "30",
    dentistUserId: "",
    plannedProcedure: "",
    notes: "",
    reason: ""
  });
  const [actionDentists, setActionDentists] = useState<SchedulingDentist[]>([]);

  useEffect(() => {
    if (!requestOptions) return;
    let active = true;
    setLoadingBootstrap(true);
    setFeedback("");

    getSchedulingBootstrap(requestOptions)
      .then((bootstrap) => {
        if (!active) return;
        setBranches(bootstrap.branches);
        setCapabilities(bootstrap.capabilities);
        setSelectedBranchId((current) => current || bootstrap.branches[0]?.id || "");
      })
      .catch((error) => {
        if (!active) return;
        setFeedback(error instanceof Error ? error.message : "Unable to load scheduling access.");
      })
      .finally(() => {
        if (active) setLoadingBootstrap(false);
      });

    return () => {
      active = false;
    };
  }, [requestOptions]);

  useEffect(() => {
    if (!requestOptions || !selectedBranchId) {
      setDentists([]);
      return;
    }
    let active = true;
    getSchedulingContext(selectedBranchId, requestOptions)
      .then((context) => {
        if (!active) return;
        setDentists(context.dentists);
        setCapabilities(context.capabilities);
        setDentistFilter((current) =>
          current === "all" || context.dentists.some((dentist) => dentist.id === current) ? current : "all"
        );
      })
      .catch((error) => {
        if (active) setFeedback(error instanceof Error ? error.message : "Unable to load branch scheduling context.");
      });
    return () => {
      active = false;
    };
  }, [requestOptions, selectedBranchId]);

  const loadCalendar = useCallback(async () => {
    if (!requestOptions || !selectedBranchId) {
      setAppointments([]);
      return;
    }

    const dates = weekDates(selectedDate);
    setLoadingCalendar(true);
    try {
      const rows = await listCalendarWeekAppointments(selectedBranchId, dates, requestOptions);
      setAppointments(sortAppointments(rows));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unable to load appointments.");
    } finally {
      setLoadingCalendar(false);
    }
  }, [requestOptions, selectedBranchId, selectedDate]);

  useEffect(() => {
    void loadCalendar();
  }, [loadCalendar, refreshVersion]);

  useEffect(() => {
    if (!actionState || actionState.mode !== "reschedule" || !requestOptions || !actionForm.branchId) return;
    let active = true;
    getSchedulingContext(actionForm.branchId, requestOptions)
      .then((context) => {
        if (!active) return;
        setActionDentists(context.dentists);
        setActionForm((current) => ({
          ...current,
          dentistUserId: context.dentists.some((item) => item.id === current.dentistUserId)
            ? current.dentistUserId
            : context.dentists[0]?.id || ""
        }));
      })
      .catch((error) => {
        if (active) setActionFeedback(error instanceof Error ? error.message : "Unable to load target branch Dentists.");
      });
    return () => {
      active = false;
    };
  }, [actionState?.mode, actionForm.branchId, requestOptions]);

  const selectedBranch = branches.find((branch) => branch.id === selectedBranchId) ?? null;
  const dentistNameById = useMemo(
    () => new Map(dentists.map((dentist) => [dentist.id, dentist.displayName])),
    [dentists]
  );

  const filteredAppointments = useMemo(
    () =>
      appointments.filter((appointment) => {
        if (view === "day" && appointment.appointmentDate !== selectedDate) return false;
        if (dentistFilter !== "all" && appointment.dentistUserId !== dentistFilter) return false;
        if (statusFilter !== "all" && appointment.status !== statusFilter) return false;
        return true;
      }),
    [appointments, view, selectedDate, dentistFilter, statusFilter]
  );

  const pendingAppointments = useMemo(
    () => appointments.filter(isPendingAppointment).slice(0, 12),
    [appointments]
  );

  const week = weekDates(selectedDate);

  function refresh(message?: string) {
    if (message) setFeedback(message);
    setRefreshVersion((value) => value + 1);
  }

  function openCreate() {
    const defaultDentist = dentists[0]?.id || "";
    setSelectedPatient(null);
    setPatientQuery("");
    setPatientResults([]);
    setCreateForm({
      branchId: selectedBranchId,
      appointmentDate: selectedDate,
      appointmentTime: "09:00",
      durationMinutes: "30",
      dentistUserId: defaultDentist,
      plannedProcedure: "",
      notes: "",
      reason: "",
      status: "confirmed"
    });
    setCreateFeedback("");
    setCreateOpen(true);
  }

  function openAction(mode: ActionMode, appointment: AppointmentRecord) {
    setActionFeedback("");
    setActionState({ mode, appointment });
    setActionDentists(dentists);
    setActionForm({
      branchId: appointment.branchId,
      appointmentDate: appointment.appointmentDate,
      appointmentTime: appointment.appointmentTime || "09:00",
      durationMinutes: String(appointment.durationMinutes || 30),
      dentistUserId: appointment.dentistUserId || dentists[0]?.id || "",
      plannedProcedure: appointment.plannedProcedure || "",
      notes: appointment.notes || "",
      reason: ""
    });
  }

  async function searchPatients() {
    if (!requestOptions || !selectedBranchId || patientQuery.trim().length < 2) {
      setCreateFeedback("Enter at least two characters to search patients.");
      return;
    }
    setSearchingPatients(true);
    setCreateFeedback("");
    try {
      setPatientResults(await searchSchedulingPatients(selectedBranchId, patientQuery.trim(), requestOptions));
    } catch (error) {
      setCreateFeedback(error instanceof Error ? error.message : "Unable to search patients.");
    } finally {
      setSearchingPatients(false);
    }
  }

  async function verifyAvailability(input: {
    branchId: string;
    dentistUserId: string;
    appointmentDate: string;
    appointmentTime: string;
    durationMinutes: number;
    excludeAppointmentId?: string;
  }): Promise<boolean> {
    if (!requestOptions) return false;
    const result = await checkAppointmentAvailability(
      {
        branchId: input.branchId,
        dentistUserId: input.dentistUserId,
        date: input.appointmentDate,
        time: input.appointmentTime,
        durationMinutes: input.durationMinutes,
        excludeAppointmentId: input.excludeAppointmentId
      },
      requestOptions
    );
    return result.available;
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!requestOptions || !selectedPatient) {
      setCreateFeedback("Select a patient before creating the appointment.");
      return;
    }
    if (submissionLockRef.current) return;

    submissionLockRef.current = true;
    setSubmitting(true);
    setCreateFeedback("");
    try {
      const confirmed = createForm.status === "confirmed";
      const duration = Number(createForm.durationMinutes);
      if (confirmed) {
        if (!createForm.dentistUserId || !createForm.appointmentTime || !Number.isInteger(duration) || duration < 1) {
          throw new Error("Confirmed appointments require a Dentist, time, and valid duration.");
        }
        const available = await verifyAvailability({
          branchId: selectedBranchId,
          dentistUserId: createForm.dentistUserId,
          appointmentDate: createForm.appointmentDate,
          appointmentTime: createForm.appointmentTime,
          durationMinutes: duration
        });
        if (!available) throw new Error("The selected Dentist is already booked for that time.");
      }

      await createAppointment(
        {
          patientId: selectedPatient.id,
          branchId: selectedBranchId,
          appointmentDate: createForm.appointmentDate,
          appointmentTime: confirmed ? createForm.appointmentTime : null,
          durationMinutes: confirmed ? duration : null,
          dentistUserId: confirmed ? createForm.dentistUserId : null,
          plannedProcedure: createForm.plannedProcedure || null,
          notes: createForm.notes || null,
          status: createForm.status
        },
        requestOptions
      );
      setCreateOpen(false);
      refresh("Appointment created.");
    } catch (error) {
      setCreateFeedback(error instanceof Error ? error.message : "Unable to create the appointment.");
    } finally {
      submissionLockRef.current = false;
      setSubmitting(false);
    }
  }

  async function handleActionSubmit(event: FormEvent) {
    event.preventDefault();
    if (!requestOptions || !actionState || submissionLockRef.current) return;
    const { mode, appointment } = actionState;

    submissionLockRef.current = true;
    setSubmitting(true);
    setActionFeedback("");
    try {
      if (mode === "edit") {
        await updateAppointment(
          appointment.id,
          {
            plannedProcedure: actionForm.plannedProcedure || null,
            notes: actionForm.notes || null
          },
          requestOptions
        );
      } else if (mode === "cancel") {
        await cancelAppointment(appointment.id, actionForm.reason, requestOptions);
      } else {
        const duration = Number(actionForm.durationMinutes);
        if (!actionForm.dentistUserId || !actionForm.appointmentTime || !Number.isInteger(duration) || duration < 1) {
          throw new Error("A Dentist, time, and valid duration are required.");
        }
        const available = await verifyAvailability({
          branchId: actionForm.branchId,
          dentistUserId: actionForm.dentistUserId,
          appointmentDate: actionForm.appointmentDate,
          appointmentTime: actionForm.appointmentTime,
          durationMinutes: duration,
          excludeAppointmentId: appointment.id
        });
        if (!available) throw new Error("The selected Dentist is already booked for that time.");

        if (mode === "confirm") {
          await confirmAppointment(
            appointment.id,
            {
              appointmentDate: actionForm.appointmentDate,
              appointmentTime: actionForm.appointmentTime,
              durationMinutes: duration,
              dentistUserId: actionForm.dentistUserId
            },
            requestOptions
          );
        } else {
          await rescheduleAppointment(
            appointment.id,
            {
              branchId: actionForm.branchId,
              appointmentDate: actionForm.appointmentDate,
              appointmentTime: actionForm.appointmentTime,
              durationMinutes: duration,
              dentistUserId: actionForm.dentistUserId,
              plannedProcedure: actionForm.plannedProcedure || null,
              notes: actionForm.notes || null,
              reason: actionForm.reason || null
            },
            requestOptions
          );
        }
      }

      setActionState(null);
      setSelectedAppointment(null);
      refresh(
        mode === "confirm"
          ? "Appointment confirmed."
          : mode === "reschedule"
            ? "Appointment rescheduled."
            : mode === "cancel"
              ? "Appointment cancelled."
              : "Appointment details updated."
      );
    } catch (error) {
      setActionFeedback(error instanceof Error ? error.message : "Unable to update the appointment.");
    } finally {
      submissionLockRef.current = false;
      setSubmitting(false);
    }
  }

  async function runSimpleAction(action: "check-in" | "start" | "complete" | "no-show") {
    if (!requestOptions || !selectedAppointment || submissionLockRef.current) return;
    const labels = {
      "check-in": "check in",
      start: "start",
      complete: "complete",
      "no-show": "mark as no-show"
    };
    if (!window.confirm(`Are you sure you want to ${labels[action]} this appointment?`)) return;

    submissionLockRef.current = true;
    setSubmitting(true);
    setFeedback("");
    try {
      await runAppointmentAction(selectedAppointment.id, action, requestOptions);
      setSelectedAppointment(null);
      refresh("Appointment status updated.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unable to update the appointment.");
    } finally {
      submissionLockRef.current = false;
      setSubmitting(false);
    }
  }

  function shiftCalendar(direction: -1 | 1) {
    setSelectedDate((date) => addDays(date, direction * (view === "day" ? 1 : 7)));
  }

  if (loadingBootstrap) {
    return (
      <main className="min-h-screen bg-slate-100 p-6">
        <div className="mx-auto max-w-6xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold text-slate-600">Loading secure appointment workspace...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-clinic-700">Dental Clinic Operations</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-950">Appointment Schedule</h1>
            <p className="mt-1 text-sm text-slate-500">Asia/Manila clinic scheduling · protected V2 workflow</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link className="button-secondary" to="/auth/account">Account</Link>
            {capabilities.create && selectedBranchId ? (
              <button type="button" className="button-primary" onClick={openCreate}>
                New appointment
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] space-y-4 px-4 py-5 sm:px-6 lg:px-8">
        {feedback ? (
          <div className="flex items-start justify-between gap-3 rounded-2xl border border-clinic-100 bg-clinic-50 px-4 py-3 text-sm text-clinic-900">
            <span>{feedback}</span>
            <button type="button" className="font-bold" onClick={() => setFeedback("")} aria-label="Dismiss message">×</button>
          </div>
        ) : null}

        {branches.length === 0 ? (
          <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6">
            <h2 className="text-lg font-bold text-amber-900">No appointment branch access</h2>
            <p className="mt-2 text-sm text-amber-800">
              Your account is authenticated, but it does not currently have an appointment-capable branch assignment.
            </p>
          </section>
        ) : (
          <>
            <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.3fr_1fr_1fr_auto]">
                <LabeledField label="Branch">
                  <select
                    className="select-input"
                    value={selectedBranchId}
                    onChange={(event) => setSelectedBranchId(event.target.value)}
                  >
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>{branch.branchName} ({branch.branchCode})</option>
                    ))}
                  </select>
                </LabeledField>
                <LabeledField label="Dentist">
                  <select className="select-input" value={dentistFilter} onChange={(event) => setDentistFilter(event.target.value)}>
                    <option value="all">All Dentists</option>
                    {dentists.map((dentist) => (
                      <option key={dentist.id} value={dentist.id}>{dentist.displayName}</option>
                    ))}
                  </select>
                </LabeledField>
                <LabeledField label="Status">
                  <select
                    className="select-input"
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value as AppointmentStatus | "all")}
                  >
                    {appointmentStatusOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </LabeledField>
                <div className="flex items-end gap-2">
                  {(["day", "week", "agenda"] as CalendarView[]).map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={view === option ? "button-primary capitalize" : "button-secondary capitalize"}
                      onClick={() => setView(option)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-w-0 rounded-3xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                      {selectedBranch?.branchName ?? "Selected branch"}
                    </p>
                    <h2 className="mt-1 text-xl font-bold text-slate-900">
                      {view === "day"
                        ? formatCalendarDate(selectedDate)
                        : `${formatCalendarDate(startOfWeek(selectedDate), "short")} – ${formatCalendarDate(addDays(startOfWeek(selectedDate), 6), "short")}`}
                    </h2>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" className="button-secondary" onClick={() => shiftCalendar(-1)}>Previous</button>
                    <button type="button" className="button-secondary" onClick={() => setSelectedDate(manilaToday())}>Today</button>
                    <button type="button" className="button-secondary" onClick={() => shiftCalendar(1)}>Next</button>
                    <input
                      type="date"
                      className="text-input w-auto"
                      value={selectedDate}
                      onChange={(event) => setSelectedDate(event.target.value)}
                    />
                  </div>
                </div>

                {loadingCalendar ? (
                  <div className="p-8 text-center text-sm text-slate-500">Loading appointments...</div>
                ) : view === "day" ? (
                  <div className="space-y-3 p-4">
                    {filteredAppointments.length === 0 ? (
                      <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                        No appointments match this day and filter.
                      </p>
                    ) : (
                      filteredAppointments.map((appointment) => (
                        <CalendarAppointmentCard
                          key={appointment.id}
                          appointment={appointment}
                          dentistName={
                            appointment.dentistUserId
                              ? dentistNameById.get(appointment.dentistUserId) ?? "Dentist unavailable"
                              : "Dentist pending"
                          }
                          onOpen={() => setSelectedAppointment(appointment)}
                        />
                      ))
                    )}
                  </div>
                ) : view === "week" ? (
                  <div className="overflow-x-auto">
                    <div className="grid min-w-[1050px] grid-cols-7 divide-x divide-slate-200">
                      {week.map((date) => {
                        const dayRows = filteredAppointments.filter((appointment) => appointment.appointmentDate === date);
                        return (
                          <div key={date} className="min-h-[520px] bg-slate-50/50">
                            <button
                              type="button"
                              className="w-full border-b border-slate-200 bg-white p-3 text-left hover:bg-slate-50"
                              onClick={() => {
                                setSelectedDate(date);
                                setView("day");
                              }}
                            >
                              <span className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                                {formatCalendarDate(date, "short")}
                              </span>
                              {date === manilaToday() ? <span className="mt-1 block text-xs font-semibold text-clinic-700">Today</span> : null}
                            </button>
                            <div className="space-y-2 p-2">
                              {dayRows.map((appointment) => (
                                <CalendarAppointmentCard
                                  key={appointment.id}
                                  appointment={appointment}
                                  dentistName={
                                    appointment.dentistUserId
                                      ? dentistNameById.get(appointment.dentistUserId) ?? "Dentist unavailable"
                                      : "Dentist pending"
                                  }
                                  onOpen={() => setSelectedAppointment(appointment)}
                                />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200">
                    {week.map((date) => {
                      const dayRows = filteredAppointments.filter((appointment) => appointment.appointmentDate === date);
                      return (
                        <section key={date} className="p-4">
                          <div className="mb-3 flex items-center justify-between">
                            <h3 className="font-bold text-slate-900">{formatCalendarDate(date)}</h3>
                            <span className="text-xs font-semibold text-slate-500">{dayRows.length} appointment{dayRows.length === 1 ? "" : "s"}</span>
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            {dayRows.length ? dayRows.map((appointment) => (
                              <CalendarAppointmentCard
                                key={appointment.id}
                                appointment={appointment}
                                dentistName={
                                  appointment.dentistUserId
                                    ? dentistNameById.get(appointment.dentistUserId) ?? "Dentist unavailable"
                                    : "Dentist pending"
                                }
                                onOpen={() => setSelectedAppointment(appointment)}
                              />
                            )) : (
                              <p className="text-sm text-slate-400">No appointments.</p>
                            )}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                )}
              </div>

              <aside className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">Pending requests</p>
                    <h2 className="mt-1 text-lg font-bold text-slate-900">Needs attention</h2>
                  </div>
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">{pendingAppointments.length}</span>
                </div>
                <div className="mt-4 space-y-3">
                  {pendingAppointments.length ? pendingAppointments.map((appointment) => (
                    <button
                      key={appointment.id}
                      type="button"
                      className="w-full rounded-2xl border border-amber-100 bg-amber-50/60 p-3 text-left hover:bg-amber-50"
                      onClick={() => setSelectedAppointment(appointment)}
                    >
                      <p className="text-sm font-bold text-slate-900">{appointmentPatientLabel(appointment)}</p>
                      <p className="mt-1 text-xs text-slate-600">{formatCalendarDate(appointment.appointmentDate, "short")} · {appointmentTimeRange(appointment)}</p>
                      <div className="mt-2">{statusPill(appointment.status)}</div>
                    </button>
                  )) : (
                    <p className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                      No pending requests in this week.
                    </p>
                  )}
                </div>
              </aside>
            </section>
          </>
        )}
      </div>

      {selectedAppointment ? (
        <Modal
          title={appointmentPatientLabel(selectedAppointment)}
          subtitle={`${formatCalendarDate(selectedAppointment.appointmentDate)} · ${appointmentTimeRange(selectedAppointment)}`}
          onClose={() => setSelectedAppointment(null)}
        >
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              {statusPill(selectedAppointment.status)}
              <span className="text-sm text-slate-500">{selectedAppointment.patientCode ?? selectedAppointment.patientId}</span>
            </div>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-3">
                <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Dentist</dt>
                <dd className="mt-1 text-sm font-semibold text-slate-900">
                  {selectedAppointment.dentistUserId
                    ? dentistNameById.get(selectedAppointment.dentistUserId) ?? "Dentist unavailable"
                    : "Not assigned"}
                </dd>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3">
                <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Duration</dt>
                <dd className="mt-1 text-sm font-semibold text-slate-900">
                  {selectedAppointment.durationMinutes ? `${selectedAppointment.durationMinutes} minutes` : "Pending"}
                </dd>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3 sm:col-span-2">
                <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Planned procedure</dt>
                <dd className="mt-1 text-sm font-semibold text-slate-900">{selectedAppointment.plannedProcedure || "General appointment"}</dd>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3 sm:col-span-2">
                <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Notes</dt>
                <dd className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{selectedAppointment.notes || "No appointment notes."}</dd>
              </div>
            </dl>

            <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
              {capabilities.update && ["requested", "pending_confirmation", "confirmed"].includes(selectedAppointment.status) ? (
                <button type="button" className="button-secondary" onClick={() => openAction("edit", selectedAppointment)}>Edit details</button>
              ) : null}
              {capabilities.confirm && ["requested", "pending_confirmation"].includes(selectedAppointment.status) ? (
                <button type="button" className="button-primary" onClick={() => openAction("confirm", selectedAppointment)}>Confirm</button>
              ) : null}
              {capabilities.reschedule && ["requested", "pending_confirmation", "confirmed"].includes(selectedAppointment.status) ? (
                <button type="button" className="button-secondary" onClick={() => openAction("reschedule", selectedAppointment)}>Reschedule</button>
              ) : null}
              {capabilities.cancel && ["requested", "pending_confirmation", "confirmed"].includes(selectedAppointment.status) ? (
                <button type="button" className="button-danger-outline" onClick={() => openAction("cancel", selectedAppointment)}>Cancel</button>
              ) : null}
              {capabilities.checkIn && selectedAppointment.status === "confirmed" ? (
                <button type="button" className="button-primary" onClick={() => void runSimpleAction("check-in")}>Check in</button>
              ) : null}
              {capabilities.noShow && selectedAppointment.status === "confirmed" ? (
                <button type="button" className="button-danger-outline" onClick={() => void runSimpleAction("no-show")}>No-show</button>
              ) : null}
              {capabilities.start && selectedAppointment.status === "checked_in" ? (
                <button type="button" className="button-primary" onClick={() => void runSimpleAction("start")}>Start treatment</button>
              ) : null}
              {capabilities.complete && ["checked_in", "in_progress"].includes(selectedAppointment.status) ? (
                <button type="button" className="button-primary" onClick={() => void runSimpleAction("complete")}>Complete</button>
              ) : null}
            </div>
          </div>
        </Modal>
      ) : null}

      {createOpen ? (
        <Modal title="New appointment" subtitle={selectedBranch?.branchName} onClose={() => setCreateOpen(false)} wide>
          <form className="space-y-5" onSubmit={handleCreate}>
            {createFeedback ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
                {createFeedback}
              </div>
            ) : null}
            <section className="rounded-2xl border border-slate-200 p-4">
              <h3 className="font-bold text-slate-900">Patient</h3>
              {selectedPatient ? (
                <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-clinic-50 p-3">
                  <div>
                    <p className="font-bold text-slate-900">{selectedPatient.displayName}</p>
                    <p className="text-sm text-slate-600">{selectedPatient.patientCode} · {selectedPatient.mobileNumber}</p>
                  </div>
                  <button type="button" className="button-secondary" onClick={() => setSelectedPatient(null)}>Change</button>
                </div>
              ) : (
                <>
                  <div className="mt-3 flex gap-2">
                    <input
                      className="text-input"
                      value={patientQuery}
                      onChange={(event) => setPatientQuery(event.target.value)}
                      placeholder="Name, patient code, or mobile"
                    />
                    <button type="button" className="button-secondary" onClick={() => void searchPatients()} disabled={searchingPatients}>
                      {searchingPatients ? "Searching..." : "Search"}
                    </button>
                  </div>
                  <div className="mt-3 max-h-52 space-y-2 overflow-y-auto">
                    {patientResults.map((patient) => (
                      <button
                        key={patient.id}
                        type="button"
                        className="w-full rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50"
                        onClick={() => setSelectedPatient(patient)}
                      >
                        <p className="font-semibold text-slate-900">{patient.displayName}</p>
                        <p className="text-xs text-slate-500">{patient.patientCode} · {patient.mobileNumber}</p>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </section>

            <div className="grid gap-4 md:grid-cols-2">
              <LabeledField label="Status">
                <select
                  className="select-input"
                  value={createForm.status}
                  onChange={(event) => setCreateForm((current) => ({ ...current, status: event.target.value as CreateFormState["status"] }))}
                >
                  <option value="confirmed">Confirmed</option>
                  <option value="requested">Requested</option>
                  <option value="pending_confirmation">Pending confirmation</option>
                </select>
              </LabeledField>
              <LabeledField label="Date">
                <input
                  type="date"
                  className="text-input"
                  value={createForm.appointmentDate}
                  onChange={(event) => setCreateForm((current) => ({ ...current, appointmentDate: event.target.value }))}
                  required
                />
              </LabeledField>
              {createForm.status === "confirmed" ? (
                <>
                  <LabeledField label="Dentist">
                    <select
                      className="select-input"
                      value={createForm.dentistUserId}
                      onChange={(event) => setCreateForm((current) => ({ ...current, dentistUserId: event.target.value }))}
                      required
                    >
                      <option value="">Select Dentist</option>
                      {dentists.map((dentist) => <option key={dentist.id} value={dentist.id}>{dentist.displayName}</option>)}
                    </select>
                  </LabeledField>
                  <LabeledField label="Time">
                    <input
                      type="time"
                      className="text-input"
                      value={createForm.appointmentTime}
                      onChange={(event) => setCreateForm((current) => ({ ...current, appointmentTime: event.target.value }))}
                      required
                    />
                  </LabeledField>
                  <LabeledField label="Duration (minutes)">
                    <input
                      type="number"
                      min="1"
                      max="1440"
                      className="text-input"
                      value={createForm.durationMinutes}
                      onChange={(event) => setCreateForm((current) => ({ ...current, durationMinutes: event.target.value }))}
                      required
                    />
                  </LabeledField>
                </>
              ) : null}
              <LabeledField label="Planned procedure">
                <input
                  className="text-input"
                  maxLength={500}
                  value={createForm.plannedProcedure}
                  onChange={(event) => setCreateForm((current) => ({ ...current, plannedProcedure: event.target.value }))}
                />
              </LabeledField>
              <div className="md:col-span-2">
                <LabeledField label="Notes">
                  <textarea
                    className="text-area"
                    maxLength={2000}
                    value={createForm.notes}
                    onChange={(event) => setCreateForm((current) => ({ ...current, notes: event.target.value }))}
                  />
                </LabeledField>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
              <button type="button" className="button-secondary" onClick={() => setCreateOpen(false)}>Cancel</button>
              <button type="submit" className="button-primary" disabled={submitting}>{submitting ? "Saving..." : "Create appointment"}</button>
            </div>
          </form>
        </Modal>
      ) : null}

      {actionState ? (
        <Modal
          title={
            actionState.mode === "confirm"
              ? "Confirm appointment"
              : actionState.mode === "reschedule"
                ? "Reschedule appointment"
                : actionState.mode === "cancel"
                  ? "Cancel appointment"
                  : "Edit appointment details"
          }
          subtitle={appointmentPatientLabel(actionState.appointment)}
          onClose={() => setActionState(null)}
        >
          <form className="space-y-4" onSubmit={handleActionSubmit}>
            {actionFeedback ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
                {actionFeedback}
              </div>
            ) : null}
            {actionState.mode === "cancel" ? (
              <LabeledField label="Cancellation reason" hint="Optional; retained in appointment history.">
                <textarea
                  className="text-area"
                  maxLength={500}
                  value={actionForm.reason}
                  onChange={(event) => setActionForm((current) => ({ ...current, reason: event.target.value }))}
                />
              </LabeledField>
            ) : actionState.mode === "edit" ? (
              <>
                <LabeledField label="Planned procedure">
                  <input
                    className="text-input"
                    maxLength={500}
                    value={actionForm.plannedProcedure}
                    onChange={(event) => setActionForm((current) => ({ ...current, plannedProcedure: event.target.value }))}
                  />
                </LabeledField>
                <LabeledField label="Notes">
                  <textarea
                    className="text-area"
                    maxLength={2000}
                    value={actionForm.notes}
                    onChange={(event) => setActionForm((current) => ({ ...current, notes: event.target.value }))}
                  />
                </LabeledField>
              </>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {actionState.mode === "reschedule" ? (
                  <LabeledField label="Branch">
                    <select
                      className="select-input"
                      value={actionForm.branchId}
                      onChange={(event) => setActionForm((current) => ({ ...current, branchId: event.target.value }))}
                    >
                      {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.branchName}</option>)}
                    </select>
                  </LabeledField>
                ) : null}
                <LabeledField label="Date">
                  <input
                    type="date"
                    className="text-input"
                    value={actionForm.appointmentDate}
                    onChange={(event) => setActionForm((current) => ({ ...current, appointmentDate: event.target.value }))}
                    required
                  />
                </LabeledField>
                <LabeledField label="Dentist">
                  <select
                    className="select-input"
                    value={actionForm.dentistUserId}
                    onChange={(event) => setActionForm((current) => ({ ...current, dentistUserId: event.target.value }))}
                    required
                  >
                    <option value="">Select Dentist</option>
                    {(actionState.mode === "reschedule" ? actionDentists : dentists).map((dentist) => (
                      <option key={dentist.id} value={dentist.id}>{dentist.displayName}</option>
                    ))}
                  </select>
                </LabeledField>
                <LabeledField label="Time">
                  <input
                    type="time"
                    className="text-input"
                    value={actionForm.appointmentTime}
                    onChange={(event) => setActionForm((current) => ({ ...current, appointmentTime: event.target.value }))}
                    required
                  />
                </LabeledField>
                <LabeledField label="Duration (minutes)">
                  <input
                    type="number"
                    min="1"
                    max="1440"
                    className="text-input"
                    value={actionForm.durationMinutes}
                    onChange={(event) => setActionForm((current) => ({ ...current, durationMinutes: event.target.value }))}
                    required
                  />
                </LabeledField>
                {actionState.mode === "reschedule" ? (
                  <>
                    <LabeledField label="Planned procedure">
                      <input
                        className="text-input"
                        value={actionForm.plannedProcedure}
                        onChange={(event) => setActionForm((current) => ({ ...current, plannedProcedure: event.target.value }))}
                      />
                    </LabeledField>
                    <div className="md:col-span-2">
                      <LabeledField label="Reason" hint="Optional; retained in appointment history.">
                        <textarea
                          className="text-area"
                          maxLength={500}
                          value={actionForm.reason}
                          onChange={(event) => setActionForm((current) => ({ ...current, reason: event.target.value }))}
                        />
                      </LabeledField>
                    </div>
                  </>
                ) : null}
              </div>
            )}
            <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
              <button type="button" className="button-secondary" onClick={() => setActionState(null)}>Close</button>
              <button
                type="submit"
                className={actionState.mode === "cancel" ? "button-danger" : "button-primary"}
                disabled={submitting}
              >
                {submitting ? "Saving..." : actionState.mode === "cancel" ? "Cancel appointment" : "Save"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </main>
  );
}
