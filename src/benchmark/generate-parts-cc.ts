import { prompts } from "./prompts";
import { chatCompletionInstructions } from "./chat-completion-instructions";
import { existsSync, writeFileSync } from "fs";
import { join } from "path";
import { openai } from "../utils/open-ai";
import { withRetries } from "../utils";

export interface RawGeneratedPart {
  result: string;
  tokens: number;
}

export interface GeneratedPart extends RawGeneratedPart {
  completionTime: number;
  generatorName: string;
  prompt: string;
}

export type Generator = {
  name: string;
  generate: (prompt: string) => Promise<RawGeneratedPart>;
};

const completionBasedGenerators: Generator[] =
  chatCompletionInstructions.flatMap(({ name, instructions }) => {
    return [
      "ft:gpt-3.5-turbo-0613:personal:flyde-23-08-27:7s9Gy7SR",
      "gpt-3.5-turbo",
    ].map((model) => ({
      name: `chat-completion-${model}-${name}`,
      generate: async (prompt: string) => {
        const result = await openai.chat.completions.create(
          {
            model,
            messages: [
              { role: "system", content: instructions },
              { role: "user", content: prompt },
            ],
            temperature: 0.1,
            max_tokens: 512,
            frequency_penalty: 0,
            presence_penalty: 0,
          },
          { timeout: 25000 }
        );
        const tokens = result.usage?.total_tokens ?? -1;
        return {
          result: result.choices[0].message?.content ?? "",
          tokens,
        };
      },
    }));
  });

(async function () {
  for (const prompt of prompts) {
    const idx = prompts.indexOf(prompt);

    console.log(`Generating prompt ${idx + 1}/${prompts.length}`);
    for (const generator of [...completionBasedGenerators]) {
      console.log(`Generating with ${generator.name}`);
      const now = Date.now();
      const promptId = `prompt-${idx + 1}-${generator.name}`;

      if (doesPromptResultsExist(promptId)) {
        console.log(`Skipping prompt ${promptId}`);
        continue;
      }

      const { result, tokens } = await withRetries(() =>
        generator.generate(prompt)
      );
      const time = Date.now() - now;
      console.log(
        `Generated ${generator.name} in ${time}ms with ${tokens} tokens. ${result}. Prompt: ${prompt}}`
      );
      const data = {
        result,
        tokens,
        completionTime: time,
        generatorName: generator.name,
        prompt,
      };
      savePromptResult(promptId, data);
    }
  }
})();

function savePromptResult(resultId: string, result: GeneratedPart) {
  return writeFileSync(
    join(__dirname, `../../prompt-results`, `${resultId}.json`),
    JSON.stringify(result, null, 2)
  );
}

function doesPromptResultsExist(resultId: string) {
  return existsSync(
    join(__dirname, `../../prompt-results`, `${resultId}.json`)
  );
}
