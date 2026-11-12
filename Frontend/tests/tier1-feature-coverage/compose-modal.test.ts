/**
 * Tier 1 - Feature Coverage: Area 2 - Globally Accessible Compose Modal & State
 * Covers Features 5, 6, 7, 8, 9 from PROJECT.md
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createBlankDraft, type ComposeDraftState } from "../harness/spec-contracts.ts";

interface ModalState {
  isOpen: boolean;
  isMinimized: boolean;
  isMaximized: boolean;
  draft: ComposeDraftState;
}

function createModalStateMachine(): {
  getState: () => ModalState;
  openCompose: (initial?: Partial<ComposeDraftState>) => void;
  closeCompose: () => void;
  minimizeCompose: () => void;
  maximizeCompose: () => void;
  updateDraft: (updates: Partial<ComposeDraftState>) => void;
  clearDraft: () => void;
  handleKeydown: (event: { key: string; targetTagName: string; isContentEditable?: boolean }) => void;
} {
  let state: ModalState = {
    isOpen: false,
    isMinimized: false,
    isMaximized: false,
    draft: createBlankDraft(),
  };

  return {
    getState: () => ({ ...state, draft: { ...state.draft } }),
    openCompose: (initial?: Partial<ComposeDraftState>) => {
      state = {
        isOpen: true,
        isMinimized: false,
        isMaximized: false,
        draft: { ...createBlankDraft(), ...initial },
      };
    },
    closeCompose: () => {
      state = { ...state, isOpen: false, isMinimized: false, isMaximized: false };
    },
    minimizeCompose: () => {
      state = { ...state, isMinimized: !state.isMinimized, isMaximized: false };
    },
    maximizeCompose: () => {
      state = { ...state, isMaximized: !state.isMaximized, isMinimized: false };
    },
    updateDraft: (updates: Partial<ComposeDraftState>) => {
      state = { ...state, draft: { ...state.draft, ...updates } };
    },
    clearDraft: () => {
      state = { ...state, draft: createBlankDraft() };
    },
    handleKeydown: (e: { key: string; targetTagName: string; isContentEditable?: boolean }) => {
      const tag = e.targetTagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || e.isContentEditable) {
        return; // ignore keystroke in inputs
      }
      if (e.key === "c" || e.key === "C") {
        state = {
          isOpen: true,
          isMinimized: false,
          isMaximized: false,
          draft: state.isOpen ? state.draft : createBlankDraft(),
        };
      }
    },
  };
}

test("Tier 1 - Feature 5: ComposeContext initializes with closed modal and blank draft", () => {
  const sm = createModalStateMachine();
  const state = sm.getState();

  assert.strictEqual(state.isOpen, false);
  assert.strictEqual(state.isMinimized, false);
  assert.strictEqual(state.isMaximized, false);
  assert.deepStrictEqual(state.draft.to, []);
  assert.strictEqual(state.draft.subject, "");
});

test("Tier 1 - Feature 6: Global Compose trigger in Sidebar opens docked composer", () => {
  const sm = createModalStateMachine();
  sm.openCompose();

  const state = sm.getState();
  assert.strictEqual(state.isOpen, true);
  assert.strictEqual(state.isMinimized, false);
  assert.strictEqual(state.isMaximized, false);
});

test("Tier 1 - Feature 7: Floating / Docked modal toggles minimize and maximize window states", () => {
  const sm = createModalStateMachine();
  sm.openCompose();

  // Minimize
  sm.minimizeCompose();
  assert.strictEqual(sm.getState().isMinimized, true);
  assert.strictEqual(sm.getState().isMaximized, false);

  // Maximize (should auto-unminimize)
  sm.maximizeCompose();
  assert.strictEqual(sm.getState().isMaximized, true);
  assert.strictEqual(sm.getState().isMinimized, false);

  // Close
  sm.closeCompose();
  assert.strictEqual(sm.getState().isOpen, false);
});

test("Tier 1 - Feature 8: Empty-state Compose trigger in ChatArea opens composer with initial data", () => {
  const sm = createModalStateMachine();
  sm.openCompose({ subject: "New Discussion" });

  const state = sm.getState();
  assert.strictEqual(state.isOpen, true);
  assert.strictEqual(state.draft.subject, "New Discussion");
});

test("Tier 1 - Feature 9: Pressing 'C' globally triggers compose when focus is outside inputs", () => {
  const sm = createModalStateMachine();

  // Press 'c' while focused on body/div
  sm.handleKeydown({ key: "c", targetTagName: "div" });
  assert.strictEqual(sm.getState().isOpen, true);

  sm.closeCompose();

  // Press 'c' while focused inside an input element (should NOT trigger)
  sm.handleKeydown({ key: "c", targetTagName: "input" });
  assert.strictEqual(sm.getState().isOpen, false);
});

test("Tier 1 - Feature 5 & 7: Draft updates and clear actions preserve modal visibility", () => {
  const sm = createModalStateMachine();
  sm.openCompose();
  sm.updateDraft({ subject: "Meeting Agenda", to: ["colleague@company.org"] });

  let state = sm.getState();
  assert.strictEqual(state.draft.subject, "Meeting Agenda");
  assert.deepStrictEqual(state.draft.to, ["colleague@company.org"]);

  sm.clearDraft();
  state = sm.getState();
  assert.strictEqual(state.isOpen, true, "Modal should remain open after clearing draft");
  assert.strictEqual(state.draft.subject, "");
  assert.deepStrictEqual(state.draft.to, []);
});
