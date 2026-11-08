import { useCase } from "./useCase";

export function PriorWorkTab() {
  const { scenario } = useCase();
  if (!scenario.priorWork) return null;
  return (
    <article className="document">
      <p className="doc-kind">Notes from {scenario.priorWork.author}</p>
      <p className="lead">{scenario.priorWork.text}</p>
    </article>
  );
}
