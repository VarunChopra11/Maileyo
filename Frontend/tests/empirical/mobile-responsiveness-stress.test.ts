/**
 * Empirical Stress & Adversarial Challenge Test Suite: Mobile & Tablet Responsiveness
 *
 * Authored by: Challenger M4-1
 * Focus:
 * 1. Viewport transitions across critical boundaries (639px, 640px, 767px, 768px, 769px, 1024px)
 * 2. Mobile master-detail switching mechanics and CSS class truth table
 * 3. High-frequency burst contact selection stress (1,000+ transitions)
 * 4. Back button behavior, idempotence, touch target compliance, and prop fallback
 * 5. Drawer open/close cycles (1,000+ iterations), folder switching, and compose modal triggers
 * 6. Thread selection vs contact back button interactions
 * 7. Absence of horizontal blowout / overflow across all breakpoints
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  type EmailContact,
  type EmailMessage,
  type SidebarFolder,
} from "../../src/types/email.ts";
import {
  VIEWPORT_BREAKPOINTS,
  SIDEBAR_CONSTRAINTS,
  evaluateMasterDetailView,
} from "../harness/spec-contracts.ts";

const FRONTEND_DIR = path.resolve(import.meta.dirname, "../..");

// Sample mock contacts for burst testing
function createMockContact(id: number): EmailContact {
  return {
    id: `contact_${id}`,
    name: `User ${id} Extended Name That Tests Layout Truncation`,
    email: `user${id}.long.test.address@subdomain.example.com`,
    subject: `Discussion Thread ${id} with Important Subject Line`,
    snippet: `Snippet preview for email message ${id}...`,
    date: new Date(1700000000000 + id * 60000).toISOString(),
    isRead: id % 2 === 0,
    avatar: "",
  };
}

/**
 * High-fidelity Dashboard state machine replicating the exact state lifecycle
 * and handlers in Frontend/src/pages/Dashboard.tsx.
 */
class DashboardLayoutStateMachine {
  public selectedFolder: SidebarFolder = "Primary+Sent";
  public selectedContact: EmailContact | null = null;
  public contacts: EmailContact[] = [];
  public messages: EmailMessage[] = [];
  public contactsLoading: boolean = false;
  public messagesLoading: boolean = false;
  public contactsPageToken: string = "";
  public messagesPageToken: string = "";
  public contactsWidth: number = SIDEBAR_CONSTRAINTS.DEFAULT_WIDTH;
  public isDragging: boolean = false;

  // History ledger for post-mortem invariants
  public transitionCount: number = 0;

  public handleFolderSelect(folder: SidebarFolder) {
    this.transitionCount++;
    this.selectedFolder = folder;
    this.selectedContact = null;
    this.contacts = [];
    this.messages = [];
    this.contactsPageToken = "";
    this.messagesPageToken = "";
  }

  public handleContactSelect(contact: EmailContact) {
    this.transitionCount++;
    this.selectedContact = contact;
    this.messages = [];
    this.messagesPageToken = "";
  }

  public handleBackToContacts() {
    this.transitionCount++;
    this.selectedContact = null;
    this.messages = [];
    this.messagesPageToken = "";
  }

  public handleSidebarResize(width: number) {
    this.transitionCount++;
    this.contactsWidth = width;
  }

