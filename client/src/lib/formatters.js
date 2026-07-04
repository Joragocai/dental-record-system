const pesoFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

export function formatPesoAmount(value) {
  if (value === null || value === undefined || value === "") {
    return "₱0.00";
  }

  const numericValue = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(numericValue)) {
    return "₱0.00";
  }

  return pesoFormatter.format(numericValue);
}
