## 1. Engine

- [x] 1.1 The carb and Prompt write endpoints reconcile after their response, never two at once, once per pass a later write crosses, then invalidate the follow-up results; `tests/test_prompt_answer_reconcile.py` (ADR 677)

## 2. App

- [x] 2.1 The live adapter holds Prompt answers in flight and refused, by the Prompt's identity, reads the Prompts once per burst, and sends each answer and its grams with keepalive; `live.test.js`, `data.test.js`
- [x] 2.2 The Day screen reads the held answers, shows a refused one's Not saved with Retry on Day or the Prompts, and leaves the Lows or Rises after their last answer through Day's drill-down router
- [x] 2.3 Stories: a burst of answers followed by Back, the routed Lows, and a Forward onto Lows with none left
