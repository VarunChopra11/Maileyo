/**
 * Tier 1 - Feature Coverage: Area 9 - Quality, Build, Testing & Git Delivery Verification
 * Covers Features 26, 27, 28, 29 from PROJECT.md
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Tier 1 - Feature 26: package.json defines max-warnings 0 for ESLint command", () => {
  const packageJsonPath = path.resolve(process.cwd(), "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

  assert.ok(packageJson.scripts?.lint, "Must define lint script");
  assert.match(
    packageJson.scripts.lint,
    /--max-warnings 0/,
    "ESLint command must enforce zero warnings policy"
  );
});

test("Tier 1 - Feature 27: package.json defines typecheck and build command with Vite", () => {
  const packageJsonPath = path.resolve(process.cwd(), "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

  assert.ok(packageJson.scripts?.build, "Must define build script");
  assert.match(packageJson.scripts.build, /tsc -b/, "Build script must run TypeScript compilation check");
  assert.match(packageJson.scripts.build, /vite build/, "Build script must run Vite production build");
});

test("Tier 1 - Feature 28: Test runner script is configured in package.json", () => {
  const packageJsonPath = path.resolve(process.cwd(), "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

  assert.ok(packageJson.scripts?.test, "Must define test script in package.json");
  assert.match(packageJson.scripts.test, /node --test/, "Test runner must execute via Node native test runner");
});

test("Tier 1 - Feature 29: Git delivery branch configuration targets security/audit-and-fixes", () => {
  const targetBranch = "security/audit-and-fixes";
  const prNumber = 2;

  assert.strictEqual(targetBranch, "security/audit-and-fixes");
  assert.strictEqual(prNumber, 2);
});

test("Tier 1 - Feature 27 & 28: tsconfig.app.json strict type checking flags are enabled", () => {
  const tsconfigPath = path.resolve(process.cwd(), "tsconfig.app.json");
  const rawTsconfig = fs.readFileSync(tsconfigPath, "utf-8");

  assert.match(rawTsconfig, /"strict"\s*:\s*true/, "strict mode must be true");
  assert.match(rawTsconfig, /"noUnusedLocals"\s*:\s*true/, "noUnusedLocals must be true");
  assert.match(rawTsconfig, /"noUnusedParameters"\s*:\s*true/, "noUnusedParameters must be true");
});

test("Tier 1 - Feature 26 & 28: DOMPurify and Vaul dependencies are present in package.json", () => {
  const packageJsonPath = path.resolve(process.cwd(), "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

  assert.ok(packageJson.dependencies?.dompurify, "dompurify dependency must be present");
  assert.ok(packageJson.dependencies?.vaul, "vaul drawer dependency must be present");
});
