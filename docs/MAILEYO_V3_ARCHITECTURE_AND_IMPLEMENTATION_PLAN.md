# Maileyo V3: Production Architecture & Implementation Blueprint

> **Status:** Production-Ready Architectural Specification & Implementation Plan  
> **Target Version:** Maileyo V3 (AI-Native, Contact-Centric Email Client)  
> **Author:** Senior Staff Software Architect & Full-Stack Systems Engineer  
> **Date:** September 2026  
> **Repository Target:** `VarunChopra11/Maileyo` (`Backend/`, `Frontend/`, `docs/`)

---

## 1. Executive Summary

Maileyo is an AI-first email client that reimagines email communication through a contact-centric, chat/WhatsApp-style paradigm while preserving the underlying power and semantics of Gmail.

### Current State (V1/V2 Baseline Audit)
The current codebase consists of a **FastAPI** backend (`Backend/`) and a **Vite + React + Tailwind + Redux Toolkit** frontend (`Frontend/`). While the project demonstrates an innovative contact-based conversation UI concept, a forensic audit reveals severe architectural deficiencies, security vulnerabilities, rendering bugs, and broken threading logic:
1. **Broken Threading & Contact Flattening:** Emails are queried purely by sender/recipient (`from:{contact} OR to:{contact}`) and flattened into a single timestamp-sorted array. Distinct Gmail threads (topics, invoices, negotiations) are incorrectly interleaved. Outgoing replies create orphaned messages without `In-Reply-To`, `References`, or `threadId`.
2. **Email Rendering Failure (Raw HTML/Text):** The frontend parser (`ChatArea.tsx`) fails to handle single-part HTML messages (looking only in `payload.parts`), ignores nested MIME structures (`multipart/mixed -> multipart/related -> multipart/alternative`), and uses deprecated `escape(atob())` which crashes on multi-byte UTF-8, dumping raw HTML or raw base64.
3. **Severe Security Vulnerabilities:** Unsanitized `dangerouslySetInnerHTML` in `MessageBubble.tsx` allows arbitrary Stored XSS via incoming emails. Cookie domains are hardcoded to `.maileyo.in`, breaking local development. Synchronous network calls (`requests.post`, `time.sleep`) block the async event loop.
4. **Token Refresh Flaw:** Refreshed Google OAuth tokens are never saved back to MongoDB, forcing synchronous refresh calls on every subsequent request.
5. **Absent AI & RAG Infrastructure:** Redux contains placeholder slices (`modelMessageSlice`, `userMessageSlice`) and a mock UI (`chat-card.tsx`), but no embeddings, vector storage, retrieval pipeline, or LLM agent exists.

### The V3 Strategic Vision
Maileyo V3 transforms this prototype into an enterprise-grade, privacy-first, AI-native email workspace:
* **The Contact + Thread UX Paradigm:** Preserves the natural, intuitive contact-centric chat stream while introducing distinct, navigable **Thread Containers** within each contact view. Threads maintain visual boundaries, separate subject lines, independent reply contexts, and explicit thread state.
* **Zero-Body-Persistence RAG Architecture:** Strictly compliant with enterprise privacy and Google OAuth Restricted Scopes. **No email body content is ever stored in MongoDB.** Only metadata (IDs, timestamps, headers, thread relations) and dense vector embeddings (generated from sanitized snippets/bodies) are indexed in MongoDB Atlas Vector Search. Grounded LLM generation re-fetches fresh email content directly from Gmail API in real time.
* **Transparent AI Availability:** A subtle, accessible UI indicator (`✨ AI-Indexed` badge) communicates exactly which messages and threads have completed vector indexing and are available to the Maileyo AI Copilot.
* **Autonomous Email Agent:** A thread-aware AI agent equipped with tool-calling capabilities (search, synthesize, draft, verify, follow-up) that operates across contact and thread boundaries without hallucinations.
* **Hardened Full-Stack Architecture:** Python-based MIME normalization on the backend, sandboxed Shadow DOM / iframe rendering with DOMPurify on the frontend, background job processing with Celery/Redis, incremental Gmail History API sync, and optimistic React Query state management.

---

## 2. Existing Architecture Audit

### 2.1 Backend Architecture (`Backend/`)
The backend is built with FastAPI 0.115.13 and Motor 3.7.1 (async MongoDB driver).

```
Backend/
├── main.py                          # Application entrypoint & CORS
├── requirements.txt                 # Dependencies
├── api/v1/
│   ├── config.py                    # Environment & Fernet encryption key setup
│   ├── db/
│   │   ├── init_db.py               # Database lifecycle hooks
│   │   └── session.py               # Motor client singleton
│   ├── schemas/
│   │   ├── emails.py                # Pydantic models for emails
│   │   └── users.py                 # Pydantic models for OAuth & Users
│   ├── routers/
│   │   ├── auth_routers/google.py   # Google OAuth login, callback, user profile
│   │   └── email_routers/emails.py  # Email fetch, fetch-by-contact, send, attachment
│   ├── services/
│   │   ├── auth_services/google.py  # OAuth code exchange, Fernet encryption
│   │   └── email_services/gmail_service.py # Gmail REST API interactions
│   └── utils/
│       ├── jwt.py                   # JWT access token generation
│       ├── tokens.py                # Token extraction, Fernet decrypt, refresh
│       ├── validate_scopes.py       # OAuth scope verification
│       └── verify_id_token.py       # Google ID token verification
```

#### Detailed Findings & Architectural Assessment:
* **Application Lifecycle (`main.py:9-14`):** Uses modern FastAPI `lifespan` context manager to call `init_db()` and `close_db()`.
* **CORS Configuration (`main.py:17-28`):** Hardcoded origins `https://app.maileyo.in` and `http://localhost:8080`. Developers running Vite on standard `http://localhost:5173` are blocked by CORS.
* **Configuration Management (`config.py`):** `AuthConfig` and `DBConfig` call `load_dotenv(override=True)` on every class initialization. Properties evaluate environment variables on every access. `FERNET_KEY` is derived dynamically by slicing/padding a raw string with base64 without checking key length validity.
* **Database Session (`session.py`):** `DatabaseSession` exposes class-level `client` and `db`. Connection pooling is configured (`maxPoolSize=100`, `minPoolSize=10`), but no indexes or collections are initialized upon startup.
* **Authentication & Token Storage (`services/auth_services/google.py` & `schemas/users.py`):**
  * Tokens are encrypted using symmetric Fernet encryption before storing in the `users` collection.
  * Line 104 in `google.py`: `refresh_expires_in = token_data.get("refresh_token_expires_in")`. Line 112 checks `if not refresh_expires_in or refresh_expires_in <= 0:` and raises an HTTP 400 exception. **Google OAuth 2.0 Web Server Flow does NOT return `refresh_token_expires_in`** for standard offline access tokens! This causes OAuth callbacks to fail outright for standard Google credentials.
  * Hardcoded cookie domain `.maileyo.in` in `google.py:48` and `google.py:94`. Cookies cannot be stored or transmitted when developing locally on `localhost`.
* **Token Management (`utils/tokens.py`):**
  * `refresh_access_token` (`tokens.py:98-129`): Uses synchronous `requests.post()` inside an async framework, blocking the event loop.
  * **Critical Bug (`tokens.py:159-166`):** When `get_access_token` refreshes an expired access token, it returns `refreshed["access_token"]` directly **without updating MongoDB**. The expired token and expiration timestamp remain unchanged in the database. Consequently, every subsequent API call triggers another synchronous token refresh against Google's servers.
* **Scope Drift (`utils/validate_scopes.py` vs `services/auth_services/google.py`):**
  * `validate_scopes.py:7-13` defines 5 required scopes: `openid`, `email`, `profile`, `gmail.readonly`, `gmail.send`.
  * `google.py:18-26` requests 7 scopes, adding `gmail.compose` and `gmail.modify`. If Google collapses or normalizes these scopes, authentication validation produces false-negative 403 errors.
* **Gmail Batch Processing (`gmail_service.py:85-173`):**
  * Implements batch fetching by manually assembling a `multipart/mixed` HTTP request string to `https://www.googleapis.com/batch/gmail/v1` and manually parsing the response lines using regex and string splitting.
  * Google has announced the deprecation of global HTTP batch endpoints. Furthermore, hand-crafted HTTP boundary parsing breaks when response chunks contain nested headers or alternate CRLF line breaks.
* **Contact Fetch Logic (`gmail_service.py:222-250`):**
  * Queries Gmail using `from:{email} OR to:{email}`.
  * Side effect: Lines 244-249 automatically schedule `mark_messages_as_read` on all fetched messages in `BackgroundTasks`. Opening a contact unconditionally marks their unread emails as read in Gmail, even if the user never scrolled to or viewed those messages!
