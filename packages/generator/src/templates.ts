export type Flag = [category: string, note: string];

export type Party = { name: string; kind: "individual" | "company" | "merchant" | "crypto_exchange" | "solicitor"; foreign?: boolean };

export type RuleSpec = {
  parties: string[];
  dir: "in" | "out";
  rail: string;
  n: number;
  min: number;
  max: number;
  from: number;
  to: number;
  ref?: string;
  flag?: Flag;
};

export type DocSpec = { kind: string; title: string; text: string; flag?: Flag };

export type Body = {
  alert: [ruleName: string, text: string];
  customer: { type: "individual" | "company"; name: string; occupation: string; income: number; risk: "low" | "medium" | "high"; text: string };
  parties: Record<string, Party>;
  rules: RuleSpec[];
  /** Exactly six: the first three are on file, the last three are available on request. */
  docs: [DocSpec, DocSpec, DocSpec, DocSpec, DocSpec, DocSpec];
  summary: string;
  reason: string;
  explanation: string;
};

export type Ctx = {
  /** Formats a base amount in the case's currency, after the case's scale. */
  m: (amount: number) => string;
  fast: string;
  high: string;
  salary: string;
  person: string;
};

export type Template = { kind: "tp" | "fp"; pattern: string; build: (c: Ctx) => Body };

const CASH = "Cash deposits above expected activity";
const TURNOVER = "High turnover against expected activity";
const LARGE = "Large credit against expected activity";
const RISKY = "Payments involving a higher-risk country";

const NO_MATCH = "No matches on sanctions or politically exposed persons lists.";

