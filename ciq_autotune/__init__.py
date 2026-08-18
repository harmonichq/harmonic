"""ciq_autotune — local, advisory Control-IQ tuning (basal, ISF, I:C, behavioral).

The package is layered so the analysis ("the brain") never touches files or the
network, and so everything funnels into one result object two interfaces render:

    sync.py        pull raw t:connect data + settings snapshots -> store
    store.py       local SQLite store (schema + idempotent read/write)
    settings.py    parse pump settings; diff snapshots into a change-log
    epochs.py      basal/ISF/I:C setting epochs; basal slot cuts; ISF/I:C caveats
    model.py       the shared clean-window filter primitive
    uncertainty.py Estimate = point value + bootstrap CI + n
    analyzers/     basal (A1), isf (A2), ic (A3), behavioral (A4)
    result.py      the versioned, JSON-serializable AnalysisResult
    analyze.py     analyze(store) -> AnalysisResult (the facade)
    render.py      AnalysisResult -> terminal text
    api.py         AnalysisResult -> HTTP JSON (the `api` extra)
    cli.py         the command you type
"""

__version__ = "0.1.0"
