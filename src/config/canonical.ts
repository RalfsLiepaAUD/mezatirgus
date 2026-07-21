import { createHash } from "node:crypto";

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortValue(child)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

export function configurationHash(
  entries: ReadonlyArray<readonly [string, unknown]>,
): string {
  const canonicalBundle = entries
    .slice()
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([file, value]) => ({ file, value }));
  return createHash("sha256").update(canonicalJson(canonicalBundle), "utf8").digest("hex");
}
