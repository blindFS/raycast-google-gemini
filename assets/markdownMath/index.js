const fs = require("fs");
var mjAPI = require("mathjax-node");
const Parser = require('tree-sitter');
const MarkDown = require('@tree-sitter-grammars/tree-sitter-markdown');

mjAPI.config({
  MathJax: {
    // traditional MathJax configuration
  },
});
mjAPI.start();

async function replaceEquationsWithImages(markdown, parser) {
  const tree = parser.parse(markdown);
  const query = new Parser.Query(MarkDown.inline, '(latex_block (latex_span_delimiter) @delimiter) @math');
  const matches = query.matches(tree.rootNode);
  var res = markdown;
  const promises = [];
  const ranges = [];
  matches.reverse().forEach(match => {
    const node = match.captures[0].node
    ranges.push({ start: node.startIndex, end: node.endIndex });
    // delimiter's length == 1, means `$`, inline equation
    const height = match.captures[1].node.text.length == 1 ? 16 : 48;
    promises.push(Promise.resolve(generateMathJaxImage(node.text, height)));
  })
  const results = await Promise.all(promises);
  for (const result of results) {
    const range = ranges.shift();
    res = res.substring(0, range.start) + result + res.substring(range.end);
  }
  return res;
}

async function generateMathJaxImage(equation, height) {
  return new Promise((resolve, reject) => {
    mjAPI.typeset(
      {
        math: equation,
        format: "TeX",
        svg: true,
      },
      (data) => {
        if (data.svg) {
          resolve(
            `![equation](data:image/svg+xml;base64,${Buffer.from(data.svg).toString(
              "base64"
            )}?raycast-height=${height})`
          );
        } else {
          reject("Failed to generate MathJax image");
        }
      }
    );
  });
}

async function main(path) {
  // read from local file
  let inputStream = fs.readFileSync(path, "utf8");

  const parser = new Parser();
  parser.setLanguage(MarkDown.inline);

  let res = await replaceEquationsWithImages(inputStream, parser);
  console.log(res);
}

main(process.argv[2]);
