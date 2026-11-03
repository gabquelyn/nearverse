// A vertical rail of steps: green when done, yellow while working, red if it failed, hollow if not reached.
export type StepState = "todo" | "active" | "done" | "failed";
export interface RailStep { id: string; label: string; state: StepState; detail?: string }

const MARK: Record<StepState, string> = { todo: "", active: "", done: "✓", failed: "✕" };
const SPOKEN: Record<StepState, string> = { todo: "Not started", active: "Working", done: "Done", failed: "Failed" };

export function StepRail({ steps }: { steps: RailStep[] }) {
  return (
    <ol className="rail" aria-live="polite">
      {steps.map((s) => (
        <li key={s.id} className={s.state} aria-current={s.state === "active" ? "step" : undefined}>
          <span className="dot" aria-hidden>{MARK[s.state]}</span>
          <div><b>{s.label}</b><span className="sr">{SPOKEN[s.state]}</span>{s.detail && <small>{s.detail}</small>}</div>
        </li>
      ))}
    </ol>
  );
}
