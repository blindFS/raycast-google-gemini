import { Clipboard } from "@raycast/api";
import { execSync } from "child_process";
import { fileTypeFromBuffer } from "file-type";
import { setTimeout } from "timers";
import { convert } from "html-to-text";
import { assert } from "console";
import { Toast, showToast } from "@raycast/api";
import cheerio from "cheerio";
import url from "url";
import fs from "fs";

export async function parseLink(pathOrURL = "") {
  var fileUrl = "";
  var filePath = "";
  try {
    // from clipboard
    const { text, file } = await Clipboard.read();
    pathOrURL = pathOrURL || file || text;
    if (fs.existsSync(pathOrURL)) {
      assert(fs.lstatSync(pathOrURL).isFile());
      filePath = pathOrURL;
      fileUrl = url.pathToFileURL(filePath).href;
    } else {
      const parsedUrl = new URL(pathOrURL);
      fileUrl = parsedUrl.href;
      if (parsedUrl.protocol == "file:") {
        filePath = url.fileURLToPath(fileUrl);
        assert(fs.existsSync(filePath));
        assert(fs.lstatSync(filePath).isFile());
      } else if (!parsedUrl.protocol || !parsedUrl.host) {
        throw new Error("Invalid URL:" + parsedUrl.href);
      }
    }
  } catch (e) {
    console.error(e);
    throw new Error("The specified link or content in clipboard should be either a local file (path) or a hyper link.");
  }
  return {
    fileUrl,
    filePath,
  };
}

async function retrieveByUrl(urlText = "", title = "") {
  const { fileUrl, filePath } = await parseLink(urlText);
  if (filePath !== "") {
    throw new Error("Local file is currently not supported in this mode.");
  }
  showToast({
    style: Toast.Style.Animated,
    title: "Extracting context from the URL in clipboard",
    message: fileUrl,
  });
  const controller = new AbortController();
  setTimeout(() => {
    controller.abort();
  }, 5000);
  const response = await fetch(fileUrl, { signal: controller.signal });
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
    href: fileUrl,
    title: title,
    content: converted,
  };
}

export const retrievalTypes = {
  None: 0,
  URL: 1,
  Google: 2,
};

export async function getRetrieval(
  searchQuery,
  retrievalType,
  searchApiKey = "",
  searchEngineID = "",
  URL = "",
  topN = 10
) {
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

export function executeShellCommand(command) {
  try {
    const result = execSync(command, { encoding: "utf-8" });
    return result.trim();
  } catch (error) {
    console.error(`Error executing shell command: ${error}`);
    return "";
  }
}

// Converts local file information to a GoogleGenerativeAI.Part object.
export async function pathToGenerativePart(path, mimeType) {
  return {
    inlineData: {
      data: Buffer.from(fs.readFileSync(path)).toString("base64"),
      mimeType,
    },
  };
}

export async function urlToGenerativePart(fileUrl) {
  try {
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
  } catch (e) {
    throw new Error("Image download failed: " + e.message);
  }
}

export function getExtraContext(retrievalObjects) {
  return retrievalObjects.length > 0
    ? "\n\n====================\n\n" +
        retrievalObjects
          .map(
            (retrievalObject) =>
              `**Title**: ${retrievalObject.title}\n\n**Body**: ${retrievalObject.content.slice(0, 20000)}\n\n`
          )
          .join(" ----------------------- \n\n")
    : "";
}
