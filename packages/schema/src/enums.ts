export const JURISDICTIONS = ["uk", "eu"] as const;
export const LEVELS = ["l1", "l2", "l3"] as const;
export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export const CURRENCIES = ["GBP", "EUR"] as const;
export const SEVERITIES = ["low", "medium", "high"] as const;
export const RISK_RATINGS = ["low", "medium", "high"] as const;
export const CUSTOMER_TYPES = ["individual", "company"] as const;
export const DIRECTIONS = ["in", "out"] as const;

export const ACCOUNT_TYPES = ["current", "savings", "business", "e_money"] as const;

export const COUNTERPARTY_KINDS = [
  "individual",
  "company",
  "merchant",
  "crypto_exchange",
  "solicitor",
] as const;

export const RAILS = [
  "faster_payments",
  "chaps",
  "bacs",
  "sepa",
  "swift",
  "card",
  "cash",
  "crypto",
] as const;

export const DOCUMENT_KINDS = [
  "kyc_form",
  "id_check",
  "source_of_funds",
  "invoice",
  "contract",
  "adverse_media",
  "screening_result",
  "account_note",
  "company_register",
  "rfi_response",
] as const;

export const DOCUMENT_AVAILABILITY = ["initial", "on_request"] as const;

/** Sections the trainee assembles. Header, subject and accounts are filled by the app. */
export const REPORT_SECTIONS = [
  "escalation_note",
  "activity_summary",
  "reason_for_suspicion",
  "action_taken",
  "daml_request",
] as const;

export const OUTCOMES = ["true_positive", "false_positive", "borderline"] as const;
export const DECISIONS = ["close", "escalate", "refer_to_mlro", "no_report", "file_report"] as const;

export const ROUTES = [
  "mlro",
  "nca_sar",
  "nca_daml",
  "national_fiu",
  "amla",
  "supervisor",
  "police",
  "customer_notification",
] as const;

/** Offered as checkboxes to teach the trap, but never part of a correct answer. */
export const NEVER_CORRECT_ROUTES = ["amla", "customer_notification"] as const;
export const UK_ONLY_ROUTES = ["nca_sar", "nca_daml"] as const;
export const EU_ONLY_ROUTES = ["national_fiu"] as const;
export const EXTERNAL_REPORT_ROUTES = ["nca_sar", "nca_daml", "national_fiu"] as const;

export const TYPOLOGIES = [
  "structuring_cash",
  "money_mule",
  "app_fraud_proceeds",
  "shell_company_opaque_ubo",
  "pep_unexplained_wealth",
  "crypto_off_ramp",
  "cash_intensive_front",
  "trade_based_laundering",
] as const;

export const FALSE_POSITIVE_ARCHETYPES = [
  "property_sale",
  "inheritance",
  "seasonal_trader",
  "bonus_or_dividend",
  "family_remittances",
  "documented_crypto_gain",
] as const;

export const IRREGULARITY_TARGETS = ["transaction", "document", "customer", "network"] as const;

export const IRREGULARITY_CATEGORIES = [
  "amount",
  "frequency",
  "counterparty",
  "geography",
  "document",
  "behaviour",
  "ownership",
] as const;

export const SEAL_KEY_SOURCES = ["app", "password"] as const;