* **Send Email Logic (`gmail_service.py:259-307`):**
  * Accepts `to: str`, whereas `schemas/emails.py:79` specifies `to: List[EmailStr]`. Passing a list causes string representation `['user@domain.com']` to be inserted into the `To:` header.
  * Does not support `threadId`, `In-Reply-To`, or `References`. Replies cannot be attached to existing threads.

---

### 2.2 Frontend Architecture (`Frontend/`)
The frontend is built with React 18, TypeScript 5.2, Vite 7.1, Tailwind CSS, Redux Toolkit, and Radix UI primitives.

```
Frontend/src/
├── App.tsx                          # App shell, routing container, Toast notifications
├── main.tsx                         # Providers (Kinde, Redux, React Router)
├── api/api.ts                       # Generic axios instance
├── services/
│   └── emailService.ts              # Email API client
├── types/
│   └── email.ts                     # TypeScript interfaces
├── store/
│   ├── store.ts                     # Redux store configuration
│   └── services/                    # Redux slices (auth, userMessage, modelMessage)
├── lib/
│   ├── auth.ts                      # Current user fetcher & login redirect
│   └── utils.ts                     # Classnames utility (clsx + twMerge)
├── pages/
│   ├── Home.tsx                     # Landing page
│   ├── Dashboard.tsx                # Email dashboard state container
│   └── EmailDisplay.tsx             # Commented-out test page
└── components/
    └── dashboard/
        ├── Sidebar.tsx              # Folder navigation & user profile
        ├── ContactList.tsx           # Contact list & infinite scroll
        ├── ChatArea.tsx              # Conversation view & email parsing
        ├── MessageBubble.tsx         # Message rendering & attachment downloads
        └── ComposeMessage.tsx        # Message composition & formatting
```

#### Detailed Findings & Architectural Assessment:
* **Dead / Unused Dependencies (`package.json` & `main.tsx`):**
  * Wrapped with `@kinde-oss/kinde-auth-react` in `main.tsx:100-112`, but authentication is actually handled by backend Google OAuth cookies. Kinde is completely unused and initializes redundant state.
  * Redux slices `userMessageSlice.ts` and `modelMessageSlice.ts` store arrays of strings for a mock AI conversation (`chat-card.tsx`), but are completely disconnected from the actual dashboard.
* **State Architecture Bottleneck (`pages/Dashboard.tsx`):**
  * State is held in a single monolithic `DashboardState` (`selectedFolder`, `selectedContact`, `contacts`, `messages`, `contactsLoading`, `messagesLoading`, `contactsPageToken`, `messagesPageToken`).
  * No query caching (no React Query / SWR). Clicking between contacts causes entire message threads to be destroyed and re-fetched. Folder changes wipe all contact state.
* **Contact Entity Misrepresentation (`ContactList.tsx:85-98`):**
  * The frontend calls `/emails/fetch` (which returns individual Gmail messages) and maps **every message into a contact**:
    ```typescript
    const newContacts: EmailContact[] = emailsArray.map((email: RawEmail) => {
      const { contactName, contactEmail } = extractContactInfo(email.payload?.headers, currentUser?.email);
      return { id: email.id, name: contactName, email: contactEmail, ... };
    });
    ```
  * If the user has 15 emails from "john@acme.com", `ContactList` renders 15 separate contact rows for John! There is no aggregation, grouping, or unique deduplication by email address or contact entity.
* **Email Rendering Flaws (`ChatArea.tsx:187-218` & `MessageBubble.tsx:32-53`):**
  * Detailed root-cause analysis is provided in Section 5. In short: `extractHtmlContent` does not check `payload.body.data`; nested MIME parts are ignored; `decodeBase64UrlSafe` throws `URI malformed` on UTF-8 characters; `dangerouslySetInnerHTML` is executed without sanitization.
* **Composer Limitations (`ComposeMessage.tsx`):**
  * "Rich Text" mode is simulated by inserting raw HTML strings (`<strong>`, `<em>`) into a plain `<textarea>` element rather than using a proper contenteditable engine.
  * The composer has no concept of replying to a thread, quoting original messages, replying to all, forwarding, or drafting.

---

## 3. Current Strengths and Weaknesses

| Architectural Dimension | Current Strengths (V1 Baseline) | Critical Weaknesses & Vulnerabilities | Architectural Verdict |
| :--- | :--- | :--- | :--- |
| **User Experience (UX)** | • Unique WhatsApp/chat-like layout for emails.<br>• Clean modern aesthetic with Tailwind and Radix UI.<br>• Responsive sidebar and contact drawers. | • Contacts are duplicated for every email received.<br>• Multiple Gmail threads are mixed into one confusing chat stream.<br>• No thread-level navigation or subject clarity. | **Preserve & Overhaul:** Retain chat aesthetic, but introduce hierarchical Thread grouping. |
| **MIME / Email Rendering** | • Handles simple multipart emails containing top-level `text/plain` and `text/html`.<br>• Attachment metadata extracted and displayed. | • Single-part HTML emails fail and render as raw HTML strings.<br>• Nested multipart structures (`related`, `alternative`) fail.<br>• Deprecated `escape(atob())` crashes on multi-byte UTF-8.<br>• **Critical XSS vulnerability:** Unsanitized HTML rendering. | **Replace:** Move parsing to backend with Python `email` library; render via sandboxed Shadow DOM / DOMPurify. |
| **Threading & Semantics** | • Extracts `threadId` from Gmail API message objects. | • Discards `threadId` during contact chat compilation.<br>• Replies sent do not include `threadId`, `In-Reply-To`, or `References`.<br>• Reading one email marks all emails in contact as read. | **Rebuild:** Create explicit Contact $\to$ Thread $\to$ Message hierarchy with strict RFC 5322 compliance. |
| **Backend & APIs** | • Clean FastAPI structure with lifespan handlers.<br>• Asynchronous database driver (Motor).<br>• Fernet encryption for OAuth tokens. | • Token refresh never persists to DB, causing repeat refreshes.<br>• Synchronous `requests.post` and `time.sleep` block event loop.<br>• Deprecated Google Batch HTTP parsing with brittle regex.<br>• Missing database indexes and schema validation. | **Refactor:** Fix token persistence, replace sync calls with `httpx`, implement background task queue (Celery/ARQ). |
| **Authentication** | • Google OAuth 2.0 PKCE/state verification.<br>• HTTP-only JWT cookies for session management. | • Hardcoded `.maileyo.in` cookie domain breaks local dev.<br>• Expectation of non-existent `refresh_token_expires_in` crashes callback.<br>• Unused Kinde SDK creates bundle bloat. | **Refactor:** Dynamic cookie domain handling, remove Kinde, sanitize OAuth scope checks. |
| **AI / RAG / Search** | • Conceptual Redux slices for chat messages.<br>• Prototype card UI in `chat-card.tsx`. | • **Completely absent:** No embeddings, no vector storage, no retrieval, no LLM integration, no grounding. | **Newly Introduce:** Build zero-body-persistence RAG pipeline on MongoDB Atlas Vector Search. |

---

## 4. Critical Bugs/Issues and Root Causes

### Issue 4.1: Emails Rendering as Raw HTML or Raw Base64 Text
* **File:** `Frontend/src/components/dashboard/ChatArea.tsx` (lines 187–218), `Frontend/src/components/dashboard/MessageBubble.tsx` (lines 32–53)
* **Root Cause 1 (Asymmetry in Body Data Extraction):**
  ```typescript
  // ChatArea.tsx:
  const extractTextContent = (payload) => {
    if (payload?.body?.data) return decodeBase64UrlSafe(payload.body.data); // Checks top-level!
    ...
  };
  const extractHtmlContent = (payload) => {
    // BUG: DOES NOT CHECK payload?.body?.data! ONLY CHECKS payload?.parts!
    if (payload?.parts) {
      for (const part of payload.parts) { ... }
    }
    return '';
  };
  ```
  When a sender transmits a single-part HTML email (`Content-Type: text/html`), the HTML payload resides in `payload.body.data` and `payload.parts` is `undefined`. `extractHtmlContent` returns `""`, while `extractTextContent` decodes the HTML string. In `MessageBubble.tsx`, because `bodyHtml` is empty, the component falls back to `bodyPlain`, rendering the raw HTML markup inside `<div className="whitespace-pre-wrap">{message.bodyPlain}</div>`!
* **Root Cause 2 (Shallow Multipart Traversal):**
  Emails with inline images or attachments have nested MIME trees (e.g., `multipart/mixed` $\to$ `multipart/related` $\to$ `multipart/alternative`). `ChatArea.tsx` executes a flat 1-level loop: `for (const part of payload.parts)`. It never inspects `part.parts`. Nested `text/html` parts are completely missed.
* **Root Cause 3 (Unicode Decoding Crash):**
  ```typescript
  const decodeBase64UrlSafe = (str: string): string => {
    try {
      ...
      const decoded = atob(base64);
      return decodeURIComponent(escape(decoded));
    } catch (error) {
      return str; // BUG: Returns raw base64 string on failure!
    }
  };
  ```
  `escape()` is deprecated and fails on arbitrary multi-byte UTF-8 sequences, throwing `URIError: URI malformed`. The `catch` block catches this and returns `str`—displaying the raw base64 string directly on the user's screen.

