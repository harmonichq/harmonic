# Generated facts — #464 (regenerate from the checked-out tree)

```
$ git diff --stat e4862000 59fa4737 -- frontend ciq_autotune scripts
```

```
$ node /Users/connor/.claude/skills/ui-craft/scripts/route.mjs --embodiment shipped --runnability runnable --declaration complete --data-source manufactured
{"mode":"revise","reason":"safe manufactured data source declared"}
```

```
$ grep -n 'issued.: 193' mockups/sweep/harmonic-v2-desktop/acceptance.py
1268:    require(counts == {"issued": 193, "active": 174, "retired": 19}
```

```
$ grep -n 'S98' frontend/replay-cases.mjs
14:  S7: 'c3-trial', S7b: 'basal-no-change', S9: 'basal-lower', S18: 'basal-no-change', S80b: 'basal-no-change', S97: 'basal-lower', S98: 'ic-lower', S99: 'basal-insufficient-seven-night',
```

```
$ grep -n "modes: \['event', 'clock'\]" frontend/diagnose-evidence-charts.js
1025:    modes: ['event', 'clock'],
1043:    modes: ['event', 'clock'],
```

```
$ grep -n 'SCHEMA = ' ciq_autotune/ic_block_evidence.py
14:SCHEMA = "diagnose-carb-ratio-block-evidence-v1"
```

```
$ grep -n 'feed-only forms do not invent' frontend/diagnose-evidence-charts.test.js
1147:test('feed-only forms do not invent unavailable fit or current-setting values', () => {
```

```
$ grep -n '"ic-raise",' scripts/qa_e2e_cases.py
2186:        "ic-raise",
```

```
$ ls tests/test_ic_block_evidence.py tests/test_ic_regression.py tests/test_ic_blocks.py tests/test_ic_meal_runs.py tests/test_synthetic_fixture_shapes.py tests/test_qa_e2e_cases.py tests/test_gen_qa_e2e_db.py frontend/diagnose-evidence-charts.test.js frontend/diagnose-workstation.test.js frontend/diagnose-canvas-layout.test.js frontend/diagnose-event-comparison.test.js frontend/occurrence-roster.test.js frontend/diagnose.test.js
frontend/diagnose-canvas-layout.test.js
frontend/diagnose-event-comparison.test.js
frontend/diagnose-evidence-charts.test.js
frontend/diagnose-workstation.test.js
frontend/diagnose.test.js
frontend/occurrence-roster.test.js
tests/test_gen_qa_e2e_db.py
tests/test_ic_block_evidence.py
tests/test_ic_blocks.py
tests/test_ic_meal_runs.py
tests/test_ic_regression.py
tests/test_qa_e2e_cases.py
tests/test_synthetic_fixture_shapes.py
```

```
$ grep -n 'def attributed_occurrences' ciq_autotune/analyzers/scenario/engine.py
106:def attributed_occurrences(bolus_events, cgm_readings, basal_events=(), *, isf=None,
```

```
$ grep -n 'function renderIcBlockLevel' frontend/diagnose-workstation.js
1076:function renderIcBlockLevel(host, cell, icStaged, onStage, demoNote) {
```

```
$ grep -n 'harm.: (guidance or {}).get(.seriousness.)' ciq_autotune/guidance.py
128:            "harm": (guidance or {}).get("seriousness")}
```

```
$ python3 scripts/check_adr_numbers.py
check-adr: 251 ADRs in 117 design.md files, all identities unique and issue-keyed.
```

```
$ npx --yes @fission-ai/openspec@1 validate --all --strict
- Validating...
✓ spec/backtest
✓ spec/basal-suggestion
✓ spec/behavioral-layer
✓ change/carb-ratio-block-evidence
✓ spec/credentials
✓ spec/data-ingest
✓ spec/durable-follow-up
✓ spec/eating-sequences
✓ spec/http-api
✓ spec/insulin-reconstruction
✓ spec/outcomes
✓ spec/parameter-analysis
✓ spec/plan
✓ spec/qa-e2e-database
✓ spec/safety
✓ spec/surfaces
Totals: 16 passed, 0 failed (16 items)
```


```
$ grep -n 'DESK_GLOSSARY = ' mockups/harmonic-v2.exploration/generate.py
38:DESK_GLOSSARY = "frontend/glossary.js"
```