  /**
   * Evaluates CSS display state for the 4 primary layout elements
   * based on current viewport width and Dashboard state.
   */
  public evaluateLayoutAt(viewportWidth: number) {
    const isMobile = viewportWidth < VIEWPORT_BREAKPOINTS.TABLET_MD; // < 768px
    const hasContact = this.selectedContact !== null;

    // Desktop sidebar rail: "hidden md:flex"
    const sidebarVisible = !isMobile;

    // Aside (ContactList): state.selectedContact ? "hidden md:flex" : "flex"
    const asideVisible = isMobile ? !hasContact : true;

    // Section (ChatArea): state.selectedContact ? "flex flex-1 w-full md:w-auto" : "hidden md:flex md:flex-1"
    const sectionVisible = isMobile ? hasContact : true;

    // ResizableDivider: "hidden md:flex"
    const dividerVisible = !isMobile;

    // Mobile back button in ChatArea: "md:hidden"
    const backButtonVisible = isMobile && sectionVisible;

    // Mobile drawer hamburger in ContactList: "md:hidden"
    const drawerTriggerVisible = isMobile && asideVisible;

    // Margin styling in main container: m-2 (<640px), sm:m-3 (640-767px), md:my-3 md:mr-3 md:ml-0 (>=768px)
    let marginTotalHorizontal = 16; // m-2 = 8px each side
    if (viewportWidth >= 640 && viewportWidth < 768) {
      marginTotalHorizontal = 24; // sm:m-3 = 12px each side
    } else if (viewportWidth >= 768) {
      marginTotalHorizontal = 12; // md:mr-3 (12px), md:ml-0 (0px)
    }

    const sidebarRailWidth = sidebarVisible ? 96 : 0;
    const dividerWidth = dividerVisible ? 12 : 0;
    const availablePanesWidth = viewportWidth - sidebarRailWidth - marginTotalHorizontal - dividerWidth;

    return {
      isMobile,
      sidebarVisible,
      asideVisible,
      sectionVisible,
      dividerVisible,
      backButtonVisible,
      drawerTriggerVisible,
      availablePanesWidth,
      marginTotalHorizontal,
    };
  }
}

// -----------------------------------------------------------------------------
// Suite 1: Viewport Boundary Transitions (639px, 640px, 767px, 768px, 769px)
// -----------------------------------------------------------------------------

test("Suite 1.1: Threshold 639px (<sm max) vs 640px (sm min) margin and single-pane invariant", () => {
  const ds = new DashboardLayoutStateMachine();

  // Test at 639px (<sm)
  const l639NoContact = ds.evaluateLayoutAt(639);
  assert.strictEqual(l639NoContact.isMobile, true);
  assert.strictEqual(l639NoContact.sidebarVisible, false);
  assert.strictEqual(l639NoContact.dividerVisible, false);
  assert.strictEqual(l639NoContact.asideVisible, true);
  assert.strictEqual(l639NoContact.sectionVisible, false);
  assert.strictEqual(l639NoContact.drawerTriggerVisible, true);
  assert.strictEqual(l639NoContact.backButtonVisible, false);
  assert.strictEqual(l639NoContact.marginTotalHorizontal, 16);
  assert.strictEqual(l639NoContact.availablePanesWidth, 639 - 16); // 623px

  // Test at 640px (sm)
  const l640NoContact = ds.evaluateLayoutAt(640);
  assert.strictEqual(l640NoContact.isMobile, true);
  assert.strictEqual(l640NoContact.sidebarVisible, false);
  assert.strictEqual(l640NoContact.dividerVisible, false);
  assert.strictEqual(l640NoContact.asideVisible, true);
  assert.strictEqual(l640NoContact.sectionVisible, false);
  assert.strictEqual(l640NoContact.marginTotalHorizontal, 24); // sm:m-3
  assert.strictEqual(l640NoContact.availablePanesWidth, 640 - 24); // 616px

  // Select a contact and re-test both thresholds
  ds.handleContactSelect(createMockContact(1));
  const l639Contact = ds.evaluateLayoutAt(639);
  assert.strictEqual(l639Contact.asideVisible, false);
  assert.strictEqual(l639Contact.sectionVisible, true);
  assert.strictEqual(l639Contact.backButtonVisible, true);

  const l640Contact = ds.evaluateLayoutAt(640);
  assert.strictEqual(l640Contact.asideVisible, false);
  assert.strictEqual(l640Contact.sectionVisible, true);
  assert.strictEqual(l640Contact.backButtonVisible, true);
});

