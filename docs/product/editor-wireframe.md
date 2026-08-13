# Non-coder Editor Wireflow and Interaction Contract

> Các sơ đồ trong tài liệu này chỉ dùng ASCII.
>
> Guided Brief và Design Direction Gallery trong mục 3–4 đã được triển khai ở production trong Stage 5 ngày 2026-07-27. Section-first Editor/progressive disclosure trong mục 5/8 và contextual AI Change Review trong mục 6 đã được triển khai production trong Stage 6–7 ngày 2026-07-28. Preview/Share/Publish đơn giản trong mục 7 được triển khai production trong Stage 9 ngày 2026-07-28: Simple mode tự pin website đã lưu mới nhất, còn revision/provider/target nằm trong Advanced details hoặc Advanced mode. AI worker chỉ chuẩn bị proposal; accepted document chỉ đổi sau hành động `Chấp nhận thay đổi`. Production editor kỹ thuật tiếp tục là Advanced mode trên cùng EditorState/command/autosave engine.

## 1. Capability

ZenUI giúp người không biết code đi từ ý tưởng kinh doanh đến website có thể xuất bản bằng một hành trình duy nhất:

```text
Guided Brief
    |
    v
Design Direction Gallery
    |
    v
Section-first Editor
    |
    v
AI Change Review
    |
    v
Preview / Share / Publish
```

Primary user không cần hiểu component hierarchy, CSS, breakpoint, node ID, token, revision hoặc deployment provider để hoàn thành hành trình này.

### 1.1. Invariants

1. Accepted Design Document vẫn là source of truth duy nhất cho website.
2. Simple mode thay đổi cách trình bày và workflow, không thay đổi document contract, command layer, undo/redo, autosave, renderer parity hoặc security boundary.
3. Design directions và proposed changes là dữ liệu tạm thời. Chúng không thay đổi accepted document hoặc project history trước hành động xác nhận tương ứng.
4. Chỉ `Choose this direction` tạo initial accepted document từ một direction.
5. Chỉ `Accept change` áp proposed command transaction vào accepted document.
6. `Cancel`, `Discard` và đóng một transient surface không được tạo command, autosave hoặc history entry.
7. Advanced mode giữ Components, Layers, Inspector, responsive overrides, revisions và technical details hiện có.
8. Chuyển Simple/Advanced mode không tạo command và không thay đổi rendered output.
9. Canvas, isolated Preview, Share, Export và Publish tiếp tục dùng cùng deterministic renderer/compiler behavior.
10. Stage 4 prototype dùng local fixtures; không gọi Gemini, Pexels hoặc external provider.

## 2. End-to-end state model

```text
Project entry
    |
    +-- no accepted website --> Guided Brief
    |                              |
    |                              +-- Save draft / leave
    |                              +-- Prepare directions
    |                                      |
    |                                      v
    |                              Direction Gallery
    |                                      |
    |                                      +-- Adjust brief -----+
    |                                      |                     |
    |                                      +-- Try three others  |
    |                                      |                     |
    |                                      +-- Choose -----------+--> Simple Editor
    |
    +-- accepted website --------------------------------------------> Simple Editor
                                                                      |
                                     +--------------------------------+
                                     |                                |
                                     v                                v
                              Contextual request               Preview / Share / Publish
                                     |
                                     v
                              Proposed change
                                     |
                 +-------------------+-------------------+
                 |                   |                   |
                 v                   v                   v
              Accept              Refine /            Discard
                 |                Try another             |
                 v                   |                   |
       atomic command transaction   +---- proposal only--+
                 |
                 v
        autosave accepted website
```

### 2.1. Mutation boundary

| User action | Accepted document changes? | History/autosave effect |
|---|---:|---|
| Edit brief | No | Brief draft only |
| Cancel preparing directions | No | None |
| Preview a direction | No | None |
| Try three other directions | No | Replaces transient direction set only |
| Choose this direction | Yes | Creates one accepted document |
| Switch Simple/Advanced | No | None |
| Open/close device preview | No | None |
| Request or refine a proposal | No | Proposal state only |
| Try another proposal | No | Replaces proposal only |
| Discard proposal | No | None |
| Accept change | Yes | One atomic transaction, then autosave |
| Preview/Share/Publish | No design mutation | Uses latest eligible saved website |

## 3. Guided Brief

The brief turns ordinary language into visible, editable constraints. It must not require the user to write a “good AI prompt”.

### 3.1. Desktop

```text
+----------------------------------------------------------------------------------+
| ZenUI                                      Help                     Save and exit |
+----------------------------------------------------------------------------------+
| STEP 1 OF 3                                                                      |
| Tell us about the website you want                                               |
| Start with one sentence. You can review every detail before anything is created. |
|                                                                                  |
| [ Describe your business or idea .............................................. ] |
| [ ............................................................................ ] |
| [ Use my description ]                                                           |
|                                                                                  |
| YOUR WEBSITE BRIEF                                      5 of 7 details ready     |
| +-------------------------------------+------------------------------------------+ |
| | What do you offer?                  | Who is it for?                           | |
| | [ Team planning software......... ] | [ Small product teams................. ] | |
| +-------------------------------------+------------------------------------------+ |
| | Main goal                          | Main action                              | |
| | [ Get demo requests............ v] | [ Book a demo......................... ] | |
| +-------------------------------------+------------------------------------------+ |
| | Tone and style                     | Brand details                            | |
| | [ Clear, confident, modern...... ] | [ Logo/colors/notes (optional)........ ] | |
| +-------------------------------------+------------------------------------------+ |
| | Sections to include                                                           | |
| | [x] Introduction [x] Benefits [x] Trust [ ] Pricing [x] Questions [x] Contact | |
| +--------------------------------------------------------------------------------+ |
|                                                                                  |
| Missing: describe the audience's main problem.                                   |
| [ Back ]                                             [ Create 3 design directions ]|
+----------------------------------------------------------------------------------+
```

