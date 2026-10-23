import { getManilaTodayIso } from "./dateUtils.js";

export const paymentMethods = ["Cash", "GCash", "Bank Transfer", "Card", "Other"];

export function toCents(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 100);
}

export function validatePaymentInput(input, { treatmentDate, balanceCents, today = getManilaTodayIso() }) {
  const errors = [];
  const raw = String(input?.amount ?? "").trim();
  const amountCents = /^\d+(?:\.\d{1,2})?$/.test(raw) ? toCents(raw) : null;
  const paymentDate = String(input?.payment_date ?? "").trim();
  const paymentMethod = String(input?.payment_method ?? "").trim();
  const reference = String(input?.reference ?? "").trim();
  const notes = String(input?.notes ?? "").trim();
  const requestId = String(input?.request_id ?? "").trim();

  if (amountCents === null || amountCents <= 0) errors.push("Enter an amount greater than zero with at most two decimal places.");
  if (amountCents !== null && amountCents > balanceCents) errors.push("Payment cannot exceed the remaining treatment balance.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate) || !Number.isFinite(Date.parse(paymentDate)) || new Date(paymentDate).toISOString().slice(0, 10) !== paymentDate) {
    errors.push("Enter a valid payment date.");
  } else {
    if (paymentDate > today) errors.push("Payment date cannot be in the future.");
    if (paymentDate < treatmentDate) errors.push("Payment date cannot be earlier than the treatment date.");
  }
  if (!paymentMethods.includes(paymentMethod)) errors.push("Select a valid payment method.");
  if (reference.length > 120) errors.push("Reference number must not exceed 120 characters.");
  if (notes.length > 500) errors.push("Payment notes must not exceed 500 characters.");
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) errors.push("Invalid payment request identifier.");

  return { errors, data: { amount_cents: amountCents, payment_date: paymentDate, payment_method: paymentMethod, reference, notes, request_id: requestId } };
}