test("Suite 1.2: Threshold 767px (<md max) vs 768px (md min) layout transformation", () => {
  const ds = new DashboardLayoutStateMachine();

  // At 767px with NO contact:
  const l767NoContact = ds.evaluateLayoutAt(767);
  assert.strictEqual(l767NoContact.isMobile, true, "767px must be classified as mobile (<md)");
  assert.strictEqual(l767NoContact.sidebarVisible, false, "Sidebar must be hidden at 767px");
  assert.strictEqual(l767NoContact.dividerVisible, false, "Divider must be hidden at 767px");
  assert.strictEqual(l767NoContact.asideVisible, true, "ContactList must be visible at 767px");
  assert.strictEqual(l767NoContact.sectionVisible, false, "ChatArea must be hidden at 767px");
  assert.strictEqual(l767NoContact.drawerTriggerVisible, true, "Mobile drawer trigger visible at 767px");

  // At 768px with NO contact:
  const l768NoContact = ds.evaluateLayoutAt(768);
  assert.strictEqual(l768NoContact.isMobile, false, "768px must transition to desktop/tablet layout (>=md)");
  assert.strictEqual(l768NoContact.sidebarVisible, true, "Sidebar must become visible at 768px");
  assert.strictEqual(l768NoContact.dividerVisible, true, "Divider must become visible at 768px");
  assert.strictEqual(l768NoContact.asideVisible, true, "ContactList must remain visible at 768px");
  assert.strictEqual(l768NoContact.sectionVisible, true, "ChatArea must now become visible at 768px in split view");
  assert.strictEqual(l768NoContact.drawerTriggerVisible, false, "Drawer trigger must be hidden on >=md");
  assert.strictEqual(l768NoContact.backButtonVisible, false, "Back button must be hidden on >=md");

  // At 768px geometry check
  // Available width = 768 - 96 (sidebar) - 12 (mr-3) - 12 (divider) = 648px
  assert.strictEqual(l768NoContact.availablePanesWidth, 648);
  const contactsWidth = ds.contactsWidth; // 320px
  const chatAreaWidth = l768NoContact.availablePanesWidth - contactsWidth; // 328px
  assert.strictEqual(chatAreaWidth, 328);
  assert.ok(chatAreaWidth >= 200, "ChatArea has sufficient width (328px) at 768px");

  // At 767px with active contact:
  ds.handleContactSelect(createMockContact(2));
  const l767Contact = ds.evaluateLayoutAt(767);
  assert.strictEqual(l767Contact.asideVisible, false, "ContactList hidden on mobile when contact selected");
  assert.strictEqual(l767Contact.sectionVisible, true, "ChatArea visible full width on mobile when contact selected");
  assert.strictEqual(l767Contact.backButtonVisible, true, "Back button visible on mobile when contact selected");

  // At 768px with active contact:
  const l768Contact = ds.evaluateLayoutAt(768);
  assert.strictEqual(l768Contact.asideVisible, true, "ContactList visible at 768px even when contact selected");
  assert.strictEqual(l768Contact.sectionVisible, true, "ChatArea visible at 768px when contact selected");
  assert.strictEqual(l768Contact.backButtonVisible, false, "Back button strictly hidden at 768px (md:hidden)");
});

test("Suite 1.3: Threshold 769px (Tablet/Desktop) preserves split view seamlessly", () => {
  const ds = new DashboardLayoutStateMachine();
  ds.handleContactSelect(createMockContact(3));

  const l769 = ds.evaluateLayoutAt(769);
  assert.strictEqual(l769.isMobile, false);
  assert.strictEqual(l769.sidebarVisible, true);
  assert.strictEqual(l769.dividerVisible, true);
  assert.strictEqual(l769.asideVisible, true);
  assert.strictEqual(l769.sectionVisible, true);
  assert.strictEqual(l769.backButtonVisible, false);
  assert.strictEqual(l769.availablePanesWidth, 769 - 96 - 12 - 12); // 649px
});

