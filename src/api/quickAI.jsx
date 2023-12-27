import { Form, Detail, ActionPanel, Action, useNavigation } from "@raycast/api";
import { Toast, environment, showToast } from "@raycast/api";
import { getSelectedText } from "@raycast/api";
import { useState, useEffect } from "react";
import { getPreferenceValues } from "@raycast/api";
import { Clipboard } from "@raycast/api";
import { resolve } from "path";
import { execSync } from "child_process";
import { fileTypeFromBuffer } from "file-type";
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from "@google/generative-ai";
import fs from "fs";
import url from "url";
import fetch from "node-fetch";

const DOWNLOAD_PATH = resolve(environment.supportPath, "response.md");
globalThis.fetch = fetch;

function executeShellCommand(command) {
  try {
    const result = execSync(command, { encoding: "utf-8" });
    return result.trim();
  } catch (error) {
    console.error(`Error executing shell command: ${error}`);
    return "";
  }
}

// Converts local file information to a GoogleGenerativeAI.Part object.
async function pathToGenerativePart(path, mimeType) {
  return {
    inlineData: {
      data: Buffer.from(fs.readFileSync(path)).toString("base64"),
      mimeType,
    },
  };
}

async function arrayBufferToGenerativePart(arrayBuffer, mimeType) {
  return {
    inlineData: {
      data: Buffer.from(arrayBuffer).toString("base64"),
      mimeType,
    },
  };
}

export default (props, context, vision = false) => {
  const { query: argQuery } = props.arguments;
  const { apiKey } = getPreferenceValues();
  const { push, pop } = useNavigation();
  const [markdown, setMarkdown] = useState("");
  const [rawAnswer, setRawAnswer] = useState("");
  const [DOM, setDOM] = useState(<Detail markdown={markdown}></Detail>);
  const [chatObject, setChatObject] = useState(null);

  const genAI = new GoogleGenerativeAI(apiKey);
  const safetySettings = [];
  for (const category of Object.keys(HarmCategory)) {
    if (category != HarmCategory.HARM_CATEGORY_UNSPECIFIED) {
      safetySettings.push({ category: category, threshold: HarmBlockThreshold.BLOCK_NONE });
    }
  }
  const generationConfig = {
    stopSequences: ["red"],
    maxOutputTokens: 50000,
    temperature: 0.0,
    topP: 0.01,
    topK: 1,
  };

  const getResponse = async (query, enable_vision = false) => {
    const textTemplate = `\n\n👤: \n\n\`\`\`\n${query}\n\`\`\` \n\n 🤖: \n\n`;
    var historyText = markdown + textTemplate;

    await showToast({
      style: Toast.Style.Animated,
      title: "Waiting for Gemini...",
    });

    const start = Date.now();
    try {
      var result;
      if (chatObject) {
        setMarkdown(historyText + "...");
        result = await chatObject.sendMessageStream(query);
      } else {
        if (enable_vision) {
          const model = genAI.getGenerativeModel({ model: "gemini-pro-vision" }, safetySettings, generationConfig);
          // read image from clipboard
          const { text, file, html } = await Clipboard.read();
          var fileUrl = file;
          var imageParts = [];
          if (fileUrl) {
            const imageTempalte = `👤: \n\n\`\`\`\n${query}\n\`\`\` \n\n ![image](${fileUrl}) \n\n 🤖: \n\n`;
            historyText = markdown + imageTempalte;
            setMarkdown(historyText + "...");
            const path = url.fileURLToPath(fileUrl);
            const mime = "image/png";
            imageParts = [await pathToGenerativePart(path, mime)];
          } else {
            const parsedUrl = url.parse(text);
            if (parsedUrl.protocol) {
              // download image from parsedUrl.href to IMAGE_PATH
              fileUrl = parsedUrl.href;
              const imageTempalte = `👤: \n\n\`\`\`\n${query}\n\`\`\` \n\n ![image](${fileUrl}) \n\n 🤖: \n\n`;
              historyText = markdown + imageTempalte;
              setMarkdown(historyText + "...");
              const response = await fetch(fileUrl);
              const arrayBuffer = await response.arrayBuffer();
              const fileType = await fileTypeFromBuffer(arrayBuffer);
              const mime = await fileType.mime;
              imageParts = [await arrayBufferToGenerativePart(arrayBuffer, mime)];
            } else {
              setMarkdown("Please copy an image or an image link to clipboard.");
              // show toast
              await showToast({
                style: Toast.Style.Failure,
                title: "No image found",
                message: "Please copy an image or an image link to clipboard.",
              });
              return;
            }
          }
          console.log(fileUrl);
          const chat = model.startChat({
            history: [],
            generationConfig: generationConfig,
            safetySettings: safetySettings,
          });
          setChatObject(chat);
          result = await chat.sendMessageStream([query, ...imageParts]);
        } else {
          setMarkdown(historyText + "...");
          const model = genAI.getGenerativeModel({ model: "gemini-pro" }, safetySettings, generationConfig);
          const chat = model.startChat({
            history: [],
            generationConfig: generationConfig,
            safetySettings: safetySettings,
          });
          setChatObject(chat);
          result = await chat.sendMessageStream(query);
        }
      }
      var text = "";
      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        text += chunkText;
        setMarkdown(historyText + text);
      }
      setRawAnswer(text);
      setMarkdown(historyText + text);
      fs.writeFileSync(DOWNLOAD_PATH, text);
      console.log("New response saved to " + DOWNLOAD_PATH);
      // replace equations with images
      const scriptPath = resolve(__dirname, "assets", "mathEquation.js");
      const commandString = `node ${scriptPath} "${DOWNLOAD_PATH}"`;
      const newMarkdown = executeShellCommand(commandString);
      setMarkdown(historyText + newMarkdown);
      // show toast
      await showToast({
        style: Toast.Style.Success,
        title: "Response Loaded",
        message: `Load finished in ${(Date.now() - start) / 1000} seconds.`,
      });
    } catch (e) {
      console.error(e);
      await showToast({
        style: Toast.Style.Failure,
        title: "Response Failed",
        message: e.message,
      });
    }
  };

  useEffect(() => {
    (async () => {
      try {
        getResponse(`${context ? `${context}\n\n` : ""}${argQuery ? argQuery : await getSelectedText()}`, vision);
        setDOM(<Detail markdown={markdown}></Detail>);
      } catch (e) {
        if (argQuery) {
          getResponse(`${context ? `${context}\n\n` : ""}${argQuery}`, vision);
          setDOM(<Detail markdown={markdown}></Detail>);
        } else {
          setDOM(
            <Form
              actions={
                <ActionPanel>
                  <Action.SubmitForm
                    onSubmit={(values) => {
                      getResponse(values.query, vision);
                    }}
                  />
                </ActionPanel>
              }
            >
              <Form.TextField id="query" title="Query" />
            </Form>
          );
        }
      }
    })();
  }, []);

  useEffect(() => {
    setDOM(
      <Detail
        markdown={markdown}
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
                                title: "Going back",
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
                      placeholder="explain more"
                    ></Form.TextArea>
                  </Form>
                );
              }}
            />
            <Action.CopyToClipboard content={rawAnswer} shortcut={{ modifiers: ["cmd"], key: "." }} />
          </ActionPanel>
        }
      ></Detail>
    );
  }, [markdown]);

  return DOM;
};
