import { demoOn } from '../tests/db/demo-helpers';

/** switch the demo on in the local database; the returned function switches it off and cleans up */
export default async function globalSetup() {
  return await demoOn();
}