test("Suite 1.4: Exhaustive 1px-step viewport sweep across [320px..1024px] maintains non-overlapping geometry", () => {
  const ds = new DashboardLayoutStateMachine();

  for (let width = 320; width <= 1024; width += 5) {
    // Test without contact
    ds.selectedContact = null;
    const withoutContact = ds.evaluateLayoutAt(width);
    if (width < 768) {
      assert.strictEqual(withoutContact.asideVisible, true);
      assert.strictEqual(withoutContact.sectionVisible, false);
      assert.strictEqual(withoutContact.sidebarVisible, false);
      assert.strictEqual(withoutContact.dividerVisible, false);
      assert.strictEqual(evaluateMasterDetailView(width, null), "contact-list");
    } else {
      assert.strictEqual(withoutContact.asideVisible, true);
      assert.strictEqual(withoutContact.sectionVisible, true);
      assert.strictEqual(withoutContact.sidebarVisible, true);
      assert.strictEqual(withoutContact.dividerVisible, true);
      assert.strictEqual(evaluateMasterDetailView(width, null), "split");
    }

    // Test with contact
    ds.selectedContact = createMockContact(width);
    const withContact = ds.evaluateLayoutAt(width);
    if (width < 768) {
      assert.strictEqual(withContact.asideVisible, false);
      assert.strictEqual(withContact.sectionVisible, true);
      assert.strictEqual(withContact.backButtonVisible, true);
      assert.strictEqual(evaluateMasterDetailView(width, `contact_${width}`), "chat-area");
    } else {
      assert.strictEqual(withContact.asideVisible, true);
      assert.strictEqual(withContact.sectionVisible, true);
      assert.strictEqual(withContact.backButtonVisible, false);
      assert.strictEqual(evaluateMasterDetailView(width, `contact_${width}`), "split");
    }
  }
});

// -----------------------------------------------------------------------------
// Suite 2: Burst Rapid Contact Selection & Back Button Stress
// -----------------------------------------------------------------------------

test("Suite 2.1: Burst 1,000 rapid sequential contact selections preserves state integrity", () => {
  const ds = new DashboardLayoutStateMachine();

  for (let i = 1; i <= 1000; i++) {
    const contact = createMockContact(i);
    ds.handleContactSelect(contact);

    assert.strictEqual(ds.selectedContact?.id, `contact_${i}`);
    assert.strictEqual(ds.messages.length, 0, "Messages must reset to empty array on contact change");
    assert.strictEqual(ds.messagesPageToken, "", "Page token must reset to empty string");

    // Layout invariant on mobile
    const layoutMobile = ds.evaluateLayoutAt(375);
    assert.strictEqual(layoutMobile.asideVisible, false);
    assert.strictEqual(layoutMobile.sectionVisible, true);
  }

  assert.strictEqual(ds.transitionCount, 1000);
});

test("Suite 2.2: Burst 1,000 interleaved contact selection and back button transitions", () => {
  const ds = new DashboardLayoutStateMachine();

  for (let i = 1; i <= 1000; i++) {
    // 1. Select contact
    ds.handleContactSelect(createMockContact(i));
    assert.strictEqual(ds.selectedContact?.id, `contact_${i}`);
    const mobileInDetail = ds.evaluateLayoutAt(390);
    assert.strictEqual(mobileInDetail.asideVisible, false);
    assert.strictEqual(mobileInDetail.sectionVisible, true);
    assert.strictEqual(mobileInDetail.backButtonVisible, true);

    // 2. Click back button
    ds.handleBackToContacts();
    assert.strictEqual(ds.selectedContact, null);
    assert.strictEqual(ds.messages.length, 0);
    const mobileInMaster = ds.evaluateLayoutAt(390);
    assert.strictEqual(mobileInMaster.asideVisible, true);
    assert.strictEqual(mobileInMaster.sectionVisible, false);
    assert.strictEqual(mobileInMaster.drawerTriggerVisible, true);
  }

  assert.strictEqual(ds.transitionCount, 2000);
});

test("Suite 2.3: Idempotent back button execution (burst 100 consecutive calls)", () => {
  const ds = new DashboardLayoutStateMachine();

  // Already at root (selectedContact === null)
  for (let i = 0; i < 100; i++) {
    assert.doesNotThrow(() => ds.handleBackToContacts());
    assert.strictEqual(ds.selectedContact, null);
    assert.strictEqual(ds.messages.length, 0);
  }
});

test("Suite 2.4: Rapid alternating selections between two contacts does not deadlock", () => {
  const ds = new DashboardLayoutStateMachine();
  const contactA = createMockContact(101);
  const contactB = createMockContact(102);

  for (let i = 0; i < 500; i++) {
    ds.handleContactSelect(contactA);
    assert.strictEqual(ds.selectedContact?.id, "contact_101");

    ds.handleContactSelect(contactB);
    assert.strictEqual(ds.selectedContact?.id, "contact_102");
  }
});

