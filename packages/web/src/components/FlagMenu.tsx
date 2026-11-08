import { options } from "@casedrill/profiles";
import { useCallback, useRef, useState } from "react";
import { type Mark, type Target, useStore } from "../store";
import { InfoButton } from "./InfoButton";
import { Popover } from "./Popover";

const categoryLabel = (id: string) => options.categories.find((item) => item.id === id)?.label ?? id;

/** Marks one transaction, document or party as an irregularity, with a category. */
export function FlagMenu({ caseId, target, marks }: { caseId: string; target: Target; marks: Mark[] }) {
  const flag = useStore((state) => state.flag);
  const unflag = useStore((state) => state.unflag);
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const existing = marks.find((mark) => mark.key === target.key);

  if (existing) {
    return (
      <span className="flag-chip">
        {categoryLabel(existing.category)}
        <button type="button" aria-label={`Remove flag from ${target.label}`} onClick={() => unflag(caseId, target.key)}>
          ×
        </button>
      </span>
    );
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        className="flag-button"
        aria-label={`Flag ${target.label}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        Flag
      </button>
      {open && (
        <Popover anchor={button} width={260} label="Choose why you are flagging this" onClose={close}>
          <h4 className="popover-title">Why are you flagging this?</h4>
          <ul className="category-list">
            {options.categories.map((category) => (
              <li key={category.id}>
                <button
                  type="button"
                  onClick={() => {
                    flag(caseId, target, category.id);
                    close();
                  }}
                >
                  {category.label}
                </button>
                <InfoButton label={category.label} info={category.info} />
              </li>
            ))}
          </ul>
        </Popover>
      )}
    </>
  );
}

export { categoryLabel };
