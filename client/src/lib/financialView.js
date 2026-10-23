export const balanceFilters = ["Unpaid", "Partially Paid", "Settled"];

export function getBalancesEmptyState({ patientMode = false, query = "", filter = "Unpaid" } = {}) {
  if (String(query).trim()) {
    return {
      title: "No Matching Treatments",
      description: patientMode
        ? "No treatments for this patient match your search. Try a different search term."
        : "No treatments match your search within this payment status. Try a different search term.",
      showClearSearch: true
    };
  }

  if (patientMode) {
    return {
      title: "No Treatment Accounts",
      description: "This patient has no recorded treatments yet.",
      showClearSearch: false
    };
  }

  const messages = {
    "Unpaid": {
      title: "No Unpaid Treatments",
      description: "There are currently no treatments without payment. Select another payment status to view other treatment accounts."
    },
    "Partially Paid": {
      title: "No Partially Paid Treatments",
      description: "There are currently no partially paid treatments. Select another payment status to view other treatment accounts."
    },
    "Settled": {
      title: "No Settled Treatments",
      description: "There are currently no fully settled treatments. Select another payment status to view other treatment accounts."
    }
  };

  return {
    ...(messages[filter] || {
      title: "No Treatment Accounts",
      description: "There are no treatment accounts for the selected payment status."
    }),
    showClearSearch: false
  };
}

export function getPaymentStatus(netDue, paid) {
  const dueCents = Math.round(Number(netDue || 0) * 100);
  const paidCents = Math.round(Number(paid || 0) * 100);
  if (dueCents - paidCents <= 0) return "Settled";
  return paidCents > 0 ? "Partially Paid" : "Unpaid";
}

export function filterAndSortBalances(records, { query = "", filter = "Unpaid", sort = "balance", patientId = "" } = {}) {
  const term = query.trim().toLocaleLowerCase("en");
  return records
    .filter((row) => {
      const matchesQuery = !term || [
        row.patient_name, row.patient_id, row.treatment_id, row.procedure, row.mobile_number
      ].some((value) => String(value || "").toLocaleLowerCase("en").includes(term));
      const matchesStatus = patientId ? true : row.payment_status === filter;
      return matchesQuery && matchesStatus && (!patientId || row.patient_id === patientId);
    })
    .sort((a, b) => {
      if (sort === "balance") {
        const balanceDifference = Number(b.balance) - Number(a.balance);
        if (balanceDifference) return balanceDifference;
      }
      if (sort === "patient") {
        const nameDifference = String(a.patient_name).localeCompare(String(b.patient_name));
        if (nameDifference) return nameDifference;
      }
      return String(b.treatment_date || "").localeCompare(String(a.treatment_date || "")) ||
        String(b.treatment_id || "").localeCompare(String(a.treatment_id || ""));
    });
}
