# SOP Template Benchmark — Logistics / Supply Chain (UAE, Procurement pilot)

Date: 2026-10-08
Status: Research note (input to the Process AI SOP generator design)

Evidence labels used below:
- **[Public]** — stated in a public source listed in section 2.
- **[Practice]** — common industry / audit practice; not tied to a named company's internal template.
- No internal templates from DHL, Maersk, DP World, Kuehne+Nagel, Aramex, DSV or UPS were reviewed. Only public documents (mostly codes of conduct, handbooks and press material) were used.

---

## 1. Summary — what strong SOP templates have in common

- **Document control comes first, and it is auditable.** Every standard reviewed expects a unique identifier, title, date, author/owner, approval by an authorised person, a visible current revision, and a defined retention period (ISO 9001 7.5.2/7.5.3; EU GDP Ch. 4). [Public]
- **A clear document hierarchy.** Policy (why, rules) → Process (what flows end to end) → SOP (who does what, in what order, with which decisions) → Work Instruction (how one task is done in one system). The SOP links up to the policy and down to work instructions; it does not repeat them. [Practice]
- **Roles, not names.** Steps are assigned to roles, with a RACI and a named accountable owner for the whole document. [Practice]
- **Decisions, exceptions and escalation are written out**, not left implicit. GDP requires deviations to be documented and investigated, with CAPA. [Public]
- **Controls are identifiable and evidenced.** Each control has an ID, type (preventive/detective), owner, frequency and the record that proves it ran (COSO-style control matrix). [Public / Practice]
- **Measured performance.** KPIs/SLAs are linked to steps and, where useful, to standard metric definitions (SCOR DS, e.g. RL.1.2 Perfect Supplier Order). [Public]
- **Records and retention are explicit.** Which records the procedure creates, where they are kept and for how long (UAE commercial records: at least 5 years; EU GDP: at least 5 years). [Public]
- **Periodic review and training are part of the document.** TAPA FSR expects procedures to be documented, training to be recorded, and the risk assessment to be updated at least once a year; IATA DGR training uses a competency-based model (CBTA) with recurrent training every 24 months. [Public]

---

## 2. Sources reviewed

Standards and regulation
- ISO 9001:2015 cl. 7.5 overview — https://www.isms.online/iso-9001/clause-7-5-documented-information/ — identification, review/approval, version control, retention (7.5.2/7.5.3).
- ISO 9001 7.5.3 explained — https://www.thecoresolution.com/clause-7-5-3-iso-90012015-explained — distribution, access, preservation, disposition.
- ISO 28000:2022 overview (ANSI) — https://blog.ansi.org/anab/what-is-iso-28000/ — security management system scope; risk-based operational controls.
- ISO 28000 summary — https://en.wikipedia.org/wiki/ISO_28000 — 2022 revision aligned to the ISO management-system structure (Annex SL).
- EU GDP Guidelines 2013/C 343/01 (EUR-Lex) — https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=oj%3AJOC_2013_343_R_0001_01 — Ch. 4: procedures approved, signed and dated; clear language; records kept at least 5 years. Ch. 9: transport deviations and temperature excursions.
- European GDP Association, Part 4 Documentation checklist — https://gdp.gmp-compliance.org/about-gdp/news/news-details/checklist-for-implementation-of-gdp-principles-part-4-documentation.html — practical audit checklist for procedures and records.
- European GDP Association, Part 9 Transportation checklist — https://gdp.gmp-compliance.org/about-gdp/news/news-details/checklist-for-implementation-of-gdp-principles-part-9-transportation.html — excursion procedure, reporting to recipient.
- TAPA FSR 2023 standard — https://tapa.memberclicks.net/assets/2023_FSR-TSR_Standards/2023_FSR_Documents/FSR%202023%20Standard.pdf — all required procedures documented; training records; annual risk assessment; a named security owner.
- TAPA TSR 2023 standard — https://tapa.memberclicks.net/assets/2023_FSR-TSR_Standards/2023_TSR_Documents/TSR%202023%20Standard.pdf — trucking security: in-transit procedures, escalation.
- IATA DGR courses / CBTA — https://www.iata.org/en/training/subject-areas/dangerous-goods-regulations-courses/ — function-based competency training for DG roles.
- SCOR DS Quick Reference (ASCM) — https://www.ascm.org/globalassets/documents--files/corporate-transformation/scor-ds-digital-guide_final.pdf — processes (Orchestrate, Plan, Order, Source, Transform, Fulfill, Return) and metric coding.
- SCOR metric RL.1.1 — https://scor.ascm.org/performance/reliability/RL.1.1 — example of a metric definition format (code, attribute, level).
- UAE PDPL (Federal Decree-Law 45/2021) — https://u.ae/en/about-the-uae/digital-uae/data/data-protection-laws — personal data handling (supplier contacts, employee data).
- UAE Cabinet Decision 74/2020 (TFS) — https://www.moet.gov.ae/en/targeted-financial-sanctions — ongoing screening against the UAE Local Terrorist List and UN lists; act within 24 hours of list updates.
- UAE Commercial Transactions Law (FDL 50/2022) — https://uaelegislation.gov.ae/en/legislations/1610 — commercial books, invoices and correspondence kept at least 5 years.
- UAE AEO programme (ICP) — https://icp.gov.ae/en/economic-operator/ — customs security/compliance; written internal controls and record keeping.
- COSO control activities (Syracuse Univ. guide) — https://finance.syr.edu/audit/general-internal-controls/internal-control-types-and-activities/ — preventive vs detective; approvals, reconciliations, reviews.

