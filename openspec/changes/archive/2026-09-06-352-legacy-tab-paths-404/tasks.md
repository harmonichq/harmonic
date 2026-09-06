# Tasks — retire the retired-tab-id migration (#352)

- [x] Assert in `frontend/tab-routing.test.js` that every retired page id resolves to the default page, and observe `daily`, `modelview` and `outcomes` fail against the unchanged module first.
- [x] Remove the retired-id mapping from page resolution in `frontend/tab-routing.js`, keeping the fallback that sends an unrecognized id to the default page.
- [x] Correct the shell's routing comments in `frontend/index.html` so no comment promises that a retired id migrates.
- [x] Pin the retired ids as not served in `tests/test_frontend_asset_routes.py`, leaving its page-mirror, closed-route-set and unknown-path assertions unchanged.
- [x] Pass the repository verification gate.
