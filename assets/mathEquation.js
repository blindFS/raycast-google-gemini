const fs = require('fs');
var mjAPI = require("/usr/local/lib/node_modules/mathjax-node");
mjAPI.config({
  MathJax: {
    // traditional MathJax configuration
  }
});
mjAPI.start();

function findAllVerbatimPositions(markdown) {
  const regex = /^[\s]*?```([\s\S]+?)```[\s]*?$|`([^`\n]+?)`/gm;
  const verbatims = [];
  const matches = markdown.matchAll(regex);
  for (const match of matches) {
    verbatims.push({
      'start': match.index,
      'end': match.index + match[0].length
    });
  }
  return verbatims;
}

async function replaceEquationsWithImages(markdown) {
  const verbatims = findAllVerbatimPositions(markdown);
  const regex = /\$\$([^$]+?)\$\$|\$([^\n$]+?)\$/g;
  const promises = [];
  const equationMatches = markdown.matchAll(regex);
  const needReplace = [];
  for (const match of equationMatches) {
    const start = match.index;
    const end = start + match[0].length;
    var needReplaceThis = true;
    for (const verbatim of verbatims) {
      if (start >= verbatim.start && end <= verbatim.end ||
        end >= verbatim.start && end <= verbatim.end) {
        needReplaceThis = false;
        break;
      }
    }
    needReplace.push(needReplaceThis);
  }
  async function asyncReplaceFunction(match, group1, group2) {
    const equation = group1 || group2;
    const height = group1 ? 48 : 16
    const imageUrl = generateMathJaxImage(equation, height, needReplace.shift());
    promises.push(imageUrl);
  }

  markdown.replace(regex, asyncReplaceFunction);
  const data = await Promise.all(promises);
  return markdown.replace(regex, () => data.shift());
}

async function generateMathJaxImage(equation, height, needReplaceThis) {
  return new Promise((resolve, reject) => {
    if (!needReplaceThis) {
      resolve(equation);
    }
    mjAPI.typeset({
      math: equation,
      format: "TeX",
      svg: true,
    }, (data) => {
      if (data.svg) {
        resolve(`![equation](data:image/svg+xml;base64,${Buffer.from(data.svg).toString('base64')}?raycast-height=${height})`);
      } else {
        reject("Failed to generate MathJax image");
      }
    });
  });
}

async function main(path) {
  // read from local file
  let inputStream = fs.readFileSync(path, "utf8");
  let res = await replaceEquationsWithImages(inputStream);
  console.log(res);
}

main(process.argv[2])