### 3.2. Narrow/mobile

```text
+------------------------------------------+
| ZenUI                     Save and exit  |
+------------------------------------------+
| STEP 1 OF 3                              |
| Tell us about your website               |
|                                          |
| [ Describe your idea.................. ] |
| [ .................................... ] |
| [ Use my description ]                   |
|                                          |
| YOUR BRIEF                     5/7 ready |
| [ What do you offer?                 > ] |
| [ Who is it for?                     > ] |
| [ Main goal                          > ] |
| [ Main action                        > ] |
| [ Tone and style                     > ] |
| [ Brand details              Optional > ]|
| [ Sections to include                > ] |
|                                          |
| Missing: audience problem.               |
| [ Create 3 design directions ]           |
+------------------------------------------+
```

Selecting a row opens one full-width field sheet. The sheet title repeats the question, contains one primary input and returns focus to the originating row when closed.

### 3.3. Brief contract

| Field | Required | Plain-language question | Validation behavior |
|---|---:|---|---|
| Offer | Yes | What do you offer? | Explain what detail is missing; keep entered text |
| Audience | Yes | Who is it for? | Ask for a recognizable audience, not demographic jargon |
| Primary goal | Yes | What should this website achieve? | Choose one main goal; optional secondary notes remain allowed |
| CTA | Yes | What should visitors do next? | Require visible action wording |
| Tone/style | Yes | How should it feel? | Bounded choices plus editable description |
| Brand details | No | Do you already have brand details? | Empty is valid and described as optional |
| Design system | No | Should ZenUI propose the style, or do you have one? | `ZenUI` keeps automatic presets; `Custom` requires structurally valid primary/background/text HEX colors, allowlisted fonts, and bounded type/spacing/radius scales. Low contrast shows a non-blocking readability warning; ZenUI preserves the exact colors and still allows generation. Local preview does not mutate the website. |
| Must-have sections | Yes | What must the website include? | At least introduction and one primary-action surface |

A natural-language description may prefill fields, but never locks them. The user reviews the structured summary before directions are prepared.

### 3.4. Brief states

| State | User-visible copy/behavior | Available recovery |
|---|---|---|
| Empty | Show one example beneath the ordinary-language input | Enter a sentence or fill fields directly |
| Partial | Show completion count and the next missing detail | Open the missing field |
| Invalid | Place a specific message next to the field and summary at top | Correct input; no entered value is erased |
| Ready | Primary action becomes available | Create 3 design directions |
| Preparing | Show bounded progress: “Creating three directions from your brief” | Cancel and return to the unchanged brief |
| Failed | “We couldn't prepare directions. Your brief is safe.” | Try again or continue editing the brief |
| Cancelled | Return to the ready brief without a partial gallery | Start again when ready |
| Saved draft | Confirm “Brief saved” without implying a website exists | Resume from project entry |

## 4. Design Direction Gallery

The gallery compares three bounded materializations of the same accepted brief constraints. Differences must be visible in hierarchy, section layout, narrative rhythm, visual depth and icon treatment, not only color. ZenUI owns twelve preset IDs; one structured planner call may propose exactly three allowlisted IDs and distinct Hero intents. ZenUI then deterministically replaces duplicate, recently shown or structurally similar choices before materializing the final trio. `Try three other directions` requests a new bounded plan while excluding the most recently displayed IDs where the catalog permits.

When the user supplied a custom Design System, every direction preserves its exact primary/background/text colors, fonts, typography scale, spacing and radius—even after a low-contrast warning; only server-owned layout, section variants and narrative rhythm vary. Icons are rendered from allowlisted server-owned inline SVG paths. Provider or user content never supplies SVG paths, CSS, visual tokens or rhythm, and the gallery introduces no gradient or arbitrary-style capability.

### 4.1. Desktop

```text
+-------------------------------------------------------------------------------------------+
| ZenUI | Your website brief                                      [ Adjust brief ] [ Exit ] |
+-------------------------------------------------------------------------------------------+
| STEP 2 OF 3                                                                               |
| Choose a design direction                                      Preview: Desktop | Mobile  |
| All three directions keep your audience, goal, main action and required sections.         |
|                                                                                           |
| +-------------------------+ +-------------------------+ +-------------------------+        |
| | A. Clear momentum       | | B. Trusted advisor      | | C. Bold launch          |        |
| |                         | |                         | |                         |        |
| | [ deterministic        ]| | [ deterministic        ]| | [ deterministic        ]|        |
| | [ rendered preview     ]| | [ rendered preview     ]| | [ rendered preview     ]|        |
| | [ same brief content   ]| | [ same brief content   ]| | [ same brief content   ]|        |
| |                         | |                         | |                         |        |
| | Direct hierarchy and    | | Evidence-first story    | | Strong visual opening   |        |
| | prominent main action.  | | for a cautious audience.| | and energetic sections. |        |
| | [ View larger ]         | | [ View larger ]         | | [ View larger ]         |        |
| | [ Choose this direction]| | [ Choose this direction]| | [ Choose this direction]|        |
| +-------------------------+ +-------------------------+ +-------------------------+        |
|                                                                                           |
| None feel right? [ Try three other directions ]                                           |
+-------------------------------------------------------------------------------------------+
```

`View larger` opens a deterministic preview dialog with the same Desktop/Mobile toggle. It does not select the direction.

### 4.2. Narrow/mobile

