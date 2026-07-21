import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { configurationHash } from "./canonical.js";
import { validateRawBundle } from "./validate.js";
import type { LoadedBundle } from "./types.js";

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

export async function loadConfigurationBundle(rootDir: string): Promise<LoadedBundle> {
  const dataDir = resolve(rootDir, "data");
  const rawManifest = await readJson(resolve(dataDir, "manifest.json"));
  const listedFiles =
    rawManifest &&
    typeof rawManifest === "object" &&
    Array.isArray((rawManifest as { configurationFiles?: unknown }).configurationFiles)
      ? ((rawManifest as { configurationFiles: string[] }).configurationFiles)
      : [];

  const rawFiles = new Map<string, unknown>();
  for (const fileName of listedFiles) {
    rawFiles.set(fileName, await readJson(resolve(dataDir, fileName)));
  }

  const validated = validateRawBundle(rawManifest, rawFiles);
  const hash = configurationHash([
    ["manifest.json", rawManifest],
    ...[...rawFiles.entries()],
  ]);

  return {
    rootDir,
    manifest: validated.manifest,
    files: validated.files,
    hash,
    issues: validated.issues,
    provenanceEntries: validated.provenanceEntries,
    counts: validated.counts,
  };
}
