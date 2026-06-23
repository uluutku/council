import {
  premiumCodeInputSchema,
  premiumGrantListSchema,
  premiumRedemptionSchema,
} from '@council/schemas';
import { getSupabaseClient } from '../../../lib/supabase.js';

export async function redeemPremiumCode(code, client = getSupabaseClient()) {
  const parsed = premiumCodeInputSchema.parse({ code });
  const { data, error } = await client
    .rpc('redeem_premium_access_code', { p_code: parsed.code })
    .single();
  if (error) throw error;
  return premiumRedemptionSchema.parse(data);
}

export async function listMyPremiumGrants(client = getSupabaseClient()) {
  const { data, error } = await client.rpc('list_my_premium_grants', { p_limit: 20 });
  if (error) throw error;
  return premiumGrantListSchema.parse(data ?? []);
}
