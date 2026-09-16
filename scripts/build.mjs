import { build } from 'esbuild';
await build({
  entryPoints: ['src/main.js'],
  outfile: 'pilot.js',
  bundle: true,
  format: 'iife',
  target: ['chrome111'],
  minify: false,
  legalComments: 'none',
  banner: { js: '// OpenFront Pilot 0.11.0 — locally running strategy bot. See README.md.' },
});
console.log('Built pilot.js');