Public logistics-company material
- DHL Group Supplier Code of Conduct — https://group.dhl.com/en/about-us/code-of-conduct/supplier-code-of-conduct.html — referenced from DHL's Corporate Procurement Policy as a minimum standard (policy-level, not SOP-level).
- Maersk Third Party Code of Conduct — https://www.maersk.com/about/sustainability/third-party-code-of-conduct — risk-based supplier due diligence (audits, self-assessments, document reviews) and integrity checks before contract.
- Maersk responsible procurement — https://www.maersk.com/procurement/what-we-expect-of-suppliers — supplier risk segmentation.
- DP World Vendor Code of Conduct v3.0 — https://dpw-p-001.sitecorecontenthub.cloud/api/public/content/2761e3d17e134652bc8ad86424b017ae?v=e6a697d1 — versioned policy document; vendor pre-qualification; sanctions/export controls covered.
- DP World GCC Supplier Handbook — https://www.dpworld.com/uae/-/media/project/dpwg/dpwg-tenant/mea/uae/media-files/publications/newmediafiles/supplier-handbook_rev09.pdf — public example of a structured document ID with revision: `DPW-JA-SP-PRO&MM-SHAND Rev.09` (entity–site–type–function–doc + revision). Body text not extracted.
- DP World Americas Code of Conduct "DG-15" — https://www.dpworld.com/dakar/-/media/project/dpwg/dpwg-tenant/americas/brazil/santos/media-files/dg-15-code_of_conduct-15072019-rev02.pdf — cover shows "Approved by / Date / Code / Rev" block.
- Kuehne+Nagel HealthChain / PharmaChain — https://newsroom.kuehne-nagel.com/the-heart-of-the-matter-the-evolution-of-our-healthchain-quality-certified-network/ — states that SOPs are managed in a pharma-compliant document management system, with lane-level risk assessments and shipment-specific SOPs.
- Aramex Supplier Code of Conduct 2024 — https://www.aramex.com/docs/default-source/address-book/aramex-supplier-code-of-conduct---2024.pdf — UAE-headquartered peer; supplier ethical and legal expectations.
- DSV Supplier Code of Conduct — https://www.dsv.com/en/sustainability-esg/governance/policies/supplier-code-of-conduct — anti-corruption, including facilitation payments.

