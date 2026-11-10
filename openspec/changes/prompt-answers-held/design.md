## ADR 677 — A Prompt answer saves at once, and the adapter holds it until it is served

**Context.** On a copy of a real history, answering the Prompts on Day row after
row (#677): one answer took 3.2 s idle and 6.5 to 8.7 s while the warm pass
the answer before it started was computing; six sent together took 17 to 27 s
each. Inside each request the answer committed, and then
`reconcile_ingested_follow_up` read the whole history to reconcile the
follow-up frontier, which an answer leaves behind because it advances the
input revision. Building the Prompts themselves took 0.27 s. In the browser,
each answer was sent at once and followed by its own read of the Prompts, and
the answers in flight were Day screen state: leaving the list or the tab
dropped what the screen knew of them, a refusal made meanwhile was never shown,
and a Back out of the app unloaded the page under them. The Lows and Rises
were screen state as well, not a router entry, so the platform's Back left the
tab. With every row answered, the list waited on an empty page for the last
answer to come back. Theory, not observed here: the six time-of-day reads the
operator saw are the Day tab's catch-up, reading its glucose profile again
while each answer kept the engine's answer behind; they are bounded, and stay.

**Decision.**

1. A carb or Prompt write commits and invalidates the cache, as before, and
   answers. The follow-up reconcile runs after the response, as a background
   task of the request, not in it. One lock serializes those reconciles: a
   write whose task finds one running marks one owed and returns, and the
   running one reconciles again once it is done. A burst of answers therefore
   pays the reconcile once, plus once more for each pass a later answer
   crosses: none runs inside a request, and never two at once. Answers made
   faster than a reconcile share passes; answers paced about one reconcile
   apart (some 3 s on a long history) can still cost close to one pass each,
   after their responses. ADR 557's rule, that each writer reconciles what it
   committed, holds for the burst: the last reconcile reads every answer in
   it.
2. Each such reconcile is followed by `follow_up_written()`. Until it lands
   the frontier is behind, which every read already serves as
   "reconciliation required" (#557), as it was during the in-request
   reconcile. A reconcile that only advances the frontier advances no
   revision, so a roster computed meanwhile would otherwise stay cached as
   behind.
3. A reconcile that fails is logged and leaves the frontier behind, to be
   reconciled by the next write or the start. The write it follows was saved,
   so it is answered as saved: it no longer answers 500 for a committed write.
4. The live adapter holds every Prompt answer, as it holds the Queue's writes
   (#610): from when it is made until a Prompts read begun after it saved, so
   a saved answer the engine has not yet served answered never reads as
   unanswered, and a refused one, with its prompt, until it is sent again.
   The Day screen reads them (`held`), and its bar shows a refusal, on the
   Prompts or on Day, with Retry. An answer is held by the Prompt's identity,
   its detector and its anchor, so a low and a rise at one anchor are two.
   Each answer is sent as it is made, never queued behind another, with
   `keepalive`, as are the grams typed after a Yes, so one already sent
   outlives the page.
5. The Prompts are read again once no answer is in flight, once for every
   answer made meanwhile, and each answer resolves then. The day on screen is
   read again after them, once, as ADR 610 has it.
6. Past the last prompt of its kind the Lows or Rises return to Day at once
   (§2.5, 2026-10-14 Rises), a Yes once its Next lets the card go, through
   the router: they are Day's drill-down entry, as ADR 669 gave the other
   tabs theirs, and a Back or Forward onto the entry with nothing left leaves
   it at once.

**Not changed.** What a reconcile computes; what an answer records and the
exclusion it feeds the analysis; the cache invalidation at every answer; the
two revisions; `/api/prompts`, which stays an uncached read of the last week.

**Consequences.** On the same copy, six answers sent together each saved in
0.02 to 0.26 s and the burst in 1.9 s, and one at a time each in under 0.1 s.
The whole-history reconcile still costs its seconds (about 3 s on a long
history), now after the responses, once per pass as decision 1 bounds it; how
to make it cheaper is ADR 667's open question, not this one.
