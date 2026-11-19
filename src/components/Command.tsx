import { useState } from "react";

/** A shell command with a copy button. */
export function Command({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="command">
      <pre>
        <code>{text}</code>
      </pre>
      <button type="button" className="copy" onClick={copy} aria-label={`Copy ${label ?? "command"}`}>
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
