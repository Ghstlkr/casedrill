import { getRoutes } from "@casedrill/profiles";
import { InfoButton } from "../components/InfoButton";
import { useStore } from "../store";
import { useCase } from "./useCase";

export function RoutingTab() {
  const { caseId, work, level, jurisdiction } = useCase();
  const toggleRoute = useStore((state) => state.toggleRoute);

  return (
    <fieldset className="routes">
      <legend>Where should this case go?</legend>
      <p>Select every route you recommend. Leave them all empty if the case does not need to go anywhere.</p>
      {getRoutes(level, jurisdiction).map((route) => (
        <div key={route.id} className="option-row">
          <label>
            <input type="checkbox" checked={work.routing.includes(route.id)} onChange={() => toggleRoute(caseId, route.id)} /> {route.label}
          </label>
          <InfoButton label={route.label} info={route.info} />
        </div>
      ))}
    </fieldset>
  );
}
