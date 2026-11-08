/** Elements that are always lists, even when the file holds only one. */
const ARRAY_TAGS = new Set([
  "scenario",
  "account",
  "counterparty",
  "txRule",
  "document",
  "block",
  "answer",
  "irregularity",
  "priorWorkError",
]);

/** Parser settings that map a pack XML file onto packSchema (fast-xml-parser). */
export const xmlParserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: "",
  textNodeName: "text",
  ignoreDeclaration: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
  htmlEntities: false,
  isArray: (tagName: string) => ARRAY_TAGS.has(tagName),
};