```text
+------------------------------------------+
| Back to brief                    Exit    |
+------------------------------------------+
| STEP 2 OF 3                              |
| Choose a direction                       |
| [ Desktop ] [ Mobile ]                   |
|                                          |
| +--------------------------------------+ |
| | A. Clear momentum                   | |
| | [ rendered preview                 ]| |
| | Direct hierarchy and clear action.  | |
| | [ View larger ]                     | |
| | [ Choose this direction ]           | |
| +--------------------------------------+ |
|                                          |
|           1 of 3   [ Previous ] [ Next ] |
|                                          |
| [ Try three other directions ]           |
+------------------------------------------+
```

The mobile gallery uses one card at a time instead of shrinking three cards. Previous/Next, swipe and keyboard controls expose the same order and labels.

### 4.3. Direction rules

1. Every card states why the direction supports the same brief in one or two sentences.
2. Desktop/Mobile changes only the preview surface; it does not create another direction.
3. `Try three other directions` confirms that the current transient set will be replaced, then makes one new structured planner call with up to the three most recently displayed allowlisted IDs excluded; the brief remains unchanged.
4. The provider may propose only three server-owned preset IDs. ZenUI rejects unknown/extra authority fields and deterministically substitutes duplicate, recent or structurally similar choices; repair never issues a second provider call and the visible trio never relaxes its structural-diversity threshold.
5. Within every visible trio, Hero and Features variants, theme presets and benefit-first/proof-first/offer-first story rhythms remain distinct. Richer server-owned variants may also change Testimonials, FAQ and Final CTA composition.
6. Visual depth uses only existing Design Document capabilities: token-based alternating surfaces, borders, shadows, radius, spacing and a bounded editorial divider. No direction can introduce gradients, raw CSS or JavaScript.
7. Inline icons resolve only from the server-owned SVG allowlist and inherit document color/size tokens; user/provider props cannot supply SVG paths.
8. `Adjust brief` returns to editable fields. Preparing again replaces the transient set.
9. `Choose this direction` is the only gallery action that creates an accepted website; prepare/remix do not change the project version or revision list.
10. The one planner response contains one shared Hero intent and exactly three shared feature-image intents (`feature-1`, `feature-2`, `feature-3`; each `query` + localized `alt`); direction entries contain only preset IDs. ZenUI generates stable private keys `shared-hero`, `shared-feature-1`, `shared-feature-2`, `shared-feature-3`, resolves exactly four intents per run in batches of two, prefers generated images and falls back to the server-owned Pexels/import pipeline; AI never supplies a key, URL, provider result ID or asset ID.
11. ZenUI materializes the same successful owned media map into all three directions so comparison focuses on layout and Design System treatment. If generation, search or import is unavailable, failure remains isolated to that slot: a missing feature image creates no empty media panel, Hero may retain its deterministic geometric fallback, and no reload, resize or direction switch starts new image requests.
12. In Simple mode the exact clicked image or server-owned media slot remains the contextual AI target. Image language such as “đổi hình” or “tạo ảnh” is routed to a `replace-media` proposal, while an alt-description request remains a text proposal. The worker prepares an owned image first, and only explicit Accept applies the validated `UPDATE_PROPS` or `REPLACE_SUBTREE`; Discard, stale version and provider failure leave the accepted document unchanged.
13. Unchosen or replaced directions never appear in website history.
14. Double click, swipe or merely viewing a card never chooses it.

### 4.4. Gallery states

| State | User-visible behavior | Available recovery |
|---|---|---|
| Loading | Three labelled skeleton positions or one mobile skeleton; brief summary stays visible | Cancel |
| Ready | Three complete, comparable directions | View, adjust brief, try others or choose |
| Preview loading | Keep card/rationale visible; mark only preview as preparing | Close larger preview or wait |
| Failed | No incomplete card may be chosen; say the brief is safe | Try again or adjust brief |
| Cancelled | Return to ready brief | Prepare directions again |
| Replacing set | Keep current cards readable until replacement is complete, but disable choosing stale cards | Cancel replacement and keep current set |
| Choosing | Disable duplicate submission and announce “Preparing your editor” | If creation fails, remain in gallery with the chosen card intact |

## 5. Section-first Simple Editor

The default editor treats the website as a story made of meaningful sections. Primitive placement remains an Advanced-mode capability.

### 5.1. Desktop

```text
+------------------------------------------------------------------------------------------------+
| ZenUI | Project name | Saved | Undo Redo | Desktop Tablet Mobile | Preview | Share | Publish  |
|                                                         Mode: [ Simple v ]                      |
+----------------------+------------------------------------------------+------------------------+
| PAGE STORY           |                                                | CO-DESIGN              |
|                      |                                                |                        |
| 1. Introduce         |                                                | Working on:            |
|    Header + Hero     |                                                | Benefits section       |
|                      |                                                |                        |
| 2. Build trust       |                 WEBSITE CANVAS                 | [ Make it more        ]|
|    Logos + Results   |                                                | [ persuasive......... ]|
|                      |       select a section to work on it            |                        |
| 3. Explain value     |                                                | Suggestions:           |
|    Benefits          |                                                | [ Shorter ]            |
|    [selected]        |                                                | [ More premium ]       |
|                      |                                                | [ Improve main action ]|
| 4. Handle questions  |                                                |                        |
|    FAQ               |                                                | [ Propose a change ]   |
|                      |                                                |                        |
| 5. Invite action     |                                                | No change is applied   |
|    Final action      |                                                | before you review it.  |
+----------------------+------------------------------------------------+------------------------+
| Benefits section: [ Rewrite ] [ Try another layout ] [ Move ] [ Hide ] [ More v ]             |
+------------------------------------------------------------------------------------------------+
```

Top-bar `Saved` is a plain-language status, not a technical version. `More` contains Duplicate and Delete; Delete requires confirmation and explains undo availability.

