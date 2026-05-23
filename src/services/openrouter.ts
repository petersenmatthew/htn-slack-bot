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
            [
              "You write concise Slack channel recaps in Slack mrkdwn.",
              "Return a structured recap with these exact sections: *Quick summary*, *Decisions*, *Action items*, *Blockers*, and *Notable updates*.",
              "Use short bullet points under each section with '- '. Keep each bullet easy to scan.",
              "Use Slack bold with single asterisks only, like *Action items*. Do not use Markdown headings, double-asterisk bold, tables, or long paragraphs.",
              "Mention owners when clear. If a section has nothing meaningful, use '- None surfaced in the recent messages.'",
              "If the transcript is thin, say so plainly in *Quick summary*."
            ].join(" ")
        },
        {
          role: "user",
          content: `Create a useful, easy-to-read bullet-point recap for #${channelName} from this Slack transcript:\n\n${transcript}`
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
