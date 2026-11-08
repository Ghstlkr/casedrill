export const money = (amount: number, currency: string) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount);

export const longDate = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`),
  );

export function clock(totalMs: number): string {
  const totalSeconds = Math.floor(Math.abs(totalMs) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

export const STAMP_TEXT: Record<string, string> = {
  close: "Closed",
  escalate: "Escalated",
  refer_to_mlro: "Referred",
  no_report: "No report",
  file_report: "Filed",
};

export const TAB_LABELS: Record<string, string> = {
  overview: "Overview",
  transactions: "Transactions",
  documents: "Documents",
  network: "Network",
  prior_work: "Earlier notes",
  processing: "Processing",
  routing: "Routing",
  report: "Report",
};

export const DOCUMENT_KINDS: Record<string, string> = {
  kyc_form: "Customer form",
  id_check: "Identity check",
  source_of_funds: "Source of funds",
  invoice: "Invoice",
  contract: "Contract",
  adverse_media: "Media search",
  screening_result: "Screening result",
  account_note: "Account note",
  company_register: "Company register",
  rfi_response: "Customer response",
};
