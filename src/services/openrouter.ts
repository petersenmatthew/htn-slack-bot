import { OpenRouter } from "@openrouter/sdk";

type SummarizeRecapOptions = {
  apiKey: string;
  model: string;
  channelName: string;
  transcript: string;
};

export const summarizeRecap = async ({
  apiKey,
  model,
  channelName,
  transcript
}: SummarizeRecapOptions): Promise<string> => {
  const openrouter = new OpenRouter({
    apiKey,
    httpReferer: "https://github.com/local/slack-recap-bot",
    appTitle: "Slack Recap Bot"
  });

  const stream = await openrouter.chat.send({
    chatRequest: {
      model,
      messages: [
        {
          role: "system",
          content:
            "You write concise Slack channel recaps. Focus on decisions, blockers, action items, owners, and important updates. If the transcript is thin, say so plainly."
        },
        {
          role: "user",
          content: `Create a useful recap for #${channelName} from this Slack transcript:\n\n${transcript}`
        }
      ],
      stream: true,
      temperature: 0.2,
      maxTokens: 700
    }
  });

  let summary = "";

  for await (const chunk of stream) {
    if (chunk.error) {
      throw new Error(chunk.error.message);
    }

    const content = chunk.choices[0]?.delta.content;

    if (content) {
      summary += content;
    }
  }

  const trimmedSummary = summary.trim();

  if (!trimmedSummary) {
    throw new Error("OpenRouter returned an empty recap.");
  }

  return trimmedSummary;
};