### Issue 4.2: Stored Cross-Site Scripting (XSS) Vulnerability
* **File:** `Frontend/src/components/dashboard/MessageBubble.tsx` (lines 43)
* **Code:** `<div dangerouslySetInnerHTML={{ __html: message.bodyHtml }} />`
* **Root Cause:** The raw HTML decoded from the email is injected directly into the application DOM without sanitization via DOMPurify or any HTML sanitizer. Any email containing `<script>`, `<img src=x onerror=...>`, or malicious `<iframe>` tags can execute arbitrary JavaScript in the context of the user's authenticated session, stealing cookies and session credentials.

### Issue 4.3: Infinite Token Refresh Loop & Event Loop Blocking
* **File:** `Backend/api/v1/utils/tokens.py` (lines 98–166)
* **Root Cause:** In `get_access_token`, when an access token expires:
  1. It calls `refresh_access_token(tokens["refresh_token"])`.
  2. `refresh_access_token` executes synchronous `requests.post()` to Google's OAuth endpoint, freezing all other concurrent asynchronous requests on the FastAPI thread.
  3. `get_access_token` returns `refreshed["access_token"]` to the caller, **but never saves it or the new expiry timestamp to MongoDB**.
  4. The next incoming request finds the exact same expired token in MongoDB and repeats the synchronous refresh cycle.

### Issue 4.4: OAuth Callback Crash on Google Standard Accounts
* **File:** `Backend/api/v1/services/auth_services/google.py` (lines 104–118)
* **Code:**
  ```python
  refresh_expires_in = token_data.get("refresh_token_expires_in")
  if not refresh_expires_in or refresh_expires_in <= 0:
      raise HTTPException(status_code=400, detail="Invalid refresh token expiration information")
  ```
* **Root Cause:** `refresh_token_expires_in` is only returned by Google Cloud Identity Platform or specific OAuth apps with expiring refresh tokens enabled. Standard Google OAuth authorization returns `expires_in` (3600 seconds for the access token) and a permanent `refresh_token` without an expiration field. This validation unconditionally crashes login for all standard accounts.

### Issue 4.5: Thread Severing on Reply
* **File:** `Backend/api/v1/services/email_services/gmail_service.py` (lines 259–307) & `Frontend/src/components/dashboard/ComposeMessage.tsx` (lines 102–140)
* **Root Cause:** Neither `SendEmailRequest` nor `send_email` accepts or sets `threadId`, `In-Reply-To`, or `References` headers. Gmail uses these headers to group messages into conversations. Every message sent from Maileyo creates a disconnected, single-message thread in Gmail.

---

## 5. Email Rendering Analysis and Solution

### 5.1 The Complexity of Real-World MIME
RFC 2045/2046 MIME structures encountered in Gmail mailboxes follow multiple tree topologies:

```
Simple Email:
multipart/alternative
├── text/plain (Fallback for text clients)
└── text/html  (Formatted rich content)

Rich Email with Attachments & Inline Images:
multipart/mixed
├── multipart/related
│   ├── multipart/alternative
│   │   ├── text/plain
│   │   └── text/html (References <img src="cid:img_01">)
│   └── image/png (Content-ID: <img_01>, inline attachment)
└── application/pdf (Regular file attachment)
```

### 5.2 Architectural Flaw of Frontend-Only Parsing
Attempting to parse raw Gmail API JSON payloads on the browser client has critical drawbacks:
1. **Bandwidth Waste:** The frontend must download megabytes of raw base64 data and attachment blobs just to extract snippet text.
2. **Brittle Traversal:** JavaScript recursive traversal frequently misses malformed or non-standard MIME headers generated by legacy mail clients (Outlook, Thunderbird, Exchange).
3. **Encoding Hazards:** Handling character sets (ISO-8859-1, Windows-1252, Shift-JIS, UTF-8) with raw `atob()` in browser JS without full TextDecoder charset tables causes text corruption.

### 5.3 Recommended V3 Rendering Architecture

```
┌─────────────────────────┐
│     Gmail API (MIME)    │
└────────────┬────────────┘
             │ Raw message (format=full or format=raw)
             ▼
┌────────────────────────────────────────────────────────┐
│ Backend: MIME Normalization Engine (`mime_parser.py`)  │
│ 1. Python `email` / `email.policy.default`             │
│ 2. Recursive MIME tree traversal                      │
│ 3. Charset conversion (Windows-1252, ISO -> UTF-8)     │
│ 4. Inline CID resolution (cid:foo -> attachment proxy) │
│ 5. Quoted text / signature extraction & partitioning   │
└────────────┬───────────────────────────────────────────┘
             │ Clean Normalized DTO:
             │ { body_html, body_plain, quoted_html, attachments, inline_images }
             ▼
┌────────────────────────────────────────────────────────┐
│ Frontend: Secure Rendering Pipeline                   │
│ 1. DOMPurify sanitization (XSS mitigation)             │
│ 2. CSS Encapsulation (Shadow DOM or Sandboxed iframe)  │
│ 3. Collapsible Quoted Reply / Signature Accordion      │
│ 4. Lazy-loaded secure attachment proxy URLs            │
└────────────────────────────────────────────────────────┘
```

#### Step 1: Backend MIME Extraction (`Backend/api/v1/services/email_services/mime_parser.py`)
Create a dedicated service utilizing Python's battle-tested `email` standard library:
* **Recursive Part Walker:** Traverses arbitrary nesting levels to extract the definitive HTML part, plain text fallback, inline assets, and regular attachments.
* **CID Mapping:** Maps all `Content-ID` headers to a secure backend proxy endpoint (`/api/v1/emails/{message_id}/attachments/{attachment_id}/inline`). Rewrites `src="cid:banner_logo"` to the authenticated proxy URL.
* **Header & Signature Partitioning:** Uses heuristics (`talent-quote-regex` and standard delimiter checks: `-- \n`, `On <date>, <sender> wrote:`, `-----Original Message-----`) to split the body into `active_content` and `quoted_content`.

#### Step 2: Frontend Sanitization and Style Isolation (`Frontend/src/components/dashboard/SecureEmailRenderer.tsx`)
1. **Sanitization with DOMPurify:** Run all incoming HTML through `DOMPurify.sanitize()` configured with allowed tags, attributes, and protocol schemes (`http`, `https`, `mailto`, `cid`/proxy).
2. **Style Isolation (Shadow DOM or `srcdoc` iframe):**
   * **Problem:** Marketing emails often define global CSS (`body { width: 100% !important; background: #000; }` or `p { font-size: 24px; }`), which destroys the Maileyo dashboard UI when injected into the document DOM.
   * **Solution:** Render the sanitized HTML inside a **Shadow DOM container** using a React Custom Web Component or an auto-resizing sandboxed iframe (`sandbox="allow-popups allow-popups-to-escape-sandbox"` without `allow-scripts`). Shadow DOM isolates styles completely while allowing dark-mode inheritance and auto-scaling.
3. **Collapsible History:** Hide `quoted_content` inside an accordion (`"Show trimmed content..."`), keeping message bubbles clean, concise, and chat-like.

---

## 6. Contact/Conversation/Thread Architecture

### 6.1 The Core UX Dilemma
* **The Promise of Maileyo:** Email feels like chatting on WhatsApp or Slack. You click a person (e.g., "Sarah Connor"), and you see your dialogue with them.
* **The Reality of Gmail:** A contact is NOT a conversation. A contact is a communication counterparty who participates in dozens of independent threads over months and years:
  * Thread 1: *"Q3 Financial Report"* (3 messages)
  * Thread 2: *"Lunch tomorrow?"* (5 messages)
  * Thread 3: *"Critical Server Outage"* (8 messages)
* **The V1 Failure:** Flattening all messages into a single timeline means messages from Thread 1, Thread 2, and Thread 3 are interleaved chronologically. Context is destroyed, subjects are lost, and sending a reply generates an orphaned email.

### 6.2 The V3 Dual-Hierarchy: Contact $\to$ Thread $\to$ Message

Maileyo V3 preserves the contact-centric chat model while providing clear visual, logical, and conversational boundaries between Gmail threads:

```
Contact: "Sarah Connor <sarah@skynet.org>"
 │
 ├── Thread A: "Q3 Budget Review" [✨ AI Indexed] [Status: Active]
 │    ├── Msg 1 (Inbound): Sarah - "Here is the revised Q3 draft..." (10:15 AM)
 │    ├── Msg 2 (Outbound): Me - "Approved with comments on slide 4." (10:30 AM)
 │    └── Msg 3 (Inbound): Sarah - "Thanks! Finalizing now." (10:45 AM)
 │
 ├── [Divider: Thread Switch | Dec 12, 2026]
 │
 └── Thread B: "Holiday Party RSVP" [✨ AI Indexed] [Status: Closed]
      ├── Msg 1 (Inbound): Sarah - "Are you bringing a +1?" (Dec 12)
      └── Msg 2 (Outbound): Me - "Yes, adding to the sheet." (Dec 12)
```