### 5.2. Page Story Map

| Story purpose | Example section labels | Default action |
|---|---|---|
| Introduce | Header, Hero | Select and explain its role |
| Build trust | Customer logos, Results, Testimonials | Select and review evidence |
| Explain value | Benefits, How it works, Features | Select and refine clarity/layout |
| Handle objections | Pricing, Questions | Select and review unanswered concerns |
| Invite action | Final action, Contact, Footer | Select and improve next step |

The map uses purpose-oriented groups while preserving actual section order. Reorder actions update both Story Map and Canvas through the command layer. Hidden sections remain listed with a `Hidden` label and a `Show` action.

### 5.3. Selection and contextual scope

```text
No selection ------> Working on: Whole website
Section selected --> Working on: Benefits section
Text selected -----> Working on: Heading in Benefits
Image selected ----> Working on: Image in Introduction
```

1. The scope label is always visible before a proposal request is submitted.
2. Selecting another section updates the contextual toolbar and composer suggestions.
3. `Escape` moves element selection to its containing section, then clears section selection on a second press.
4. Keyboard focus provides the same Select, Move, Hide, More and co-design actions as pointer input.
5. If a requested scope no longer exists, ZenUI stops safely and asks the user to select the current content again.

### 5.4. Narrow/mobile

```text
+------------------------------------------+
| Project | Saved | Undo | Redo | More     |
+------------------------------------------+
| [ Story ]       Mobile preview    [ Ask ]|
+------------------------------------------+
|                                          |
|                                          |
|             WEBSITE CANVAS               |
|                                          |
|       selected: Benefits section         |
|                                          |
+------------------------------------------+
| [ Rewrite ] [ Layout ] [ Move ] [ More ] |
+------------------------------------------+
```

`Story`, `Ask` and `More` open mutually exclusive bottom sheets:

```text
+------------------------------------------+
| CO-DESIGN                         Close  |
| Working on: Benefits section             |
|                                          |
| [ What would you like to improve?..... ] |
| [ .................................... ] |
| [ Shorter ] [ More premium ]             |
|                                          |
| [ Propose a change ]                     |
+------------------------------------------+
```

Narrow-surface rules:

1. Canvas remains the primary surface; no permanent two-column side panels.
2. Opening a sheet moves focus to its heading or first field and traps focus inside it.
3. Closing/Escape restores focus to the originating `Story`, `Ask` or `More` control.
4. Device preview remains selectable under `More`; `Mobile preview` describes the current surface.
5. Section actions may horizontally scroll only when each action remains reachable by keyboard and an overflow `More` control is present.

## 6. AI Change Review

A contextual request creates an isolated proposal. The accepted website remains visible and unchanged until `Accept change`.

### 6.1. Desktop review

```text
+-------------------------------------------------------------------------------------------+
| Review proposed change                                      Scope: Benefits section       |
+-------------------------------------------------------------------------------------------+
| Preserved: main message, “Book a demo” action, brand colors and surrounding sections      |
|                                                                                           |
| [ Current ] [ Proposed ] [ Side by side ]                         Preview: Desktop Mobile  |
| +--------------------------------------+ +--------------------------------------+          |
| | CURRENT                              | | PROPOSED                             |          |
| | deterministic accepted render        | | isolated deterministic render        |          |
| |                                      | | changed area highlighted             |          |
| +--------------------------------------+ +--------------------------------------+          |
|                                                                                           |
| What changed: shortened three benefit descriptions and increased visual separation.       |
|                                                                                           |
| [ Discard ] [ Try another ] [ Refine... ]                         [ Accept change ]         |
+-------------------------------------------------------------------------------------------+
```

On narrow surfaces, Current and Proposed are tabs rather than side-by-side columns. Scope, preserved constraints and action buttons remain visible before Accept.

### 6.2. Proposal lifecycle

```text
Request submitted
       |
       v
Preparing proposal ---- Cancel ----> Editor unchanged
       |
       +---- Failed ---------------> Retry / refine request / discard
       |
       v
Ready for review
       |
       +---- Refine ---------------> Preparing replacement proposal
       |
       +---- Try another ----------> Preparing replacement proposal
       |
       +---- Discard --------------> Editor unchanged
       |
       +---- Accept ---------------> Validate current scope and saved state
                                           |
                              +------------+-------------+
                              |                          |
                              v                          v
                       Atomic apply                 Page changed/stale
                              |                          |
                              v                          +--> Keep proposal visible,
                       Autosave accepted                   ask user to review again
```

### 6.3. Proposal rules

1. `Refine` keeps the current proposal as context but does not chain mutations onto the accepted website.
2. `Try another` uses the same request and preserved constraints unless the user edits them.
3. `Discard` closes review and restores focus to the composer or selected section.
4. `Accept change` validates the exact reviewed proposal against the current accepted website and applies one atomic command transaction.
5. Accept is disabled while the website is saving, offline or stale.
6. A failed Accept never partially mutates the accepted website.
7. Optional provider, token and repair information is absent from Simple mode; safe actionable copy describes only what the user can do next.

### 6.4. Proposal states

| State | User-visible message | Actions |
|---|---|---|
| Preparing | “Preparing a preview of your change” | Cancel |
| Ready | Scope, preserved constraints, visual preview and summary | Accept, Refine, Try another, Discard |
| Failed | “We couldn't prepare this change. Your website is unchanged.” | Retry, edit request, Discard |
| Cancelled | Return to editor; accepted website unchanged | Submit again |
| Applying | “Applying the change” with duplicate submission disabled | Wait |
| Saving | “Change applied, saving…” | Continue viewing; publishing remains disabled |
| Stale page | “Your website changed while this preview was open.” | Refresh proposal or Discard |
| Invalid scope | “That content is no longer available.” | Return to editor and select current content |

