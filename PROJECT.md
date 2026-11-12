# Project: Maileyo UI/UX Improvements & Feature Completeness (PR #2)

## Architecture
- **Framework & Runtime**: React 18.3.1, TypeScript 5.2.2/5.9.2, Vite 7.1.3, Tailwind CSS 3.4.17, Radix UI primitives, `vaul` drawer, `lucide-react`, `DOMPurify`.
- **Backend Services**: FastAPI on Python, dual-mounted `/emails/send` and `/api/v1/emails/send` handling `SendEmailRequest` with Gmail API integration.
- **State Management**:
  - `Dashboard.tsx` manages folder selection, contact selection, contact list, and messages.
  - `ComposeContext` (`useCompose`) manages global compose modal state (isOpen, isMinimized, isMaximized, draft, mode, reply/forward headers, attachments).
  - `localStorage` manages user preferences (contacts sidebar width: `maileyo_contacts_panel_width`).
- **Layout Architecture**:
  - Desktop (>= md): 3-column layout (Sidebar icon rail 96px, Resizable Contacts panel 260px–500px with draggable divider, Reading Pane flex-1).
  - Mobile (< md): Master-detail single-pane layout. `ContactList` full-width when no contact selected; `ChatArea` full-width with responsive Back button when contact selected; `Sidebar` accessible via slide-out drawer (`vaul`).

## Feature Inventory
Every feature from the Survey phase appears here with its assigned milestone:
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Resizable Contacts Divider | Draggable divider between aside and section with col-resize handle | M1 | R2 |
| 2 | Sidebar Width Boundary Clamping | Enforce 260px minimum and 500px maximum width | M1 | R2 |
| 3 | Sidebar Width Persistence | Persist custom sidebar width across reloads in localStorage | M1 | R2 |
| 4 | Double-Click Reset Width | Double-clicking divider resets to default 320px | M1 | R2 |
| 5 | ComposeContext & Provider | Centralized state for global composer (draft, window state, reply/forward mode) | M2 | R3 |
| 6 | Global Compose Trigger in Sidebar | Prominent "Compose" button in Sidebar navigation rail | M2 | R3 |
| 7 | Floating / Docked Compose Modal | Gmail-style bottom-right docked modal (normal, minimized, maximized) | M2 | R3 |
| 8 | Empty-State Compose Trigger | "Compose New Email" button inside ChatArea when no contact selected | M2 | R3 |
| 9 | Keyboard Shortcut for Compose | Pressing 'C' globally opens composer when not in input/textarea | M2 | R3 |
| 10 | Recipient Chip Management | Tokenized email chips for To, CC, BCC on Enter, Tab, Comma, Space, Paste | M3 | R4 |
| 11 | Recipient Email Validation | RFC 5322 regex validation with red badge highlight for invalid addresses | M3 | R4 |
| 12 | Recipient Contact Autocomplete | Dropdown suggestions filtering contacts from active contact list | M3 | R4 |
| 13 | Collapsible CC & BCC Rows | Expand/collapse buttons for CC and BCC input lines | M3 | R4 |
| 14 | WYSIWYG Rich-Text Editor | ContentEditable editor with Bold, Italic, Underline, Strikethrough, Lists, Links | M3 | R4 |
| 15 | HTML Sanitization | Sanitize rich text using DOMPurify before submission | M3 | R4 |
| 16 | Attachment Selection & Drag-and-Drop | File picker and drag-and-drop file target on composer | M3 | R4 |
| 17 | Attachment List & Size Validation | File pills with remove buttons and 20MB total attachment limit check | M3 | R4 |
| 18 | Backend Send API Integration | Connect to `/api/v1/emails/send` with proper headers, payload and types | M3 | R4 |
| 19 | Error Feedback & Draft Retention | Propagate backend error details without losing composed draft on failure | M3 | R4 |
| 20 | Reply & Forward Workflows | Integrate Reply and Forward actions from MessageBubble into composer | M3 | R4 |
| 21 | Mobile Master-Detail Switching | Toggle ContactList vs ChatArea full-width based on selectedContact on <md | M4 | R1 |
| 22 | Mobile Back Navigation | Header back button in ChatArea on <md returning to ContactList | M4 | R1 |
| 23 | Mobile Sidebar Drawer | Slide-out folder drawer using vaul triggered from ContactList header | M4 | R1 |
| 24 | Tablet Viewport Adaptations | Refine layout, spacing, and composer inputs for 768px tablet screens | M4 | R1 |
| 25 | Overflow & Clipping Fixes | Eliminate horizontal scrollbars, truncate long headers, wrap bubbles cleanly | M4 | R1 |
| 26 | ESLint Zero-Error Cleanup | Resolve all 28 linter errors and 10 warnings for `npm run lint` compliance | M5 | R5 |
| 27 | TypeScript & Build Verification | Guarantee `npm run build` passes with zero errors | M5 | R5 |
| 28 | Comprehensive E2E Testing Pass | Execute and pass 100% of requirement-driven test cases (Tiers 1-4) | M5 | R5 |
| 29 | Git PR #2 Branch Delivery | Commit clean commits and push to `security/audit-and-fixes` updating PR #2 | M5 | R5 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Resizable Contacts Sidebar | Features 1, 2, 3, 4 | none | DONE |
| M2 | Globally Accessible Compose Modal | Features 5, 6, 7, 8, 9 | none | DONE |
| M3 | Production Email Composer | Features 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20 | M2 | PLANNED |
| M4 | Comprehensive UI Responsiveness | Features 21, 22, 23, 24, 25 | M1 | DONE |
| M5 | Quality, E2E Verification & Git Delivery | Features 26, 27, 28, 29 | M1, M2, M3, M4 | PLANNED |

