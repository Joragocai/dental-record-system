export interface EmailTemplate {
  subject: string;
  text: string;
}

const appointmentTemplates: Record<string, EmailTemplate> = {
  "appointment-confirmed": {
    subject: "Your appointment is confirmed",
    text: "Your appointment has been confirmed. Please contact the clinic if you need more information."
  },
  "appointment-rescheduled": {
    subject: "Your appointment was rescheduled",
    text: "Your appointment schedule has changed. Please contact the clinic if you need more information."
  },
  "appointment-cancelled-by-clinic": {
    subject: "Your appointment was cancelled",
    text: "Your appointment was cancelled by the clinic. Please contact the clinic if you need more information."
  },
  "appointment-no-show": {
    subject: "Appointment status update",
    text: "Your appointment status was updated. Please contact the clinic if you need more information."
  }
};

export function renderEmailTemplate(templateKey: string): EmailTemplate | null {
  const template = appointmentTemplates[templateKey];
  return template ? { ...template } : null;
}