## 7. Preview, Share and Publish

Simple mode always acts on the latest eligible saved website. It never asks the primary user to choose a technical snapshot or hosting target.

### 7.1. Preview

```text
+----------------------------------------------------------------------------+
| Preview your website                         Desktop | Tablet | Mobile | X  |
+----------------------------------------------------------------------------+
|                                                                            |
|                    ISOLATED WEBSITE PREVIEW                                |
|                                                                            |
+----------------------------------------------------------------------------+
| Latest saved website                                      [ Back to edit ] |
+----------------------------------------------------------------------------+
```

If unsaved changes exist, Preview labels them clearly as “Your latest edits are still saving” and may show the current local render, but Share/Publish remain tied to a successfully saved website.

### 7.2. Share

```text
+------------------------------------------------------------+
| Share your website                                      X  |
+------------------------------------------------------------+
| Anyone with the link can view the latest saved website.    |
| Search engines are asked not to list this preview.          |
|                                                            |
| [ Create share link ]                                      |
|                                                            |
| Link ready                                                  |
| [ https://share.example/... ] [ Copy ] [ Open ]             |
| [ Turn off link ]                                           |
|                                                            |
| [ Advanced details v ]                                     |
+------------------------------------------------------------+
```

### 7.3. Publish

```text
+------------------------------------------------------------+
| Publish your website                                    X  |
+------------------------------------------------------------+
| This will make your latest saved website public.            |
|                                                            |
| Project: NovaFlow                                          |
| Main action: Book a demo                                   |
| Destination: your public website                           |
|                                                            |
| [ ] I understand this website will become public.           |
|                                                            |
| [ Cancel ]                              [ Publish website ] |
+------------------------------------------------------------+
```

Success:

```text
+------------------------------------------------------------+
| Your website is live                                       |
| [ https://example-site... ] [ Copy ] [ Open website ]       |
|                                                            |
| [ Back to editor ]                                         |
+------------------------------------------------------------+
```

`Advanced details` may reveal immutable revision, deployment provider, target and technical status for secondary users. It is collapsed by default and is never required to publish.

### 7.4. Lead Form surfaces (Phase 12 F1 baseline + managed F2 Share)

A Lead Form is one bounded composite section, not a free-form HTML builder. Owner/editor can add it from the section library or receive a server-materialized default from Guided Brief. Its field builder offers only Text, Email, Phone, Long text and Select, plus optional consent. It enforces the bounded F1 limits and never exposes action URL, recipient, webhook, method/header, hidden field, file, password or payment controls.

```text
+----------------------------------------------------------------------------+
| Lead form                                                   Preview only    |
+------------------------------------------+---------------------------------+
| Title        [ Request a consultation ]  | Fields (maximum 12)             |
| Description  [________________________]  | 1. Name        Text   Required  |
| Submit label [ Send request___________]  | 2. Work email  Email  Required  |
| Success copy [________________________]  | 3. Need         Select Optional  |
|                                          | [ Add field ] [ Reorder ]        |
| Consent [ ] [ I agree to be contacted ] |                                 |
+------------------------------------------+---------------------------------+
| Bản xem trước — chưa gửi dữ liệu.                                          |
+----------------------------------------------------------------------------+
```

Rules:

1. Labels remain visible; placeholder never replaces a label. Required/optional state and consent are conveyed in text, not color alone. Field errors are associated with their controls and focus moves to the first invalid field.
2. Every field add/edit/reorder/delete uses the existing atomic command/autosave/history boundary. Invalid edits rollback the complete transaction.
3. Drag-and-drop is structural: it changes only the Lead Form parent or order in the document tree, never an x/y coordinate or free-position offset. Horizontal placement uses the shared `Bố cục biểu mẫu` controls with four bounded states: `Canh trái`, `Canh giữa`, `Canh phải` and `Toàn chiều rộng`; a new Lead Form defaults to centered full available width capped at 720px.
4. Canvas and isolated Preview call `preventDefault` and announce “Bản xem trước — chưa gửi dữ liệu”; no network submission, publication token or fake success state is created.
5. Standalone ZIP Export and ordinary compiler output remain visual-only, keep `form-action 'none'`, `script-src 'none'` and `connect-src 'none'`, and do not claim successful collection.
6. Creating/reusing a managed Share provisions exact immutable Lead Form bindings before the server returns `leadFormsLive: true`. Only that server-confirmed state may show “Chia sẻ website để nhận khách hàng”; a link without an active binding keeps ordinary “Website được chia sẻ” copy.
7. The managed Share uses native POST with no generated JavaScript. Receipt is generic and no-PII. Visitor values never enter editor state, Design Document, command history or autosave.
8. The Share panel discloses “Thông tin khách hàng được lưu tối đa 90 ngày.” Email, push, webhook and CRM settings are not present.

Managed Share state:

```text
+------------------------------------------------------------+
| Chia sẻ website để nhận khách hàng                          |
+------------------------------------------------------------+
| Ai có liên kết đều có thể xem website đã lưu mới nhất.     |
| Thông tin khách hàng được lưu tối đa 90 ngày.               |
|                                                            |
| Website nhận khách hàng       Đang hoạt động   [Mở] [Sao chép] |
+------------------------------------------------------------+
```

### 7.5. Publish eligibility and recovery

