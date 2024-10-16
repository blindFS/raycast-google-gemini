import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from "@google/generative-ai";
import { GoogleAIFileManager } from "@google/generative-ai/server";
import { Detail, environment, getPreferenceValues, LocalStorage, showToast, Toast, useNavigation } from "@raycast/api";
import fs from "fs";
import fetch, { Headers } from "node-fetch";
import { resolve } from "path";
import { useEffect, useMemo, useRef, useState } from "react";
globalThis.fetch = fetch;
globalThis.Headers = Headers;

import {
  executeShellCommand,
  getRetrieval,
  GoogleSearch,
  pathOrURLToImage,
  rawHTMLByURL,
  retrievalTypes,
} from "../utils";

const { apiKey, defaultModel, searchApiKey, searchEngineID, enableMathjax, temperature, topP, topK } =
  getPreferenceValues();
const DOWNLOAD_PATH = resolve(environment.supportPath, "response.md");
const safetySettings = [];
for (const category of Object.keys(HarmCategory)) {
  if (category != HarmCategory.HARM_CATEGORY_UNSPECIFIED) {
    safetySettings.push({ category: category, threshold: HarmBlockThreshold.BLOCK_NONE });
  }
}
const generationConfig = {
  maxOutputTokens: 50000,
  temperature: 0.0,
  topP: 0.01,
  topK: 1,
};

const GoogleSearchFunctionDeclaration = {
  name: "google",
  parameters: {
    type: "OBJECT",
    description: "Set the query and how many docs to return.",
    properties: {
      query: {
        type: "STRING",
        description: "The query to search google for.",
      },
      topN: {
        type: "NUMBER",
        description: "Return top N related documents.",
      },
    },
    required: ["query"],
  },
};

const GetFullContextFunctionDeclaration = {
  name: "getFullContext",
  parameters: {
    type: "OBJECT",
    description: "Set the url of the online document that you want to retrieve.",
    properties: {
      url: {
        type: "STRING",
        description: "The url of the online document that you want to retrieve.",
      },
    },
    required: ["url"],
  },
};

// Executable function code. Put it in a map keyed by the function name
// so that you can call it once you get the name string from the model.
const apiFunctions = {
  google: async ({ query, topN = 5 }) => {
    return await GoogleSearch(query, searchApiKey, searchEngineID, topN);
  },
  getFullContext: async ({ url }) => {
    return [await rawHTMLByURL(url)];
  },
};

