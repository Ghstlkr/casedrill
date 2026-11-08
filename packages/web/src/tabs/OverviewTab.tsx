import { FlagMenu } from "../components/FlagMenu";
import { longDate, money } from "../format";
import { useCase } from "./useCase";

export function OverviewTab() {
  const { caseId, scenario, work, transactions, profile } = useCase();
  const { customer, alert } = scenario;

  const railLabel = (id: string) => profile.rails.find((rail) => rail.id === id)?.label ?? id;
  const rails = [...new Set(transactions.map((item) => item.rail))];
  const total = (rail: string, direction: string) =>
    transactions.filter((item) => item.rail === rail && item.direction === direction).reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="overview">
      <section>
        <h2>Why this alert was raised</h2>
        <p className="lead">{alert.text}</p>
      </section>

      <section>
        <div className="section-head">
          <h2>Customer</h2>
          <FlagMenu
            caseId={caseId}
            marks={work.marks}
            target={{ key: `customer:${customer.id}`, targetType: "customer", targetRef: customer.id, label: customer.name }}
          />
        </div>
        <p>{customer.text}</p>
        <dl className="facts">
          <dt>Occupation or business</dt>
          <dd>{customer.occupation}</dd>
          <dt>Type</dt>
          <dd>{customer.type === "company" ? "Company" : "Individual"}</dd>
          <dt>Country</dt>
          <dd>{customer.country}</dd>
          <dt>Risk rating</dt>
          <dd className="capitalise">{customer.riskRating}</dd>
          <dt>Customer since</dt>
          <dd>{longDate(customer.onboardedOn)}</dd>
          <dt>{customer.type === "company" ? "Declared annual turnover" : "Declared annual income"}</dt>
          <dd>{money(customer.declaredAnnualIncome, customer.currency)}</dd>
        </dl>
      </section>

      <section>
        <h2>Activity by payment method</h2>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Activity by payment method">
          <table className="ledger">
            <thead>
              <tr>
                <th scope="col">Method</th>
                <th scope="col" className="num">Money in</th>
                <th scope="col" className="num">Money out</th>
              </tr>
            </thead>
            <tbody>
              {rails.map((rail) => (
                <tr key={rail}>
                  <td>{railLabel(rail)}</td>
                  <td className="num">{money(total(rail, "in"), transactions[0]?.currency ?? "GBP")}</td>
                  <td className="num">{money(total(rail, "out"), transactions[0]?.currency ?? "GBP")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
