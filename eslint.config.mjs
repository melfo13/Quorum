import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const config = [
  ...nextVitals,
  ...nextTs,
  // eslint-plugin-react's version auto-detect breaks on ESLint 10; pin the version instead.
  { settings: { react: { version: '19.2' } } },
  { ignores: ['.next/**', 'node_modules/**', 'vendor/**', 'docs/**', '.taste-skill/**', 'data/**', 'next-env.d.ts'] },
];

export default config;
