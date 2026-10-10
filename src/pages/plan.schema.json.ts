import type { APIRoute } from 'astro';
import { PLAN_SCHEMA } from '@/photorouter/lib/byoai';

// The response contract an AI must follow, published so it can be passed
// straight to a provider's structured-output option.
export const GET: APIRoute = () =>
  new Response(JSON.stringify(PLAN_SCHEMA, null, 2), {
    headers: { 'Content-Type': 'application/schema+json; charset=utf-8' },
  });