| State | Preview | Share | Publish | Plain-language recovery |
|---|---:|---:|---:|---|
| Saved | Yes | Yes | Yes | None required |
| Unsaved | Local preview allowed | Disabled | Disabled | Wait for saving or resolve save issue |
| Saving | Local preview allowed | Disabled | Disabled | “Saving your latest edits…” |
| Offline | Local preview allowed | Existing link may be shown | Disabled | Reconnect; keep edits safely recoverable |
| Save failed | Local preview allowed | Disabled for new link | Disabled | Try saving again or download recovery copy |
| Conflict | Current local preview labelled | Disabled | Disabled | Review latest saved website before continuing |
| Lead settings invalid | Visual-only | Disabled for live forms | Disabled for live forms | Owner completes privacy notice and valid retention/intake settings |
| Form publication failed | Visual-only | Not ready; retry/disable | Not ready; retry/cancel | Never show a live form until immutable binding is active |
| Sharing failed | Yes | Retry | Unaffected if eligible | “We couldn't create a link. Try again.” |
| Publishing queued | Yes | Yes | Duplicate publish disabled | Show human-readable progress and allow dialog close |
| Publishing failed | Yes | Yes | Retry after actionable message | Never expose raw provider error in Simple mode |
| Published | Yes | Yes | Publish again only after a newer saved change | Open/copy public URL |
| Cancelled confirmation | Yes | Yes | No publish started | Return to editor unchanged |

## 7A. Image Library and Brand Kit (Stage 10A)

Simple mode adds an `Ảnh và thương hiệu` surface below the Canvas. It acts only on the exact selected content image or the selected server-owned Hero media slot; upload/import completion never changes the accepted document automatically. The Canvas exposes `Thêm ảnh Hero` on the fallback slot and `Thay ảnh` on an existing image so the target is discoverable without selecting an unrelated first image implicitly.

```text
+----------------------------------------------------------------------------+
| Thư viện ảnh                              | Brand Kit                       |
+--------------------------------------------+--------------------------------+
| [ Tải ảnh lên ] [ Tìm ảnh ______ ] [Tìm]  | Tên thương hiệu [___________] |
|                                            | Primary / background / text    |
| [ owned asset ] [ derivative ]             | Heading font / body font       |
|                                            |                                |
| Mô tả ảnh [____________________________]   | +----------------------------+ |
| [ ] Ảnh chỉ để trang trí                   | | Live brand preview         | |
| Cắt: [ Vuông ] [ Ngang ]                   | +----------------------------+ |
| [ Dùng ảnh đã chọn ]                       | [Lưu] [Áp dụng cho website]   |
+----------------------------------------------------------------------------+
```

Rules:

1. Upload accepts JPEG/PNG/WebP and announces bounded processing. Its guidance names the supported formats and recommends a landscape Hero image (`16:9`, at least `1200×675`). Search/import uses a fixed provider result ID; no provider key/source URL is shown.
2. Crop creates a new immutable derivative. The parent remains in the library, and the document changes only when the user chooses `Dùng ảnh đã chọn`.
3. Content images require a meaningful description. `Ảnh chỉ để trang trí` is explicit and intentionally stores empty alt.
4. Applying to an existing image queues one `UPDATE_PROPS` command through existing autosave/history; legacy `src` is removed atomically using the JSON-safe patch-deletion contract. Applying to the selected Hero fallback queues one atomic `REPLACE_SUBTREE`, selects the new owned image and allows Undo to restore the complete fallback.
5. Asset controls never fall back to the first image in the page. Until a specific image or Hero slot is selected, the library explains how to choose a target and keeps apply disabled.
6. Brand Kit preview does not mutate the website. Save is optimistic and owner-only; Apply maps only theme/navbar/brand slots through one server transaction.
7. Empty optional logo is valid. When supplied, it must be a ready workspace-owned asset; arbitrary URLs/fonts are not accepted.
8. Busy, failed and retry states use safe copy. The 390px surface becomes one column with at least 44px controls and retains keyboard access.
9. Canvas, isolated Preview, Share, Export and Publish resolve the same opaque asset ID through the configured cookie-free asset origin. Viewer surfaces render the image/fallback only and never expose editor mutation controls.

## 7B. Multi-page and Navigation (Stage 10B1)

Simple mode places a bounded Page Manager before the active page's Story. Switching pages changes editor context only; it does not create a command or autosave.

```text
+----------------------------------------------------------------------------+
| Trang                                                | Điều hướng          |
+------------------------------------------------------+---------------------+
| [Home] [About] [Contact]                  [Thêm trang]| [x] Home            |
|  ↑  ↓  Đổi tên  Nhân bản  Xóa                         | [x] About           |
|                                                      | [ ] Contact         |
| Đường dẫn: /about                                    |  ↑  ↓  Nhãn         |
+------------------------------------------------------+---------------------+
| Câu chuyện của trang đang chọn | Canvas | Chỉnh sửa section / AI          |
+----------------------------------------------------------------------------+
```

Rules:

1. One Home page is mandatory and always uses `/`. Page IDs remain stable across rename, reorder and slug changes.
2. Create, rename/slug, reorder, duplicate, delete and navigation apply through typed atomic commands with the current optimistic version. A switch between pages is local UI state only.
3. Slug fields show the normalized safe route and actionable errors for reserved names, collisions, traversal, encoded separators or excessive length/depth.
4. Delete and slug changes first show affected navigation/internal links. ZenUI never silently retargets a link; the user must remove or reassign affected references in one accepted batch.
5. Advanced Layers/Inspector and Simple Page Story display only the active page. Drag/drop cannot cross page roots. Contextual page AI is scoped to the active page.
6. Preview includes a route/page switch and renders deep links on the isolated origin. Share, Export and Publish operate on the complete latest saved immutable site rather than only the active page.
7. At 390px, Page Manager and Navigation become keyboard-accessible sheets. Modal impact confirmation traps/restores focus, supports Escape where safe and keeps primary controls at least 44px.
8. Viewer is read-only. Empty/loading/error/offline/conflict states preserve the active valid page or fall back to Home with a plain-language announcement.

