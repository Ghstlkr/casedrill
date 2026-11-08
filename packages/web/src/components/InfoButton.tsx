import { useCallback, useRef, useState } from "react";
import { Popover } from "./Popover";

export type Info = { what: string; when: string; mistake: string };

export function InfoButton({ label, info }: { label: string; info: Info }) {
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        ref={button}
        type="button"
        className="info-button"
        aria-label={`About ${label}`}
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        i
      </button>
      {open && (
        <Popover anchor={button} width={320} label={`About ${label}`} onClose={close}>
          <h4 className="popover-title">{label}</h4>
          <dl className="info-list">
            <dt>What it is</dt>
            <dd>{info.what}</dd>
            <dt>When to use it</dt>
            <dd>{info.when}</dd>
            <dt>Common mistake</dt>
            <dd>{info.mistake}</dd>
          </dl>
        </Popover>
      )}
    </>
  );
}
