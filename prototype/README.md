# MatiQ Voice prototype

This prototype renders the existing src/ui implementation through the shared desktop shell. There is no second maintained UI tree. bridge.js supplies sample state and simulated desktop operations. Production renderer files remain unchanged.

Run matiq-tool prototype build --suite <solutions-checkout> --shell <shared-shell-directory>. This registers this repository and builds both standalone and hosted views. Generated .prototype output and local registration are ignored. Edit renderer source here and rebuild; never copy maintained tool UI into the suite repository.

Review both modes. Feedback is not approval. After explicit owner approval, record the actual instruction with prototype approve --by and --approval-text. Changes to renderer, bridge, manifest or shared shell invalidate approval. Browser prototypes do not qualify native audio, inference, OS permissions or installers.

After SDK 0.1.4 is published, use `npm run prototype -- --suite <solutions-checkout>` (or set `MATIQ_SOLUTIONS_PROTOTYPE`). No native dependency build, model download or installed application is required for the browser preview.
