import { audit } from './audit';

let [ manifestFile ] = process.argv.slice(2);

if (!manifestFile) {
  throw new Error("usage: vendoza <manifestFile>");
}

let writePatches = process.argv.includes('--patches');

audit(manifestFile, writePatches);