### 6.3 UX Implementation Details
1. **Contact Navigation Bar:** Clicking a contact opens their conversation view. At the top of the chat area, a horizontal **Thread Strip (Pill Carousel)** displays all active threads for that contact, ordered by most recent activity:
   * `[All Threads (Unified Stream)]` `[● Q3 Budget Review (3)]` `[Holiday Party RSVP (2)]` `[Server Outage (8)]`
2. **Unified Stream with Distinct Thread Cards:**
   * In the default "All Threads" view, messages belonging to the same `threadId` are rendered inside a visually bounded **Thread Container Card**.
   * Each Thread Container Card has:
     * A clear header with the **Email Subject**, **Thread Timestamp**, **Gmail Label Badges**, and the **✨ AI Available** indicator.
     * An action bar with thread operations: `Reply in Thread`, `Star`, `Archive`, `Summarize with AI`.
     * The chronological sequence of message bubbles for that thread.
3. **Focused Thread View:**
   * Clicking a thread pill from the top strip isolates the chat area to *only* that specific thread, eliminating distractions and narrowing the AI Copilot context exclusively to that topic.
4. **Context-Aware Inline Composer:**
   * When typing at the bottom of the active thread, the composer automatically binds to the active `threadId`, setting `Subject: Re: <Subject>`, `In-Reply-To: <last_message_id>`, and `References: <reference_list>`.
   * An intuitive toggle allows the user to switch between:
     * `Reply in "Q3 Budget Review"` (keeps thread intact)
     * `Start New Thread with Sarah` (prompts for new subject line, starts clean Gmail thread)

---

## 7. Maileyo V3 Product Requirements

### 7.1 Functional Requirements
* **FR-01 (Authentication):** Seamless Google OAuth 2.0 with automatic token refresh, secure cookie sessions, and multi-environment support (local development vs production).
* **FR-02 (Contact Management):** Automatic extraction and deduplication of contacts from Gmail inbox history with avatar generation, search, and frequency sorting.
* **FR-03 (Thread Integrity):** Strict preservation of Gmail `threadId`, subject hierarchies, and RFC 5322 headers (`Message-ID`, `In-Reply-To`, `References`).
* **FR-04 (MIME & Rich Content):** Flawless rendering of plain text, rich HTML, inline images (`cid:`), and downloadable attachments.
* **FR-05 (Gmail Sync):** Dual-mode synchronization utilizing Google Cloud Pub/Sub Webhooks (real-time push) with a fallback to the Gmail History API (incremental pull).
* **FR-06 (Zero-Persistence RAG):** Fast vector indexing of newly arrived emails; embeddings and retrieval metadata stored in MongoDB Atlas Vector Search; zero storage of raw email bodies in MongoDB.
* **FR-07 (AI Indicator):** Real-time, visible, accessible badge (`✨ AI-Indexed`) on messages and threads that have been vectorized and are available for RAG queries.
* **FR-08 (AI Copilot & Agent):** Context-aware conversational email assistant capable of answering questions grounded in mailbox knowledge, drafting replies, summarizing threads, and executing email actions with user confirmation.
* **FR-09 (Email Actions):** Star, unstar, mark as read/unread, archive, trash, spam, label management, draft autosave, reply, reply-all, and forward.
* **FR-10 (Productivity & Search):** Global hybrid search (Vector Semantic Search + Gmail Keyword Filters), keyboard shortcuts (Vim-style or Gmail-standard), infinite scrolling, and unread badges.

### 7.2 Non-Functional Requirements
* **NFR-01 (Privacy & Compliance):** Full compliance with Google API Services User Data Policy (Restricted Scopes). No persistent storage of email bodies on external databases.
* **NFR-02 (Performance):** UI message render latency $< 16\text{ms}$ (60 fps); RAG query response first token latency $< 1.2\text{s}$; Gmail fresh body fetch latency $< 400\text{ms}$.
* **NFR-03 (Scalability):** Support mailboxes with $> 100,000$ messages via pagination and asynchronous background processing.
* **NFR-04 (Security):** Zero Stored XSS vulnerabilities (enforced via DOMPurify + Shadow DOM); AES-256 Fernet encryption for OAuth credentials at rest; Strict SameSite, Secure, HttpOnly cookies.
* **NFR-05 (Reliability & Idempotency):** Idempotent ingestion pipeline preventing duplicate vector embeddings for identical Gmail message IDs.

---

## 8. UX/UI Architecture

### 8.1 Modern 3-Pane Responsive Layout

```
┌──────┬──────────────────────┬────────────────────────────────────────────────────────┐
│ Nav  │ Contacts Pane        │ Conversation & Thread Workspace                        │
├──────┼──────────────────────┼────────────────────────────────────────────────────────┤
│ [M]  │ [🔍 Search contacts] │ Contact Header: Sarah Connor <sarah@skynet.org>       │
│      ├──────────────────────┼────────────────────────────────────────────────────────┤
│ Inbox│ Sarah Connor         │ Thread Strip: [All Threads] [● Q3 Budget] [RSVP]       │
│ Sent │ - "Thanks! Final..." ├────────────────────────────────────────────────────────┤
│ Star │ 10:45 AM • [✨ AI]   │ ┌── Thread Container: "Q3 Budget Review" ────────────┐ │
│ Draft│                      │ │ [Subject: Q3 Budget Review] [✨ AI Indexed] [⭐]   │ │
│ Trash│ Alex Mercer          │ │                                                    │ │
│      │ - "Invoice attached" │ │  [Sarah] "Here is the revised draft..." (10:15)    │ │
│ ⚙️    │ Yesterday            │ │                                                    │ │
│ [👤] │                      │ │  [Me]    "Approved with comments." (10:30)         │ │
│      │ Elena Rostova        │ │                                                    │ │
│      │ - "Meeting at 3pm"   │ │  [Sarah] "Thanks! Finalizing now." (10:45)         │ │
│      │ Dec 10               │ └────────────────────────────────────────────────────┘ │
│      │                      ├────────────────────────────────────────────────────────┤
│      │                      │ Context-Aware Composer:                                │
│      │                      │ [Replying to: "Q3 Budget Review" ▼]                    │
│      │                      │ [Type your message or ask AI to draft...            ] │
│      │                      │ [📎 Attach] [✨ AI Assist]             [Send Message ✈️] │
└──────┴──────────────────────┴────────────────────────────────────────────────────────┘
```

### 8.2 State Progression: Loading, Empty, Error, and Offline

```
┌─────────────────┬──────────────────────────────────────────────────────────────────┐
│ State           │ Visual & Behavioral Treatment                                    │
├─────────────────┼──────────────────────────────────────────────────────────────────┤
│ **Initial Sync**│ Animated pulse progress banner: "Syncing mailbox with Gmail...   │
│                 │ 450 messages indexed for AI [====================>       ] 65%" │
├─────────────────┼──────────────────────────────────────────────────────────────────┤
│ **Empty Thread**│ Friendly illustrated state: "No messages yet in this thread.     │
│                 │ Write a message below to kick off the conversation."             │
├─────────────────┼──────────────────────────────────────────────────────────────────┤
│ **Offline**     │ Non-intrusive top banner: "Working offline. Changes will sync    │
│                 │ when connection is restored." Local optimistic updates enabled.  │
├─────────────────┼──────────────────────────────────────────────────────────────────┤
│ **Error**       │ Toast alert with concrete action: "Failed to load thread.         │
│                 │ [Retry] or [Check Google Auth]".                                 │
└─────────────────┴──────────────────────────────────────────────────────────────────┘
```

---

## 9. AI-Availability Indicator UX

### 9.1 Design and Semantics
Users must intuitively know which emails have been indexed by Maileyo's vector search and can be referenced by the AI Copilot.

```
Visual Indicator:
  [ ✨ AI ]  or  [ ✨ AI Indexed ]

Placement:
1. Contact List: Subtle sparkle icon next to the contact timestamp if their latest email is indexed.
2. Thread Header: Distinct pill badge:
   • Green/Purple Gradient: `✨ AI Ready` (All messages in thread indexed)
   • Amber Pill: `⏳ AI Indexing (2/3)` (Partial indexing in progress)
   • Gray Pill: `○ Not Indexed` (Eligible but awaiting queue)
3. Message Bubble: A micro-badge `✨` in the message header adjacent to the timestamp.
```