## 7C. Customer Leads Inbox (implemented, in review)

Accepted projects add `Khách hàng` only for owner/editor. Viewer does not receive the navigation item and direct API access is denied without rendering PII. Inbox is project-scoped. The capability remains `In review` until owner completes the normal local-live visitor-to-Inbox journey.

```text
+----------------------------------------------------------------------------+
| Customer Leads                                                            |
| Khách hàng                     Thông tin được lưu tối đa 90 ngày.          |
+-------------------------------------+--------------------------------------+
| Danh sách khách hàng                | Chi tiết khách hàng                  |
| Khách hàng mới  Nhận tư vấn         | Nhận tư vấn                          |
| 13 Aug 2026, 15:00                  | Email   visitor@example.test         |
|-------------------------------------|                                      |
| Đã liên hệ       Đăng ký demo       | [ Đánh dấu đã liên hệ ]              |
| 12 Aug 2026, 10:30                  |                                      |
+-------------------------------------+--------------------------------------+
```

MVP rules and states:

1. List is newest-first and bounded. The first release supports only `Mới` and `Đã liên hệ`; broad plaintext PII search, qualified/won/lost/spam filters, notes and CSV are out of scope.
2. Detail decrypts only after authorization. Loading, empty, unavailable/decrypt-failed and retention-expired states never leave stale PII from the prior selection on screen.
3. “Đánh dấu đã liên hệ” uses optimistic versioning. Conflict keeps the server version, announces that another update won and offers reload; it never silently overwrites.
4. Owner/editor may read and process leads. Viewer cannot access navigation or Lead PII. Cross-project lookup fails tenant-safely before decryption.
5. Retention is fixed at 90 days for the first slice and must be disclosed before enabling intake. Selectable retention, manual delete, email, webhook/CRM and notification settings are later capabilities.
6. Mobile presents list and detail sequentially. Opening detail moves focus to its heading; Back/Close restores focus to the originating row. All controls are at least 44px, labels survive 200% zoom and axe serious/critical findings block acceptance.
7. Persisted Inbox is the source of truth. Initial count fetch, approximately 30-second visible-only polling and immediate focus/visibility refresh update the `Khách hàng mới` badge; polling failure never loses a lead. `aria-live="polite"` announces only increases after the baseline count.
8. “Báo ngay” is this in-product badge only; no email, push, webhook or CRM notification is included.
9. Implementation stays `In review` until owner completes the normal local-live visitor/owner journey without E2E session, DevTools or database inspection.

## 8. Visual Design and In-depth Editing

The implementation values remain `simple | advanced`; the product-facing names describe the working style rather than the user's technical background.

### 8.1. Surface matrix

| Capability | Visual Design (`simple`) | In-depth Editing (`advanced`) |
|---|---|---|
| Default navigation | Guided journey and Page Story Map | Components and Layers |
| Editing unit | Website section or visible content | Design node/component |
| Properties | Common content and section actions | Full Inspector metadata and responsive overrides |
| AI entry | One contextual composer | Technical generate/edit scope may remain available |
| Responsive behavior | Automatic plus device preview | Explicit responsive controls |
| History | Undo/Redo, saved status, named immutable revisions and restore | The same immutable revisions plus technical document-version context |
| Publish | Latest saved website | Immutable revision and provider target details |
| Intended workflow | Visual, section-first website editing | Detailed component and hierarchy control |

### 8.2. Transition contract

```text
Visual Design -- “Open in-depth editing” confirmation --> In-depth Editing
In-depth Editing -------- “Return to Visual Design” -----> Visual Design
```

1. The first entry to In-depth Editing explains that it exposes components, hierarchy and detailed responsive controls; it does not imply data loss.
2. Transition creates no command, history entry or autosave.
3. Current viewport and valid selection are preserved. A primitive-only selection maps to its containing section when returning to Visual Design.
4. Any open proposal must be accepted or discarded before changing mode; mode switch never silently accepts it.
5. Focus moves to the destination experience heading and can return to the switch.
6. Output before and after an immediate round trip must be identical.
7. Named immutable revisions are available in both experiences and use the same server API, authorization and restore semantics.

## 9. Plain-language vocabulary

Simple-mode copy follows this table. Technical terms may appear only in Advanced mode or in developer documentation.

| Do not use in Simple happy path | Use instead | Allowed technical location |
|---|---|---|
| Container | Section or part of the section | Advanced Components/Layers |
| Node / node ID | Selected text, image or section | Advanced metadata/debugging |
| Component hierarchy | Page Story | Advanced Layers |
| Breakpoint | Desktop, Tablet or Mobile preview | Advanced responsive controls |
| Token count | No equivalent needed | Advanced AI run details |
| Repair attempt | “Preparing the change” or actionable failure copy | Advanced AI run details |
| Revision / revision ID | Latest saved website or website history | Advanced history/publish details |
| Provider | Publishing service | Advanced connection details |
| Deployment target | Public website or preview website | Advanced publish details |
| Command transaction | Apply change | Internal contract only |
| Invalid model output | “We couldn't prepare this change” | Safe logs/Advanced diagnostics |
| Stale document version | “Your website changed while this preview was open” | Internal API/Advanced diagnostics |

Copy rules:

1. Say what happened, whether the website changed and what the user can do next.
2. Never blame the user for provider, validation or connectivity failures.
3. Do not describe a proposal as applied until atomic acceptance succeeds.
4. Do not describe a website as public until publish status is ready and a validated URL exists.
5. Do not claim conversion improvement; use “supports the goal” or “makes the action clearer”.

## 10. Unified status contract

