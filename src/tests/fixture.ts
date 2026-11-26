/**
 * A trimmed copy of a real `/api/v1/public/models` response.
 * Kept as a fixture so tests never depend on the network or on today's prices.
 */

export const LIVE_PAYLOAD = {
  updated_at: "2026-11-21T14:46:57.000000+00:00",
  models: [
    {
      id: "claude-sonnet-5-5",
      display_name: null,
      provider_display_name: "Anthropic",
      owned_by: "normahub",
      endpoints: ["/v1/responses", "/v1/chat/completions", "/v1/completions", "/v1/messages"],
      capabilities: { tools: true, openai: true, vision: false, anthropic: true, reasoning: true, streaming: true },
      context_window: 1_000_000,
      max_output_tokens: 1_000_000,
      pricing: {
        currency: "USD",
        input_price_per_million: "0.3500000000",
        output_price_per_million: "1.8000000000",
        input_price_per_million_cached: "0.3000000000",
        output_price_per_million_cached: "0.5000000000",
        cache_percent: "90.00",
        image_price: "0E-10",
        video_price_480p_per_sec: "0",
        video_price_720p_per_sec: "0",
        video_price_1080p_per_sec: "0",
        video_price_4k_per_sec: "0",
      },
      public_page: {
        name: "Claude Sonnet 5.5",
        summary: "Balanced reasoning model.",
        updated_at: "2026-11-21T14:46:23.511966+00:00",
      },
    },
    {
      id: "gpt-image-2.5-flare",
      display_name: null,
      provider_display_name: "OpenAI",
      owned_by: "normahub",
      endpoints: ["/v1/chat/completions", "/v1/images/generations"],
      capabilities: { openai: true, streaming: true },
      context_window: 353_000,
      max_output_tokens: 100_000,
      pricing: {
        currency: "USD",
        input_price_per_million: "0E-10",
        output_price_per_million: "0E-10",
        input_price_per_million_cached: "0E-10",
        output_price_per_million_cached: "0E-10",
        cache_percent: "0.00",
        image_price: "0.0400000000",
        video_price_480p_per_sec: "0",
        video_price_720p_per_sec: "0",
        video_price_1080p_per_sec: "0",
        video_price_4k_per_sec: "0",
      },
      public_page: { name: "GPT Image 2.5 Flare", summary: "Image generation." },
    },
    {
      id: "grok-imagine-video-1.5",
      display_name: null,
      provider_display_name: "xAI",
      owned_by: "openai",
      endpoints: ["/v1/chat/completions", "/v1/videos"],
      capabilities: { openai: true },
      context_window: 353_000,
      max_output_tokens: 100_000,
      pricing: {
        currency: "USD",
        input_price_per_million: "0E-10",
        output_price_per_million: "0E-10",
        input_price_per_million_cached: "0E-10",
        output_price_per_million_cached: "0E-10",
        cache_percent: "0.00",
        image_price: "0E-10",
        video_price_480p_per_sec: "0.1000000000",
        video_price_720p_per_sec: "0.2000000000",
        video_price_1080p_per_sec: "0.3000000000",
        video_price_4k_per_sec: "0",
      },
      public_page: { name: "Grok Imagine Video 1.5", summary: "Video generation, per-second pricing." },
    },
  ],
};

export function fixtureFetch(calls?: { count: number }): typeof fetch {
  return (async () => {
    if (calls) calls.count += 1;
    return new Response(JSON.stringify(LIVE_PAYLOAD), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
}

export function failingFetch(message = "network down"): typeof fetch {
  return (async () => {
    throw new Error(message);
  }) as typeof fetch;
}