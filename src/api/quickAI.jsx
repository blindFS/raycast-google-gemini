import { Form, Detail, ActionPanel, Action, useNavigation, open } from "@raycast/api";
import { Toast, showToast, Icon } from "@raycast/api";
import { getSelectedText } from "@raycast/api";
import { useEffect } from "react";
import { retrievalTypes } from "./utils";
import { useChat } from "./hook/useChat";

const getFullQuery = (query, context, examples) => {
  if (typeof context === "function") {
    return context(query, examples);
  }
  return `${context ? `${context}\n\n` : ""}${query}`;
};

export default (props, context, vision = false, retrievalType = retrievalTypes.None, examples = "") => {
  const { query: argQuery } = props.arguments;
  const { push, pop } = useNavigation();
  const { markdown, metadata, rawAnswer, suggestion, extraContext, loading, getResponse } = useChat(props);

  useEffect(() => {
    (async () => {
      var query = "";
      try {
        query = argQuery || (await getSelectedText());
        getResponse(
          getFullQuery(query, context, examples),
          vision,
          retrievalType,
          examples && getFullQuery(query, context, "")
        );
      } catch (e) {
        push(
          <Form
            actions={
              <ActionPanel>
                <Action.SubmitForm
                  onSubmit={async (values) => {
                    pop();
                    getResponse(
                      getFullQuery(values.query, context, examples),
                      vision,
                      retrievalType,
                      examples && getFullQuery(query, context, "")
                    );
                  }}
                />
              </ActionPanel>
            }
          >
            <Form.TextArea id="query" title="Query" defaultValue={query} placeholder="Edit your query" />
          </Form>
        );
      }
    })();
  }, []);

  return (
    <Detail
      markdown={markdown}
      metadata={
        metadata &&
        metadata.length > 0 && (
          <Detail.Metadata>
            <Detail.Metadata.TagList title="Extra Context">
              {metadata.map((retrievalObject) => (
                <Detail.Metadata.TagList.Item
                  key={retrievalObject.href}
                  text={retrievalObject.title}
                  onAction={() => open(retrievalObject.href)}
                />
              ))}
            </Detail.Metadata.TagList>
            <Detail.Metadata.Separator />
          </Detail.Metadata>
        )
      }
      isLoading={loading}
      actions={
        <ActionPanel>
          <Action
            title="Reply"
            icon={Icon.Reply}
            onAction={() => {
              push(
                <Form
                  actions={
                    <ActionPanel>
                      <Action.SubmitForm
                        onSubmit={(values) => {
                          if (values.replyText) {
                            getResponse(values.replyText, vision);
                          } else {
                            showToast({
                              style: Toast.Style.Success,
                              title: "Cancelled reply",
                            });
                          }
                          pop();
                        }}
                      />
                    </ActionPanel>
                  }
                >
                  <Form.TextArea
                    id="replyText"
                    title="reply with following text"
                    placeholder="..."
                    defaultValue={suggestion.current}
                  />
                </Form>
              );
            }}
          />
          <Action
            title="View Extra Context"
            icon={Icon.Document}
            onAction={() => {
              push(<Detail markdown={extraContext.current} />);
            }}
          />
          <Action.CopyToClipboard content={rawAnswer.current} shortcut={{ modifiers: ["cmd"], key: "c" }} />
        </ActionPanel>
      }
    ></Detail>
  );
};
