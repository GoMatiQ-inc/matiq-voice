# Third-party notices

MatiQ Voice bundles whisper.cpp (MIT; license in the bundled engine directory),
sherpa-onnx (Apache-2.0; npm package license) and ONNX Runtime through its native
sherpa-onnx packages. Electron and its third-party notices travel in the desktop
runtime. Source Sans 3 and Source Serif 4 use the SIL Open Font License; copies
are in `src/ui/assets/`.

Setup downloads the English whisper.cpp models and two speaker models from the
URLs pinned in `src/core.cjs` / `src/assets.cjs`. Every model is size- and
SHA-256-verified. The pyannote segmentation conversion's MIT notice and the
3D-Speaker embedding's Apache-2.0 notice are included in `src/ui/assets/`.

Before commercial distribution, review the shipped runtime and model notices,
upstream model provenance and any applicable dataset terms. Do not remove
upstream license files from installers. Public test recordings are development
fixtures and are not bundled into the product.
