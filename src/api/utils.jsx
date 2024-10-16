import { Clipboard } from "@raycast/api";
import { execSync } from "child_process";
import { fileTypeFromBuffer, fileTypeFromFile } from "file-type";
import { setTimeout } from "timers";
import { assert } from "console";
import { Toast, showToast } from "@raycast/api";
import * as cheerio from "cheerio";
import isBinaryPath from "is-binary-path";
import url from "url";
import fs from "fs";
import path from "path";

async function requestWithToast(closure, message, loading_banner, success_banner) {
  showToast({
    style: Toast.Style.Animated,
    title: loading_banner,
    message: message,
  });
  const result = await closure();
  showToast({
    style: Toast.Style.Success,
    title: success_banner,
  });
  return result;
}

export async function pathOrURLToImage(pathOrURL = "") {
  const { fileUrl, filePath } = await parseLink(pathOrURL);
  var res = null;
  if (filePath) {
    res = await pathToGenerativePart(filePath, "image/png");
  } else {
    res = await urlToGenerativePart(fileUrl);
  }
  return {
    fileUrl,
    res,
  };
}

async function parseLink(pathOrURL = "") {
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

async function retrieveByUrl(fileManager, urlText = "") {
  const { fileUrl, filePath } = await parseLink(urlText);
  if (filePath !== "") {
    const isText = !isBinaryPath(filePath);
    if (isText) {
      return {
        href: filePath,
        title: path.basename(filePath),
        content: await pathToGenerativePart(filePath, "text/plain"),
      };
    }
    const fType = await fileTypeFromFile(filePath);
    const mime = fType.mime || "unknown";
    if (mime == "application/pdf") {
      const uploadResponse = await requestWithToast(
        async () => {
          return await fileManager.uploadFile(filePath, {
            mimeType: mime,
            displayName: path.basename(filePath),
          });
        },
        filePath,
        "Uploading PDF file ...",
        "PDF file upload successful",
      );
      return {
        href: filePath,
        title: path.basename(filePath),
        content: {
          fileData: {
            mimeType: uploadResponse.file.mimeType,
            fileUri: uploadResponse.file.uri,
          },
        },
      };
    } else {
      throw new Error(`FileType ${mime} is currently not supported in this mode.`);
    }
  }
  const rawHTML = await requestWithToast(
    async () => {
      const controller = new AbortController();
      setTimeout(() => {
        controller.abort();
      }, 5000);
      const response = await fetch(fileUrl, { signal: controller.signal });
      return await response.text();
    },
    fileUrl,
    "Extracting context from the URL in clipboard",
    "Content extraction successful",
  );

  const $ = cheerio.load(rawHTML);
  return {
    href: fileUrl,
    title: $("title").text(),
    content: bufferToGenerativePart(rawHTML, "text/html"),
  };
}

export const retrievalTypes = {
  None: 0,
  URL: 1,
  Google: 2,
};

export async function getRetrieval(
  fileManager,
  searchQuery,
  retrievalType,
  searchApiKey = "",
  searchEngineID = "",
  URL = "",
  topN = 10,
) {
  var retrievalObjects = [];
  if (retrievalType == retrievalTypes.URL) {
    const retrievalObject = await retrieveByUrl(fileManager, URL);
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
    const json = await requestWithToast(
      async () => {
        const response = await fetch(googleSearchUrl + new URLSearchParams(params), { signal: controller.signal });
        return await response.json();
      },
      "query: " + searchQuery,
      "Google Searching",
      "Got google top results",
    );
    for (const item of json.items.slice(0, topN)) {
      retrievalObjects.push({
        href: item.link,
        title: item.title,
        content: bufferToGenerativePart(item.snippet, "text/plain"),
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

function bufferToGenerativePart(buffer, mimeType) {
  return {
    inlineData: {
      data: Buffer.from(buffer).toString("base64"),
      mimeType,
    },
  };
}

// Converts local file information to a GoogleGenerativeAI.Part object.
async function pathToGenerativePart(path, mimeType) {
  return bufferToGenerativePart(await fs.promises.readFile(path), mimeType);
}

async function urlToGenerativePart(fileUrl) {
  try {
    const response = await fetch(fileUrl);
    const arrayBuffer = await response.arrayBuffer();
    const fileType = await fileTypeFromBuffer(arrayBuffer);
    const mimeType = fileType.mime;
    return bufferToGenerativePart(arrayBuffer, mimeType);
  } catch (e) {
    throw new Error("Image download failed: " + e.message);
  }
}
