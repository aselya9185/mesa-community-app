import { cache } from 'react';
import { demoMode } from '@/lib/demo';
import { supabaseService } from '@/lib/supabase/service';
import { demoReady } from './demo';

/**
 * SERVER ONLY. Is this really the demo: the server setting AND the database switch? Anything that changes what a real
 * person gets (storing a request, pings, messages) asks this, so one setting left on by mistake changes nothing.
 * Where the setting is off, the database is not asked.
 */
export const demoActive = cache(async (): Promise<boolean> => demoMode() && (await demoReady(supabaseService())));
