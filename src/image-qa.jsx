import useQuickAI from "./api/quickAI";

export default function FindSynonym(props) {
  return useQuickAI(
    props,
    "Answer the question according to the given image",
    [],
    true
  );
}
