# Test Infrastructure Specification: Maileyo E2E Test Suite

## Overview
The Maileyo E2E test suite provides a comprehensive, opaque-box, requirement-driven verification harness covering all 29 features from `PROJECT.md § Feature Inventory` across 4 testing tiers.

## Architecture & Toolchain
- **Runtime Environment**: Node.js `v26.13.0` with native ESM and TypeScript type stripping (`--experimental-strip-types`).
- **Test Runner**: Node Native Test Runner (`node:test`, `node:assert/strict`).
- **Zero-Footprint Integration**: Standard `npm test` script registered in `Frontend/package.json`. No heavy external browser binaries (Puppeteer/Playwright) or bundling overhead required for fast deterministic CI/CD execution.
- **Production Isolation**: Tests reside in `Frontend/tests/`, strictly isolated from `Frontend/src/` to prevent interference with production bundling (`tsc -b && vite build`).
- **Lint Compliance**: ESLint verified clean (0 errors, 0 warnings) with strict TypeScript types and no unused symbols.

## Directory Structure
```
Frontend/tests/
├── harness/
│   ├── dom-harness.ts            # Isolated MockWindow, MockLocalStorage, MockFile, and event dispatchers
│   ├── spec-contracts.ts         # Authoritative business logic, algorithms, regex, and interface constants
│   └── mock-api.ts               # Simulated FastAPI /api/v1/emails/send server with schema validation
├── tier1-feature-coverage/        # Tier 1: Isolated Happy-Path Feature Coverage (54 tests, >=5 per area)
│   ├── sidebar-divider.test.ts   # Features 1, 2, 3, 4 (Divider, clamping, persistence, double-click)
│   ├── compose-modal.test.ts     # Features 5, 6, 7, 8, 9 (Context, trigger, docked modal, empty state, shortcut 'C')
│   ├── recipient-chips.test.ts   # Features 10, 11, 12, 13 (Chips, RFC 5322 regex, autocomplete, collapsible CC/BCC)
│   ├── editor-sanitization.test.ts # Features 14, 15 (WYSIWYG formatting, DOMPurify sanitization)
│   ├── attachments.test.ts       # Features 16, 17 (File selection, pills, 20MB limit validation)
│   ├── api-send-errors.test.ts   # Features 18, 19 (FastAPI payload construction, error propagation, draft retention)
│   ├── reply-forward.test.ts     # Feature 20 (Reply & Forward header/quotation generation)
│   ├── mobile-responsiveness.test.ts # Features 21, 22, 23, 24, 25 (Master-detail, back nav, drawer, tablet, overflow)
│   └── build-delivery.test.ts    # Features 26, 27, 28, 29 (Lint compliance, build verification, PR delivery)
├── tier2-boundary-corner/         # Tier 2: Boundary & Corner Cases (28 tests)
│   ├── boundary-limits.test.ts   # 260px/500px clamping, micro-deltas, corrupted localStorage, 20MB exact bounds
│   ├── recipient-validation-adversarial.test.ts # RFC 5322 edge cases, 254-char max, delimiter clusters, deduplication
│   ├── sanitization-xss.test.ts  # Adversarial XSS injections, script tags, iframes, onerror handlers, data: URIs
│   └── draft-edge-cases.test.ts  # 500-char subject limits, Unicode/international filenames, blank draft invariants
├── tier3-cross-feature/           # Tier 3: Pairwise Feature Combinations (8 tests)
│   └── cross-feature-interactions.test.ts # Resizing while composing, mobile view switching with active draft,
│                                          # contact list switching vs draft isolation, API retry with rich text & files
└── tier4-real-world-scenarios/    # Tier 4: Multi-Step Real-World User Workflows (5 tests)
    └── scenarios.test.ts         # User onboarding, mobile triage & reply, forward with autocomplete,
                                  # network outage recovery, and adversarial XSS/attachment defense
```

## Running the Tests

### Execute Entire Suite (All Tiers)
```bash
cd Frontend
npm test
```
*or directly with Node:*
```bash
cd Frontend
node --test 'tests/**/*.test.ts'
```

### Execute by Individual Tier
```bash
cd Frontend

# Tier 1 - Feature Coverage
node --test 'tests/tier1-feature-coverage/*.test.ts'

# Tier 2 - Boundary & Corner Cases
node --test 'tests/tier2-boundary-corner/*.test.ts'

# Tier 3 - Cross-Feature Combinations
node --test 'tests/tier3-cross-feature/*.test.ts'

# Tier 4 - Real-World Application Scenarios
node --test 'tests/tier4-real-world-scenarios/*.test.ts'
```

## Performance & Execution Statistics
- **Total Tests**: 95 tests across 4 tiers.
- **Pass Rate**: 100% (95 passing, 0 failing, 0 skipped).
- **Execution Time**: ~1.1 to 1.3 seconds for the entire suite.
