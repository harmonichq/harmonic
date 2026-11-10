# Prompt answers are saved at once, and every one is kept

## Why

Answering the Prompts on Day row after row (#677), each answer took seconds on a
long history, and longer the more were answered together: every answer
reconciled the whole follow-up history inside its request. Each answer then
read the Prompts again. The answers were held by the Day screen, so a Back out
of the list could leave several of them unsent or unanswered. And the list,
once its last row was answered, rested on an empty page until the slowest
answer came back.

## What changes

- A carb or Prompt write reconciles the follow-up after its response, and a
  burst of them pays one reconcile, not one each. The cache is still
  invalidated by every answer, at once.
- The live adapter holds each Prompt answer from when it is made until the
  Prompts are served with it, and a refused one until it is sent again, so
  leaving the list or the tab loses none, and an answer is sent so that it
  outlives the page. The Prompts are read again once, after the last answer in
  flight.
- Past the last prompt of its kind, the Lows or Rises return to Day at once,
  and they go back and forward through history as the other drill-downs do.

## Impact

- `ciq_autotune/api.py`: the carb and Prompt write endpoints.
- `frontend/data.js`, `frontend/ui/app/live.js`, `frontend/ui/app/App.tsx` and
  the Day screen.
- The `durable-follow-up` and `surfaces` capabilities.
