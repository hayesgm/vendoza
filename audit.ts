import * as path from "path";
import { readdir, readFile, lstat, writeFile } from "fs/promises";
import { Hunk, structuredPatch } from "diff";
import fetch from "node-fetch";
import chalk from 'chalk';

export interface GitSource {
  repo: string;
  commit: string;
  path?: string[]
}

export type Source = { git: GitSource };

export interface ManifestItem {
  source: Source;
  patches: Hunk[];
}

export type ManifestFiles = Map<string, ManifestItem>;

interface Manifest {
  files: ManifestFiles,
  strict: boolean,
  manifestDir: string,
  allowedExtra: string[]
}

interface ManifestJson {
  files?: { [path: string]: ManifestItem };
  strict?: boolean;
  manifestDir?: string;
  allowedExtra?: string[]
}

// Adopted from https://inspirnathan.com/posts/19-how-to-recursively-fetch-files-in-nodejs/
async function fetchFiles(targetPath: string): Promise<string[]> {
  const files = await readdir(targetPath);
  const fetchedFiles = [];

  for (let file of files) {
    const filepath = path.join(targetPath, file);
    const stats = await lstat(filepath);

    if (stats.isFile()) {
      fetchedFiles.push(path.normalize(filepath));
    }

    if (stats.isDirectory()) {
      const childFiles = await readdir(filepath);
      files.push(...childFiles.map((f) => path.join(file, f))); 
    }
  }

  return fetchedFiles;
}

async function loadManifest(manifestFile: string): Promise<Manifest> {
  let manifestJSON = await readFile(manifestFile, 'utf8');
  let manifestObject = JSON.parse(manifestJSON) as ManifestJson;
  let manifestDir = manifestObject.manifestDir ?? path.dirname(manifestFile);

  return {
    files: new Map(Object.entries(manifestObject.files ?? [])),
    strict: manifestObject.strict ?? false,
    manifestDir,
    allowedExtra: (manifestObject.allowedExtra ?? []).concat(path.relative(manifestDir, manifestFile))
  };
}

async function readGitSource(
  git: GitSource,
  fileName: string
): Promise<string> {
  let regex =
    /^(?:git@|http:\/\/)?(?<domain>[\w.]+)[\/:](?<repo>[\w\/-]+)(?:\.git)?$/;
  let match = regex.exec(git.repo);
  if (match === null || match.length == 0) {
    throw new Error(
      `Must specify full git repo, such as "git@github.com:hayesgm/cool.git" or "https://github.com/hayesgm/cool.git", got: "${git.repo}"`
    );
  }
  let { domain, repo } = (
    match as unknown as { groups: { domain: string; repo: string } }
  ).groups;
  if (domain === "github.com") {
    let fetchPath = path.join("https://raw.githubusercontent.com", repo, git.commit, ...(git.path ?? []), fileName);
    let res = await fetch(fetchPath);
    return await res.text();
  } else {
    throw new Error(
      `Unknown git domain, must be ["github.com"], got: ${domain}`
    );
  }
}

async function readSource(fileName: string, source: Source): Promise<string> {
  if (source.git) {
    return await readGitSource(source.git, fileName);
  } else {
    throw new Error(
      `Unknown manifest source ${JSON.stringify(source)} for ${fileName}`
    );
  }
}

function diff(a: string, b: string): Hunk[] {
  let diff = structuredPatch("", "", a, b, "", "");

  return diff.hunks;
}

