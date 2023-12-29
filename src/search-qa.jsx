import useQuickAI from "./api/quickAI";

export default function SearchQA(props) {
  return useQuickAI(
    props,
    `Answer question using your knowledge as well as the following extra context from possibly relative webpages: \n\nquestion: `,
    false,
    2
  );
}
