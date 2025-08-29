KTX2 transcoder files (optional)

By default, the client uses CDN-hosted BasisU transcoder binaries from:

  https://unpkg.com/three@0.179.1/examples/jsm/libs/basis/

If you prefer to self-host, download the following files into this folder and update the loader path in useCardTexture.ts to `loader.setTranscoderPath("/ktx2/")`:

- basis_transcoder.js
- basis_transcoder.wasm
- basis_transcoder.wasm.js (some builds include this shim)
- basis_transcoder.wasm.wasm (some builds include this extra indirection)

Notes
- Version should match your installed three.js (currently ^0.179.1).
- Files are served as static assets from the Next.js `public/` folder.
