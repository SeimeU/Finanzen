import { ApiError } from "../../api";

export type Feedback = { kind: "success" | "error"; text: string } | null;

/** Success or error line under a settings form. */
export function FeedbackLine({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  return feedback.kind === "success" ? (
    <p role="status" className="success">
      {feedback.text}
    </p>
  ) : (
    <p role="alert">{feedback.text}</p>
  );
}

export function errorText(e: unknown) {
  return e instanceof ApiError ? e.message : "Unbekannter Fehler.";
}

