# Working on MatiQ Voice

Read README.md, docs/PRODUCT.md and docs/OAUTH.md before changing behavior.

- Standalone desktop software, not a platform feature or a new platform layer.
- Preserve recognized words. No dictation rewrite, filler deletion, automatic
  replacements or translation. Keep meeting notes separate and source-linked.
- Audio/transcripts never leave the device. Explicit OAuth/calendar metadata
  and model downloads are allowed. Meeting storage requires explicit user
  intent; never introduce silent dictation history or transcript logging.
- Customers do not configure OAuth IDs or developer packages. Registrations
  belong to the build owner; tokens stay in the main process, encrypted with OS
  crypto. Never fall back to plaintext or expose tokens to renderer/logs.
- Keep the renderer sandboxed, IPC narrow and checked, native inference in an
  isolated process. Use JavaScript-owned PCM buffers: native external-buffer
  WAV helpers are incompatible with Electron's V8 memory cage.
- Capture failures must be visible and retained audio must remain retryable.
  Posting a paste shortcut does not verify delivery. Track the original field.
- Test with npm test and npm run test:e2e. Native field/capture permissions,
  provider consent, real meetings and production signing remain separate gates.
- Update docs/VALIDATION.md with actual results and limitations. Never equate
  fixture-provider tests with live Google/Microsoft account qualification.
- Follow inherited storage-guard and worktree rules. No generated dependencies,
  binaries, private registration config or model files in Git.

## Prototype first

Before implementing UI changes, create or update the repository-owned prototype with the Solutions desktop SDK. Use the exact shared shell and existing renderer source. Do not maintain duplicate tool UI in the suite repository. Register/build it into the Solutions prototype, review standalone and hosted modes, and wait for explicit owner approval before applying the design. Saved feedback alone is not approval. Keep mock desktop bridges under prototype/, native code unchanged, and generated output/local registration ignored.
