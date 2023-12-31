import { useMemo, useRef, useState, useEffect } from "react";
import { Toast, environment, useNavigation, showToast, Detail } from "@raycast/api";
import { getPreferenceValues } from "@raycast/api";
import { LocalStorage } from "@raycast/api";
import { resolve } from "path";
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from "@google/generative-ai";
import fs from "fs";
import fetch from "node-fetch";
import {
  retrievalTypes,
  retrieveByUrl,
  getRetrieval,
  getExtraContext,
  executeShellCommand,
  pathToGenerativePart,
  urlToGenerativePart,
  parseLink,
} from "../utils";

const DOWNLOAD_PATH = resolve(environment.supportPath, "response.md");
globalThis.fetch = fetch;
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

export function useChat(props) {
  const { query: argQuery } = props.arguments;
  var { searchQuery: argGoogle } = props.arguments;
  var { docLink: argURL } = props.arguments;
  argGoogle = argGoogle || argQuery;
  argURL = argURL || "";
  const context = props.launchContext || {};
  const { apiKey, searchApiKey, searchEngineID, streamedIO, enableMathjax, temperature, topP, topK } =
    getPreferenceValues();
  generationConfig.temperature = parseFloat(temperature);
  generationConfig.topP = parseFloat(topP);
  generationConfig.topK = parseInt(topK);
  const [markdown, setMarkdown] = useState(context.markdown || "");
  const [metadata, setMetadata] = useState(context.metadata || []);
  const [loading, setLoading] = useState(false);
  const [historyJson, storedHistoryJson] = useState(context.history || []);
  const extraContext = useRef(context.extraContext || "");
  const chatID = useRef(context.chatID || Date.now().toString());
  const rawAnswer = useRef("");
  const chatObject = useRef(null);
  const lastQuery = useRef(argQuery);
  const suggestion = useRef(argQuery);
  const { push } = useNavigation();

  async function getSuggestion(text) {
    suggestion.current = "";
    const searchRegex = /^\s*?Search for (.+)$/;
    const match = text.match(searchRegex);
    if (match) {
      console.log(match[1]);
      const newRetrievalObjects = await getRetrieval(match[1], retrievalTypes.Google, searchApiKey, searchEngineID);
      setMetadata(newRetrievalObjects);
      suggestion.current = getExtraContext(newRetrievalObjects, "");
    }
    const readDocRegex = /^\s*?Full content of document (\d+)$/;
    const match2 = text.match(readDocRegex);
    if (match2) {
      const docID = parseInt(match2[1]);
      if (docID >= 1 && docID <= metadata.length + 1) {
        suggestion.current = getExtraContext([await retrieveByUrl(metadata[docID - 1].href)], "");
      }
    }
  }

  const getResponse = async (query, enable_vision = false, retrievalType = retrievalTypes.None) => {
    lastQuery.current = query;
    const textTemplate = `\n\n👤: \n\n\`\`\`\n${query}\n\`\`\` \n\n 🤖: \n\n`;
    var historyText = markdown + textTemplate;
    setMarkdown(historyText + "...");
    var retrievalObjects = [];
    // empty extraContext means it is the initial query
    if (!extraContext.current) {
      try {
        retrievalObjects = await getRetrieval(argGoogle, retrievalType, searchApiKey, searchEngineID, argURL);
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
    // extraContext is to long to show in markdown
    if (retrievalObjects.length > 0) {
      setMetadata(retrievalObjects);
      extraContext.current = getExtraContext(retrievalObjects);
      query += extraContext.current;
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    const start = Date.now();
    try {
      var messageInfo = query;
      // continue with the chat context
      if (chatObject.current) {
        setLoading(true);
        await showToast({
          style: Toast.Style.Animated,
          title: "Waiting for Gemini...",
        });
      } else {
        var model_name = "gemini-pro";
        var imagePart = null;
        if (enable_vision) {
          model_name = "gemini-pro-vision";
          const { fileUrl, filePath } = await parseLink(argURL);
          if (filePath) {
            const mime = "image/png";
            imagePart = pathToGenerativePart(filePath, mime);
          } else {
            imagePart = urlToGenerativePart(fileUrl);
          }

          console.log(fileUrl);
          const imageTemplate = `👤: \n\n\`\`\`\n${query}\n\`\`\` \n\n ![image](${fileUrl}) \n\n 🤖: \n\n`;
          historyText = imageTemplate;
        }
        // common behavior for all models
        setMarkdown(historyText + "...");
        setLoading(true);
        await showToast({
          style: Toast.Style.Animated,
          title: "Preparing image...",
        });
        messageInfo = imagePart ? [query, await imagePart] : query;
        await showToast({
          style: Toast.Style.Animated,
          title: "Waiting for Gemini...",
        });

        const model = genAI.getGenerativeModel({ model: model_name });
        const chat = model.startChat({
          history: historyJson,
          generationConfig: generationConfig,
          safetySettings: safetySettings,
        });
        chatObject.current = chat;
      }
      var result;
      if (streamedIO) {
        result = await chatObject.current.sendMessageStream(messageInfo);
      } else {
        result = await chatObject.current.sendMessage(messageInfo);
      }

      // post process of response text
      var text = "";
      if (streamedIO) {
        for await (const chunk of result.stream) {
          const chunkText = chunk.text();
          text += chunkText;
          setMarkdown(historyText + text);
        }
      } else {
        const response = await result.response;
        text = response.text();
      }
      storedHistoryJson((prev) => [...prev, { role: "user", parts: query }, { role: "model", parts: text }]);
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
      await getSuggestion(text);
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
        JSON.stringify({ query: lastQuery.current, markdown: markdown, metadata: metadata, history: historyJson })
      );
  }, [markdown, metadata, historyJson]);

  return useMemo(
    () => ({
      markdown,
      metadata,
      rawAnswer,
      suggestion,
      extraContext,
      loading,
      getResponse,
    }),
    [markdown, metadata, rawAnswer, suggestion, extraContext, loading, getResponse]
  );
}
