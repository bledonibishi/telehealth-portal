import { useQuery } from '@apollo/client';
import { AI_FEATURES } from '@/graphql/ai';

export type AiFeature = 'brief' | 'reply' | 'translate' | 'urgency' | 'search';

/** Whether an AI helper is switched on for this clinic (needs the API key, and not turned off). The buttons stay hidden when it isn't. */
export function useAiFeature(feature: AiFeature): boolean {
  const { data } = useQuery(AI_FEATURES, { fetchPolicy: 'cache-first' });
  return ((data?.aiFeatures ?? []) as string[]).includes(feature);
}