General SOP practice
- SOP vs work instruction vs policy — https://covisionconsultants.com/sop-vs-work-instruction-vs-policy-difference/ — hierarchy definitions.
- Procedures vs work instructions — https://www.bizmanualz.com/write-better-procedures/are-procedures-the-same-as-work-instructions.html — scope boundary between SOP and WI.

What the public company sources show: they publish **policy-level** documents (codes of conduct, handbooks) with version and approval metadata. None publishes an operational SOP template. Everything below the policy level in this note is [Practice].

---

## 3. Recommended SOP template (sections in order)

Legend for the "Filled by" column: `process.*`, `step.*`, `connection.*`, `rule.*`, `evidence.*`, `kb.*`, `version.*` = Process AI fields. **Owner** = written by the process owner. **Gen** = generated or derived by the app.

### 0. Cover and document control block
- **Purpose:** identify the document and show its status at a glance (ISO 9001 7.5.2; GDP Ch. 4).
- **Content:** Document ID; title; version; status (Draft / In review / Approved / Superseded); owner role and name; approver(s); effective date; next review date; classification (Public / Internal / Confidential / Restricted); department; process level (L1–L4); language.
- **Filled by:** `process.name`, `process.owner_role`, `version.number`, `version.approvals[]` (approver, date). Gen: Document ID, next review = effective date + review cycle. **Gaps:** classification, effective date, review cycle, owner name, document status (see section 6).

### 1. Purpose
- **Content:** 2–4 sentences: why the procedure exists and what result it guarantees.
- **Filled by:** `process.purpose`.

### 2. Scope
- **Content:** in scope / out of scope; applicable entities, sites and departments; trigger (start event); end condition; frequency/volume.
- **Filled by:** `process.scope`, `process.trigger`, `process.end_condition`, `process.frequency`, `process.volume`. Out-of-scope items and applicable entities: Owner (gap).

### 3. Definitions and abbreviations
- **Content:** a table of terms (PR, PO, RFQ, GRN, DoA, 3-way match, etc.).
- **Filled by:** Gen (draft by collecting system names and acronyms from `step.systems`, `rule.*`); Owner confirms. Suggest a shared glossary in the knowledge base.

### 4. References
- **Content:** parent policy; related SOPs (upstream/downstream); work instructions; forms/templates; external standards and regulation (e.g. Delegation of Authority, Procurement Policy, ISO 9001 7.5, Cabinet Decision 74/2020).
- **Filled by:** `kb.linked_documents[]` (type policy/SOP, title, ID, version). Gen: list upstream and downstream processes when connections cross process boundaries. External regulations: Owner (gap: `kb` has no "external regulation" type).

### 5. Roles and responsibilities
- **Content:** one row per role: role, responsibilities in this SOP, authority (e.g. approval limit).
- **Filled by:** distinct `step.actor_role`; `step.approval_authority`; `process.owner_role`. Gen: a responsibilities summary per role from that role's steps.

### 6. RACI matrix
- **Content:** activities (rows; key steps or step groups) × roles (columns), with exactly one A per row.
- **Filled by:** R = `step.actor_role`; A = `step.approval_authority` if present, otherwise `process.owner_role`. **Gap:** C and I are not captured (section 6). Validation rule: flag rows with no A or with more than one A.

### 7. Process overview
- **Content:** (a) flow diagram, swimlanes by role, generated from the model; (b) summary table: step ID, step name, role, system, SLA; (c) the process's place in the hierarchy (parent process, SCOR process such as "Source").
- **Filled by:** `step.*`, `connection.*` (render as BPMN-style swimlanes). SCOR mapping: gap.

