import MarkDown from '@tree-sitter-grammars/tree-sitter-markdown';
import fs from "fs";
import mjAPI from "mathjax-node";
import Parser from 'tree-sitter';

mjAPI.config({
  MathJax: {
    // traditional MathJax configuration
  },
});
mjAPI.start();

async function replaceEquationsWithImages(markdown, parser) {
  const tree = parser.parse(markdown);
  const query = new Parser.Query(MarkDown.inline, '(latex_block (latex_span_delimiter) @delimiter (latex_span_delimiter)) @math');
  const matches = query.matches(tree.rootNode);
  var res = markdown;
  const promises = [];
  const ranges = [];
  matches.reverse().forEach(match => {
    const node = match.captures[0].node;
    ranges.push({ start: node.startIndex, end: node.endIndex });
    // delimiter's length == 1, means `$`, inline equation
    const del_len = match.captures[1].node.text.length;
    promises.push(Promise.resolve(generateMathJaxImage(node.text.slice(del_len, -del_len), del_len == 1)));
  })
  const results = await Promise.all(promises);
  for (const result of results) {
    const range = ranges.shift();
    res = res.substring(0, range.start) + result + res.substring(range.end);
  }
  return res;
}

async function generateMathJaxImage(equation, inline = false) {
  const height = inline ? 24 : 48;
  const newline_or_empty = inline ? "" : "\n";
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
            `${newline_or_empty}![equation](data:image/svg+xml;base64,${Buffer.from(data.svg).toString(
              "base64"
            )}?raycast-height=${height})${newline_or_empty}`
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
