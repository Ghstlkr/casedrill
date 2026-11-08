import { options } from "@casedrill/profiles";
import { FlagMenu } from "../components/FlagMenu";
import { InfoButton } from "../components/InfoButton";
import { DOCUMENT_KINDS } from "../format";
import { useStore } from "../store";
import { useCase } from "./useCase";

export function DocumentsTab() {
  const { caseId, scenario, work, config } = useCase();
  const requestDocument = useStore((state) => state.requestDocument);

  const available = scenario.documents.document.filter(
    (doc) => doc.availability === "initial" || work.requestedDocs.includes(doc.id),
  );
  const requestable = config.canRequestDocuments
    ? scenario.documents.document.filter((doc) => doc.availability === "on_request" && !work.requestedDocs.includes(doc.id))
    : [];

  return (
    <div className="documents">
      {available.map((doc) => (
        <article key={doc.id} className="document">
          <div className="section-head">
            <div>
              <p className="doc-kind">{DOCUMENT_KINDS[doc.kind]}</p>
              <h2>{doc.title}</h2>
            </div>
            <FlagMenu
              caseId={caseId}
              marks={work.marks}
              target={{ key: `document:${doc.id}`, targetType: "document", targetRef: doc.id, label: doc.title }}
            />
          </div>
          <p>{doc.text}</p>
        </article>
      ))}

      {requestable.length > 0 && (
        <section className="requests">
          <div className="section-head">
            <h2>Available on request</h2>
            <InfoButton label="Requesting a document" info={options.actions.requestDocument} />
          </div>
          <ul>
            {requestable.map((doc) => (
              <li key={doc.id}>
                <span>{doc.title}</span>
                <button type="button" onClick={() => requestDocument(caseId, doc.id, doc.requestMinutes ?? 0)}>
                  Request ({doc.requestMinutes} min)
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
