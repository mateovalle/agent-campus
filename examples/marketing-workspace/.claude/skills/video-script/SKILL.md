---
name: video-script
description: >-
  Write a short-form video script (YouTube/TikTok/Reels/Shorts). Use whenever
  the task asks for a video script, guion, storyboard, or talking-head piece.
  Produces a timed script file in scripts/ following the house format.
---

# Video script procedure

1. Read `CLAUDE.md` (brand voice, banned claims) and the two most recent files
   in `scripts/` to match tone and format.
2. Confirm from the task: target channel, length, and the ONE takeaway the
   viewer should leave with. If the task doesn't say, choose and state your
   choice at the top of the file — don't ask.
3. Write to `scripts/YYYY-MM-DD-<slug>.md` with this structure:

   ```markdown
   # <title>  ·  <channel> · <target length>

   **Takeaway:** <one sentence>
   **CTA:** <what the viewer does next>

   | t | visual | script |
   |---|--------|--------|
   | 0:00 | <what's on screen> | <spoken words, verbatim> |
   ```

4. Rules that make scripts survive contact with a camera:
   - The first 3 seconds must state the payoff — no "hola, en este video…".
   - Spoken words are written to be SAID, not read: short sentences,
     contractions, no subordinate-clause pileups.
   - One idea per 15 seconds of runtime. Cut the second-best idea.
   - Every claim must be true of the product today. Unverifiable number →
     `<DATO: pedir>` placeholder, flagged at the end of the file.

5. Done when: the file is in `scripts/`, timed to the target length (~140
   spoken words per minute), and the CTA matches an actual link/action that
   exists.
