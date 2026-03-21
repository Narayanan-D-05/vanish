/**
 * Vanish Protocol - All-in-One Launcher
 * Starts the Pool Manager, User Agent, and Frontend dev server.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Load environment variables
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const colors = {
  reset: "\x1b[0m",
  pool: "\x1b[35m", // Magenta
  user: "\x1b[32m", // Green
  front: "\x1b[36m", // Cyan
  error: "\x1b[31m", // Red
};

function log(label, message, color) {
  const lines = message.toString().split('\n');
  lines.forEach(line => {
    if (line.trim()) {
      console.log(`${color}[${label}]${colors.reset} ${line}`);
    }
  });
}

function startProcess(name, command, args, cwd, color) {
  console.log(`${color}Starting ${name}...${colors.reset}`);
  const proc = spawn(command, args, { 
    cwd, 
    shell: true,
    env: { ...process.env, FORCE_COLOR: 'true' }
  });

  proc.stdout.on('data', (data) => log(name, data, color));
  proc.stderr.on('data', (data) => log(name, data, colors.error));

  proc.on('close', (code) => {
    console.log(`${color}${name} process exited with code ${code}${colors.reset}`);
    if (code !== 0 && code !== null) {
      console.log(`${colors.error}CRITICAL: ${name} process failed. Shutting down all processes...${colors.reset}`);
      process.emit('SIGINT');
    }
  });

  return proc;
}

// 1. Start Pool Manager
const poolManager = startProcess(
  'POOL', 
  'node', 
  ['agents/pool-manager/index.cjs'], 
  __dirname, 
  colors.pool
);

// 2. Start User Agent
const accountId = process.env.HEDERA_ACCOUNT_ID || '0.0.8274009';
const privateKey = process.env.HEDERA_PRIVATE_KEY || '';
console.log(`${colors.user}Using User Agent Account: ${accountId}${colors.reset}`);
const userAgent = startProcess(
  'USER', 
  'node', 
  ['--max-old-space-size=4096', 'agents/user-agent/index.cjs', accountId, privateKey], 
  __dirname, 
  colors.user
);

// 3. Start Frontend
const frontend = startProcess(
  'FRONTEND', 
  'npm', 
  ['run', 'dev'], 
  path.join(__dirname, 'frontend'), 
  colors.front
);

// Handle termination
process.on('SIGINT', () => {
  console.log('\nShutting down Vanish Protocol...');
  poolManager.kill();
  userAgent.kill();
  frontend.kill();
  process.exit();
});
