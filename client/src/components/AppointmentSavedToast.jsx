import RecordSuccessToast from "./RecordSuccessToast";

export default function AppointmentSavedToast({ notice, onDismiss }) {
  return <RecordSuccessToast notice={notice} onDismiss={onDismiss} dismissLabel="Dismiss appointment notification" />;
}
