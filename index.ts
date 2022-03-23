#!/usr/bin/env node
import { audit, sync } from './audit';

let [ manifestFile ] = process.argv.slice(2);

if (!manifestFile) {
  throw new Error("usage: vendoza <manifestFile>");
}

let syncFlag = process.argv.includes('--sync');

if (syncFlag) {
  sync(manifestFile);
} else {
  let writePatches = process.argv.includes('--patches');
  audit(manifestFile, writePatches);
}
