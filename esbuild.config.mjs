import esbuild from 'esbuild';
const prod = process.argv[2] === 'production';
await esbuild.build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: ['obsidian', 'electron'],
  format: 'cjs',
  target: 'es2020',
  platform: 'browser',
  logLevel: 'info',
  sourcemap: prod ? false : 'inline',
  minify: prod,
  treeShaking: true,
  outfile: 'main.js'
});
