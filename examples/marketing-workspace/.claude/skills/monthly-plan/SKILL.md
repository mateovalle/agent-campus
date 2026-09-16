---
name: monthly-plan
description: >-
  Build or revise the monthly marketing plan. Use when the task asks for a
  marketing plan, content calendar, campaign plan, or monthly priorities.
  Produces plans/YYYY-MM.md with themes, calendar, and measurable goals.
---

# Monthly plan procedure

1. Read `CLAUDE.md` and last month's plan in `plans/` (if any). Note what was
   planned vs. what actually shipped — carry unfinished items forward
   explicitly or kill them explicitly, never silently.
2. Write to `plans/YYYY-MM.md`:

   ```markdown
   # Plan <month year>

   ## Goal
   <ONE measurable goal for the month, with its current baseline number>

   ## Themes (max 2)
   <theme> — why now, and what "working" looks like

   ## Calendar
   | date | channel | piece | owner | status |

   ## Not doing this month
   <explicit cuts, so agents don't resurrect them>
   ```

3. Rules:
   - One goal. A plan with three goals is a wishlist.
   - Every calendar row names a concrete deliverable file that will exist in
     this repo (`scripts/...`, `copy/...`).
   - Volume follows capacity: don't schedule more pieces than last month
     actually shipped, unless the task says otherwise.
   - The "Not doing" section is mandatory — scope cuts are decisions worth
     recording.

4. Done when: the file is in `plans/`, the goal has a baseline and a target
   number, and every calendar row is executable by an agent with no other
   context than the row plus this repo.