function showHunk(hunk: Hunk): string {
  let res = [];
  res.push(`---found`);
  res.push(`+++expected`);
  res.push(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines}`);
  for (let line of hunk.lines) {
    if (line.startsWith('+')) {
      res.push(chalk.green(line));
    } else if (line.startsWith('-')) {
      res.push(chalk.red(line));
    } else {
      res.push(line);
    }
  }
  return res.join("\n");
}

function stringifyHunk(hunk: Hunk): string {
  return JSON.stringify(hunk);
}

function parseHunk(hunk: string): Hunk {
  return JSON.parse(hunk) as Hunk;
}

function compareDeltas(fileName: string, given: Hunk[], exp: Hunk[]): { error: string, given: Hunk[], fileName: string } | null {
  let { match: matching, leftDiff: extraHunks, rightDiff: missingHunks } = listCompare(given.map(stringifyHunk), exp.map(stringifyHunk));
  if (extraHunks.length === 0 && missingHunks.length === 0) {
    return null;
  }
  let res = [];
  if (extraHunks.length > 0) {
    res.push(`Found unexpected diffs in ${fileName}: \n\n${extraHunks.map(parseHunk).map(showHunk).join("\n\n")}`);
  }
  if (missingHunks.length > 0) {
    res.push(`Missing expected diffs in ${fileName}: \n\n${missingHunks.map(parseHunk).map(showHunk).join("\n\n")}`);
  }
  let error = res.join("\n\n");

  return { error, given, fileName };
}

export async function checkFile(
  fileName: string,
  contents: string,
  item: ManifestItem
): Promise<{ error: string, given: Hunk[] } | null> {
  let sourced = await readSource(fileName, item.source);
  let patches = diff(contents, sourced);
  // console.log(fileName, {deltas});
  return compareDeltas(fileName, patches, item.patches);
}

function listCompare<T>(left: T[], right: T[]): { match: T[], leftDiff: T[], rightDiff: T[] } {
  let leftSet = new Set([...left]);
  let rightSet = new Set([...right]);
  let match = [...left].filter(x => rightSet.has(x));
  let leftDiff = [...left].filter(x => !rightSet.has(x));
  let rightDiff = [...right].filter(x => !leftSet.has(x));

  return { match, leftDiff, rightDiff }
}

function countFiles(count: number, adj?: string) {
  return `${count}${adj ? ` ${adj}` : ''} ${count === 1 ? 'file' : 'files'}`
}

export async function audit(manifestFile: string, writePatches: boolean) {
  let manifest = await loadManifest(manifestFile);
  let diskFiles = (await fetchFiles(manifest.manifestDir)).map((file) => path.relative(manifest.manifestDir, file));

  let { match: files, leftDiff: extraFilesFound, rightDiff: missingFiles } = listCompare(diskFiles, [...manifest.files.keys()]);
  let fileCount = files.length + extraFilesFound.length + missingFiles.length;

  let comparisons = await Promise.all(files.map(async (fileName) => {
    let manifestItem = manifest.files.get(fileName);
    if (!manifestItem) {
      throw new Error(`Unable to get manifestItem for ${fileName}`);
    }

    let contents = await readFile(path.join(manifest.manifestDir, fileName), 'utf8');
    return await checkFile(fileName, contents, manifestItem);
  }));

  let extraFiles = extraFilesFound.filter((file) => !manifest.allowedExtra.includes(file));
  let errors = comparisons.filter((comparison) => comparison !== null) as { error: string, given: Hunk[], fileName: string }[];
  let failed = false;

  if (missingFiles.length > 0) {
    let missingFilesStr = missingFiles.map((file) => `\n\t * ${file}`);
    console.error(`\n${chalk.red("Audit Error")}: Failed to find ${countFiles(missingFiles.length, 'expected')} in manifest directory\n${missingFilesStr}`);
    failed = true;
  }

  if (extraFiles.length > 0) {
    // TODO: Add a way to supress this?
    let extraFilesStr = extraFiles.map((file) => `\n\t * ${file}`);
    let heading = manifest.strict ? chalk.red('Audit Error') : chalk.yellow('Audit Warning');
    console.error(`\n${heading}: Found ${countFiles(extraFiles.length, 'unexpected')} in manifest directory\n${extraFilesStr}`);
    if (manifest.strict) {
      failed = true;
    }
  }

  let patches: Record<string, Hunk[]> = {};
  for (let { error, fileName, given } of errors) {
    console.error(`\n${chalk.red("Audit Error")}: File divergence found\n${error})`);
    patches[fileName] = given;
    failed = true;
  }

  if (Object.keys(patches).length > 0 && writePatches) {
    let patchesFile = 'patches.json';
    await writeFile(patchesFile, JSON.stringify(patches, null, 2));
    console.log(`\nPatches written to \`${patchesFile}\`.`);
  }

  if (failed == true) {
    console.error(`\n${chalk.red(`Audit failed for ${countFiles(fileCount)}`)} ❌\n`);
    process.exit(1);
  } else {
    console.log(`\n${chalk.green(`Successfully audited ${countFiles(fileCount)}`)} ✅\n`);
  }
}