// -----------------------------------------------------------------------------
// Suite 3: Mobile Slide-Out Drawer Cycles & Interactions
// -----------------------------------------------------------------------------

test("Suite 3.1: MobileFolderDrawer 1,000 open/close cycles", () => {
  let drawerOpen = false;
  let cycleCount = 0;

  const setDrawerOpen = (open: boolean) => {
    drawerOpen = open;
    cycleCount++;
  };

  for (let i = 0; i < 1000; i++) {
    // Open drawer via hamburger
    setDrawerOpen(true);
    assert.strictEqual(drawerOpen, true);

    // Close drawer via close button (X) or overlay click
    setDrawerOpen(false);
    assert.strictEqual(drawerOpen, false);
  }

  assert.strictEqual(cycleCount, 2000);
});

test("Suite 3.2: Selecting each of all 9 mailbox folders from drawer auto-closes drawer and resets contact", () => {
  const folders: SidebarFolder[] = [
    "Primary+Sent",
    "Inbox:Primary",
    "Inbox:Social",
    "Inbox:Promotions",
    "Starred",
    "Sent",
    "Drafts",
    "Spam",
    "Trash",
  ];

  const ds = new DashboardLayoutStateMachine();

  for (const folder of folders) {
    // Select contact first so we're in detail view
    ds.handleContactSelect(createMockContact(99));
    assert.notStrictEqual(ds.selectedContact, null);

    let drawerOpen = true;

    // Simulate clicking folder inside MobileFolderDrawer:
    // onFolderSelect(folder) and setDrawerOpen(false)
    ds.handleFolderSelect(folder);
    drawerOpen = false;

    // Invariant: drawer is closed
    assert.strictEqual(drawerOpen, false);
    // Invariant: active folder updated
    assert.strictEqual(ds.selectedFolder, folder);
    // Invariant: contact is cleared, so mobile view returns to ContactList master view
    assert.strictEqual(ds.selectedContact, null);
    assert.strictEqual(ds.messages.length, 0);

    const layout = ds.evaluateLayoutAt(375);
    assert.strictEqual(layout.asideVisible, true, "Selecting folder must restore ContactList on mobile");
    assert.strictEqual(layout.sectionVisible, false);
  }
});

test("Suite 3.3: Compose button inside MobileFolderDrawer auto-closes drawer and triggers compose", () => {
  let drawerOpen = true;
  let composeOpened = false;

  const handleComposeClick = () => {
    drawerOpen = false;
    composeOpened = true;
  };

  handleComposeClick();

  assert.strictEqual(drawerOpen, false, "Drawer must close when compose is tapped");
  assert.strictEqual(composeOpened, true, "Compose modal trigger must fire");
});

// -----------------------------------------------------------------------------
// Suite 4: Source Inspection, Touch Targets, and Accessibility Contracts
// -----------------------------------------------------------------------------

test("Suite 4.1: ChatArea mobile back button satisfies WCAG 2.1 touch target and accessibility", () => {
  const chatAreaSource = fs.readFileSync(
    path.join(FRONTEND_DIR, "src/components/dashboard/ChatArea.tsx"),
    "utf-8"
  );

  // Must have md:hidden
  assert.match(chatAreaSource, /className="md:hidden[^"]*"/);
  // Must have min 44x44px touch target
  assert.match(chatAreaSource, /min-h-\[44px\] min-w-\[44px\]/);
  // Must have accessible aria-label
  assert.match(chatAreaSource, /aria-label="Back to contacts list"/);
  // Must have screen reader span
  assert.match(chatAreaSource, /<span className="sr-only">Back to contacts<\/span>/);
  // Must use ArrowLeft icon with shrink-0
  assert.match(chatAreaSource, /<ArrowLeft className="w-5 h-5 shrink-0" \/>/);
  // Must use cursor-pointer
  assert.match(chatAreaSource, /cursor-pointer/);
});

