import useQuickAI from "./api/quickAI";

export default function DocQA(props) {
  return useQuickAI(
    props,
    `Answer question using your knowledge as well as the extra information provided below the separator "====================". The extra information can be noisy sometimes, feel free to ignore the non-informative parts: \n\nHere's the question: `,
    false,
    1,
  );
}