### 9.2 Message-Level vs. Thread-Level Recommendation
* **Recommendation: Dual-Level Indicator with Thread-Level Primary Aggregation.**
* **Rationale:** 
  * A user interacts with email primarily at the **thread level** (a conversation topic). Knowing that a thread is `✨ AI Ready` gives the user confidence to click "Summarize" or ask the AI questions about that deal/topic.
  * However, individual messages may fail indexing (e.g., massive attachment, OCR failure). Displaying micro-indicators on individual message bubbles provides full transparency into exact grounding boundaries without cluttering the interface.

### 9.3 Popover / Tooltip Specification
Hovering over the `✨ AI Ready` badge opens an accessible Radix popover:
```
┌────────────────────────────────────────────────────────┐
│ ✨ Available to Maileyo AI Copilot                    │
│                                                        │
│ Indexed on: Sep 7, 2026, 01:15 AM                      │
│ Model: text-embedding-3-small (1536 dim)               │
│ Privacy: Grounded via Gmail on-demand API fetch.       │
│ Content is never stored permanently in the database.   │
│                                                        │
│ [Ask AI about this email]    [Re-index message]        │
└────────────────────────────────────────────────────────┘
```

---

## 10. Gmail Synchronization Architecture

```
                                  GMAIL SYNCHRONIZATION PIPELINE
                                  
┌─────────────────────────┐
│     Gmail Webhook       │
│   (Google Cloud Pub/Sub)│
└────────────┬────────────┘
             │ Push Notification: { emailAddress, historyId }
             ▼
┌───────────────────────────────────────────────────────────────────┐
│ FastAPI Webhook Handler: `POST /api/v1/sync/gmail/webhook`        │
│ 1. Validate Pub/Sub token & signature                             │
│ 2. Enqueue background task with { user_id, historyId }            │
└────────────┬──────────────────────────────────────────────────────┘
             │ Enqueue Job
             ▼
┌───────────────────────────────────────────────────────────────────┐
│ Background Worker (ARQ / Celery)                                  │
│ 1. Fetch user's last synced `historyId` from MongoDB `sync_state` │
│ 2. Call Gmail API: `users.history.list(startHistoryId=lastId)`    │
│ 3. Extract change events: `messagesAdded`, `labelsAdded`, etc.    │
└────────────┬──────────────────────────────────────────────────────┘
             │ Process Batch
             ▼
┌───────────────────────────────────────────────────────────────────┐
│ Sync Engine: Dispatch Events                                      │
│ ├── Message Added    ──> Queue for RAG Ingestion Pipeline         │
│ ├── Label Changed    ──> Update Mongo metadata (Read/Star/Labels) │
│ └── Message Deleted  ──> Remove vector embedding from Mongo       │
└───────────────────────────────────────────────────────────────────┘
```

### 10.1 Initial Mailbox Backfill vs. Incremental Sync
1. **Incremental Sync (Hot Path):**
   * Configured via Google Cloud Pub/Sub push notifications.
   * On webhook receipt, query Gmail `users.history.list` starting at the stored `historyId`.
   * Only fetches delta changes (messages added, labels modified, messages deleted). Runs in $< 500\text{ms}$.
2. **Initial Mailbox Backfill (Cold Path):**
   * On first user registration, index the user's recent mailbox history (default: last 90 days or 1,000 most recent messages).
   * Backfill executes asynchronously in prioritized chunks:
     * **Priority 1 (Interactive):** Last 50 messages from Primary Inbox (indexed immediately within 30 seconds).
     * **Priority 2 (Background):** Remaining messages processed in batches of 50 via background worker queue with rate-limit backoff.

### 10.2 Gmail API Rate Limiting & Quota Management
* Gmail API imposes a quota of **250 quota units per user per second** and **1,000,000 units per day**.
* A `messages.get` costs 5 units; a `history.list` costs 2 units; a `messages.send` costs 100 units.
* The V3 worker implements a **Token Bucket Rate Limiter** with Redis:
  * Maximum 40 requests/sec per user.
  * Automatic exponential backoff with jitter on HTTP 429 (`RESOURCE_EXHAUSTED`).

---

## 11. RAG Architecture (Zero-Body Persistence)

This is the central architectural pillar of Maileyo V3.

### 11.1 The Zero-Body-Persistence Principle
To comply with strict enterprise privacy policies and Google API Restricted Scope requirements:
* **The raw email body (plain text or HTML) is NEVER persisted in MongoDB.**
* MongoDB only stores:
  1. Identifiers (`message_id`, `thread_id`, `user_id`)
  2. Routing metadata (`from_email`, `to_emails`, `internal_date`, `labels`, `subject`)
  3. Chunk indexing metadata (`chunk_index`, `token_count`, `embedding_model_version`)
  4. Vector embedding ($1536$-dimensional dense float array)
  5. Indexing status (`PENDING`, `INDEXED`, `FAILED`)

```
                 ZERO-BODY-PERSISTENCE RAG WORKFLOW
                 
   [1. Ingestion Phase: Transient Processing]
   Gmail API Message
         │ (Fetched in worker memory)
         ▼
   Clean / Strip Quotes & Signatures
         │
         ▼
   Chunk & Embed (OpenAI text-embedding-3-small)
         │
         ▼
   Save Embedding & Metadata to MongoDB ──> [RAW BODY DISCARDED FROM RAM]
   
   ─────────────────────────────────────────────────────────────────────
   
   [2. Retrieval & Grounding Phase: On-Demand Re-Fetch]
   User Query: "What was the agreed budget for the Skynet migration?"
         │
         ▼
   Embed Query ──> Vector Search in MongoDB (Filtered by user_id)
         │
         ▼
   Top K Matching Results: [MsgId: "18e9f1a2", ThreadId: "18e9f1a2"]
         │
         ▼
   Fetch Fresh Email Content directly from Gmail API (`users.messages.get`)
         │
         ▼
   Construct Grounded LLM Context with Fresh Bodies + Citations
         │
         ▼
   Stream Response to User with References [Email: Q3 Budget Review, Sarah Connor]
```

### 11.2 Ingestion & Indexing Pipeline
1. **Sanitization:** Remove email boilerplates, confidentiality notices, tracking pixels, and repeated quoted thread history.
2. **Chunking Strategy:**
   * Short emails ($< 500$ tokens): Embedded as a single document.
   * Long emails ($> 500$ tokens): Chunked using `RecursiveCharacterTextSplitter` with chunk size of 500 tokens and 50-token overlap.
   * Each chunk prepends header context: `From: {sender} | To: {recipient} | Subject: {subject} | Date: {date}\n\n{chunk_text}`.
3. **Embedding:** Generated via `text-embedding-3-small` (1536 dimensions, highly cost-effective at \$0.02 / 1M tokens) or locally deployable embeddings (`bge-small-en-v1.5`).
4. **Persistence:** The resulting vector is stored in `email_embeddings` collection with indexing state set to `INDEXED`. The plain text body is immediately garbage-collected from RAM.

### 11.3 Retrieval & Grounding Flow
1. **User asks question in AI Chat:** e.g., *"Did Varun approve the contract changes?"*
2. **Embed Query:** Compute embedding vector for the prompt.
3. **Vector Search with Metadata Filters:**
   * Execute MongoDB Atlas `$vectorSearch` scoped strictly to `user_id == current_user.id`.
   * Apply metadata pre-filters (e.g., `labels: { $nin: ["SPAM", "TRASH"] }`, optional date range).
   * Return top $K = 5$ matching message IDs with similarity score $> 0.72$.
4. **On-Demand Content Hydration:**
   * Make parallel asynchronous calls to Gmail API (`messages.get(id, format='full')`) using the user's fresh OAuth token.
   * Extract the fresh message bodies in memory.
5. **Context Assembly & LLM Generation:**
   * Inject fetched bodies into the system prompt as grounded reference sources.
   * Prompt the LLM with strict grounding constraints (cite sources with `[Msg-ID]`, forbid hallucination of details not present in the emails).

---

## 12. MongoDB / Vector Search Design

### 12.1 Atlas Vector Search Index Definition
Create a Vector Search index named `vector_index_emails` on the `email_embeddings` collection:

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 1536,
      "similarity": "cosine"
    },
    {
      "type": "filter",
      "path": "user_id"
    },
    {
      "type": "filter",
      "path": "thread_id"
    },
    {
      "type": "filter",
      "path": "labels"
    },
    {
      "type": "filter",
      "path": "internal_date"
    }
  ]
}
```

### 12.2 Standard MongoDB Indexes
To support high-speed relational queries, contact compilation, and sync status checks:

```python
# users collection:
db.users.create_index([("google_id", 1)], unique=True)
db.users.create_index([("email", 1)], unique=True)

# email_embeddings collection:
db.email_embeddings.create_index([("user_id", 1), ("message_id", 1)], unique=True)
db.email_embeddings.create_index([("user_id", 1), ("thread_id", 1)])
db.email_embeddings.create_index([("user_id", 1), ("status", 1)])
db.email_embeddings.create_index([("user_id", 1), ("internal_date", -1)])

