import { FallbackProps } from "react-error-boundary";
import styles from "./styles/WidgetError.module.css";
import { Button } from "../primitives/Button";
import { WidgetDefinition } from "../registry/defRegistry";
import { useState } from "react";
import { Modal } from "../primitives/Modal";

function trimErrorMessage(message: string) {
  while (message.startsWith("Error:")) {
    message = message.slice("Error:".length).trimStart();
  }
  return message;
}

function makeMarkdownText(
  instanceId: string | undefined,
  widgetDef: WidgetDefinition | undefined,
  error: unknown,
) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const widgetTypeId = widgetDef?.id ?? "Unknown";
  const widgetName = widgetDef?.name ?? "Unknown";
  const instanceIdText = instanceId ?? "Unknown";
  return `# Widget Error Report
An unhandled error occurred in a widget. Please report this to the developer.

## Error Message

\`\`\`
${errorMessage}
\`\`\`

## Widget Information
| Widget Type ID | Widget Name | Instance ID |
|----------------|-------------|-------------|
| ${widgetTypeId} | ${widgetName} | ${instanceIdText} |

## Error Detail
\`\`\`
${error instanceof Error ? (error.stack ?? error.message) : String(error)}
\`\`\`
`;
}

export default function WidgetError({
  error,
  resetErrorBoundary,
  instanceId,
  widgetDef,
}: FallbackProps & {
  instanceId: string | undefined;
  widgetDef: WidgetDefinition | undefined;
}) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className={styles.error}>
      <p className={styles.errorMessage}>
        An unhandled error occurred in this widget. Please report this to the
        developer.
        <br />
        <code>
          {`Error: ${error instanceof Error ? trimErrorMessage(error.message) : String(error)}`}
        </code>
      </p>
      <div className={styles.errorButtons}>
        <Button onClick={() => setShowDetails(!showDetails)}>
          Show Details
        </Button>
        <Button onClick={resetErrorBoundary}>Reset Widget</Button>
      </div>
      {showDetails && (
        <Modal
          title="Widget Error Details"
          onClose={() => setShowDetails(false)}
          actions={
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  const markdownText = makeMarkdownText(
                    instanceId,
                    widgetDef,
                    error,
                  );
                  navigator.clipboard.writeText(markdownText).then(() => {
                    alert("Error report copied to clipboard.");
                  });
                }}
              >
                Copy Error Report
              </Button>
              <Button
                variant="ghost_danger"
                onClick={() => setShowDetails(false)}
              >
                Close
              </Button>
            </>
          }
        >
          <ErrorDetails
            instanceId={instanceId}
            widgetDef={widgetDef}
            error={error}
          />
        </Modal>
      )}
    </div>
  );
}

function ErrorDetails({
  instanceId,
  widgetDef,
  error,
}: {
  instanceId: string | undefined;
  widgetDef: WidgetDefinition | undefined;
  error: unknown;
}) {
  return (
    <div className={styles.errorDetails}>
      <h3>Error Message:</h3>
      <code>{error instanceof Error ? error.message : String(error)}</code>
      <h3>Widget Information:</h3>
      <table className={styles.errorDetailsTable}>
        <thead>
          <tr>
            <th>Widget Type ID</th>
            <th>Widget Name</th>
            <th>Instance ID</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{widgetDef?.id ?? "Unknown"}</td>
            <td>{widgetDef?.name ?? "Unknown"}</td>
            <td>{instanceId ?? "Unknown"}</td>
          </tr>
        </tbody>
      </table>
      <h3>Error Detail:</h3>
      <code className={styles.stackTrace}>
        {error instanceof Error ? (
          <StackTrace stack={error.stack ?? error.message} />
        ) : (
          String(error)
        )}
      </code>
    </div>
  );
}

function StackTrace({ stack }: { stack: string }) {
  return (
    <pre className={styles.stackTrace}>
      {stack
        .split("\n")
        .map((line) => (
          <div key={line} className={styles.stackTraceLine}>
            {line}
          </div>
        ))
        .slice(0, 5)}
    </pre>
  );
}
