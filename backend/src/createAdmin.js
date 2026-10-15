// Creates (or resets the password of) an admin account:
//   npm run create-admin -w backend -- --email you@bitevo.in --name "Your Name" --role "Super admin"
// The password is asked for in the terminal and stored only as a bcrypt hash.
import readline from 'node:readline';
import bcrypt from 'bcryptjs';
import { connectStore, store } from './db/index.js';

const arg = name => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};

function askHidden(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = text => { if (!rl.muted) rl.output.write(text); };
    rl.question(question, answer => {
      rl.output.write('\n');
      rl.close();
      resolve(answer);
    });
    rl.muted = true;
  });
}

const email = (arg('email') || '').trim().toLowerCase();
const name = (arg('name') || '').trim();
const role = (arg('role') || 'Super admin').trim();
if (!/^\S+@\S+\.\S+$/.test(email) || !name) {
  console.log('Usage: npm run create-admin -w backend -- --email you@bitevo.in --name "Your Name" [--role "Super admin"]');
  process.exit(1);
}

const password = await askHidden('Password (at least 10 characters): ');
if (password.length < 10) {
  console.log('Password too short. Nothing was changed.');
  process.exit(1);
}

await connectStore();
try {
  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await store.findOne('admins', { email });
  if (existing) {
    await store.update('admins', existing._id, { name, role, passwordHash, disabled: false });
    console.log(`Updated admin ${email}.`);
  } else {
    await store.insert('admins', { name, email, role, passwordHash, createdAt: new Date().toISOString() });
    console.log(`Created admin ${email}.`);
  }
} finally {
  await store.close();
}
