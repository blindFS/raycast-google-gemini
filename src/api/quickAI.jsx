import { Form, Detail, ActionPanel, Action } from "@raycast/api";
import { Toast, environment, showToast } from "@raycast/api";
import { getSelectedText } from "@raycast/api";
import { useState, useEffect } from "react";
import { getPreferenceValues } from "@raycast/api";
import { Clipboard } from "@raycast/api";
import { resolve } from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { execSync } from "child_process";
import { fileTypeFromBuffer } from "file-type";
import fetch from 'node-fetch';
import fs from "fs";
import url from "url";

const DOWNLOAD_PATH = resolve(environment.supportPath, "response.md");

function executeShellCommand(command) {
  try {
    const result = execSync(command, { encoding: 'utf-8' });
    return result.trim();
  } catch (error) {
    console.error(`Error executing shell command: ${error}`);
    return '';
  }
}

// Converts local file information to a GoogleGenerativeAI.Part object.
async function pathToGenerativePart(path, mimeType) {
  return {
    inlineData: {
      data: Buffer.from(fs.readFileSync(path)).toString("base64"),
      mimeType
    },
  };
}

export default (props, context, examples, vision = false) => {
  const { query: argQuery } = props.arguments;
  const { apiKey } = getPreferenceValues();
  const [markdown, setMarkdown] = useState("");
  const [rawAnswer, setRawAnswer] = useState("");
  const [DOM, setDOM] = useState(<Detail markdown={markdown}></Detail>);

  const getResponse = async (query, enable_vision = false) => {
    var extraText = `User prompt: \n\n\`\`\`\n${query}\n\`\`\` \n\n Gemini response: \n\n`;
    setMarkdown(extraText + '...');

    await showToast({
      style: Toast.Style.Animated,
      title: "Waiting for Gemini...",
    });

    const start = Date.now();
    const genAI = new GoogleGenerativeAI(apiKey);

    try {
      var result;
      if (enable_vision) {
        const model = genAI.getGenerativeModel({ model: "gemini-pro-vision"});
        // read image from clipboard
        const { text, file, html } = await Clipboard.read();
        var fileUrl = file;
        var path;
        var mime = 'image/png';
        if (fileUrl) {
          path = url.fileURLToPath(fileUrl);
        } else {
          const parsedUrl = url.parse(text);
          if (parsedUrl.protocol) {
            // download image from parsedUrl.href to IMAGE_PATH
            path = resolve(environment.supportPath, "image");
            fileUrl = parsedUrl.href
            const response = await fetch(fileUrl);
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const fileType = await fileTypeFromBuffer(arrayBuffer);
            mime = await fileType.mime;
            fs.writeFileSync(path, buffer);
          } else {
            setMarkdown("Please copy an image or a link to an image.");
            return;
          }
        }
        extraText = `User prompt: \n\n\`\`\`\n${query}\n\`\`\` \n\n ![image](${fileUrl}) \n\n Gemini response: \n\n`;
        console.log(fileUrl);
        setMarkdown(extraText + 'generating answer...');
        console.log(path)
        const imageParts = [
          await pathToGenerativePart(path, mime),
        ];
        result = await model.generateContent([query, ...imageParts]);
      } else {
        const model = genAI.getGenerativeModel({ model: "gemini-pro"});
        result = await model.generateContent(query);
      }
      const response = await result.response;
      const text = response.text();
      setRawAnswer(text);
      fs.writeFileSync(DOWNLOAD_PATH, extraText + text);
      console.log('Response saved to ' + DOWNLOAD_PATH);
      // get full path of the parent directory of current script
      const scriptPath = resolve(__dirname, 'assets', 'mathEquation.js')
      let commandString = `node ${scriptPath} "${DOWNLOAD_PATH}"`;
      let markdown = executeShellCommand(commandString);
      setMarkdown(markdown);
      await showToast({
        style: Toast.Style.Success,
        title: "Response Loaded",
        message: `Load finished in ${(Date.now() - start) / 1000} seconds.`,
      });
    } catch (e) {
      console.error(e);
      setMarkdown(
        "Could not access Gemini. This may be because Gemini has decided that your prompt did not comply with its regulations. Please try another prompt, and if it still does not work, create an issue on GitHub."
      );
      await showToast({
        style: Toast.Style.Failure,
        title: "Response Failed",
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
                      getResponse(`${context ? `${context}\n\n` : ""}${values.query}`, vision);
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
    setDOM(<Detail markdown={markdown}
      actions={
      <ActionPanel>
        <Action.CopyToClipboard content={rawAnswer} shortcut={{ modifiers: ["cmd"], key: "." }} />
      </ActionPanel>
    }></Detail>);
  }, [markdown]);

  return DOM;
};