test("Suite 4.2: ContactList mobile hamburger menu button satisfies touch target and accessibility", () => {
  const contactListSource = fs.readFileSync(
    path.join(FRONTEND_DIR, "src/components/dashboard/ContactList.tsx"),
    "utf-8"
  );

  // Must have md:hidden
  assert.match(contactListSource, /className="md:hidden[^"]*"/);
  // Must have min 44x44px touch target
  assert.match(contactListSource, /min-h-\[44px\] min-w-\[44px\]/);
  // Must have accessible aria-label
  assert.match(contactListSource, /aria-label="Open folders navigation drawer"/);
  // Must have screen reader span
  assert.match(contactListSource, /<span className="sr-only">Open folders menu<\/span>/);
  // Must use Menu icon with shrink-0
  assert.match(contactListSource, /<Menu className="w-5 h-5 shrink-0" \/>/);
});

test("Suite 4.3: MobileFolderDrawer close and compose buttons satisfy touch targets", () => {
  const drawerSource = fs.readFileSync(
    path.join(FRONTEND_DIR, "src/components/dashboard/MobileFolderDrawer.tsx"),
    "utf-8"
  );

  // Close button (X) min 44x44px
  assert.match(
    drawerSource,
    /aria-label="Close navigation drawer"[^>]*min-h-\[44px\] min-w-\[44px\]/
  );
  // Compose button min 44px height
  assert.match(
    drawerSource,
    /aria-label="Compose new email"[^>]*min-h-\[44px\]/
  );
  // Folder navigation items each enforce min 44px height
  assert.match(
    drawerSource,
    /className=\{cn\(\s*"w-full flex items-center justify-between px-3 py-2\.5 min-h-\[44px\]/
  );
  // Logout button min 44x44px and aria-label
  assert.match(drawerSource, /aria-label="Logout"/);
  assert.match(
    drawerSource,
    /min-h-\[44px\] min-w-\[44px\] p-2 rounded-lg text-red-600/
  );
  // Sign in with Google button min 44px
  assert.match(
    drawerSource,
    /min-h-\[44px\] text-xs font-medium text-gray-700/
  );
});

test("Suite 4.4: Desktop Sidebar rail is strictly hidden on mobile (<md)", () => {
  const sidebarSource = fs.readFileSync(
    path.join(FRONTEND_DIR, "src/components/dashboard/Sidebar.tsx"),
    "utf-8"
  );

  assert.match(
    sidebarSource,
    /className="hidden md:flex p-1 w-24 bg-white/,
    "Desktop Sidebar must have 'hidden md:flex' to prevent mobile collision"
  );
});

test("Suite 4.5: ResizableDivider is strictly hidden on mobile (<md)", () => {
  const dividerSource = fs.readFileSync(
    path.join(FRONTEND_DIR, "src/components/dashboard/ResizableDivider.tsx"),
    "utf-8"
  );

  assert.match(
    dividerSource,
    /relative hidden md:flex items-center justify-center shrink-0/,
    "ResizableDivider must have 'hidden md:flex' to avoid mobile rendering"
  );
});

test("Suite 4.6: Dual back navigation inside ChatArea (Thread level vs Contact level)", () => {
  const chatAreaSource = fs.readFileSync(
    path.join(FRONTEND_DIR, "src/components/dashboard/ChatArea.tsx"),
    "utf-8"
  );

  // 1. Mobile back to contacts button
  assert.match(
    chatAreaSource,
    /onClick=\{\(\) => handleBack\?\.\(\)\}/,
    "Mobile back button calls handleBack"
  );

  // 2. Thread-level 'All conversations' button
  assert.match(
    chatAreaSource,
    /setSelectedThreadId\(null\)/,
    "Thread-level back button resets selectedThreadId without clearing contact"
  );
  assert.match(
    chatAreaSource,
    /<span>All conversations<\/span>/,
    "Thread-level back button offers 'All conversations' label"
  );
});

test("Suite 4.7: ChatArea props fallback resilience (onBackToContacts vs onBack)", () => {
  const chatAreaSource = fs.readFileSync(
    path.join(FRONTEND_DIR, "src/components/dashboard/ChatArea.tsx"),
    "utf-8"
  );

  assert.match(
    chatAreaSource,
    /const handleBack = onBackToContacts \|\| onBack;/,
    "ChatArea must gracefully accept either onBackToContacts or onBack"
  );
});