### 8. Detailed procedure
- **Content:** numbered steps. For each step:
  - Step ID and name; type (task / decision / approval)
  - Actor role; system(s); manual or automated
  - Inputs; outputs and records created
  - Expected duration; SLA
  - Related controls (control IDs) and business rules
  - Linked work instruction (if any)
  - Next step(s), including the condition for each branch
- **Filled by:** `step.type`, `step.actor_role`, `step.systems`, `step.inputs`, `step.outputs`, `step.execution`, `step.expected_duration`, `step.sla`, `step.approval_authority`, `connection.*`; rules linked via `rule.*`. Start/end steps become the trigger/end lines and are not numbered as tasks.
- **Writing rule:** each step starts with an imperative verb ("Verify…", "Approve…"); one action per step.

### 9. Decision criteria
- **Content:** a table for each decision step: decision question; criteria/threshold; outcome → next step.
- **Filled by:** decision `step.*` + `connection.condition` + `rule.type=threshold|approval`.

### 10. Exceptions and escalation
- **Content:** exception; how it is detected; handling path; escalation role and time trigger; whether a deviation record is needed (GDP-style deviation/CAPA).
- **Filled by:** `connection.*` flagged as exception paths; `rule.type=sla` gives time-based escalation. **Gap:** escalation role/level and timing (section 6).

### 11. Business rules and controls (control matrix)
- **Content:** a table with one row per rule or control:
  - Control ID; description; linked risk
  - Type: preventive or detective; manual, automated or IT-dependent manual
  - Frequency; control owner
  - Evidence / record that proves it ran; step ID(s) where it applies
  - Key control? (Y/N)
- **Filled by:** `rule.type` (threshold/approval/compliance/sla/control), `rule.description`, linked step IDs. Gen: Control ID. **Gaps:** preventive/detective, owner, frequency, evidence, key-control flag, linked risk.
- Note: keep `rule.*` (what must be true, e.g. "PO > AED 500k needs CFO approval") separate from controls (the activity that enforces it). One rule can have several controls.

### 12. KPIs and SLAs
- **Content:** KPI name; definition/formula; target; data source; frequency; owner; optional SCOR reference. Procurement examples: PR-to-PO cycle time; % of spend under contract; PO first-time-right; RL.1.2 Perfect Supplier Order; % of POs approved within SLA; maverick spend %.
- **Filled by:** step-level `step.sla` rolled up (Gen); `process.frequency/volume` gives the baseline. **Gap:** process-level KPIs and targets.

### 13. Records and retention
- **Content:** record name; created at step; system/location; owner; retention period; disposal method; confidentiality.
- **Filled by:** `step.outputs` (as candidate records) + `step.systems`. **Gap:** retention period and classification. Default suggestion: at least 5 years for commercial records (UAE FDL 50/2022); GDP-scope records at least 5 years or national requirement.

### 14. Risks
- **Content:** risk; cause; impact; rating; mitigating control IDs. Seed it from pain points.
- **Filled by:** `step.pain_points` (Gen drafts candidate risks); link to section 11 control IDs. **Gap:** a structured risk entity (likelihood, impact, rating).

### 15. Training and competence
- **Content:** a table per role: required training or qualification; initial vs refresher; frequency; record location. Example: IATA DG training every 24 months; TAPA security awareness; DoA training for approvers.
- **Filled by:** Owner (gap). Gen can list the roles from section 5.

### 16. Evidence and provenance (appendix)
- **Content:** sources this SOP was modelled from (interviews, documents, system logs), with dates and confidence. This is specific to Process AI and supports auditability of the model itself.
- **Filled by:** `evidence.*`.

### 17. Revision history
- **Content:** version; date; author; summary of changes; sections affected; approver.
- **Filled by:** `version.history[]`. Gen: draft the change summary from a diff of the model.

### 18. Approval and sign-off
- **Content:** prepared by / reviewed by / approved by: role, name, signature (electronic), date. GDP requires approval to be signed and dated.
- **Filled by:** `version.approvals[]`. **Gap:** a formal reviewer vs approver distinction, and e-signature metadata.

