# Google Gemini

Use the Google Gemini Pro API in Raycast.

https://ai.google.dev

To test

``` sh
npm install && npm run dev
```

@google/generative-ai
index.mjs

``` javascript
function processStream(response) {
    // const inputStream = response.body.pipeThrough(new TextDecoderStream("utf8", { fatal: true }));
        const inputStream = ReadableStream.from(response.body);
```
