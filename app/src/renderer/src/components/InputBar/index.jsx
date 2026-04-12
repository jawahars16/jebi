import React, {
  useState,
  useRef,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import PromptLine from "../PromptLine";
import Prompt from "../Prompt";
import { Keys } from "../../constants/keys";

const InputBar = forwardRef(function InputBar(
  { onSubmit, onNavigateHistory, cwd, exitCode },
  ref,
) {
  const [value, setValue] = useState("");
  const textareaRef = useRef(null);

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
  }));

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  function handleKeyDown(e) {
    if (e.key === Keys.ENTER && !e.shiftKey) {
      e.preventDefault();
      if (!value.trim()) return;
      onSubmit(value);
      setValue("");
      return;
    }

    if (e.key === Keys.ARROW_UP || e.key === Keys.ARROW_DOWN) {
      const el = textareaRef.current;
      if (!el || !onNavigateHistory) return;

      const cursor = el.selectionStart;
      const onFirstLine = value.lastIndexOf("\n", cursor - 1) === -1;
      const onLastLine = value.indexOf("\n", cursor) === -1;

      if (
        (e.key === Keys.ARROW_UP && onFirstLine) ||
        (e.key === Keys.ARROW_DOWN && onLastLine)
      ) {
        e.preventDefault();
        const next = onNavigateHistory(
          e.key === Keys.ARROW_UP ? "up" : "down",
          value,
        );
        if (next !== null) setValue(next);
      }
    }
  }

  return (
    <div className="shrink-0 flex flex-col bg-[var(--bg-surface)]">
      <div>
        <Prompt cwd={cwd} exitCode={exitCode} />
      </div>
      <textarea
        ref={textareaRef}
        className="w-full bg-transparent resize-none border-none 
        outline-none font-[var(--font-mono)] 
        leading-relaxed placeholder:text-[var(--text-muted)]"
        style={{
          color: "var(--text-primary)",
          caretColor: "var(--accent)",
          padding: "3px 10px",
          minHeight: "calc(1em * 1.625)",
          overflow: "hidden",
          display: "block",
        }}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type a command..."
        autoFocus
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
      />
    </div>
  );
});

export default InputBar;