```
$ grep -n 'dose-ratio-ack' scripts/public_scan_config.txt
144:dose-ratio-ack CONTEXT.md:515 | 0.2 U
145:dose-ratio-ack CONTEXT.md:77 | 1 U : 36 mg/dL
146:dose-ratio-ack CONTEXT.md:99 | 0.5 U
147:dose-ratio-ack DESIGN.md:163 | 1 U : 36 mg/dL
148:dose-ratio-ack DESIGN.md:181 | 1.23 U
149:dose-ratio-ack DESIGN.md:183 | 1.23 U
150:dose-ratio-ack ciq_autotune/analyzers/classifiers/evidence.py:6 | 10 U
151:dose-ratio-ack ciq_autotune/analyzers/ic.py:185 | 0.5 U
152:dose-ratio-ack ciq_autotune/analyzers/ic.py:196 | 0.0 U
153:dose-ratio-ack ciq_autotune/analyzers/ic.py:359 | 1U
154:dose-ratio-ack ciq_autotune/analyzers/scenario/narrate.py:30 | 1 U
155:dose-ratio-ack ciq_autotune/analyzers/scenario/payload.py:77 | 6U
156:dose-ratio-ack ciq_autotune/analyzers/scenario_config.py:286 | 0.23 U
157:dose-ratio-ack ciq_autotune/analyzers/scenario_config.py:287 | 3.6 U
158:dose-ratio-ack ciq_autotune/analyzers/scenario_config.py:292 | 20 U
159:dose-ratio-ack ciq_autotune/analyzers/scenario_config.py:295 | 0.7 U
160:dose-ratio-ack ciq_autotune/analyzers/tuning_priority.py:16 | 3.6 U
161:dose-ratio-ack ciq_autotune/analyzers/tuning_priority.py:201 | 100 U
162:dose-ratio-ack ciq_autotune/harm.py:70 | 0.1 U
163:dose-ratio-ack ciq_autotune/insulin.py:220 | 0.1 U
164:dose-ratio-ack ciq_autotune/pattern_sweep.py:1043 | 1 U
165:dose-ratio-ack ciq_autotune/tandemsource_map.py:207 | 65.535 U
166:dose-ratio-ack docs/kb/start-here.md:12 | 4.5 U
167:dose-ratio-ack frontend/__fixtures__/findings-projection.json:14830 | 0.86 U
168:dose-ratio-ack frontend/__fixtures__/findings-projection.json:14902 | 1.06 U
169:dose-ratio-ack frontend/__fixtures__/findings-projection.json:14974 | 4.9 g/U
170:dose-ratio-ack frontend/__fixtures__/findings-projection.json:15030 | 1 U : 42 mg/dL
171:dose-ratio-ack frontend/__fixtures__/findings-projection.json:15978 | 1.06 U
172:dose-ratio-ack frontend/__fixtures__/findings-projection.json:16050 | 4.9 g/U
173:dose-ratio-ack frontend/__fixtures__/findings-projection.json:16106 | 1 U : 42 mg/dL
174:dose-ratio-ack frontend/__fixtures__/findings-projection.json:17539 | 4.9 g/U
175:dose-ratio-ack frontend/__fixtures__/findings-projection.json:17595 | 0.73 U
176:dose-ratio-ack frontend/__fixtures__/findings-projection.json:17667 | 0.61 U
177:dose-ratio-ack frontend/__fixtures__/findings-projection.json:17739 | 1 U : 42 mg/dL
178:dose-ratio-ack frontend/__fixtures__/findings-projection.json:18240 | 1.13 U
179:dose-ratio-ack frontend/__fixtures__/findings-projection.json:19817 | 6 g/U
180:dose-ratio-ack frontend/__fixtures__/findings-projection.json:19885 | 6.2 g/U
181:dose-ratio-ack frontend/__fixtures__/findings-projection.json:19964 | 6.4 g/U
182:dose-ratio-ack frontend/__fixtures__/findings-projection.json:20043 | 6.6 g/U
183:dose-ratio-ack frontend/__fixtures__/findings-projection.json:20122 | 6.8 g/U
184:dose-ratio-ack frontend/__fixtures__/findings-projection.json:20201 | 7 g/U
185:dose-ratio-ack frontend/__fixtures__/findings-projection.json:20280 | 7.2 g/U
186:dose-ratio-ack frontend/__fixtures__/findings-projection.json:214863 | 6 g/U
187:dose-ratio-ack frontend/__fixtures__/findings-projection.json:214922 | 4.3 g/U
188:dose-ratio-ack frontend/__fixtures__/findings-projection.json:215524 | 1.00 U
189:dose-ratio-ack frontend/__fixtures__/findings-projection.json:216154 | 6 g/U
190:dose-ratio-ack frontend/__fixtures__/findings-projection.json:216176 | 6 g/U
191:dose-ratio-ack frontend/__fixtures__/findings-projection.json:216660 | 4.3 g/U
192:dose-ratio-ack frontend/__fixtures__/findings-projection.json:217067 | 1 U : 36 mg/dL
193:dose-ratio-ack frontend/__fixtures__/findings-projection.json:217639 | 4.3 g/U
194:dose-ratio-ack frontend/__fixtures__/findings-projection.json:218059 | 1 U : 36 mg/dL
195:dose-ratio-ack frontend/__fixtures__/findings-projection.json:218537 | 4.3 g/U
196:dose-ratio-ack frontend/__fixtures__/findings-projection.json:219139 | 1.00 U
197:dose-ratio-ack frontend/__fixtures__/findings-projection.json:219769 | 6 g/U
198:dose-ratio-ack frontend/__fixtures__/findings-projection.json:219791 | 6 g/U
199:dose-ratio-ack frontend/__fixtures__/findings-projection.json:220273 | 4.3 g/U
200:dose-ratio-ack frontend/__fixtures__/findings-projection.json:220589 | 1 U : 36 mg/dL
201:dose-ratio-ack frontend/__fixtures__/findings-projection.json:221054 | 1.00 U
202:dose-ratio-ack frontend/__fixtures__/findings-projection.json:221126 | 1.26 U
203:dose-ratio-ack frontend/__fixtures__/findings-projection.json:221198 | 1 U : 36 mg/dL
204:dose-ratio-ack frontend/__fixtures__/findings-projection.json:221229 | 6 g/U
205:dose-ratio-ack frontend/__fixtures__/findings-projection.json:221251 | 6 g/U
206:dose-ratio-ack frontend/__fixtures__/findings-projection.json:221727 | 4.3 g/U
207:dose-ratio-ack frontend/__fixtures__/findings-projection.json:221952 | 1 U : 36 mg/dL
208:dose-ratio-ack frontend/__fixtures__/findings-projection.json:221983 | 6 g/U
209:dose-ratio-ack frontend/__fixtures__/findings-projection.json:222005 | 6 g/U
210:dose-ratio-ack frontend/__fixtures__/findings-projection.json:222472 | 1 U : 36 mg/dL
211:dose-ratio-ack frontend/__fixtures__/findings-projection.json:222503 | 6 g/U
212:dose-ratio-ack frontend/__fixtures__/findings-projection.json:222525 | 6 g/U
213:dose-ratio-ack frontend/__fixtures__/findings-projection.json:223001 | 4.3 g/U
214:dose-ratio-ack frontend/__fixtures__/findings-projection.json:223234 | 1 U : 36 mg/dL
215:dose-ratio-ack frontend/__fixtures__/findings-projection.json:27827 | 6 g/U
216:dose-ratio-ack frontend/__fixtures__/findings-projection.json:29126 | 1 U
217:dose-ratio-ack frontend/__fixtures__/findings-projection.json:29159 | 1 U
218:dose-ratio-ack frontend/__fixtures__/findings-projection.json:29192 | 1 U
219:dose-ratio-ack frontend/__fixtures__/findings-projection.json:29225 | 1 U
220:dose-ratio-ack frontend/__fixtures__/findings-projection.json:29249 | 4.6 U
221:dose-ratio-ack frontend/__fixtures__/findings-projection.json:29260 | 4.6 U
222:dose-ratio-ack frontend/__fixtures__/findings-projection.json:33015 | 4.3 g/U
223:dose-ratio-ack frontend/__fixtures__/findings-projection.json:33425 | 1 U : 37.6 mg/dL
224:dose-ratio-ack frontend/__fixtures__/findings-projection.json:34003 | 4.3 g/U
225:dose-ratio-ack frontend/__fixtures__/findings-projection.json:34605 | 1.00 U
226:dose-ratio-ack frontend/__fixtures__/findings-projection.json:34909 | 1 U : 37.6 mg/dL
227:dose-ratio-ack frontend/__fixtures__/findings-projection.json:35296 | 6 g/U
228:dose-ratio-ack frontend/__fixtures__/findings-projection.json:35318 | 6 g/U
229:dose-ratio-ack frontend/__fixtures__/findings-projection.json:35806 | 4.3 g/U
230:dose-ratio-ack frontend/__fixtures__/findings-projection.json:36031 | 1 U : 37.6 mg/dL
231:dose-ratio-ack frontend/__fixtures__/findings-projection.json:36596 | 1.00 U
232:dose-ratio-ack frontend/__fixtures__/findings-projection.json:36671 | 1 U : 37.6 mg/dL
233:dose-ratio-ack frontend/__fixtures__/findings-projection.json:36723 | 1.26 U
234:dose-ratio-ack frontend/__fixtures__/findings-projection.json:36774 | 6 g/U
235:dose-ratio-ack frontend/__fixtures__/findings-projection.json:36796 | 6 g/U
236:dose-ratio-ack frontend/__fixtures__/findings-projection.json:37278 | 4.3 g/U
237:dose-ratio-ack frontend/__fixtures__/findings-projection.json:37506 | 1 U : 37.6 mg/dL
238:dose-ratio-ack frontend/__fixtures__/findings-projection.json:37537 | 6 g/U
239:dose-ratio-ack frontend/__fixtures__/findings-projection.json:37559 | 6 g/U
240:dose-ratio-ack frontend/__fixtures__/findings-projection.json:38035 | 1 U : 37.6 mg/dL
241:dose-ratio-ack frontend/__fixtures__/findings-projection.json:38066 | 6 g/U
242:dose-ratio-ack frontend/__fixtures__/findings-projection.json:38088 | 6 g/U
243:dose-ratio-ack frontend/__fixtures__/findings-projection.json:38570 | 4.3 g/U
244:dose-ratio-ack frontend/__fixtures__/findings-projection.json:38806 | 1 U : 37.6 mg/dL
245:dose-ratio-ack frontend/__fixtures__/findings-projection.json:46331 | 6 g/U
246:dose-ratio-ack frontend/__fixtures__/findings-projection.json:46714 | 1 U
247:dose-ratio-ack frontend/__fixtures__/findings-projection.json:46747 | 1 U
248:dose-ratio-ack frontend/__fixtures__/findings-projection.json:46780 | 1 U
249:dose-ratio-ack frontend/__fixtures__/findings-projection.json:46813 | 1 U
250:dose-ratio-ack frontend/__fixtures__/findings-projection.json:46837 | 4.6 U
251:dose-ratio-ack frontend/__fixtures__/findings-projection.json:46848 | 4.6 U
252:dose-ratio-ack frontend/__fixtures__/findings-projection.json:55895 | 4.3 g/U
253:dose-ratio-ack frontend/__fixtures__/findings-projection.json:56497 | 1.00 U
254:dose-ratio-ack frontend/__fixtures__/findings-projection.json:57578 | 4.3 g/U
255:dose-ratio-ack frontend/__fixtures__/findings-projection.json:57998 | 1 U : 36 mg/dL
256:dose-ratio-ack frontend/__fixtures__/findings-projection.json:58480 | 4.3 g/U
257:dose-ratio-ack frontend/__fixtures__/findings-projection.json:59082 | 1.00 U
258:dose-ratio-ack frontend/__fixtures__/findings-projection.json:59712 | 6 g/U
259:dose-ratio-ack frontend/__fixtures__/findings-projection.json:59734 | 6 g/U
260:dose-ratio-ack frontend/__fixtures__/findings-projection.json:60220 | 4.3 g/U
261:dose-ratio-ack frontend/__fixtures__/findings-projection.json:60822 | 1.00 U
262:dose-ratio-ack frontend/__fixtures__/findings-projection.json:76535 | 6 g/U
263:dose-ratio-ack frontend/__fixtures__/findings-projection.json:84178 | 6 g/U
264:dose-ratio-ack frontend/__fixtures__/findings-projection.json:91821 | 6 g/U
265:dose-ratio-ack frontend/kb.test.js:187 | 0.5 U
266:dose-ratio-ack frontend/kb.test.js:207 | 0.5 U
267:dose-ratio-ack frontend/plan.js:476 | 0.001 U
268:dose-ratio-ack frontend/plan.js:478 | 0.1 g/U
269:dose-ratio-ack mockups/diagnose-workstation.synthetic/ic-history-events.capture.json:2288 | 6 g/U
270:dose-ratio-ack openspec/specs/behavioral-layer/spec.md:169 | 10 U
271:dose-ratio-ack openspec/specs/behavioral-layer/spec.md:40 | 0.3 U
272:dose-ratio-ack openspec/specs/safety/spec.md:30 | 0.1 U
273:dose-ratio-ack openspec/specs/safety/spec.md:31 | 3.0 U
274:dose-ratio-ack openspec/specs/safety/spec.md:72 | 0.05 U
275:dose-ratio-ack openspec/specs/surfaces/spec.md:2992 | 1 U
276:dose-ratio-ack openspec/specs/surfaces/spec.md:3017 | 1 U : 32 mg/dL
277:dose-ratio-ack openspec/specs/surfaces/spec.md:3023 | 9 g/U
278:dose-ratio-ack openspec/specs/surfaces/spec.md:3036 | 1 U : 32 mg/dL
279:dose-ratio-ack openspec/specs/surfaces/spec.md:3119 | 1 U
280:dose-ratio-ack openspec/specs/surfaces/spec.md:3135 | 1 U : 30.0 mg/dL
281:dose-ratio-ack openspec/specs/surfaces/spec.md:3140 | 1 U
282:dose-ratio-ack openspec/specs/surfaces/spec.md:3155 | 1 U
283:dose-ratio-ack openspec/specs/surfaces/spec.md:3164 | 1 U : 30.0 mg/dL
284:dose-ratio-ack openspec/specs/surfaces/spec.md:3171 | 4.8 g/U
285:dose-ratio-ack openspec/specs/surfaces/spec.md:3179 | 1 U
286:dose-ratio-ack scripts/gen_chart_builder_fixtures.py:152 | 0.04 U
287:dose-ratio-ack tests/test_analyzer_basal.py:1030 | 0.30 U
288:dose-ratio-ack tests/test_analyzer_basal.py:1031 | 0.80 U
289:dose-ratio-ack tests/test_analyzer_basal.py:1034 | 0.30 U
290:dose-ratio-ack tests/test_analyzer_basal.py:110 | 0.9 U
291:dose-ratio-ack tests/test_analyzer_coverage.py:437 | 0.6 U
292:dose-ratio-ack tests/test_analyzer_coverage.py:752 | 6 g/U
293:dose-ratio-ack tests/test_analyzer_ic.py:1019 | 10U
294:dose-ratio-ack tests/test_analyzer_ic.py:1035 | 82 g/U
295:dose-ratio-ack tests/test_analyzer_ic.py:1121 | 10U
296:dose-ratio-ack tests/test_analyzer_ic.py:1208 | 10U
297:dose-ratio-ack tests/test_analyzer_ic.py:1209 | 11U
298:dose-ratio-ack tests/test_analyzer_ic.py:1347 | 2U
299:dose-ratio-ack tests/test_analyzer_ic.py:1493 | 2U
300:dose-ratio-ack tests/test_analyzer_ic.py:1519 | 1U
301:dose-ratio-ack tests/test_analyzer_ic.py:1530 | 3U
302:dose-ratio-ack tests/test_analyzer_ic.py:1532 | 12U
303:dose-ratio-ack tests/test_analyzer_ic.py:1556 | 0.6U
304:dose-ratio-ack tests/test_analyzer_ic.py:1557 | 1U
305:dose-ratio-ack tests/test_analyzer_ic.py:1558 | 0.6U
306:dose-ratio-ack tests/test_analyzer_ic.py:1592 | 1.5U
307:dose-ratio-ack tests/test_analyzer_ic.py:1600 | 6U
308:dose-ratio-ack tests/test_analyzer_ic.py:27 | 6 g/U
309:dose-ratio-ack tests/test_analyzer_ic.py:310 | 0.40 U
310:dose-ratio-ack tests/test_analyzer_ic.py:439 | 10U
311:dose-ratio-ack tests/test_analyzer_ic.py:478 | 5U
312:dose-ratio-ack tests/test_analyzer_ic.py:487 | 1U
313:dose-ratio-ack tests/test_analyzer_ic.py:497 | 4U
314:dose-ratio-ack tests/test_analyzer_ic.py:498 | 3.5U
315:dose-ratio-ack tests/test_analyzer_ic.py:530 | 2U
316:dose-ratio-ack tests/test_analyzer_ic.py:574 | 1U
317:dose-ratio-ack tests/test_analyzer_ic.py:585 | 1.0U
318:dose-ratio-ack tests/test_analyzer_ic.py:599 | 1.0U
319:dose-ratio-ack tests/test_analyzer_ic.py:611 | 2U
320:dose-ratio-ack tests/test_analyzer_ic.py:614 | 2U
321:dose-ratio-ack tests/test_analyzer_ic.py:698 | 1U
322:dose-ratio-ack tests/test_analyzer_ic.py:699 | 1.5U
323:dose-ratio-ack tests/test_analyzer_ic.py:712 | 1U
324:dose-ratio-ack tests/test_analyzer_ic.py:739 | 4U
325:dose-ratio-ack tests/test_analyzer_ic.py:745 | 1.0U
326:dose-ratio-ack tests/test_analyzer_ic.py:765 | 1U
327:dose-ratio-ack tests/test_analyzer_ic.py:780 | 1.0U
328:dose-ratio-ack tests/test_analyzer_ic.py:794 | 1.8U
329:dose-ratio-ack tests/test_analyzer_ic.py:796 | 1.0U
330:dose-ratio-ack tests/test_analyzer_ic.py:847 | 2.8U
331:dose-ratio-ack tests/test_basal_night_evidence.py:35 | 2 U
332:dose-ratio-ack tests/test_classifier_correction_on_iob.py:11 | 1 U
333:dose-ratio-ack tests/test_classifier_correction_on_iob.py:116 | 0.5 U
334:dose-ratio-ack tests/test_classifier_correction_on_iob.py:14 | 0.5 U
335:dose-ratio-ack tests/test_classifier_correction_on_iob.py:70 | 7.4 U
336:dose-ratio-ack tests/test_classifier_correction_stacking.py:137 | 1U
337:dose-ratio-ack tests/test_classifier_correction_stacking.py:150 | 0.1 U
338:dose-ratio-ack tests/test_classifier_correction_stacking.py:158 | 0.1 U
339:dose-ratio-ack tests/test_ic_blocks.py:158 | 4.0 g/U
340:dose-ratio-ack tests/test_ic_blocks.py:181 | 12 U
341:dose-ratio-ack tests/test_ic_blocks.py:209 | 8.0 g/U
342:dose-ratio-ack tests/test_ic_meal_runs.py:248 | 2 U
343:dose-ratio-ack tests/test_model.py:248 | 0.09U
344:dose-ratio-ack tests/test_model.py:249 | 0.1U
345:dose-ratio-ack tests/test_model.py:72 | 5U
346:dose-ratio-ack tests/test_preempted_lows.py:97 | 0.06 U
347:dose-ratio-ack tests/test_safety_backtest.py:385 | 4U
348:dose-ratio-ack tests/test_safety_backtest.py:387 | 2U
349:dose-ratio-ack tests/test_safety_backtest.py:398 | 2U
350:dose-ratio-ack tests/test_safety_backtest.py:406 | 5U
351:dose-ratio-ack tests/test_scenario_engine.py:1066 | 6 U
352:dose-ratio-ack tests/test_scenario_engine.py:1067 | 4 U
353:dose-ratio-ack tests/test_scenario_engine.py:1130 | 8 U
354:dose-ratio-ack tests/test_scenario_engine.py:1245 | 6 U
355:dose-ratio-ack tests/test_scenario_engine.py:1255 | 0 U
356:dose-ratio-ack tests/test_scenario_engine.py:1268 | 8 U
357:dose-ratio-ack tests/test_scenario_engine.py:1367 | 8 U
358:dose-ratio-ack tests/test_scenario_engine.py:1861 | 5.5 U
359:dose-ratio-ack tests/test_scenario_engine.py:2044 | 4.5 U
360:dose-ratio-ack tests/test_scenario_engine.py:2089 | 6 U
361:dose-ratio-ack tests/test_scenario_engine.py:2497 | 0.9 U
362:dose-ratio-ack tests/test_scenario_engine.py:2498 | 1.5 U
363:dose-ratio-ack tests/test_scenario_model_view.py:221 | 2 U
364:dose-ratio-ack tests/test_scenario_model_view.py:440 | 7 U
365:dose-ratio-ack tests/test_scenario_narrate.py:103 | 5U
366:dose-ratio-ack tests/test_scenario_narrate.py:16 | 1 U
367:dose-ratio-ack tests/test_settings.py:121 | 15 U
368:dose-ratio-ack tests/test_settings.py:124 | 0.6 U
369:dose-ratio-ack tests/test_settings.py:126 | 7.0 g/U
370:dose-ratio-ack tests/test_settings.py:220 | 5 g/U
371:dose-ratio-ack tests/test_settling.py:93 | 0.6 U
372:dose-ratio-ack tests/test_settling.py:94 | 0.9 U
373:dose-ratio-ack tests/test_store.py:490 | 5.4U
374:dose-ratio-ack tests/test_store.py:491 | 4.0U
375:dose-ratio-ack tests/test_tandemsource_map_real.py:94 | 65.535 U
376:dose-ratio-ack tests/test_tuning_priority.py:682 | 0.7 U
377:dose-ratio-ack tests/test_tuning_priority.py:683 | 100 U
378:dose-ratio-ack tests/test_tuning_priority.py:710 | 20 U
379:dose-ratio-ack tests/test_tuning_priority.py:754 | 3.0 U
380:dose-ratio-ack tests/test_tuning_priority.py:767 | 35 U
381:dose-ratio-ack tests/test_tuning_priority.py:77 | 0.2 U
382:dose-ratio-ack tests/test_tuning_priority.py:78 | 0.2 U
383:dose-ratio-ack tests/test_user_correction_provenance.py:103 | 0.5U
384:dose-ratio-ack tests/test_user_correction_provenance.py:104 | 0.5U
385:dose-ratio-ack tests/test_user_correction_provenance.py:109 | 8.5U
386:dose-ratio-ack tests/test_user_correction_provenance.py:55 | 1U
387:dose-ratio-ack tests/test_user_correction_provenance.py:56 | 1U
388:dose-ratio-ack tests/test_user_correction_provenance.py:68 | 0.4U
389:dose-ratio-ack tests/test_user_correction_provenance.py:69 | 1U
390:dose-ratio-ack tests/test_user_correction_provenance.py:7 | 1U
391:dose-ratio-ack tests/test_user_correction_provenance.py:82 | 1U
392:dose-ratio-ack tests/test_user_correction_provenance.py:83 | 1U
393:dose-ratio-ack tests/test_user_correction_provenance.py:97 | 1.0U
```

```
$ grep -n 'ic-block-evidence.capture.json' frontend/desk.browser.test.mjs
154:const icEvidence = generated('../mockups/diagnose-workstation.synthetic/ic-block-evidence.capture.json').cases.cross_midnight;
```

```
$ grep -n 'def build_exposures' ciq_autotune/explore_exposures.py
56:def build_exposures(store, *, window_days: int = 30) -> dict:
```

```
$ grep -n 'def credited_claims' ciq_autotune/analyzers/scenario/outcome_patterns.py
219:def credited_claims(exposures: dict, family: str,
```

```
$ grep -n 'function assertEventCaseFile' frontend/diagnose-event-comparison.js
266:function assertEventCaseFile(caseFile) {
```

```
$ grep -n "import './diagnose-event-comparison.css'" frontend/main.js
17:import './diagnose-event-comparison.css';
```

```
$ grep -n 'harmonic-v2.exploration/generate.py' .github/workflows/ci.yml
77:        run: uv run python mockups/harmonic-v2.exploration/generate.py --check
```