# contacts cache collection:
db.contacts.create_index([("user_id", 1), ("email", 1)], unique=True)
db.contacts.create_index([("user_id", 1), ("last_interaction", -1)])

# sync_state collection:
db.sync_state.create_index([("user_id", 1)], unique=True)
```

---

## 13. AI Agent Architecture

### 13.1 Agent Responsibilities & Tool Definitions
The Maileyo AI Copilot is an autonomous agent operating within strict security guardrails.

```
┌────────────────────────────────────────────────────────┐
│               Maileyo AI Agent Engine                  │
├────────────────────────────────────────────────────────┤
│ • Model: Claude 3.5 Sonnet / GPT-4o / Gemini 1.5 Pro   │
│ • Tool Use / Function Calling Engine                   │
│ • Memory: Sliding-window conversation context          │
├────────────────────────────────────────────────────────┤
│                       TOOLS                            │
│ 1. `search_emails_semantic(query, date_range, sender)` │
│ 2. `fetch_email_thread(thread_id)`                     │
│ 3. `draft_reply(thread_id, recipient, body, subject)`  │
│ 4. `summarize_thread(thread_id)`                       │
│ 5. `extract_action_items(thread_id)`                   │
│ 6. `modify_email_labels(message_id, add, remove)`      │
└────────────────────────────────────────────────────────┘
```

### 13.2 Thread-Aware Context Construction
The agent receives the current conversation state in its prompt:
```
You are the Maileyo AI Assistant, a privacy-first email agent.
CURRENT VIEW CONTEXT:
- Active Contact: Sarah Connor (sarah@skynet.org)
- Active Thread: "Q3 Budget Review" (ThreadID: 18e9f1a2)
- Messages in Current Thread: 3 messages (hydrated below)

GROUNDING RULES:
1. Only answer based on information present in the provided emails or retrieved via tools.
2. If the user asks about something not in the context, call `search_emails_semantic`.
3. Never invent facts, dates, dollar amounts, or commitments.
4. When referring to specific emails, cite them as [Email: Subject (Sender, Date)].
5. Any destructive action (sending emails, archiving, deleting) requires explicit confirmation from the user.
```

### 13.3 Streaming & Source Attribution
* Backend streams responses using Server-Sent Events (SSE) via `StreamingResponse`.
* Format includes special citation markers that the frontend parses into interactive chips:
  `"Sarah confirmed the budget was approved for $150,000 [cite:18e9f1a2]."`
* Clicking `[cite:18e9f1a2]` in the chat opens the exact message bubble in the conversation pane.

---

## 14. Backend Architecture

### 14.1 Module & Service Boundaries

```
Backend/
├── main.py                          # Application initialization & middleware
├── api/v1/
│   ├── config.py                    # Validated Pydantic BaseSettings
│   ├── db/
│   │   ├── session.py               # Motor client & MongoDB connection pool
│   │   └── init_indexes.py          # Automatic index creation on startup
│   ├── schemas/
│   │   ├── users.py                 # User & OAuth models
│   │   ├── emails.py                # Email DTOs & Thread models
│   │   ├── rag.py                   # Vector search & RAG query models
│   │   └── agent.py                 # Tool calling & chat models
│   ├── routers/
│   │   ├── auth.py                  # Google OAuth, refresh, logout
│   │   ├── contacts.py              # Unique contacts list & contact details
│   │   ├── threads.py               # Thread list, thread messages, thread actions
│   │   ├── emails.py                # Raw email operations, compose, attachments
│   │   ├── sync.py                  # Webhooks, sync status, manual sync triggers
│   │   └── agent.py                 # Streaming AI Copilot endpoints
│   ├── services/
│   │   ├── auth_service.py          # Secure token lifecycle & Fernet encryption
│   │   ├── gmail_client.py          # Asynchronous Gmail REST API wrapper
│   │   ├── mime_parser.py           # Robust RFC 5322 MIME decoder & cleaner
│   │   ├── contact_service.py       # Contact aggregation & caching
│   │   ├── thread_service.py        # Thread reconstruction & hierarchy builder
│   │   ├── rag_service.py           # Embeddings, Vector Search, Content Hydration
│   │   └── agent_service.py         # LLM agent loop, tool execution, SSE streaming
│   ├── workers/
│   │   ├── arq_worker.py            # Async Redis worker entrypoint
│   │   └── tasks/
│   │       ├── sync_tasks.py        # Incremental History API sync job
│   │       └── indexing_tasks.py    # Chunking & embedding worker
│   └── utils/
│       ├── encryption.py            # AES-256 Fernet utilities
│       └── rate_limiter.py          # Redis token bucket rate limiter
```

### 14.2 Component Classification Matrix

| Component | V1 Baseline File | V3 Architectural Action | Rationale |
| :--- | :--- | :--- | :--- |
| `FastAPI Shell` | `Backend/main.py` | **Refactor** | Fix CORS origin matching; register clean router structure; add exception handlers. |
| `Config Engine` | `Backend/api/v1/config.py` | **Replace** | Replace ad-hoc class with `pydantic_settings.BaseSettings` with type validation. |
| `DB Session` | `Backend/api/v1/db/session.py` | **Refactor** | Add index initialization and lifecycle health checks. |
| `Auth Service` | `Backend/api/v1/services/auth_services/google.py` | **Refactor** | Remove `refresh_token_expires_in` bug; persist refreshed tokens to MongoDB; dynamic cookie domains. |
| `Token Manager`| `Backend/api/v1/utils/tokens.py` | **Refactor** | Replace sync `requests` with async `httpx`; implement auto-save of refreshed tokens. |
| `MIME Parser`  | *None (was inline in frontend)* | **Newly Introduce** | Complete Python MIME parser resolving nested parts, charsets, CIDs, and quotes. |
| `Gmail Service`| `Backend/api/v1/services/email_services/gmail_service.py` | **Replace** | Replace deprecated batch HTTP with parallel async HTTP/2 calls; add thread awareness. |
| `Contact Svc`  | *None (was mapped on frontend)* | **Newly Introduce** | Backend contact extraction and deduplication aggregation pipeline. |
| `Thread Svc`   | *None (threads ignored)* | **Newly Introduce** | Service modeling Thread $\to$ Message boundaries and RFC 5322 reply headers. |
| `Sync Engine`  | *None* | **Newly Introduce** | Google Cloud Pub/Sub webhook listener and Gmail History API delta processor. |
| `RAG Service`  | *None* | **Newly Introduce** | MongoDB Atlas Vector Search integration with zero email body persistence. |
| `AI Agent Svc` | *None* | **Newly Introduce** | Tool-calling LLM agent with streaming SSE endpoints and mailbox grounding. |

---

## 15. Frontend Architecture

### 15.1 State Management Overhaul: TanStack Query + Zustand
Replace the monolithic `DashboardState` with:
1. **TanStack Query (React Query):**
   * Manages server state: contacts list, thread list, messages, sync status, and attachment downloads.
   * Provides automatic background caching, garbage collection, and window-focus refetching.
   * Optimistic updates for marking read/unread, starring, and archiving.
2. **Zustand (Client UI State):**
   * Manages local UI interactions: active folder, active contact ID, active thread ID, composer expansion, rich text state, and AI drawer visibility.

```
┌────────────────────────────────────────────────────────┐
│                   Frontend State Layer                 │
├──────────────────────────┬─────────────────────────────┤
│ TanStack Query (Server)  │ Zustand Store (UI State)    │
├──────────────────────────┼─────────────────────────────┤
│ • `useContacts(folder)`  │ • `activeFolder`            │
│ • `useThreads(contactId)`│ • `activeContactId`         │
│ • `useMessages(threadId)`│ • `activeThreadId`          │
│ • `useSyncStatus()`      │ • `isComposerExpanded`      │
│ • `useAISearch(query)`   │ • `isAICopilotOpen`         │
└──────────────────────────┴─────────────────────────────┘
```

### 15.2 Virtualization & Performance
* Replace unvirtualized scrolling in `ChatArea.tsx` with `@tanstack/react-virtual`.
* Smooth 60fps rendering even for long email histories containing hundreds of messages and large attachments.

---

## 16. API Design

### 16.1 Core V3 REST Endpoints

#### Authentication & User
* `GET  /api/v1/auth/google/login` $\to$ Redirects to Google consent screen (PKCE).
* `GET  /api/v1/auth/google/callback` $\to$ Exchanges code, stores encrypted tokens, sets secure session cookie.
* `GET  /api/v1/auth/me` $\to$ Returns authenticated user profile.
* `POST /api/v1/auth/logout` $\to$ Clears session cookie and invalidates session.

#### Contacts
* `GET  /api/v1/contacts?folder=Inbox&search=...&limit=30` $\to$ Returns deduplicated contacts list with unread counts and AI indexing badges.
* `GET  /api/v1/contacts/{contact_id}/profile` $\to$ Returns full contact card and interaction statistics.

#### Threads (The Key V3 Abstraction)
* `GET  /api/v1/contacts/{contact_id}/threads?limit=20` $\to$ Returns all distinct Gmail threads exchanged with this contact, each with subject, snippet, timestamp, and AI status.
* `GET  /api/v1/threads/{thread_id}/messages` $\to$ Returns all messages belonging strictly to this Gmail thread, normalized and sorted.
* `POST /api/v1/threads/{thread_id}/actions` $\to$ Batch actions: `{ action: "archive" | "star" | "read" | "trash" }`.

#### Emails & Composition
* `POST /api/v1/emails/send` $\to$ Sends an email. Supports `thread_id`, `in_reply_to`, and `references` for threaded replies.
* `GET  /api/v1/emails/{message_id}/attachments/{attachment_id}` $\to$ Streams attachment data.
* `GET  /api/v1/emails/{message_id}/attachments/{attachment_id}/inline` $\to$ Authenticated image proxy for inline CID images.

#### Synchronization & RAG Status
* `POST /api/v1/sync/gmail/webhook` $\to$ Google Cloud Pub/Sub push notification receiver.
* `GET  /api/v1/sync/status` $\to$ Returns current mailbox indexing status (`total_messages`, `indexed_messages`, `is_syncing`).

#### AI Copilot & Search
* `POST /api/v1/ai/chat` $\to$ SSE streaming endpoint for conversational queries with tool calling.
* `POST /api/v1/ai/summarize-thread` $\to$ Summarizes a specific Gmail thread.
* `POST /api/v1/ai/draft-reply` $\to$ Generates a grounded draft reply for a thread.

---

## 17. Database / Schema Design

### 17.1 MongoDB Collections & Schemas

#### 1. `users` Collection
```json
{
  "_id": "ObjectId(...)",
  "google_id": "1098234710293847",
  "email": "user@example.com",
  "name": "Varun Chopra",
  "picture": "https://lh3.googleusercontent.com/...",
  "oauth": [
    {
      "service": "google",
      "access_token": "gAAAAABl...", // Fernet encrypted
      "refresh_token": "gAAAAABl...", // Fernet encrypted
      "access_token_expiry": "2026-09-07T02:15:00Z",
      "scope": "openid email profile https://www.googleapis.com/auth/gmail.modify..."
    }
  ],
  "created_at": "2026-09-01T00:00:00Z",
  "updated_at": "2026-09-07T01:00:00Z"
}
```

#### 2. `email_embeddings` Collection (Zero Body Persistence!)
```json
{
  "_id": "ObjectId(...)",
  "user_id": "1098234710293847",
  "message_id": "18e9f1a23b4c5d6e",
  "thread_id": "18e9f1a23b4c5d6e",
  "subject": "Q3 Budget Review",
  "from_email": "sarah@skynet.org",
  "to_emails": ["user@example.com"],
  "internal_date": "2026-09-07T01:15:00Z",
  "labels": ["INBOX", "IMPORTANT"],
  "chunk_index": 0,
  "embedding": [0.0124, -0.0432, 0.0891, ...], // 1536 float values
  "embedding_model": "text-embedding-3-small",
  "status": "INDEXED", // PENDING | INDEXED | FAILED | UNAVAILABLE
  "error_reason": null,
  "indexed_at": "2026-09-07T01:16:02Z",
  "updated_at": "2026-09-07T01:16:02Z"
}
```

#### 3. `contacts` Collection (Fast Query Cache)
```json
{
  "_id": "ObjectId(...)",
  "user_id": "1098234710293847",
  "email": "sarah@skynet.org",
  "name": "Sarah Connor",
  "avatar_url": null,
  "last_interaction": "2026-09-07T01:15:00Z",
  "unread_count": 1,
  "total_threads_count": 4,
  "latest_thread_id": "18e9f1a23b4c5d6e",
  "latest_snippet": "Thanks! Finalizing now.",
  "ai_ready": true,
  "created_at": "2026-09-01T00:00:00Z"
}
```

#### 4. `sync_state` Collection
```json
{
  "_id": "ObjectId(...)",
  "user_id": "1098234710293847",
  "last_history_id": "8921742",
  "last_synced_at": "2026-09-07T01:20:00Z",
  "initial_backfill_completed": true,
  "total_indexed_messages": 1420
}
```

---

## 18. Thread / Contact / Message Relationships

```
┌─────────────────────────────────────────────────────────────┐
│                     USER (Account Root)                     │
│                    google_id: "1098..."                     │
└──────────────────────────────┬──────────────────────────────┘
                               │ 1 : N
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                           CONTACT                           │
│   email: "sarah@skynet.org" | name: "Sarah Connor"          │
│   (Aggregated counterparty representation)                 │
└──────────────────────────────┬──────────────────────────────┘
                               │ 1 : N
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                         GMAIL THREAD                        │
│   thread_id: "18e9f1a2" | subject: "Q3 Budget Review"        │
│   ai_status: "INDEXED" (All messages vectorized)            │
│   (Logical conversation unit & reply container)             │
└──────────────────────────────┬──────────────────────────────┘
                               │ 1 : N
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                        GMAIL MESSAGE                        │
│   message_id: "m_01" | timestamp: "10:15 AM"                │
│   rfc_headers: { Message-ID, In-Reply-To, References }      │
│   ai_status: "INDEXED" | Vector in Mongo Atlas              │
│   Body: Transient in Gmail API (Hydrated on demand)         │
└─────────────────────────────────────────────────────────────┘
```

---

## 19. RAG Indexing State Model

### 19.1 Finite State Machine (FSM)

```
       [New Gmail Message Detected]
                    │
                    ▼
               ┌─────────┐
               │ PENDING │
               └────┬────┘
                    │ Worker picks up task
                    ▼
              ┌────────────┐
              │ PROCESSING │
              └─────┬──────┘
         ┌──────────┴──────────┐
         │ Success             │ Failure (Timeout / Quota)
         ▼                     ▼
   ┌───────────┐         ┌───────────┐
   │  INDEXED  │         │  FAILED   │ ──(Retry count < 3)──> [PROCESSING]
   └─────┬─────┘         └───────────┘
         │ Message Deleted in Gmail
         ▼
  ┌─────────────┐
  │ UNAVAILABLE │ (Embedding purged from Vector Search)
  └─────────────┘
