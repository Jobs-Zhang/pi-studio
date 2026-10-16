import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FULL_LINT_TRIGGERS = new Set([
  "eslint.config.js",
  "tsconfig.json",
]);

const LINTABLE_ROOT_FILES = new Set([
  "vite.config.ts",
  "vitest.artifacts.config.ts",
]);

const LINTABLE_DIRECTORIES = [
  "extensions/",
  "pi-studio-plugins/",
  "pi-packages/",
  "src/",
];

function parseNullDelimitedPaths(output) {
  const value = Buffer.isBuffer(output) ? output.toString("utf8") : output;
  return value.split("\0").filter((path) => path.length > 0);
}

export function createValidationPlan(stagedPaths, options = {}) {
  const pathExists = options.pathExists ?? existsSync;
  const paths = [...new Set(stagedPaths.map(normalizeRepoPath).filter((path) => path.length > 0))].sort();

  const lint = paths.some((path) => FULL_LINT_TRIGGERS.has(path))
    ? { mode: "full", files: [] }
    : scopedValidation(paths.filter((path) => isLintablePath(path) && pathExists(path)), "scoped");

  return { paths, lint };
}

export function createValidationSteps(plan) {
  const steps = [
    {
      label: "cached whole-project typecheck",
      npmArgs: ["run", "typecheck:cached"],
    },
    {
      label: "whole-project Knip analysis",
      npmArgs: ["run", "knip"],
    },
  ];

  if (plan.lint.mode === "full") {
    steps.push({ label: "full ESLint validation (configuration changed)", npmArgs: ["run", "lint"] });
  } else if (plan.lint.mode === "scoped") {
    steps.push({
      label: `ESLint validation for ${String(plan.lint.files.length)} staged file(s)`,
      npmArgs: ["exec", "--", "eslint", "--", ...plan.lint.files],
    });
  }

  return steps;
}

function readStagedPaths() {
  const output = execFileSync(
    "git",
    ["diff", "--cached", "--name-only", "--diff-filter=ACMRD", "-z"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  return parseNullDelimitedPaths(output);
}

function isLintablePath(path) {
  if (LINTABLE_ROOT_FILES.has(path)) return true;
  return path.endsWith(".ts") && LINTABLE_DIRECTORIES.some((directory) => path.startsWith(directory));
}

function normalizeRepoPath(path) {
  return path.replaceAll("\\", "/").replace(/^\.\//u, "");
}

function scopedValidation(files, mode) {
  return files.length > 0 ? { mode, files } : { mode: "skip", files: [] };
}

function runNpmStep(step) {
  console.log(`\n[pre-commit] ${step.label}`);
  const invocation = npmInvocation(step.npmArgs);
  const result = spawnSync(invocation.command, invocation.args, { stdio: "inherit" });
  if (result.error !== undefined) throw result.error;
  return result.status ?? 1;
}

function npmInvocation(npmArgs) {
  const npmExecPath = process.env["npm_execpath"];
  if (npmExecPath !== undefined && npmExecPath.length > 0) {
    return { command: process.execPath, args: [npmExecPath, ...npmArgs] };
  }
  return {
    command: process.platform === "win32" ? "npm.cmd" : "npm",
    args: npmArgs,
  };
}

function main() {
  const plan = createValidationPlan(readStagedPaths());
  console.log(`[pre-commit] Planning validation for ${String(plan.paths.length)} staged file(s).`);

  for (const step of createValidationSteps(plan)) {
    const status = runNpmStep(step);
    if (status !== 0) return status;
  }

  if (plan.lint.mode === "skip") console.log("\n[pre-commit] No staged files require ESLint.");
  return 0;
}

function isDirectExecution() {
  const entryPath = process.argv[1];
  if (entryPath === undefined) return false;
  return pathToFileURL(resolve(entryPath)).href === import.meta.url;
}

if (isDirectExecution()) {
  try {
    process.exitCode = main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[pre-commit] ${message}`);
    process.exitCode = 1;
  }
}
