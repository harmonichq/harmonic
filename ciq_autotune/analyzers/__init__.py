"""The parameter analyzers (each a pure function from event lists to result rows)
plus the scenario engine (episode-level behavioral insight).

* :mod:`~ciq_autotune.analyzers.basal` — A1, the hardened mimic-CIQ basal tuner.
* :mod:`~ciq_autotune.analyzers.isf` — A2, correction-response ISF.
* :mod:`~ciq_autotune.analyzers.ic` — A3, the I:C + carb-counting engine.
* :mod:`~ciq_autotune.analyzers.classifiers` — the per-instance behavioral
  classifiers (#71–#76).
* :mod:`~ciq_autotune.analyzers.scenario` — the scenario engine (#70): assembles
  the classifiers into ranked, episode-level patterns. Replaced the old A4
  aggregate-``Finding`` behavioral detector framework (``behavioral.py``, removed).

The parameter analyzers emit the result rows defined in
:mod:`~ciq_autotune.result`; the :func:`~ciq_autotune.analyze.analyze` facade
applies the analyzer-specific windows and funnels them into one
:class:`~ciq_autotune.result.AnalysisResult`. The scenario engine is served
separately (``/scenarios``) as its own ranked payload.
"""