export const TEMPLATES: Template[] = [
  {
    kind: "tp",
    pattern: "structuring_cash",
    build: (c) => ({
      alert: [CASH, "Cash credited in the last 60 days is far above the level expected from the customer profile."],
      customer: { type: "individual", name: c.person, occupation: "Retail assistant", income: 26000, risk: "low", text: "Personal current account used for salary and household spending." },
      parties: {
        branch: { name: "Branch cash deposit", kind: "individual" },
        employer: { name: "Fictia Retail Group", kind: "company" },
        dealer: { name: "Fictia Prestige Motors", kind: "company" },
      },
      rules: [
        { parties: ["employer"], dir: "in", rail: c.salary, n: 3, min: 1800, max: 1900, from: -85, to: -5, ref: "Salary" },
        { parties: ["branch"], dir: "in", rail: "cash", n: 24, min: 850, max: 990, from: -60, to: -2, ref: "Cash deposit", flag: ["frequency", "Many cash deposits of similar size in a short period, with no known source."] },
        { parties: ["dealer"], dir: "out", rail: c.fast, n: 3, min: 4500, max: 6500, from: -20, to: -1, ref: "Vehicle deposit", flag: ["counterparty", "The cash is quickly turned into payments for a high-value purchase."] },
      ],
      docs: [
        { kind: "kyc_form", title: "Onboarding form", text: `Employed as a retail assistant, with a salary of about ${c.m(1850)} a month. No cash income expected.` },
        { kind: "account_note", title: "Branch deposit notes", text: "Deposits are made at several branches, sometimes more than one a day, and are all of a similar size.", flag: ["behaviour", "Deposits are spread across branches and kept to a similar size."] },
        { kind: "screening_result", title: "Screening result", text: NO_MATCH },
        { kind: "source_of_funds", title: "Source of funds statement", text: "The customer says the cash is savings kept at home. No withdrawal history or receipts were supplied.", flag: ["document", "The stated source of the cash is not supported by any record."] },
        { kind: "rfi_response", title: "Customer response to information request", text: "The customer first says the cash was a gift from family, but cannot say who gave it or when." },
        { kind: "contract", title: "Vehicle order form", text: `An order for a vehicle priced at ${c.m(34000)}, with the balance due on delivery.` },
      ],
      summary: "Over 60 days the account received many similar cash deposits at several branches, far above the customer's expected activity. Part of the funds then paid for a vehicle.",
      reason: "The cash has no documented source and does not fit the customer's salary. The size of the deposits and the use of several branches suggest they were arranged to attract less attention.",
      explanation: "The customer's salary cannot explain the cash, the explanations change, and no record supports them. The pattern of similar deposits at several branches is the key warning sign.",
    }),
  },
  {
    kind: "tp",
    pattern: "money_mule",
    build: (c) => ({
      alert: [TURNOVER, "Credits in the last 30 days are well above the level expected from the customer profile."],
      customer: { type: "individual", name: c.person, occupation: "Full-time student", income: 8000, risk: "low", text: "Account opened online. Expected use: part-time wages and living costs." },
      parties: {
        s1: { name: "Payer: Harper Sample", kind: "individual" },
        s2: { name: "Payer: Rowan Sample", kind: "individual" },
        s3: { name: "Payer: Emery Sample", kind: "individual" },
        s4: { name: "Payer: Parker Sample", kind: "individual" },
        exchange: { name: "Example Coin Exchange", kind: "crypto_exchange", foreign: true },
        job: { name: "Fictia Cafe Ltd", kind: "company" },
      },
      rules: [
        { parties: ["s1", "s2", "s3", "s4"], dir: "in", rail: c.fast, n: 22, min: 180, max: 950, from: -30, to: -1, flag: ["frequency", "Many unrelated credits in a short period, against a student profile."] },
        { parties: ["exchange"], dir: "out", rail: c.fast, n: 18, min: 180, max: 900, from: -30, to: 0, flag: ["counterparty", "Funds move quickly to a crypto exchange, although none of this activity was expected."] },
        { parties: ["job"], dir: "in", rail: c.salary, n: 2, min: 540, max: 610, from: -70, to: -32, ref: "Wages" },
      ],
      docs: [
        { kind: "kyc_form", title: "Onboarding form", text: `Student with part-time wages of about ${c.m(575)} a month. No crypto activity expected.` },
        { kind: "account_note", title: "Payment reference review", text: "Incoming references are varied and do not show a shared purpose." },
        { kind: "screening_result", title: "Screening result", text: NO_MATCH },
        { kind: "rfi_response", title: "Customer response to information request", text: "The customer says an online contact pays a small commission for receiving and forwarding funds.", flag: ["behaviour", "The customer describes moving funds for someone else in return for commission."] },
        { kind: "source_of_funds", title: "Source of funds statement", text: "No documents were supplied for the incoming payments." },
        { kind: "adverse_media", title: "Media search", text: "No relevant results were found for the customer." },
      ],
      summary: "Over 30 days the account received many unrelated credits, which were followed shortly by payments to a crypto exchange.",
      reason: "The turnover does not fit a student's profile, the funds pass through quickly, and the customer says a third party pays commission for moving them.",
      explanation: "This is pass-through activity. The customer gains a small commission, the payers are unrelated, and the funds leave at once.",
    }),
  },
  {
    kind: "tp",
    pattern: "app_fraud_proceeds",
    build: (c) => ({
      alert: [TURNOVER, "Credits in the last 20 days are well above the level expected from the customer profile."],
      customer: { type: "individual", name: c.person, occupation: "Delivery driver", income: 25000, risk: "low", text: "Personal current account used for wages and household spending." },
      parties: {
        v1: { name: "Payer: Blake Sample", kind: "individual" },
        v2: { name: "Payer: Dana Sample", kind: "individual" },
        v3: { name: "Payer: Ellis Sample", kind: "individual" },
        transfer: { name: "Exampleland Money Transfer Co", kind: "company", foreign: true },
        employer: { name: "Fictia Couriers Ltd", kind: "company" },
      },
      rules: [
        { parties: ["v1", "v2", "v3"], dir: "in", rail: c.fast, n: 6, min: 2500, max: 9000, from: -20, to: -2, ref: "Invoice payment", flag: ["amount", "Large credits from individuals with no known link to the customer."] },
        { parties: ["transfer"], dir: "out", rail: c.fast, n: 10, min: 1500, max: 3000, from: -19, to: -1, flag: ["frequency", "Funds leave within hours through a money transfer business."] },
        { parties: ["employer"], dir: "in", rail: c.salary, n: 3, min: 1650, max: 1750, from: -80, to: -5, ref: "Wages" },
      ],
      docs: [
        { kind: "kyc_form", title: "Onboarding form", text: `Delivery driver with wages of about ${c.m(1700)} a month. No self-employed income declared.` },
        { kind: "account_note", title: "Payment reference review", text: "Credits quote invoice references, although the customer has no declared business." },
        { kind: "screening_result", title: "Screening result", text: NO_MATCH },
        { kind: "account_note", title: "Message from a sending bank", text: "A sending bank reports that its customer was deceived into making a payment to this account and asks for the funds to be returned.", flag: ["document", "A sending bank has reported that one of the payments was obtained by deception."] },
        { kind: "rfi_response", title: "Customer response to information request", text: "The customer says the payments were for a car sold online, but cannot supply an advert or any messages.", flag: ["behaviour", "The explanation cannot be supported by any record."] },
        { kind: "adverse_media", title: "Media search", text: "No relevant results were found for the customer." },
      ],
      summary: "Over 20 days the account received large credits from unconnected individuals, and most of the funds left within hours through a money transfer business.",
      reason: "A sending bank says one payment was obtained by deception. The credits do not fit the customer's work, the funds left at once, and the customer's explanation has no support.",
      explanation: "The message from the sending bank is decisive, and the immediate onward payments fit the movement of stolen funds.",
    }),
  },
  {
    kind: "tp",
    pattern: "shell_company_opaque_ubo",
    build: (c) => ({
      alert: [TURNOVER, "Credits in the last 45 days are well above the turnover expected from the customer profile."],
      customer: { type: "company", name: "Fictia Global Consulting Ltd", occupation: "Management consultancy", income: 300000, risk: "medium", text: "Business current account opened remotely for consultancy income." },
      parties: {
        a: { name: "Exampleland Commodities Co", kind: "company", foreign: true },
        b: { name: "Exampleland Marine Holdings", kind: "company", foreign: true },
        onward: { name: "Exampleland Asset Partners", kind: "company", foreign: true },
        agent: { name: "Exemplar Filing Services Ltd", kind: "company" },
      },
      rules: [
        { parties: ["a", "b"], dir: "in", rail: "swift", n: 6, min: 30000, max: 70000, from: -45, to: -2, ref: "Consulting fee", flag: ["counterparty", "Large fees come from companies with no evident need for this consultancy."] },
        { parties: ["onward"], dir: "out", rail: "swift", n: 6, min: 28000, max: 65000, from: -44, to: -1, ref: "Services", flag: ["frequency", "Almost all the money leaves soon after it arrives."] },
        { parties: ["agent"], dir: "out", rail: c.fast, n: 2, min: 100, max: 300, from: -40, to: -5, ref: "Filing fee" },
      ],
      docs: [
        { kind: "kyc_form", title: "Business onboarding form", text: "Consultancy with no employees and no website. Clients are described as international." },
        { kind: "company_register", title: "Company register extract", text: "The sole director holds appointments at more than 200 companies. The owner is a company registered in the Republic of Exampleland.", flag: ["ownership", "A nominee director and a foreign corporate owner hide who controls the company."] },
        { kind: "account_note", title: "Account review note", text: "The account shows no payroll, rent or day-to-day business costs." },
        { kind: "contract", title: "Consultancy agreement", text: "A one-page agreement with no scope of work, deliverables or named staff.", flag: ["document", "The agreement does not show that any real service was provided."] },
        { kind: "rfi_response", title: "Director's response to information request", text: "The director refers all questions to an adviser, but does not give the adviser's name.", flag: ["behaviour", "The director cannot explain the company's own business."] },
        { kind: "source_of_funds", title: "Filed accounts", text: "The latest accounts filed describe the company as dormant." },
      ],
      summary: "Over 45 days the company received large international payments described as consultancy fees, and sent nearly all of the funds abroad soon afterwards.",
      reason: "The company has no staff or business costs, its owner is hidden behind a nominee director and a foreign company, and the agreement and filed accounts do not support the stated trade.",
      explanation: "The company appears to exist only to move money. The account shows pass-through payments and no real commercial activity, and nobody can explain who controls it.",
    }),
  },
  {
    kind: "tp",
    pattern: "pep_unexplained_wealth",
    build: (c) => ({
      alert: [RISKY, "Large international credits were received from a higher-risk country in the last 60 days."],
      customer: { type: "individual", name: c.person, occupation: "Deputy minister, Republic of Exampleland", income: 60000, risk: "high", text: "Private banking customer who holds a public office abroad." },
      parties: {
        holdings: { name: "Exampleland Family Holdings", kind: "company", foreign: true },
        agent: { name: "Fictia Luxury Property Agents", kind: "company" },
        school: { name: "Example Private School", kind: "company" },
      },
      rules: [
        { parties: ["holdings"], dir: "in", rail: "swift", n: 5, min: 150000, max: 320000, from: -60, to: -3, ref: "Family support", flag: ["geography", "Large sums arrive from a higher-risk country through a family company."] },
        { parties: ["agent"], dir: "out", rail: c.high, n: 2, min: 250000, max: 420000, from: -30, to: -2, ref: "Property purchase", flag: ["amount", "The purchases are far beyond the customer's official income."] },
        { parties: ["school"], dir: "out", rail: c.fast, n: 3, min: 9000, max: 14000, from: -55, to: -10, ref: "School fees" },
      ],
      docs: [
        { kind: "kyc_form", title: "Onboarding form", text: `Holds a public office with an official salary of about ${c.m(5000)} a month.` },
        { kind: "screening_result", title: "Screening result", text: "The customer is listed as a politically exposed person." },
        { kind: "account_note", title: "Payment reference review", text: "The incoming payments give no detail beyond the words family support." },
        { kind: "source_of_funds", title: "Source of wealth letter", text: "A letter from a family adviser says the wealth comes from family businesses. No accounts were supplied.", flag: ["document", "The source of wealth is asserted but not evidenced."] },
        { kind: "adverse_media", title: "Media search", text: "A newspaper in the Republic of Exampleland reports an inquiry into transport contracts awarded during the customer's term in office.", flag: ["behaviour", "Public reports link the customer's office to an inquiry into contracts."] },
        { kind: "rfi_response", title: "Customer response to information request", text: "The customer declines to supply accounts for the family businesses." },
      ],
      summary: "Over 60 days the customer, a politically exposed person, received large payments from a family company abroad and used them to buy property.",
      reason: "The funds are far above the customer's official salary, the source of wealth is not evidenced, the customer refuses to supply accounts, and public reports refer to an inquiry into contracts.",
      explanation: "Being a politically exposed person is not suspicious in itself. Here the wealth cannot be evidenced, the customer will not supply records, and there is a relevant public report.",
    }),
  },
  {
    kind: "tp",
    pattern: "crypto_off_ramp",
    build: (c) => ({
      alert: [LARGE, "Credits from a crypto exchange in the last 40 days are far above the level expected from the customer profile."],
      customer: { type: "individual", name: c.person, occupation: "Warehouse operative", income: 27000, risk: "low", text: "Personal current account used for wages and household spending." },
      parties: {
        exchange: { name: "Example Coin Exchange", kind: "crypto_exchange", foreign: true },
        employer: { name: "Fictia Logistics Ltd", kind: "company" },
        dealer: { name: "Fictia Luxury Cars", kind: "company" },
      },
      rules: [
        { parties: ["exchange"], dir: "in", rail: "crypto", n: 14, min: 5000, max: 15000, from: -40, to: -2, ref: "Withdrawal", flag: ["amount", "Exchange withdrawals are far above anything the customer's income could fund."] },
        { parties: ["employer"], dir: "in", rail: c.salary, n: 3, min: 1850, max: 1950, from: -85, to: -5, ref: "Wages" },
        { parties: ["dealer"], dir: "out", rail: c.fast, n: 5, min: 12000, max: 25000, from: -30, to: -1, ref: "Vehicle purchase", flag: ["counterparty", "The funds are used straight away to buy high-value goods."] },
      ],
      docs: [
        { kind: "kyc_form", title: "Onboarding form", text: `Warehouse operative with wages of about ${c.m(1900)} a month. No investments declared.` },
        { kind: "account_note", title: "Account review note", text: "The account has no earlier payments to any crypto exchange." },
        { kind: "screening_result", title: "Screening result", text: NO_MATCH },
        { kind: "source_of_funds", title: "Exchange statement", text: "The statement shows withdrawals only. It has no record of how the crypto was acquired.", flag: ["document", "The statement does not show how the crypto was acquired."] },
        { kind: "rfi_response", title: "Customer response to information request", text: "The customer says a friend asked them to sell the crypto, and that they cannot give the friend's details.", flag: ["behaviour", "The customer is converting crypto for a person they will not identify."] },
        { kind: "screening_result", title: "Wallet analysis report", text: "The deposits came from wallets with no identified owner." },
      ],
      summary: "Over 40 days the account received large withdrawals from a crypto exchange, with no earlier crypto activity, and the funds were used to buy vehicles.",
      reason: "The customer's income cannot explain the crypto, the statement does not show how it was acquired, and the customer is selling it for someone they will not identify.",
      explanation: "A payment from an exchange is not suspicious in itself. Here the origin of the crypto is unknown and the customer admits to selling it for someone else.",
    }),
  },
  {
    kind: "tp",
    pattern: "cash_intensive_front",
    build: (c) => ({
      alert: [CASH, "Cash credited in the last 90 days is several times the level expected from the customer profile."],
      customer: { type: "company", name: "Fictia Takeaway Ltd", occupation: "Hot food takeaway", income: 140000, risk: "medium", text: "Business current account for takings, wages and suppliers." },
      parties: {
        d1: { name: "Depositor: Sidney Sample", kind: "individual" },
        d2: { name: "Depositor: Lane Sample", kind: "individual" },
        card: { name: "Exemplar Card Acquiring", kind: "company" },
        connected: { name: "Fictia Property Ventures Ltd", kind: "company" },
        staff: { name: "Payroll: takeaway staff", kind: "individual" },
      },
      rules: [
        { parties: ["d1", "d2"], dir: "in", rail: "cash", n: 36, min: 1500, max: 3800, from: -90, to: -1, ref: "Takings", flag: ["amount", "Cash banked is several times the level declared at onboarding."] },
        { parties: ["card"], dir: "in", rail: "card", n: 60, min: 40, max: 160, from: -90, to: -1, ref: "Card settlement" },
        { parties: ["connected"], dir: "out", rail: c.fast, n: 7, min: 5000, max: 9500, from: -85, to: -2, ref: "Management charge", flag: ["counterparty", "Large regular payments go to a company connected to the director."] },
        { parties: ["staff"], dir: "out", rail: c.salary, n: 6, min: 800, max: 1200, from: -88, to: -3, ref: "Wages" },
      ],
      docs: [
        { kind: "kyc_form", title: "Business onboarding form", text: `One site and two employees. Expected annual turnover ${c.m(140000)}, about half in cash.` },
        { kind: "company_register", title: "Company register extract", text: "One director, who is also a director of Fictia Property Ventures Ltd." },
        { kind: "account_note", title: "Branch deposit notes", text: "Cash is paid in by two people who are not on the payroll list supplied.", flag: ["behaviour", "The people banking the cash are not known to work for the business."] },
        { kind: "source_of_funds", title: "Management accounts", text: `A one-page summary with an average order of ${c.m(18)} and about 40 orders a day. No till records were supplied.`, flag: ["document", "The stated orders cannot produce the cash that was banked."] },
        { kind: "rfi_response", title: "Director's response to information request", text: "The director says trade has grown because of online orders, but supplies no records." },
        { kind: "invoice", title: "Food supplier invoices", text: "The invoices support sales of about a quarter of the takings banked.", flag: ["document", "Supplier costs point to far lower sales than the cash implies."] },
      ],
      summary: "Over 90 days cash banked by the company was several times the level declared at onboarding, and large sums were then paid to a connected company.",
      reason: "The cash cannot be reconciled with the business. Stated orders and supplier invoices point to far lower sales, the depositors are not known staff, and funds moved to a company connected to the director.",
      explanation: "Cash is expected in a takeaway, but not at this level. The records of the business show how little of it could be real trade.",
    }),
  },
  {
    kind: "tp",
    pattern: "trade_based_laundering",
    build: (c) => ({
      alert: [RISKY, "Large international credits were received from a higher-risk country in the last 60 days."],
      customer: { type: "company", name: "Fictia Trading Ltd", occupation: "Wholesale of used electronics", income: 900000, risk: "medium", text: "Business current account for export sales and supplier payments." },
      parties: {
        payer: { name: "Exampleland Investment Co", kind: "company", foreign: true },
        supplier: { name: "Exemplar Electronics Wholesale", kind: "company" },
        carrier: { name: "Fictia Freight Ltd", kind: "company" },
      },
      rules: [
        { parties: ["payer"], dir: "in", rail: "swift", n: 5, min: 60000, max: 110000, from: -60, to: -3, ref: "Goods", flag: ["counterparty", "Payment comes from a third party that is not the buyer named on the invoices."] },
        { parties: ["supplier"], dir: "out", rail: c.high, n: 6, min: 20000, max: 45000, from: -58, to: -2, ref: "Stock" },
        { parties: ["carrier"], dir: "out", rail: c.fast, n: 4, min: 400, max: 900, from: -55, to: -6, ref: "Freight" },
      ],
      docs: [
        { kind: "kyc_form", title: "Business onboarding form", text: "Exports used electronics. Buyers are described as retailers abroad." },
        { kind: "company_register", title: "Company register extract", text: "One director, who holds all of the shares." },
        { kind: "account_note", title: "Payment reference review", text: "The payments quote invoice numbers issued to a different company." },
        { kind: "invoice", title: "Sales invoices", text: "The invoices show used phones at several times their typical market price.", flag: ["document", "The invoice prices are far above the market price of the goods."] },
        { kind: "contract", title: "Shipping record", text: "The recorded weight is much lower than the quantity on the invoices would need.", flag: ["document", "The shipping record does not match the goods invoiced."] },
        { kind: "rfi_response", title: "Director's response to information request", text: "The director says the third party pays on the buyer's behalf, but cannot explain why.", flag: ["behaviour", "The reason for third-party payment cannot be explained."] },
      ],
      summary: "Over 60 days the company received large international payments for goods from a third party that is not the buyer named on its invoices.",
      reason: "The invoices are priced far above the market, the shipping record does not match the goods, and the director cannot explain why a third party pays. The trade does not make commercial sense.",
      explanation: "Review the goods as well as the payment. Prices, weight and payer all contradict the stated trade.",
    }),
  },
  {
    kind: "fp",
    pattern: "property_sale",
    build: (c) => ({
      alert: [LARGE, "A single credit is far above the customer's usual monthly turnover."],
      customer: { type: "individual", name: c.person, occupation: "Teacher", income: 42000, risk: "low", text: "Long-standing customer with a salary account and household spending." },
      parties: {
        solicitor: { name: "Exemplar Solicitors LLP", kind: "solicitor" },
        school: { name: "Example County School", kind: "company" },
        savings: { name: "Fictia Savings Bank", kind: "company" },
      },
      rules: [
        { parties: ["solicitor"], dir: "in", rail: c.high, n: 1, min: 186000, max: 186000, from: -6, to: -6, ref: "Completion proceeds" },
        { parties: ["school"], dir: "in", rail: c.salary, n: 3, min: 2780, max: 2780, from: -85, to: -5, ref: "Salary" },
        { parties: ["savings"], dir: "out", rail: c.fast, n: 2, min: 40000, max: 60000, from: -4, to: -1, ref: "Savings" },
      ],
      docs: [
        { kind: "kyc_form", title: "Onboarding form", text: "Teacher. Salary paid monthly. Homeowner." },
        { kind: "account_note", title: "Payment reference review", text: "The sender of the large credit is a firm of solicitors." },
        { kind: "screening_result", title: "Screening result", text: NO_MATCH },
        { kind: "source_of_funds", title: "Completion statement", text: "A statement from the solicitors confirms the sale of the customer's home and the net proceeds, which match the credit." },
        { kind: "rfi_response", title: "Customer response to information request", text: "The customer explains that the family has sold its home and is renting while buying another." },
        { kind: "contract", title: "Estate agent's sale memorandum", text: "The memorandum names the customer as seller and gives the agreed price." },
      ],
      summary: "The account received one large credit from a firm of solicitors, part of which moved to a savings account.",
      reason: "The value of the credit is unusual when compared with the customer's salary.",
      explanation: "A documented sale of the customer's home explains the credit. The money came through solicitors and stayed in the customer's name.",
    }),
  },
  {
    kind: "fp",
    pattern: "inheritance",
    build: (c) => ({
      alert: [LARGE, "A credit is far above the customer's usual monthly turnover."],
      customer: { type: "individual", name: c.person, occupation: "Retired nurse", income: 19000, risk: "low", text: "Long-standing customer with a pension paid monthly." },
      parties: {
        solicitor: { name: "Exemplar Probate Solicitors LLP", kind: "solicitor" },
        pension: { name: "Fictia Pension Service", kind: "company" },
        platform: { name: "Fictia Investment Platform", kind: "company" },
      },
      rules: [
        { parties: ["solicitor"], dir: "in", rail: c.high, n: 2, min: 70000, max: 95000, from: -14, to: -3, ref: "Estate distribution" },
        { parties: ["pension"], dir: "in", rail: c.salary, n: 3, min: 1250, max: 1250, from: -85, to: -5, ref: "Pension" },
        { parties: ["platform"], dir: "out", rail: c.fast, n: 3, min: 20000, max: 30000, from: -8, to: -1, ref: "Investment" },
      ],
      docs: [
        { kind: "kyc_form", title: "Onboarding form", text: `Retired. Pension of about ${c.m(1250)} a month.` },
        { kind: "account_note", title: "Payment reference review", text: "The credits come from a firm of solicitors and refer to an estate." },
        { kind: "screening_result", title: "Screening result", text: NO_MATCH },
        { kind: "source_of_funds", title: "Grant of probate", text: "The grant names the customer as a beneficiary of a relative's estate." },
        { kind: "rfi_response", title: "Customer response to information request", text: "The customer explains that a sibling has died and that the funds are being invested for retirement." },
        { kind: "invoice", title: "Estate accounts", text: "The solicitors' accounts show the customer's share, which matches the credits." },
      ],
      summary: "The account received two large credits from a firm of solicitors, and part of the funds moved to an investment platform.",
      reason: "The credits are unusual when compared with the customer's pension.",
      explanation: "A grant of probate and the estate accounts explain the credits, and they came from the solicitors handling the estate.",
    }),
  },
  {
    kind: "fp",
    pattern: "seasonal_trader",
    build: (c) => ({
      alert: [CASH, "Cash credited in the last 90 days is several times the monthly average expected from the customer profile."],
      customer: { type: "company", name: "Fictia Garden and Christmas Market Ltd", occupation: "Seasonal market stalls", income: 210000, risk: "medium", text: "Business current account for takings, wages and suppliers." },
      parties: {
        d1: { name: "Depositor: Morgan Sample", kind: "individual" },
        d2: { name: "Depositor: Taylor Sample", kind: "individual" },
        card: { name: "Exemplar Card Acquiring", kind: "company" },
        wholesale: { name: "Fictia Nursery Wholesale", kind: "company" },
        staff: { name: "Payroll: market staff", kind: "individual" },
      },
      rules: [
        { parties: ["d1", "d2"], dir: "in", rail: "cash", n: 30, min: 1200, max: 3000, from: -90, to: -1, ref: "Takings" },
        { parties: ["card"], dir: "in", rail: "card", n: 70, min: 300, max: 900, from: -90, to: -1, ref: "Card settlement" },
        { parties: ["wholesale"], dir: "out", rail: c.fast, n: 12, min: 2500, max: 5000, from: -84, to: -2, ref: "Stock" },
        { parties: ["staff"], dir: "out", rail: c.salary, n: 14, min: 1100, max: 1600, from: -88, to: -3, ref: "Wages" },
      ],
      docs: [
        { kind: "kyc_form", title: "Business onboarding form", text: "Two seasonal markets. About 70% of annual turnover is earned in spring and in December." },
        { kind: "company_register", title: "Company register extract", text: "One director, who also holds all of the shares. No other appointments are listed." },
        { kind: "account_note", title: "Branch deposit notes", text: "Cash is paid in by two people, each with a deposit slip naming the business." },
        { kind: "source_of_funds", title: "Management accounts and till reports", text: "Accounts from an external accountant, with daily till reports that match the deposits and the card settlements." },
        { kind: "rfi_response", title: "Director's response to information request", text: "The director supplies last year's statements, which show the same seasonal peak." },
        { kind: "invoice", title: "Stock invoices", text: "Supplier invoices are in proportion to the takings for the season." },
      ],
      summary: "Over 90 days cash credited to the company's account was several times the monthly average in its profile.",
      reason: "The cash is well above the customer's monthly average.",
      explanation: "The alert compares a peak season with an annual average. The profile declared this seasonality, and till reports, stock and last year's peak all support it.",
    }),
  },
  {
    kind: "fp",
    pattern: "bonus_or_dividend",
    build: (c) => ({
      alert: [LARGE, "A credit is far above the customer's usual monthly turnover."],
      customer: { type: "individual", name: c.person, occupation: "Sales director", income: 95000, risk: "low", text: "Salary account with mortgage payments and household spending." },
      parties: {
        employer: { name: "Fictia Software Ltd", kind: "company" },
        platform: { name: "Fictia Investment Platform", kind: "company" },
        mortgage: { name: "Fictia Mortgages", kind: "company" },
      },
      rules: [
        { parties: ["employer"], dir: "in", rail: c.salary, n: 3, min: 5200, max: 5200, from: -85, to: -5, ref: "Salary" },
        { parties: ["employer"], dir: "in", rail: c.high, n: 1, min: 78000, max: 78000, from: -6, to: -6, ref: "Annual payment" },
        { parties: ["platform"], dir: "out", rail: c.fast, n: 2, min: 20000, max: 30000, from: -4, to: -1, ref: "Investment" },
        { parties: ["mortgage"], dir: "out", rail: c.fast, n: 3, min: 1700, max: 1700, from: -80, to: -10, ref: "Mortgage" },
      ],
      docs: [
        { kind: "kyc_form", title: "Onboarding form", text: "Sales director. Salary and an annual performance award." },
        { kind: "account_note", title: "Payment reference review", text: "The large credit comes from the same company that pays the salary." },
        { kind: "screening_result", title: "Screening result", text: NO_MATCH },
        { kind: "source_of_funds", title: "Payslip for the award", text: "The payslip shows the annual award, tax paid and a net amount that matches the credit." },
        { kind: "rfi_response", title: "Customer response to information request", text: "The customer confirms that this is the annual award and that part of it has been invested." },
        { kind: "contract", title: "Employment contract", text: "The contract includes an annual performance award." },
      ],
      summary: "The account received one large credit from the customer's employer, and part of the funds moved to an investment platform.",
      reason: "The value of the credit is unusual when compared with the customer's monthly salary.",
      explanation: "The credit comes from the known employer, and the payslip and contract confirm it as an annual award.",
    }),
  },
  {
    kind: "fp",
    pattern: "family_remittances",
    build: (c) => ({
      alert: [RISKY, "Repeated payments were sent to a higher-risk country in the last 90 days."],
      customer: { type: "individual", name: c.person, occupation: "Care worker", income: 28000, risk: "medium", text: "Salary account with rent and household spending." },
      parties: {
        employer: { name: "Fictia Care Homes Ltd", kind: "company" },
        relative: { name: "Recipient: Avery Sample", kind: "individual", foreign: true },
        landlord: { name: "Exemplar Lettings Ltd", kind: "company" },
      },
      rules: [
        { parties: ["employer"], dir: "in", rail: c.salary, n: 3, min: 1950, max: 1950, from: -85, to: -5, ref: "Salary" },
        { parties: ["relative"], dir: "out", rail: "swift", n: 3, min: 250, max: 420, from: -85, to: -5, ref: "Family support" },
        { parties: ["landlord"], dir: "out", rail: c.fast, n: 3, min: 780, max: 780, from: -80, to: -10, ref: "Rent" },
      ],
      docs: [
        { kind: "kyc_form", title: "Onboarding form", text: "Care worker. Expects to send money to family abroad." },
        { kind: "account_note", title: "Account review note", text: "The same recipient has received similar monthly payments for several years." },
        { kind: "screening_result", title: "Screening result", text: "The customer and the recipient have no matches on sanctions lists." },
        { kind: "source_of_funds", title: "Payslips", text: "The payslips match the salary credits and leave enough to cover these payments." },
        { kind: "rfi_response", title: "Customer response to information request", text: "The customer explains that the recipient is a parent who needs help with medical bills." },
        { kind: "id_check", title: "Proof of relationship", text: "A family register entry links the customer and the recipient." },
      ],
      summary: "Over 90 days the customer sent regular payments to one person in a higher-risk country.",
      reason: "The payments go to a higher-risk country.",
      explanation: "The payments are small, regular, affordable and declared at onboarding, and the relationship is documented.",
    }),
  },
  {
    kind: "fp",
    pattern: "documented_crypto_gain",
    build: (c) => ({
      alert: [LARGE, "Credits from a crypto exchange in the last 40 days are far above the level expected from the customer profile."],
      customer: { type: "individual", name: c.person, occupation: "Software engineer", income: 72000, risk: "low", text: "Salary account with mortgage payments and regular saving." },
      parties: {
        exchange: { name: "Example Coin Exchange", kind: "crypto_exchange", foreign: true },
        employer: { name: "Fictia Systems Ltd", kind: "company" },
        tax: { name: "Example Revenue Service", kind: "company" },
      },
      rules: [
        { parties: ["exchange"], dir: "in", rail: "crypto", n: 3, min: 20000, max: 50000, from: -40, to: -3, ref: "Withdrawal" },
        { parties: ["employer"], dir: "in", rail: c.salary, n: 3, min: 4300, max: 4300, from: -85, to: -5, ref: "Salary" },
        { parties: ["tax"], dir: "out", rail: c.fast, n: 1, min: 11000, max: 11000, from: -2, to: -2, ref: "Tax payment" },
      ],
      docs: [
        { kind: "kyc_form", title: "Onboarding form", text: "Software engineer. Declared investments, including crypto." },
        { kind: "account_note", title: "Account review note", text: "Payments to the same exchange appear in earlier years, in small monthly amounts." },
        { kind: "screening_result", title: "Screening result", text: NO_MATCH },
        { kind: "source_of_funds", title: "Full exchange history", text: "The history shows purchases made from this account over several years, and the sales that match these credits." },
        { kind: "rfi_response", title: "Customer response to information request", text: "The customer explains that they sold part of a long-term holding to reduce risk." },
        { kind: "invoice", title: "Tax calculation", text: "An accountant's calculation of the gain matches the tax payment." },
      ],
      summary: "Over 40 days the account received large withdrawals from a crypto exchange.",
      reason: "The credits from a crypto exchange are unusual when compared with the customer's salary.",
      explanation: "The full exchange history links the crypto to the customer's own earlier purchases, and the tax paid fits the gain.",
    }),
  },
];