export function useChat(props) {
  const { query: argQuery } = props.arguments;
  var { searchQuery: argGoogle } = props.arguments;
  var { docLink: argURL } = props.arguments;
  argGoogle = argGoogle || argQuery;
  argURL = argURL || "";
  const context = props.launchContext || {};
  generationConfig.temperature = parseFloat(temperature);
  generationConfig.topP = parseFloat(topP);
  generationConfig.topK = parseInt(topK);
  const [markdown, setMarkdown] = useState(context.markdown || "");
  const [metadata, setMetadata] = useState(context.metadata || []);
  const [loading, setLoading] = useState(false);
  const [historyJson, storedHistoryJson] = useState(context.history || []);
  const chatID = useRef(context.chatID || Date.now().toString());
  const rawAnswer = useRef("");
  const chatObject = useRef(null);
  const lastQuery = useRef(argQuery);
  const { push } = useNavigation();

  const getResponse = async (query, enable_vision = false, retrievalType = retrievalTypes.None, shortQuery = "") => {
    lastQuery.current = query;
    const textTemplate = `\n\n👤: \n\n\`\`\`\n${shortQuery || query}\n\`\`\` \n\n 🤖: \n\n`;
    var historyText = markdown + textTemplate;
    setMarkdown(historyText + "...");
    const genAI = new GoogleGenerativeAI(apiKey);
    const fileManager = new GoogleAIFileManager(apiKey);

    // empty metadata means it is the initial query
    var retrievalObjects = [];
    if (retrievalType !== retrievalTypes.None && metadata.length == 0) {
      try {
        retrievalObjects = await getRetrieval(
          fileManager,
          argGoogle,
          retrievalType,
          searchApiKey,
          searchEngineID,
          argURL,
        );
      } catch (e) {
        console.error(e);
        push(<Detail markdown={e.message} />);
        await showToast({
          style: Toast.Style.Failure,
          title: "Failed to retrieve content",
          message: e.message,
        });
        return null;
      }
    }
    if (retrievalObjects.length > 0) {
      setMetadata(retrievalObjects);
    }
    const start = Date.now();
    try {
      var messageInfo = [query, ...retrievalObjects.map((o) => o.content)];
      // get images ready
      if (enable_vision) {
        await showToast({
          style: Toast.Style.Animated,
          title: "Preparing image...",
        });
        const { fileUrl, res: imagePart } = await pathOrURLToImage(argURL);
        if (imagePart !== null) messageInfo.push(imagePart);
        console.log(fileUrl);
        const imageTemplate = `👤: \n\n\`\`\`\n${shortQuery || query}\n\`\`\` \n\n ![image](${fileUrl}) \n\n 🤖: \n\n`;
        historyText = imageTemplate;
      }
      // common behavior for all models
      setMarkdown(historyText + "...");
      setLoading(true);
      await showToast({
        style: Toast.Style.Animated,
        title: "Waiting for Gemini...",
      });

      // TODO: for now, not allowed to enable function call & code execution at the same time
      // disable codeExecution if function call is enabled historically
      var tools = { codeExecution: {} };
      if (retrievalType == retrievalTypes.Function || (historyJson.length > 0 && metadata.length > 0)) {
        tools = {
          functionDeclarations: [GoogleSearchFunctionDeclaration, GetFullContextFunctionDeclaration],
        };
      }
      const model = genAI.getGenerativeModel({ model: defaultModel });
      const chat = model.startChat({
        history: historyJson,
        generationConfig: generationConfig,
        safetySettings: safetySettings,
        tools: [tools],
      });
      chatObject.current = chat;

      var result;
      var text = "";
      // function call conflicts with streamedIO
      if (retrievalType != retrievalTypes.Function) {
        result = await chatObject.current.sendMessageStream(messageInfo);
        // post process of response text
        for await (const chunk of result.stream) {
          const chunkText = chunk.text();
          text += chunkText;
          setMarkdown(historyText + text);
        }
      } else {
        result = await chatObject.current.sendMessage(messageInfo);
        // only the first call is executed
        var calls = result.response.functionCalls();
        while (calls && calls.length > 0 && calls[0]) {
          const call = calls[0];
          setMarkdown(historyText + `calling ${call.name} with args: ${JSON.stringify(call.args)}\n\n`);
          const apiResponse = await apiFunctions[call.name](call.args);
          if (call.name == "google") setMetadata(apiResponse);
          // Indicating
          await showToast({
            style: Toast.Style.Animated,
            title: "Thinking about the next step ...",
          });
          // auto reply with response
          result = await chat.sendMessage([
            {
              functionResponse: {
                name: call.name,
                response: {
                  docs: apiResponse,
                },
              },
            },
          ]);
          calls = result.response.functionCalls();
        }
        text = result.response.text();
      }

      const history = await chatObject.current.getHistory();
      storedHistoryJson(history);
      rawAnswer.current = text;
      setMarkdown(historyText + text);
      if (enableMathjax) {
        fs.writeFileSync(DOWNLOAD_PATH, text);
        console.log("New response saved to " + DOWNLOAD_PATH);
        // replace equations with images
        const scriptPath = resolve(environment.assetsPath, "markdownMath", "index.js");
        const commandString = `node ${scriptPath} "${DOWNLOAD_PATH}"`;
        const newMarkdown = executeShellCommand(commandString);
        setMarkdown(historyText + newMarkdown);
      }
      // show success toast
      setLoading(false);
      await showToast({
        style: Toast.Style.Success,
        title: "Response Loaded",
        message: `Load finished in ${(Date.now() - start) / 1000} seconds.`,
      });
    } catch (e) {
      console.error(e);
      setLoading(false);
      push(<Detail markdown={e.message} />);
      await showToast({
        style: Toast.Style.Failure,
        title: "Response Failed",
        message: e.message,
      });
    }
  };

  useEffect(() => {
    if (historyJson.length > 0)
      LocalStorage.setItem(
        chatID.current,
        JSON.stringify({ query: lastQuery.current, markdown: markdown, metadata: metadata, history: historyJson }),
      );
  }, [markdown, metadata, historyJson]);

  return useMemo(
    () => ({
      markdown,
      metadata,
      rawAnswer,
      loading,
      getResponse,
    }),
    [markdown, metadata, rawAnswer, loading, getResponse],
  );
}
