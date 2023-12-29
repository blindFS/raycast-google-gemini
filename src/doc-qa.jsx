import useQuickAI from "./api/quickAI";

export default function DocQA(props) {
  return useQuickAI(
    props,
    `Answer questions using your knowledge as well as the following extra context: \n\nquestion: `,
    false,
    1
  );
}
