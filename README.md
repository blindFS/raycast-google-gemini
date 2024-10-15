# Google Gemini

Use the Google Gemini Pro API in Raycast.

https://ai.google.dev

To test

``` sh
npm install && npm run dev
```

* [x] Advanced - Developer tools - Use Node production environment
* @google/generative-ai/src/index.mjs

``` javascript
import fetch, { Headers } from 'node-fetch';

...

function processStream(response) {
    // const inputStream = response.body.pipeThrough(new TextDecoderStream("utf8", { fatal: true }));
        const inputStream = ReadableStream.from(response.body);
```