```

### 19.2 State Definitions & UI Exposure
* **`PENDING`:** Message ID queued for processing. Frontend displays gray indicator `○`.
* **`PROCESSING`:** Worker is chunking and embedding. Frontend displays animated sparkle `✨ (pulsing)`.
* **`INDEXED`:** Embeddings active in Atlas Vector Search. Frontend displays vibrant badge `✨ AI Ready`. Available for RAG.
* **`FAILED`:** Retries exhausted (e.g., corrupt attachment or rate limit). Frontend displays subtle warning icon with a manual `[Retry]` action.
* **`UNAVAILABLE`:** User deleted the email in Gmail. Embedding is deleted via background sync; document removed from RAG index.

---

## 20. Privacy and Security Architecture

1. **Zero Email Body Persistence:** No email subject matter, bodies, or attachments are permanently stored in Maileyo's databases. MongoDB stores only metadata and high-dimensional semantic vectors.
2. **Encrypted Credentials at Rest:** Google OAuth access and refresh tokens are encrypted using AES-256 Fernet keys derived from environment secrets.
3. **Session Hardening:** Authentication relies on cryptographic, Signed, HttpOnly, SameSite=Lax (or Strict in prod), Secure cookies.
4. **XSS Defense-in-Depth:**
   * Layer 1: Python backend strips dangerous tags (`<script>`, `<object>`, `<embed>`, inline event handlers).
   * Layer 2: Frontend executes client-side `DOMPurify.sanitize()` before DOM mounting.
   * Layer 3: Rendered inside a Shadow DOM container or sandboxed iframe.
5. **Multi-Tenant Account Isolation:** All MongoDB queries and vector searches strictly enforce `{ user_id: current_user.google_id }`. No user can ever query or retrieve embeddings or messages belonging to another account.

---

## 21. Performance / Scalability Strategy

* **High-Throughput Vector Retrieval:** MongoDB Atlas Vector Search operates with HNSW (Hierarchical Navigable Small World) indexing, returning top-5 semantic matches in $< 35\text{ms}$.
* **Parallel Content Hydration:** When grounding LLM answers, the backend uses `asyncio.gather` with `aiohttp`/`httpx` HTTP/2 to fetch 5 message bodies from Gmail concurrently in $< 300\text{ms}$.
* **Redis Caching:**
  * Contact lists cached in Redis with a 5-minute TTL, invalidated on new email sync.
  * Resolved MIME structures cached in Redis for 10 minutes to make back-and-forth clicking instantaneous.
* **Virtual Scrolling:** The conversation stream uses `@tanstack/react-virtual`, rendering only the 10 message bubbles currently visible in the viewport.

---

## 22. Observability and Testing Strategy

### 22.1 Observability
* **Structured Logging:** Standardized JSON logs with `structlog` tracking `correlation_id`, `user_id`, `message_id`, and `latency_ms`.
* **OpenTelemetry Instrumentation:** Distributed tracing across FastAPI endpoints, Gmail API calls, Redis queues, and LLM completions.
* **Metrics:** Prometheus metrics tracking Gmail API quota usage, token refresh errors, embedding generation latency, and RAG retrieval accuracy.

### 22.2 Testing Strategy
1. **Unit Tests (Pytest):**
   * MIME parsing test suite covering 50+ real-world `.eml` files (single-part HTML, nested multipart, international charsets, malformed headers).
   * Token refresh and encryption/decryption tests with mocked Google endpoints.
2. **Integration Tests:**
   * Motor database integration tests using `mongomock-motor` or test containers.
   * Vector search query verification.
3. **Frontend Tests (Vitest + React Testing Library):**
   * Message bubble rendering tests verifying XSS prevention and Shadow DOM isolation.
   * Thread navigation and composer state transitions.
4. **E2E Tests (Playwright):**
   * End-to-end user flows: login $\to$ select contact $\to$ switch threads $\to$ compose threaded reply $\to$ ask AI question.

---

## 23. Dependency / Library Recommendations

### Backend Additions & Upgrades (`Backend/requirements.txt`)
```text
# Modern Config & Settings
pydantic-settings==2.7.1

