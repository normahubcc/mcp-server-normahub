/**
 * MCP Prompts for NormaHub.
 * Pre-engineered prompt templates for Senior Code Review, SeeDance Scene Direction, and Model Cost Optimization.
 */

export const PROMPT_DEFINITIONS = [
  {
    name: "review_code",
    description: "Senior-level architectural, security and performance code review (Optimized for Claude Sonnet 5.5).",
    arguments: [
      {
        name: "code",
        description: "Source code snippet, function, or git diff to review",
        required: true,
      },
      {
        name: "context",
        description: "Project context, architectural constraints, or runtime environment (e.g. Node 20, high-concurrency microservice)",
        required: false,
      },
      {
        name: "focus",
        description: "Specialized review focus: architecture, security, performance, typing, or edge-cases",
        required: false,
      },
    ],
  },
  {
    name: "direct_video_scene",
    description: "Cinematic prompt generator and director sheet for SeeDance 2.5 / Grok Video.",
    arguments: [
      {
        name: "concept",
        description: "Core scene idea, characters, action or story beat",
        required: true,
      },
      {
        name: "style",
        description: "Visual aesthetics: cinematic 35mm, cyberpunk noir, hyperrealistic drone shot, anime, retro VHS",
        required: false,
      },
      {
        name: "aspect_ratio",
        description: "Target aspect ratio (16:9 widescreen, 9:16 vertical reels, 1:1 square)",
        required: false,
      },
    ],
  },
  {
    name: "cost_optimize_route",
    description: "Analyzes AI workload requirements and recommends the optimal, lowest-cost model among NormaHub's 30 LLMs.",
    arguments: [
      {
        name: "task_description",
        description: "Description of the task, input data size, frequency, and reasoning complexity",
        required: true,
      },
      {
        name: "expected_volume",
        description: "Estimated monthly token volume (e.g. 500K tokens, 50M tokens/month)",
        required: false,
      },
      {
        name: "latency_sensitivity",
        description: "Latency tolerance: real-time user UX, async queue worker, or batch background job",
        required: false,
      },
    ],
  },
];

export async function handleGetPrompt(name: string, args: Record<string, any> = {}): Promise<any> {
  switch (name) {
    case "review_code": {
      const code = args.code || "";
      const context = args.context ? `Project Context: ${args.context}\n` : "";
      const focus = args.focus ? `Specific Focus Area: ${args.focus}\n` : "";

      const promptText = [
        "You are an Elite Staff / Principal Software Architect performing a thorough Senior Code Review.",
        "Model recommendation: claude-sonnet-5-5 via NormaHub for high-fidelity reasoning.",
        "",
        context,
        focus,
        "Analyze the following code with ruthless precision:",
        "1. Architectural integrity, separation of concerns, and clean boundaries.",
        "2. Potential race conditions, memory leaks, unhandled async errors, and edge-cases.",
        "3. Security vulnerabilities (injection, auth bypass, data leaks, denial of service).",
        "4. Performance bottlenecks, algorithmic complexity, and token/network efficiency.",
        "5. Concreate, actionable refactoring code snippets (not vague generalities).",
        "",
        "```",
        code,
        "```",
      ]
        .filter(Boolean)
        .join("\n");

      return {
        description: "Senior Code Review prompt pre-configured for Claude Sonnet 5.5",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: promptText,
            },
          },
        ],
      };
    }

    case "direct_video_scene": {
      const concept = args.concept || "";
      const style = args.style || "Cinematic 35mm film, volumetric lighting, photorealistic physics";
      const aspect = args.aspect_ratio || "16:9 widescreen";

      const promptText = [
        "You are an Award-Winning AI Cinematographer and Director crafting prompt parameters for SeeDance 2.5 on NormaHub.",
        "",
        `Concept: ${concept}`,
        `Visual Style: ${style}`,
        `Aspect Ratio: ${aspect}`,
        "",
        "Formulate a production-grade prompt suitable for SeeDance 2.5 / Grok Imagine Video:",
        "- Camera motion: tracking shot, crane up, slow dolly zoom, or whip pan",
        "- Lighting & optics: anamorphic lens flare, golden hour rim light, volumetric haze",
        "- Subject physics: realistic cloth dynamics, fluid motion, atmospheric particle drift",
        "- Pacing & Temporal coherence: 5-second progression beat by beat",
        "",
        "Output the final prompt in English optimized for video generation models, plus a 1-sentence summary of camera dynamics.",
      ].join("\n");

      return {
        description: "Cinematic prompt generator for SeeDance 2.5",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: promptText,
            },
          },
        ],
      };
    }

    case "cost_optimize_route": {
      const taskDesc = args.task_description || "";
      const volume = args.expected_volume ? `Expected Volume: ${args.expected_volume}\n` : "";
      const latency = args.latency_sensitivity ? `Latency Sensitivity: ${args.latency_sensitivity}\n` : "";

      const promptText = [
        "You are an AI FinOps & Infrastructure Optimization Specialist on NormaHub.",
        "Your mission is to find the most cost-effective model route among NormaHub's 30 models without compromising required output quality.",
        "",
        `Task Description: ${taskDesc}`,
        volume,
        latency,
        "Review the NormaHub catalog matrix:",
        "- DeepSeek v4.1 Flash ($0.018 in / $0.050 out per 1M) -> Fast code extraction, classification, structured JSON, high volume.",
        "- GLM 5.3 Flash ($0.025 in / $0.100 out per 1M) -> Low-latency pipelines and bilingual parsing.",
        "- Claude Sonnet 5.5 ($0.35 in / $1.80 out per 1M) -> Complex architectural synthesis, refactoring.",
        "- GPT-5.5 ($0.12 in / $0.69 out per 1M) -> Balanced intermediate reasoning.",
        "",
        "Provide:",
        "1. Recommended primary model and expected monthly cost comparison.",
        "2. Multi-tier routing strategy (e.g. cheap triage with DeepSeek v4.1, escalate complex edge cases to Claude Sonnet 5.5).",
        "3. Concrete NormaHub API configuration advice.",
      ]
        .filter(Boolean)
        .join("\n");

      return {
        description: "Cost optimization and intelligent model routing analyzer",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: promptText,
            },
          },
        ],
      };
    }

    default:
      throw new Error(`Prompt template with name "${name}" not found.`);
  }
}