Appendices (optional): forms and templates; full RACI; system screen references; the glossary.

---

## 4. Logistics-specific optional sections (enable by process type)

| Optional section | Enable when | Content | Source basis |
|---|---|---|---|
| A. Third-party due diligence and sanctions screening | Supplier onboarding, PO to a new vendor, payments, any cross-border trade | Screening lists (UAE Local Terrorist List, UN Consolidated List, plus OFAC/EU if policy requires); when to screen (onboarding, list updates, before payment); match handling; freeze/report path; records | Cabinet Decision 74/2020 [Public]; Maersk and DP World integrity due diligence [Public] |
| B. Anti-bribery and conflict of interest | Sourcing, tendering, award | Conflict-of-interest declaration step; gifts and hospitality limits; segregation of duties between requester, buyer and approver | DSV and DP World codes of conduct [Public]; SoD [Practice] |
| C. Security and chain of custody | Warehousing, transport, high-value goods | Access control, seal checks, handover records, in-transit incident escalation, annual risk assessment | TAPA FSR/TSR 2023, ISO 28000 [Public] |
| D. Customs and trade compliance | Import/export procurement, freight | HS classification, country of origin, permits, AEO obligations, broker handover, document retention | UAE AEO programme [Public] |
| E. Dangerous goods | Buying, storing or shipping DG/hazmat | UN number/class check, SDS required as an input, DG-qualified roles only, packaging/labelling hold point | IATA DGR / CBTA [Public] |
| F. Temperature-controlled / GDP | Pharma or healthcare goods | Qualified lanes/suppliers, monitoring, excursion procedure, notify recipient, CAPA, Responsible Person sign-off | EU GDP Ch. 4 and 9; K+N HealthChain [Public] |
| G. Data protection | Steps that handle personal data (supplier contacts, drivers, employees) | Lawful basis, minimisation, access, retention, breach notification path | UAE PDPL FDL 45/2021 [Public] |
| H. HSE / contractor safety | Service contracts on site | Contractor induction, permits to work, PPE | Supplier codes (DHL, Aramex) [Public]; [Practice] |

Generator rule: show a section only if its toggle is set on the process (see gap G7), or if a `rule.type=compliance` tag matches it.

---

## 5. Formatting conventions

**Document ID scheme** (modelled on the public DP World pattern of entity–function–type–number–revision):
`<ORG>-<DEPT>-SOP-<NNN>` with the version shown separately, e.g. `7X-PRC-SOP-001 v1.2`.
- DEPT codes: PRC Procurement, FIN Finance, WHS Warehouse, TRN Transport, CUS Customs, HSE.
- Type codes: POL policy, PRO process, SOP, WI work instruction, FRM form.
- Versions: `0.x` for drafts, `1.0` on first approval; minor (1.1) for editorial changes, major (2.0) for changes to steps, controls or approvals. A major change needs re-approval and retraining.

**Step-ID scheme:** `<SOP no.>-S<NN>`, shown in the document as `S01, S02…`. Use gaps of 10 in the stored key (S010, S020) so steps can be inserted without renumbering. Decisions use `D`, approvals `A` (e.g. `D03`, `A04`), so the type is visible in the ID. Sub-steps: `S04.1`. IDs must stay the same across versions; the app should never renumber automatically after approval.

**Control-ID scheme:** `<DEPT>-C-<NNN>` (e.g. `PRC-C-012`). Controls are unique across the department, not per SOP, so the same control can be referenced from several SOPs and from the risk register. Rules: `<DEPT>-R-<NNN>`. KPIs: `<DEPT>-K-<NN>`, with an optional SCOR code (e.g. `RL.1.2`).

**Numbering:** sections numbered 1–18 with fixed headings. Omit a section only if it is optional; if a mandatory section is empty, show "Not applicable — reason".

