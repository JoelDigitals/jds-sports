import { listFlagDetails } from '../src/modules/flags.ts';

const flags = listFlagDetails();
console.log('FLAGS:', JSON.stringify(flags, null, 1));
