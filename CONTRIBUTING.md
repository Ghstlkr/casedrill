# Contributing to CaseDrill

Corrections from people who work in financial crime are the most useful contribution. Please open an issue if a rule, term or procedure is wrong or out of date, and include a source.

## Updating rules

Jurisdiction rules are in `packages/profiles/data/uk.json` and `eu.json`, so most changes need no code. Update `asOfDate` and `sources` in the same change.

## Sharing a scenario pack

Packs are in two groups:

- `packs/curated`: reviewed by the maintainer.
- Community packs: open a pull request or attach the file to an issue.

Every pack must:

1. Pass the import check in CaseDrill.
2. Be entirely fictional. Use no real people, companies, banks, addresses or news stories, and do not adapt a real case in a way someone could recognise.
3. Describe warning signs an analyst must recognise, and not explain how to carry out or conceal a crime.
4. Give true and false positives the same level of detail and the same number of documents.
5. Be offered under CC BY 4.0.

## Changing the code

```bash
npm ci
npm run typecheck
npm test
```

Keep the answer key away from the training screens. They should only receive the view returned by `toTraineeView`.

Changes to scoring need tests, because a wrong score damages trust in the project.
