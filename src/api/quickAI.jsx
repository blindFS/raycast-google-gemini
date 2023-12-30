import { Form, Detail, ActionPanel, Action, useNavigation, open } from "@raycast/api";
import { Toast, environment, showToast } from "@raycast/api";
import { getSelectedText } from "@raycast/api";
import { getPreferenceValues } from "@raycast/api";
import { LocalStorage } from "@raycast/api";
import { useState, useEffect } from "react";
import { resolve } from "path";
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from "@google/generative-ai";
import fs from "fs";
import fetch from "node-fetch";
import {
  retrievalTypes,
  getRetrieval,
  getExtraContext,
  executeShellCommand,
  pathToGenerativePart,
  urlToGenerativePart,
  parseLink,
} from "./utils";

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

export default (props, context, vision = false, retrievalType = retrievalTypes.None) => {
  const { query: argQuery } = props.arguments;
  var { searchQuery: argGoogle } = props.arguments;
  var { docLink: argURL } = props.arguments;
  argGoogle = argGoogle || argQuery;
  argURL = argURL || "";
  const { apiKey, searchApiKey, searchEngineID, streamedIO, enableMathjax, temperature, topP, topK } =
    getPreferenceValues();
  generationConfig.temperature = parseFloat(temperature);
  generationConfig.topP = parseFloat(topP);
  generationConfig.topK = parseInt(topK);
  const { push, pop } = useNavigation();
  const [markdown, setMarkdown] = useState("");
  const [metadata, setMetadata] = useState("");
  const [rawAnswer, setRawAnswer] = useState("");
  const [extraContext, setExtraContext] = useState("");
  const [chatObject, setChatObject] = useState(null);
  const [loading, setLoading] = useState(false);
  const [chatKey] = useState(Date.now().toString());

  const getResponse = async (query, enable_vision = false) => {
    var retrievalObjects = [];
    // empty extraContext means it is the initial query
    if (!extraContext) {
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
    const textTemplate = `\n\n👤: \n\n\`\`\`\n${query}\n\`\`\` \n\n 🤖: \n\n`;
    if (retrievalObjects.length > 0) {
      setMetadata(retrievalObjects);
      const initialContext = getExtraContext(retrievalObjects);
      setExtraContext(initialContext);
      query += initialContext;
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    var historyText = markdown + textTemplate;
    const start = Date.now();
    try {
      var chatBot = chatObject;
      var messageInfo = query;
      // continue with the chat context
      if (chatObject) {
        setMarkdown(historyText + "...");
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
          historyText = markdown + imageTemplate;
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
          history: [],
          generationConfig: generationConfig,
          safetySettings: safetySettings,
        });
        setChatObject(chat);
        chatBot = chat;
      }
      var result;
      if (streamedIO) {
        result = await chatBot.sendMessageStream(messageInfo);
      } else {
        result = await chatBot.sendMessage(messageInfo);
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
      setRawAnswer(text);
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
    (async () => {
      var query = "";
      try {
        query = argQuery || (await getSelectedText());
        getResponse(`${context ? `${context}\n\n` : ""}${query}`, vision);
      } catch (e) {
        await showToast({
          style: Toast.Style.Failure,
          title: e.message,
          message: e.message,
        });
        push(
          <Form
            actions={
              <ActionPanel>
                <Action.SubmitForm
                  onSubmit={async (values) => {
                    query = values.query;
                    pop();
                    getResponse(`${context ? `${context}\n\n` : ""}${query}`, vision);
                  }}
                />
              </ActionPanel>
            }
          >
            <Form.TextArea id="query" title="Query" defaultValue={query} placeholder="Edit your query" />
          </Form>
        );
      }
    })();
  }, []);

  useEffect(() => {
    LocalStorage.setItem(chatKey, JSON.stringify({ query: argQuery, markdown: markdown, metadata: metadata }));
  }, [markdown, metadata]);

  return (
    <Detail
      markdown={markdown}
      metadata={
        metadata && (
          <Detail.Metadata>
            <Detail.Metadata.TagList title="Extra Context">
              {metadata.map((retrievalObject) => (
                <Detail.Metadata.TagList.Item
                  key={retrievalObject.href}
                  text={retrievalObject.title}
                  onAction={() => open(retrievalObject.href)}
                />
              ))}
            </Detail.Metadata.TagList>
            <Detail.Metadata.Separator />
          </Detail.Metadata>
        )
      }
      isLoading={loading}
      actions={
        <ActionPanel>
          <Action
            title="Reply"
            onAction={() => {
              push(
                <Form
                  actions={
                    <ActionPanel>
                      <Action.SubmitForm
                        onSubmit={(values) => {
                          if (values.replyText) {
                            getResponse(values.replyText, vision);
                          } else {
                            showToast({
                              style: Toast.Style.Success,
                              title: "Cancelled reply",
                            });
                          }
                          pop();
                        }}
                      />
                    </ActionPanel>
                  }
                >
                  <Form.TextArea
                    id="replyText"
                    title="reply with following text"
                    placeholder="..."
                    defaultValue={argQuery}
                  />
                </Form>
              );
            }}
          />
          <Action
            title="View Extra Context"
            onAction={() => {
              push(<Detail markdown={extraContext} />);
            }}
          />
          <Action.CopyToClipboard content={rawAnswer} shortcut={{ modifiers: ["cmd"], key: "c" }} />
        </ActionPanel>
      }
    ></Detail>
  );
};
