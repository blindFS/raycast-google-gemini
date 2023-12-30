// import { useState } from "react";
import { Action, ActionPanel, List, Detail, Form } from "@raycast/api";
import { open, Icon, Alert, confirmAlert } from "@raycast/api";
import { useNavigation, LocalStorage } from "@raycast/api";
import { useEffect, useState } from "react";
import { getExtraContext } from "./api/utils";

export default function History() {
  const [data, setData] = useState();
  const [isLoading, setLoading] = useState(true);
  const { push } = useNavigation();

  useEffect(() => {
    (async () => {
      const storedHistory = await LocalStorage.allItems();
      if (storedHistory) {
        setData(
          Object.entries(storedHistory).map((pair) => {
            var [key, dialogue] = pair;
            return [key, JSON.parse(dialogue)];
          })
        );
      }
      setLoading(false);
    })();
  }, []);

  return (
    <List isLoading={isLoading} isShowingDetail={true}>
      {data &&
        data.map((pair) => {
          var [key, dialogue] = pair;
          const date = new Date(parseInt(key));
          const prop = {
            detail: (
              <List.Item.Detail
                markdown={dialogue.markdown}
                metadata={
                  dialogue.metadata && (
                    <List.Item.Detail.Metadata>
                      <List.Item.Detail.Metadata.TagList title="Extra Context">
                        {dialogue.metadata.map((retrievalObject) => (
                          <List.Item.Detail.Metadata.TagList.Item
                            key={retrievalObject.href}
                            text={retrievalObject.title}
                            onAction={() => open(retrievalObject.href)}
                          />
                        ))}
                      </List.Item.Detail.Metadata.TagList>
                      <List.Item.Detail.Metadata.Separator />
                    </List.Item.Detail.Metadata>
                  )
                }
              />
            ),
          };
          return (
            <List.Item
              key={key}
              title={dialogue.query}
              subtitle={date.toDateString()}
              {...prop}
              actions={
                <ActionPanel>
                  <Action
                    title="View"
                    onAction={() => {
                      push(
                        <Detail
                          markdown={dialogue.markdown}
                          metadata={
                            dialogue.metadata && (
                              <Detail.Metadata>
                                <Detail.Metadata.TagList title="Extra Context">
                                  {dialogue.metadata.map((retrievalObject) => (
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
                          actions={
                            <ActionPanel>
                              <Action
                                title="Reply"
                                onAction={() => {
                                  push(
                                    <Form
                                      actions={
                                        <ActionPanel>
                                          <Action.SubmitForm
                                            onSubmit={(values) => {
                                              console.log(values.replyText);
                                            }}
                                          />
                                        </ActionPanel>
                                      }
                                    >
                                      <Form.TextArea
                                        id="replyText"
                                        title="reply with following text"
                                        placeholder="..."
                                      />
                                    </Form>
                                  );
                                }}
                              />
                              <Action
                                title="View Extra Context"
                                onAction={() => {
                                  push(<Detail markdown={getExtraContext(dialogue.metadata)} />);
                                }}
                              />
                            </ActionPanel>
                          }
                        ></Detail>
                      );
                    }}
                  />
                  <Action.CopyToClipboard content={dialogue.markdown} shortcut={{ modifiers: ["cmd"], key: "c" }} />
                  <Action
                    style={Action.Style.Destructive}
                    icon={Icon.Trash}
                    title="Remove History"
                    onAction={async () => {
                      await confirmAlert({
                        title: "Are you sure you want to remove this answer from your history?",
                        message: "This action cannot be undone",
                        icon: Icon.Trash,
                        primaryAction: {
                          title: "Confirm Remove",
                          style: Alert.ActionStyle.Destructive,
                          onAction: () => LocalStorage.removeItem(key),
                        },
                      });
                    }}
                    shortcut={{ modifiers: ["cmd", "shift"], key: "delete" }}
                  />
                  <Action
                    style={Action.Style.Destructive}
                    icon={Icon.Trash}
                    title="Clear History"
                    onAction={async () => {
                      await confirmAlert({
                        title: "Are you sure you want to remove all the history?",
                        message: "This action cannot be undone",
                        icon: Icon.Trash,
                        primaryAction: {
                          title: "Confirm Clear",
                          style: Alert.ActionStyle.Destructive,
                          onAction: () => LocalStorage.clear(),
                        },
                      });
                    }}
                    shortcut={{ modifiers: ["cmd", "shift"], key: "delete" }}
                  />
                </ActionPanel>
              }
            />
          );
        })}
    </List>
  );
}
