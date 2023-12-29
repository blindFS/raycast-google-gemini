import { Form, Detail, ActionPanel, Action, useNavigation, open } from "@raycast/api";
import { Toast, environment, showToast } from "@raycast/api";
import { getSelectedText } from "@raycast/api";
import { useState, useEffect } from "react";
import { getPreferenceValues } from "@raycast/api";
import { Clipboard } from "@raycast/api";
import { resolve } from "path";
import { execSync } from "child_process";
import { fileTypeFromBuffer } from "file-type";
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from "@google/generative-ai";
import { setTimeout } from "timers";
import { convert } from "html-to-text";
import cheerio from "cheerio";
import fs from "fs";
import url from "url";
import fetch from "node-fetch";

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

async function retrieveByUrl(urlText = "", title = "") {
  if (!urlText) urlText = await Clipboard.readText();
  const parsedUrl = new URL(urlText);
  showToast({
    style: Toast.Style.Animated,
    title: "Extracting context from the URL in clipboard",
    message: parsedUrl.href,
  });
  const controller = new AbortController();
  setTimeout(() => {
    controller.abort();
  }, 5000);
  const response = await fetch(parsedUrl.href, { signal: controller.signal });
  const rawHTML = await response.text();
  showToast({
    style: Toast.Style.Success,
    title: "Content extraction successful",
  });
  if (!title) {
    const $ = cheerio.load(rawHTML);
    title = $("title").text();
  }
  const converted = convert(rawHTML, { wordwrap: 130 });
  return {
    href: parsedUrl.href,
    title: title,
    content: converted,
  };
}

const retrievalTypes = {
  None: 0,
  URL: 1,
  Google: 2,
};

async function getRetrieval(searchQuery, retrievalType, searchApiKey = "", searchEngineID = "", URL = "", topN = 10) {
  var retrievalObjects = [];
  if (retrievalType == retrievalTypes.URL) {
    const retrievalObject = await retrieveByUrl(URL);
    if (retrievalObject) retrievalObjects.push(retrievalObject);
  } else if (retrievalType == retrievalTypes.Google) {
    const googleSearchUrl = "https://www.googleapis.com/customsearch/v1?";
    const params = {
      key: searchApiKey,
      cx: searchEngineID,
      q: searchQuery,
    };
    const controller = new AbortController();
    setTimeout(() => {
      controller.abort();
    }, 5000);
    showToast({
      style: Toast.Style.Animated,
      title: "Google Searching",
      message: "query: " + searchQuery,
    });
    const response = await fetch(googleSearchUrl + new URLSearchParams(params), { signal: controller.signal });
    const json = await response.json();
    showToast({
      style: Toast.Style.Success,
      title: "Got google top results",
    });
    for (const item of json.items.slice(0, topN)) {
      retrievalObjects.push({
        href: item.link,
        title: item.title,
        content: item.snippet,
      });
    }
  }
  return retrievalObjects;
}

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

async function urlToGenerativePart(fileUrl) {
  const response = await fetch(fileUrl);
  const arrayBuffer = await response.arrayBuffer();
  const fileType = await fileTypeFromBuffer(arrayBuffer);
  const mimeType = await fileType.mime;
  return {
    inlineData: {
      data: Buffer.from(arrayBuffer).toString("base64"),
      mimeType,
    },
  };
}

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
      setMetadata(
        <Detail.Metadata>
          <Detail.Metadata.TagList title="Extra Context">
            {retrievalObjects.map((retrievalObject) => (
              <Detail.Metadata.TagList.Item
                key={retrievalObject.href}
                text={retrievalObject.title}
                onAction={() => open(retrievalObject.href)}
              />
            ))}
          </Detail.Metadata.TagList>
          <Detail.Metadata.Separator />
        </Detail.Metadata>
      );

      const initalContext =
        "\n\nextra context:\n\n" +
        retrievalObjects
          .map(
            (retrievalObject) =>
              `title: ${retrievalObject.title}\n\nbody: ${retrievalObject.content.slice(0, 20000)}\n\n`
          )
          .join(" ----------------------- \n\n");
      setExtraContext(initalContext);
      query += initalContext;
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    var historyText = markdown + textTemplate;
    const start = Date.now();
    try {
      var result;
      if (chatObject) {
        setMarkdown(historyText + "...");
        await showToast({
          style: Toast.Style.Animated,
          title: "Waiting for Gemini...",
        });
        result = await chatObject.sendMessageStream(query);
      } else {
        var model_name = "gemini-pro";
        var imagePart = null;
        if (enable_vision) {
          model_name = "gemini-pro-vision";
          // read image from clipboard
          const { text, file } = await Clipboard.read();
          var fileUrl = file;
          if (fileUrl) {
            const path = url.fileURLToPath(fileUrl);
            const mime = "image/png";
            imagePart = pathToGenerativePart(path, mime);
          } else {
            const parsedUrl = new URL(text);
            if (parsedUrl.protocol) {
              // download image from parsedUrl.href to IMAGE_PATH
              fileUrl = parsedUrl.href;
              imagePart = urlToGenerativePart(fileUrl);
            } else {
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
          const imageTemplate = `👤: \n\n\`\`\`\n${query}\n\`\`\` \n\n ![image](${fileUrl}) \n\n 🤖: \n\n`;
          historyText = markdown + imageTemplate;
        }
        // common behavior for all models
        setMarkdown(historyText + "...");
        await showToast({
          style: Toast.Style.Animated,
          title: "Preparing image...",
        });
        const messageInfo = imagePart ? [query, await imagePart] : query;
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
        if (streamedIO) {
          result = await chat.sendMessageStream(messageInfo);
        } else {
          result = await chat.sendMessage(messageInfo);
        }
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
      await showToast({
        style: Toast.Style.Success,
        title: "Response Loaded",
        message: `Load finished in ${(Date.now() - start) / 1000} seconds.`,
      });
    } catch (e) {
      console.error(e);
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

  return (
    <Detail
      markdown={markdown}
      metadata={metadata}
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
                  ></Form.TextArea>
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
