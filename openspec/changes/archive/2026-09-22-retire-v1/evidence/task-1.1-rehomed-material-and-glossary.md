# Task 1.1 — the rehomed material and glossary, before and after

The desk's build used to read three facts out of `frontend/index.html` at build
time: the app-wide material, every `.ds-chart-legend` rule, and the glossary
groups (`frontend-v2/app-source.mjs`, fed to `frontend-v2/main.js` through two
virtual modules declared in `vite.config.v2.mjs`). They are now committed desk
source, `frontend-v2/material.css` and `frontend-v2/glossary.js`, and the lift
module, its test, the virtual modules and their plugin are deleted.

This record is the one-time proof that rehoming changed nothing the desk
renders.

## Before

On `0e174bcc` with the lift still in place, `npm ci && npm run build`:

```
frontend-v2/dist/assets/index-BV77V4ZT.css      491.87 kB │ gzip: 277.15 kB
frontend-v2/dist/assets/index-Bvm0BZNG.js     2,952.55 kB │ gzip: 720.48 kB
```

Those are the sizes `spike.md` recorded for the desk build, reproduced here.

The lift's own output was captured at the same commit by calling
`materialCss() + chartKeyCss()` and `glossaryModule()` directly:

```
desk-built.css: 491871 bytes, sha256 32bd5f6ee3ab3f1a276593aeb937b06815801cf1dba7638dfa3ef9eaaf22ef2e
material.css:     5275 bytes, sha256 a3473ba8abfde9c804ef353c214549eb44a8f4b86040f44c7afea974da953310
glossary.js:      2362 bytes, sha256 aa1518533b6522a6f2d7b44cca3532de45bfc673fb7b15d12d320feb5b1a9416
```

## After

`npm run build` with the two committed files in place:

```
frontend-v2/dist/assets/index-CfSHizTF.css      492.45 kB │ gzip: 277.40 kB
frontend-v2/dist/assets/index-CsD6BHqD.js     2,952.55 kB │ gzip: 720.47 kB
```

The bundled JavaScript is the same size to the byte.

## The complete difference

`diff` of the two committed files against what the lift emitted shows one
addition each — the provenance header the committed file carries and the lift,
having no file of its own, could not:

- `frontend-v2/material.css`: 10 added comment lines at the top. Every rule from
  `:root {` onward is byte-identical to the lift's output, in the lift's own
  order and indentation.
- `frontend-v2/glossary.js`: 8 added comment lines at the top. The
  `glossaryGroups` literal is byte-identical.

`diff` of the built stylesheet before and after has exactly two hunks, both
comments:

1. the 10-line header of `frontend-v2/material.css`, which Vite carries through
   because this build does not minify;
2. `frontend-v2/shell.css`'s own header, whose two lines naming the retired
   build-time lift are rewritten to name `frontend-v2/material.css`.

No selector, declaration or value differs. The 574-byte growth in the built
stylesheet is those comments.