# High-Performance Async HTTP
httpx[http2]==0.28.1

# Background Worker & Redis
arq==0.26.1
redis==5.2.1

# Robust MIME & Parsing
beautifulsoup4==4.12.3
bleach==6.2.0

# Vector Embeddings & LLM
openai==1.61.0
langchain-core==0.3.35
langchain-text-splitters==0.3.6

# Observability
structlog==25.1.0
```

### Frontend Additions & Upgrades (`Frontend/package.json`)
```json
{
  "dependencies": {
    "@tanstack/react-query": "^5.66.0",
    "@tanstack/react-virtual": "^3.11.2",
    "dompurify": "^3.2.4",
    "zustand": "^5.0.3"
  },
  "devDependencies": {
    "@types/dompurify": "^3.0.5"
  }
}
```

### Removals:
* **Uninstall `@kinde-oss/kinde-auth-react`** (removes bundle bloat and unused provider).
* **Remove synchronous `requests`** from backend dependencies in favor of `httpx`.

---

## 24. Migration Strategy from Current Codebase

To transition cleanly without disrupting existing user accounts:
1. **Database Schema Non-Destructive Update:** Existing documents in `users` remain valid. Add `sync_state`, `email_embeddings`, and `contacts` collections.
2. **Backward-Compatible Endpoints:** Keep existing `/api/v1/emails/fetch` operational while deploying `/api/v1/threads` and `/api/v1/contacts` in parallel.
3. **Frontend Migration:** Transition `Dashboard.tsx` to read from the new `/threads` and `/contacts` endpoints, deprecating the flat `/fetch-by-contact` route.

---

## 25. Detailed Phased Implementation Roadmap

```
┌──────────────────────────────────────────────────────────────────────────┐
│                   MAILEYO V3 IMPLEMENTATION ROADMAP                      │
├──────────┬───────────────────────────────────────────────┬───────────────┤
│ Phase    │ Milestone & Scope                             │ Duration      │
├──────────┼───────────────────────────────────────────────┼───────────────┤
│ Phase 1  │ Core Hardening, Token Persistence & Security  │ Weeks 1–2     │
│ Phase 2  │ Backend MIME Parser & Shadow DOM Rendering    │ Weeks 3–4     │
│ Phase 3  │ Contact + Thread Architecture Overhaul        │ Weeks 5–6     │
│ Phase 4  │ Gmail History Sync Engine & Pub/Sub Worker   │ Weeks 7–8     │
│ Phase 5  │ Zero-Body RAG & Atlas Vector Search Pipeline  │ Weeks 9–10    │
│ Phase 6  │ AI Agent Copilot & Polish                     │ Weeks 11–12   │
└──────────┴───────────────────────────────────────────────┴───────────────┘
```

### Phase 1: Core Hardening & Security (Weeks 1–2)
* Fix token refresh loop in `tokens.py` and persist refreshed tokens to MongoDB.
* Resolve Google OAuth callback crash by removing `refresh_token_expires_in` assertion.
* Implement dynamic cookie domains for seamless `localhost` and production operation.
* Replace synchronous `requests.post` and `time.sleep` with async `httpx` and `asyncio.sleep`.
* Remove `@kinde-oss/kinde-auth-react` and clean up unused Redux boilerplate.

### Phase 2: Backend MIME Parser & Rendering Engine (Weeks 3–4)
* Build `Backend/api/v1/services/email_services/mime_parser.py` using Python's `email` module.
* Implement recursive multipart traversal, charset decoding, and inline CID asset mapping.
* Build `Frontend/src/components/dashboard/SecureEmailRenderer.tsx` with DOMPurify and Shadow DOM style isolation.
* Add collapsible UI for quoted replies and signatures.

### Phase 3: Contact + Thread Architecture Overhaul (Weeks 5–6)
* Create backend `ThreadService` and `ContactService`.
* Add `/api/v1/contacts` and `/api/v1/threads/{thread_id}` endpoints.
* Rebuild `Dashboard.tsx` and `ChatArea.tsx` with Thread Strip navigation and bounded Thread Container Cards.
* Update `ComposeMessage.tsx` to inject `threadId`, `In-Reply-To`, and `References` headers for RFC 5322 compliance.

### Phase 4: Gmail History Sync Engine & Worker Pipeline (Weeks 7–8)
* Configure Google Cloud Pub/Sub webhook endpoint.
* Implement ARQ/Redis background worker for processing Gmail History API deltas.
* Implement token bucket rate limiter for Gmail API quota management.
* Build mailbox backfill engine for newly registered users.

### Phase 5: Zero-Body RAG & Vector Search (Weeks 9–10)
* Set up MongoDB Atlas Vector Search index on `email_embeddings`.
* Build worker pipeline for sanitizing, chunking, and embedding incoming emails with OpenAI `text-embedding-3-small`.
* Implement the On-Demand Gmail Hydration retrieval pipeline (zero body storage in DB).
* Add `✨ AI Ready` badges, tooltips, and real-time state updates across contact and thread UI.

### Phase 6: AI Agent Copilot & Launch Polish (Weeks 11–12)
* Implement streaming SSE AI Copilot endpoint with LangChain / OpenAI tool calling.
* Provide email tools: semantic search, thread summarize, draft reply, and action items.
* Comprehensive testing: unit tests, Playwright E2E tests, and load testing.
* Performance tuning: virtual scrolling, query caching, and final production deployment.

---

## 26. Risks and Tradeoffs

| Decision / Feature | Tradeoff Considered | Selected Approach & Rationale |
| :--- | :--- | :--- |
| **Zero Body Persistence** | Storing bodies in MongoDB would make RAG retrieval faster by skipping Gmail API re-fetch. | **Reject persistence.** Privacy compliance, user trust, and Google OAuth Restricted Scope audit guidelines mandate zero body storage. On-demand Gmail API fetch adds $\sim 250\text{ms}$, which is well within acceptable streaming latency budgets. |
| **Shadow DOM vs. Iframe** | Iframes offer complete sandboxing but complicate auto-height resizing and event bubbling. | **Shadow DOM with DOMPurify.** Provides 100% CSS isolation and dark-mode style inheritance while allowing native React event propagation and auto-sizing without ugly iframe scrollbars. |
| **History API vs. Webhook-Only** | Pub/Sub webhooks can occasionally drop events during network partitions. | **Hybrid Approach:** Use Pub/Sub for instantaneous push notifications, backed by periodic `history.list` delta polling to guarantee zero lost emails. |
| **Backend vs. Frontend Parsing** | Frontend parsing saves backend CPU cycles. | **Backend parsing.** Client-side MIME parsing is hopelessly brittle across email clients, charsets, and nested structures. Centralized Python parsing guarantees clean, validated DTOs. |

---

## 27. Final Recommended Architecture

Maileyo V3 establishes a new benchmark for modern email productivity by uniting three foundational architectural systems:
1. **The Human-Centric Communication Interface:** Merges the familiarity and speed of chat with the organizational rigor of Gmail threads, eliminating duplicated contacts and disjointed conversation streams.
2. **The Hardened Security & Rendering Engine:** Guarantees zero XSS risks, full CSS encapsulation, and universal MIME compatibility through backend normalization and Shadow DOM sandboxing.
3. **The Zero-Body-Persistence RAG Engine:** Delivers world-class AI grounding, intelligent email search, and autonomous agent assistance without compromising user data sovereignty or violating Google OAuth compliance.

This document serves as the authoritative, implementation-ready architectural blueprint for building Maileyo V3.
