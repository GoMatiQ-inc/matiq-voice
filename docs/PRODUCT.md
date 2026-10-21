# Product decisions

## Confirmed by the owner

macOS and Windows. Local recognition. Word-for-word intent: no deliberate word
removal or cleanup. Reliability and avoiding repeated manual rebuilds matter
more than a large feature list.

## First slice

- Toggle dictation with a global shortcut; visible state and cancel.
- Microphone choice and a level meter driven by captured audio.
- Download and verify one of three English models.
- Recognize locally and preserve the decoded words.
- Paste into the original app/window if still foreground; otherwise copy.
- Keep the last transcript available and retry failed recognition from memory.
- Package the engine/runtime into apps using repeatable Mac/Windows CI builds.

The UI is a compact recording console: cool gray (#eef2f6), dark ink (#202d40),
muted slate (#526176), blue action (#244fc7), and white transcript surface.
System typography respects platform conventions. Left-aligned recording,
transcript, then settings makes the last result easy to recover. The recording
control is the principal visual element; no animated decorative waveform.

## Acceptance before a release is called reliable

1. Install on clean supported Mac and Windows machines without developer tools.
2. Grant/deny/revoke microphone and paste permissions; errors remain actionable.
3. Compare a real recording with a manually verified reference. Include fillers,
   repetitions, self-corrections, numbers, proper nouns, and quiet/fast speech.
   Count substitutions, deletions, and insertions; specifically count lost
   fillers. A model that sounds polished but drops words fails this requirement.
4. Run 100 start/stop cycles in typical destination apps without crashes or
   duplicates. Switch apps mid-transcription: verify no unintended automatic paste.
5. Unplug/change microphones, sleep/wake, fill disk, interrupt a model download,
   crash the engine, cancel while processing, and recover with no stuck recording.
6. Finish a five-minute recording and confirm first/last words are preserved.
7. Disable the network after model installation and repeat real dictation.
8. Verify app signatures/notarization and installer upgrade/rollback behavior.

Acceptance is not implied by unit tests. Whisper is a starting engine, not a
promise that it meets the owner's disfluency-preservation requirement. Choose
or change the recognition model based on speech measurements.

## Later candidates, pending discussion

Customizable shortcuts, hold-to-talk, launch at login, visible floating indicator,
larger/multilingual models, manual file transcription, user-controlled history,
portable settings, signed updates with rollback. Add only after the core passes
daily use. A local inference service may later keep the model warm if measured
latency warrants it; the first version loads the model for each recording.

## Deliberately excluded

Cleanup, summary, rewrite, tone adjustment, automatic word substitutions,
voice cloning, meeting bots, accounts, cloud sync, and SaaS platform integration.
