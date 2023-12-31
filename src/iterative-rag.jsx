import useQuickAI from "./api/quickAI";

export default function IterativeRAG(props) {
  return useQuickAI(
    props,
    `You and I are going to find a solution for my following question in multiple rounds of conversations.
Each time you can choose one of the following three operations:
1. Ask for Google search result of something, and I'll provide a snippet of top10 documents of it. To do so, simply reply "Search for " + your new query.
2. Ask for the full content of one of the documents of last search snippet, and I'll provide the full text of it. To do so, simply reply "Full content of document " + document number (1-10) and nothing else, such as "Full content of document 3".
3. Answer the question using your own knowledge as well as the additional information provided by me in previous rounds.

Answer the question until you are pretty sure about it, otherwise choose operation 1 or 2.
Here's my question: `,
    false,
    0
  );
}
