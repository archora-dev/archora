# Demo script

Use this script when recording screenshots, a short video or a live walkthrough.
It keeps the demo focused on the product workflow instead of raw metrics.

## 1. Start with the sample

Open **Try sample analysis** from the Dashboard. This avoids filesystem prompts
and lands directly in the same Architecture Workspace used for real scans.

Call out:

- the architecture grade;
- the first recommended fix;
- the **Step-by-step check** workflow.

## 2. Show the review queue

Open **Review**. Explain the risk score, the main drivers and the first modules
to inspect before a release or broad refactor.

Keep the message narrow: Archora is telling the reviewer where to start, not
asking them to inspect every dependency.

## 3. Verify impact

Open the first item from Review into **Impact**. Show direct importers, outgoing
imports, affected folders and related rules. This is the proof step before a
code move.

## 4. Check boundaries

Open **Cycles** or **Rules** depending on the finding. Show the suggested break
point or the exact forbidden boundary with evidence.

## 5. Export evidence

Export a Markdown report for a PR comment or an HTML report for a team handoff.
The Markdown report should show the **Review checklist** near the top.

## What not to demo

- Do not show a full-project graph as the main story.
- Do not lead with raw JSON.
- Do not spend time on every tab. The useful path is Review → Impact →
  Cycles/Rules → Report.