## Interface Contracts

### ComposeContext ↔ ComposeModal & Dashboard
```typescript
export interface ComposeDraft {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  bodyHtml: string;
  bodyPlain: string;
  attachments: File[];
  threadId?: string;
  inReplyTo?: string;
  references?: string;
  replyMode?: "new" | "reply" | "forward";
}

export interface ComposeContextType {
  isOpen: boolean;
  isMinimized: boolean;
  isMaximized: boolean;
  draft: ComposeDraft;
  openCompose: (initial?: Partial<ComposeDraft>) => void;
  openReply: (message: EmailMessage, threadId?: string) => void;
  openForward: (message: EmailMessage) => void;
  closeCompose: () => void;
  minimizeCompose: () => void;
  maximizeCompose: () => void;
  updateDraft: (updates: Partial<ComposeDraft>) => void;
  clearDraft: () => void;
}
```

### Dashboard ↔ Draggable Divider
- `contactsWidth`: number (state, default 320, clamped between 260 and 500).
- `onResize`: `(newWidth: number) => void`.
- `onResizeEnd`: `(finalWidth: number) => void` (saves to `localStorage`).
- Key in localStorage: `"maileyo_contacts_panel_width"`.

### ChatArea ↔ Dashboard (Mobile Back Navigation)
- `onBackToContacts`: `() => void` (sets `selectedContact = null` in `DashboardState`).

### emailService.sendEmail ↔ Backend `/api/v1/emails/send`
- Request payload:
```json
{
  "to": ["user@example.com"],
  "subject": "Hello",
  "body_plain": "Plain text",
  "body_html": "<p>Plain text</p>",
  "cc": [],
  "bcc": [],
  "thread_id": "optional-id",
  "in_reply_to": "optional-id",
  "references": "optional-id",
  "attachments": [
    {
      "filename": "document.pdf",
      "content": "<base64_encoded_data>",
      "mimeType": "application/pdf"
    }
  ]
}
```
- Response:
```json
{
  "message_id": "msg-id",
  "thread_id": "thread-id",
  "status": "sent",
  "sent_at": "2026-11-11T..."
}
```
- Error: HTTP 422 / 400 / 500 with `{ "detail": "..." }`.

## Code Layout
- `Frontend/src/pages/Dashboard.tsx` — Main dashboard layout, sidebar width state, divider integration, responsive pane switching.
- `Frontend/src/components/dashboard/Sidebar.tsx` — Navigation rail, Compose trigger button, mobile drawer integration.
- `Frontend/src/components/dashboard/ContactList.tsx` — Contacts sidebar list, mobile drawer trigger header.
- `Frontend/src/components/dashboard/ChatArea.tsx` — Reading pane, mobile back navigation button, responsive thread layout.
- `Frontend/src/components/dashboard/MessageBubble.tsx` — Email message display, Reply and Forward action triggers.
- `Frontend/src/components/dashboard/ComposeModal.tsx` — Floating/docked modal container (normal, minimized, maximized).
- `Frontend/src/components/dashboard/RecipientInput.tsx` — Email chip/tag input with RFC validation and contact autocomplete.
- `Frontend/src/components/dashboard/RichTextEditor.tsx` — ContentEditable WYSIWYG editor with formatting toolbar and DOMPurify.
- `Frontend/src/components/dashboard/ResizableDivider.tsx` — Draggable divider handle with mouse/touch window handlers.
- `Frontend/src/context/ComposeContext.tsx` — React context and hook for global email composing.
- `Frontend/src/services/emailService.ts` — API client with error detail propagation.
- `Frontend/src/types/email.ts` — TypeScript models for email messages, compose draft, send requests, and responses.
