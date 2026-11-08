import cytoscape from "cytoscape";
import { useEffect, useMemo, useRef, useState } from "react";
import { FlagMenu } from "../components/FlagMenu";
import { money } from "../format";
import { useCase } from "./useCase";

export default function NetworkTab() {
  const { caseId, scenario, work, transactions } = useCase();
  const container = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const currency = transactions[0]?.currency ?? "GBP";

  const parties = useMemo(
    () =>
      scenario.counterparties.counterparty.map((party) => {
        const own = transactions.filter((item) => item.counterpartyId === party.id);
        const sum = (direction: string) =>
          own.filter((item) => item.direction === direction).reduce((total, item) => total + item.amount, 0);
        return { ...party, moneyIn: sum("in"), moneyOut: sum("out"), count: own.length };
      }),
    [scenario, transactions],
  );

  useEffect(() => {
    if (!container.current) return;
    const css = getComputedStyle(document.documentElement);
    const color = (name: string) => css.getPropertyValue(name).trim();
    const customerNode = "customer";

    const elements: cytoscape.ElementDefinition[] = [
      { data: { id: customerNode, label: scenario.customer.name, root: 1 } },
      ...parties.map((party) => ({ data: { id: party.id, label: party.name, root: 0 } })),
      ...parties.flatMap((party) => [
        ...(party.moneyIn > 0 ? [{ data: { id: `${party.id}-in`, source: party.id, target: customerNode, label: money(party.moneyIn, currency) } }] : []),
        ...(party.moneyOut > 0 ? [{ data: { id: `${party.id}-out`, source: customerNode, target: party.id, label: money(party.moneyOut, currency) } }] : []),
      ]),
    ];

    const graph = cytoscape({
      container: container.current,
      elements,
      minZoom: 0.4,
      maxZoom: 2,
      layout: {
        name: "concentric",
        concentric: (node) => (node.data("root") ? 2 : 1),
        levelWidth: () => 1,
        minNodeSpacing: 70,
        padding: 20,
      },
      style: [
        {
          selector: "node",
          style: {
            "background-color": color("--sheet"),
            "border-color": color("--ink"),
            "border-width": 1.5,
            label: "data(label)",
            color: color("--ink"),
            "font-size": 11,
            "text-wrap": "wrap",
            "text-max-width": "110px",
            "text-valign": "bottom",
            "text-margin-y": 5,
            width: 26,
            height: 26,
          },
        },
        { selector: "node[root = 1]", style: { "background-color": color("--ink"), width: 40, height: 40, "font-weight": "bold" } },
        { selector: "node:selected", style: { "border-color": color("--stamp"), "border-width": 3 } },
        {
          selector: "edge",
          style: {
            width: 1.5,
            "line-color": color("--muted"),
            "target-arrow-color": color("--muted"),
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            label: "data(label)",
            "font-size": 10,
            color: color("--muted"),
            "text-background-color": color("--sheet"),
            "text-background-opacity": 1,
            "text-background-padding": "2px",
          },
        },
      ],
    });

    graph.on("tap", "node", (event) => setSelected(event.target.id() === customerNode ? null : event.target.id()));
    graph.on("tap", (event) => {
      if (event.target === graph) setSelected(null);
    });
    return () => graph.destroy();
  }, [scenario, parties, currency]);

  return (
    <div>
      <div ref={container} className="graph" role="img" aria-label="Money flows between the customer and its counterparties. The table below lists the same information." />
      <div className="table-scroll" tabIndex={0} role="region" aria-label="Counterparties">
        <table className="ledger compact-names">
          <thead>
            <tr>
              <th scope="col">Counterparty</th>
              <th scope="col">Country</th>
              <th scope="col" className="num">Payments</th>
              <th scope="col" className="num">Money in</th>
              <th scope="col" className="num">Money out</th>
              <th scope="col">Flag</th>
            </tr>
          </thead>
          <tbody>
            {parties.map((party) => (
              <tr key={party.id} className={selected === party.id ? "selected" : undefined}>
                <td>{party.name}</td>
                <td>{party.country}</td>
                <td className="num">{party.count}</td>
                <td className="num">{money(party.moneyIn, currency)}</td>
                <td className="num">{money(party.moneyOut, currency)}</td>
                <td>
                  <FlagMenu
                    caseId={caseId}
                    marks={work.marks}
                    target={{ key: `network:${party.id}`, targetType: "network", targetRef: party.id, label: party.name }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