| Surface | States | Required user-facing fact |
|---|---|---|
| Brief | empty, partial, invalid, ready, preparing, failed, cancelled, saved | Whether entered information is safe |
| Directions | loading, ready, preview-loading, failed, cancelled, replacing, choosing | Whether any website has been created |
| Document | loading, ready, invalid, conflict | Whether editing is available and recoverable |
| Autosave | idle, dirty, saving, saved, offline, failed | Whether latest edits are eligible for Share/Publish |
| Proposal | idle, preparing, ready, failed, cancelled, applying, stale, invalid-scope | Whether accepted website changed |
| Preview | closed, loading, ready, failed | Which local/saved state is being shown |
| Share | none, creating, active, disabling, disabled, failed | Who can view and whether link is active |
| Publish | unavailable, confirmation, queued, publishing, ready, failed, cancelled | Whether website is public and destination URL |
| Lead form | editing, structurally-invalid, preview-only | F1 is visual-only and does not submit or store visitor data |
| Customer Leads | planned, unavailable | Public intake/Inbox is not implemented until the complete vertical slice is accepted |
| Mode | simple, entering-advanced, advanced, returning-simple | Transition never changes output |

No status may rely on color alone. Progress announcements must be bounded and must not repeatedly announce cosmetic animation frames.

## 11. Accessibility contract

1. Each screen has one primary heading and stable `header`, `main`, `nav`, `aside` and `footer` landmarks where applicable.
2. All pointer actions have keyboard equivalents with visible focus indicators.
3. Direction cards use a labelled group; viewing a card and choosing it are separate controls.
4. Dialogs and bottom sheets move focus inside, trap it while modal, close with Escape when safe and restore focus to the opener.
5. Destructive Delete, replacing directions and turning off a share link require explicit text confirmation; they do not depend on icon recognition.
6. `aria-live="polite"` announces meaningful state changes such as saved, proposal ready and publish ready. Validation failures use `role="alert"` only once per submit attempt.
7. Loading skeletons have an accessible status label and are hidden from the accessibility tree when decorative.
8. Current selection, hidden state, active device and active direction card are conveyed with text/semantics in addition to color.
9. Touch targets are at least 44 by 44 CSS pixels on narrow surfaces.
10. Motion is non-essential; reduced-motion preference removes sliding/animated transitions without hiding progress or state.
11. Side-by-side proposal review must have a tabbed sequential equivalent at narrow widths and high zoom.
12. Zoom to 200% must not hide Accept, Discard, error recovery or mode exit controls.

## 12. Deterministic prototype fixture contract

Stage 4 step 2 must expose stable fixture/state IDs so owner, mentor and representative non-coder can review the same behavior without external requests.

| Fixture/state ID | Surface | Required evidence |
|---|---|---|
| `brief-empty` | Guided Brief | Empty guidance and direct-field path |
| `brief-partial` | Guided Brief | Completion summary and one missing required field |
| `brief-invalid` | Guided Brief | Inline error with preserved input |
| `brief-preparing` | Guided Brief | Bounded progress and Cancel |
| `brief-failed` | Guided Brief | Safe brief plus retry/edit recovery |
| `directions-loading` | Gallery | Three stable desktop slots and mobile single-card skeleton |
| `directions-ready` | Gallery | Three visibly different directions sharing constraints |
| `directions-failed` | Gallery | No selectable partial result |
| `directions-replacing` | Gallery | Current set retained until replacement succeeds |
| `editor-simple` | Editor | Page Story, Canvas, contextual composer and section actions |
| `editor-narrow` | Editor | Canvas-first layout and accessible bottom sheets |
| `editor-advanced` | Editor | Existing Components/Layers/Inspector access |
| `proposal-preparing` | Review | Scope, unchanged accepted website and Cancel |
| `proposal-ready` | Review | Current/Proposed, preserved constraints and four decisions |
| `proposal-failed` | Review | Accepted website unchanged and recovery |
| `proposal-stale` | Review | Accept blocked and refresh/discard path |
| `save-unsaved` | Editor/publish | Preview labelled; Share/Publish disabled |
| `save-offline` | Editor/publish | Recovery copy/reconnect path |
| `share-ready` | Share | Plain-language public-link explanation |
| `publish-confirm` | Publish | Latest saved website and explicit public confirmation |
| `publish-progress` | Publish | Human-readable progress with duplicate action disabled |
| `publish-ready` | Publish | Validated public URL and editor return |
| `publish-failed` | Publish | Actionable safe failure without provider terminology |

Prototype constraints:

- Use local fixtures and existing deterministic renderer primitives.
- No Gemini, Pexels, network image search or publishing-provider request.
- Desktop target demonstrates three-column gallery and three-surface editor.
- Narrow target demonstrates one-card gallery, Canvas-first editor and bottom-sheet focus behavior.
- Fixture navigation may be a prototype-only control, visually separated from the product happy path.
- Prototype must make accepted versus proposed state visually and semantically distinguishable.

## 13. Stage 4 step 1 acceptance checklist

- [x] Complete happy path is specified from Guided Brief through Publish.
- [x] Desktop and narrow/mobile layouts are specified.
- [x] Empty, loading, invalid, error, cancel, stale, offline and unsaved paths are specified.
- [x] Simple mode avoids primitive and infrastructure terminology in its happy path.
- [x] Advanced mode has explicit entry/exit and preserves existing capabilities.
- [x] AI proposal has Accept, Refine, Try another and Discard without pre-Accept mutation.
- [x] Accessibility and focus behavior are explicit.
- [x] Deterministic prototype fixtures are enumerated and forbid external provider calls.
- [x] Deterministic browser prototype is implemented and reviewed.
- [x] Mentor and representative non-coder acceptance evidence is recorded; owner-reported evidence on 2026-07-27 confirms mentor acceptance and one representative non-coder completed the journey without reported blocking friction. Measured time/confidence were not supplied.
