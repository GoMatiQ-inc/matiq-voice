# Working on Verbatim

Read README.md and docs/PRODUCT.md before changing behavior.

- This is standalone desktop dictation, not a MatiQ platform feature.
- Never add rewriting, word removal, dictionary replacements, or translation
  to the transcription path. Preserve the recognizer's words.
- No audio/transcript network requests. Model downloads must be explicit and
  verified. No transcript logging or silent persistence.
- Report errors with a recovery action. Never report a paste as delivered text:
  sending an OS shortcut does not prove the destination accepted it.
- Keep recognition out of the renderer. Keep the renderer sandboxed and IPC
  narrow. Avoid runtime dependencies that require users to compile software.
- Run npm test for core changes and npm run test:desktop for UI/lifecycle
  changes. Build and smoke-test packaged apps on their target OS/architecture.
- Maintain docs/VALIDATION.md. Do not equate unit tests with speech accuracy,
  Windows validation, signing, or daily-use reliability.
- Respect inherited storage-guard and worktree-lifecycle rules on shared
  development machines. Keep generated dependencies and builds out of Git.