**Page header:** company logo · Document ID · Title · Version · Classification.
**Page footer:** "Uncontrolled when printed — check the current version in Process AI" · Effective date · Page X of Y.

**Writing style:** imperative verbs; one action per step; roles, not names; no handwritten entries; plain language (GDP requires clear, unambiguous language that personnel understand).

**Bilingual readiness (Arabic later):**
- Store every text field as a language map (`{en, ar}`), not as a single string. Keep IDs, codes and numbers language-neutral.
- Layout must mirror for RTL (tables, swimlanes, step numbering); test the PDF/Word export with RTL from day one.
- Use a font with Arabic support (e.g. Noto Sans / Noto Naskh Arabic, IBM Plex Sans Arabic).
- Choose a governing-language rule (e.g. "English prevails in case of conflict") and print it in the document control block.
- Translate the glossary first; reuse it for consistent translation of terms.
- Dates in ISO format (YYYY-MM-DD); currency shown as AED with Western digits unless policy says otherwise.

---

## 6. Gaps — data the template needs that Process AI does not capture yet

| # | Missing data | Needed for | Suggestion |
|---|---|---|---|
| G1 | Document metadata: classification, status, effective date, review cycle (months), owner name, governing language | Section 0 | Add a `document` object to the process version; default review cycle 12 months; next review date computed |
| G2 | Consulted / Informed roles per step | Section 6 RACI | Add optional `step.consulted_roles[]` and `step.informed_roles[]`; the app suggests them from approvals and notifications |
| G3 | Control attributes: preventive/detective, manual/automated, owner, frequency, evidence, key-control flag, linked risk | Section 11 | Extend `rule.type=control` with these fields, or add a separate `control` entity linked to rules and steps (preferred) |
| G4 | Escalation: role, level, time trigger | Section 10 | Add `connection.is_exception` (if not explicit already), `escalation_role` and `escalation_after` (duration) |
| G5 | Process-level KPIs with formula, target, source and owner | Section 12 | Add `kpi[]` per process; offer a SCOR metric picker |
| G6 | Records: retention period, location, classification | Section 13 | Add a "record" flag on `step.outputs` with retention and location fields; default to a 5-year retention rule |
| G7 | Process type / compliance tags (DG, GDP, customs, security, PDPL, sanctions) | Section 4 toggles | Add `process.compliance_tags[]` that switch on the optional sections and the matching rule templates |
| G8 | Structured risks (likelihood, impact, rating) | Section 14 | Add a `risk` entity seeded from pain points; link it to controls |
| G9 | Training and competence by role | Section 15 | Add a `role` catalogue with required training and refresher interval; reuse it across processes |
| G10 | Out-of-scope items, applicable entities/sites | Section 2 | Add `process.out_of_scope` and `process.applicability[]` |
| G11 | Definitions / glossary | Section 3 | Org-level glossary in the knowledge base (EN/AR); auto-link terms |
| G12 | External regulations and standards references | Section 4 | Add a "regulation/standard" type to KB links, with clause references |
| G13 | Work instruction links per step | Section 8 | Add `step.work_instruction_ref` (a KB link) |
| G14 | Reviewer vs approver roles; e-signature metadata (signer, timestamp, method) | Section 18 | Separate review and approval stages in the approval workflow; store an immutable sign-off record |
| G15 | Hierarchy position: parent policy, parent process, SCOR process/level | Section 7 | Add `process.parent_id`, `process.policy_ref`, `process.scor_process` |
| G16 | Bilingual text fields | All | Store text as `{en, ar}` from now on, even if Arabic stays empty for the pilot |
| G17 | Change summary and "sections affected" per version | Section 17 | Generate a diff of the model between versions; owner edits the summary at approval |

Priority for the Procurement pilot: G1, G3, G4, G6, G7 (sanctions/conflict-of-interest), G14. These are what auditors check first (document control, controls with evidence, approvals, records). The rest can follow.
