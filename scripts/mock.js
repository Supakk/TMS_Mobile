// Starts Expo with mock mode on, the same on Windows, macOS and Linux: npm run mock [-- --android]
const { spawn } = require('node:child_process');

const child = spawn('npx', ['expo', 'start', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, EXPO_PUBLIC_MOCK: '1' },
});
child.on('exit', (code) => process.exit(code ?? 0));
