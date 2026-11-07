#!/usr/bin/env node
// pnpm test : lance « ng test » (builder @angular/build:unit-test, Vitest, une passe : watch=false
// dans angular.json).
// Accepte aussi la forme Vitest « pnpm test -- --run » (utilisée par le hook Stop de .claude/settings.json) :
// pnpm transmet « -- --run » tel quel, que ng refuse ; on retire ces deux arguments, sans effet ici.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ng = require.resolve('@angular/cli/bin/ng.js');
const args = process.argv.slice(2).filter((arg) => arg !== '--' && arg !== '--run');

const { status } = spawnSync(process.execPath, [ng, 'test', ...args], { stdio: 'inherit' });
process.exit(status ?? 1);
