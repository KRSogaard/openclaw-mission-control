"use client";

import { useEffect, useRef, useCallback } from "react";
import { EditorView, lineNumbers, keymap } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { xml } from "@codemirror/lang-xml";
import { yaml } from "@codemirror/lang-yaml";
import { oneDark } from "@codemirror/theme-one-dark";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { useTheme } from "next-themes";
import type { Extension } from "@codemirror/state";

function getLanguageExtension(lang: string | null): Extension | null {
  switch (lang) {
    case "typescript":
    case "tsx":
      return javascript({ typescript: true, jsx: lang === "tsx" });
    case "javascript":
    case "jsx":
      return javascript({ jsx: lang === "jsx" });
    case "html":
      return html();
    case "css":
      return css();
    case "json":
      return json();
    case "markdown":
      return markdown();
    case "python":
      return python();
    case "xml":
    case "toml":
    case "svg":
      return xml();
    case "yaml":
      return yaml();
    default:
      return null;
  }
}

const lightTheme = EditorView.theme({
  "&": { height: "100%", fontSize: "14px" },
  ".cm-scroller": { overflow: "auto", fontFamily: "var(--font-geist-mono), monospace" },
  ".cm-gutters": { borderRight: "1px solid var(--border)", backgroundColor: "color-mix(in srgb, var(--muted) 30%, transparent)" },
  ".cm-lineNumbers .cm-gutterElement": { color: "color-mix(in srgb, var(--muted-foreground) 30%, transparent)", fontSize: "12px", minWidth: "3rem", paddingRight: "0.75rem" },
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--muted) 30%, transparent)" },
  ".cm-activeLineGutter": { backgroundColor: "color-mix(in srgb, var(--muted) 50%, transparent)" },
  ".cm-content": { caretColor: "var(--foreground)" },
  ".cm-cursor": { borderLeftColor: "var(--foreground)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": { backgroundColor: "color-mix(in srgb, var(--ring) 20%, transparent)" },
});

const readOnlyLightTheme = EditorView.theme({
  "&": { height: "100%", fontSize: "14px" },
  ".cm-scroller": { overflow: "auto", fontFamily: "var(--font-geist-mono), monospace" },
  ".cm-gutters": { borderRight: "1px solid var(--border)", backgroundColor: "color-mix(in srgb, var(--muted) 30%, transparent)" },
  ".cm-lineNumbers .cm-gutterElement": { color: "color-mix(in srgb, var(--muted-foreground) 30%, transparent)", fontSize: "12px", minWidth: "3rem", paddingRight: "0.75rem" },
  ".cm-activeLine": { backgroundColor: "transparent" },
  ".cm-content": { caretColor: "transparent" },
  ".cm-cursor": { display: "none" },
  "&.cm-focused": { outline: "none" },
});

export function CodeEditor({
  value,
  language,
  readOnly,
  onChange,
  onSave,
  onCancel,
}: {
  value: string;
  language: string | null;
  readOnly: boolean;
  onChange?: (value: string) => void;
  onSave?: () => void;
  onCancel?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  const createState = useCallback(
    (doc: string) => {
      const extensions: Extension[] = [
        lineNumbers(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        isDark ? oneDark : lightTheme,
        readOnly ? readOnlyLightTheme : lightTheme,
        EditorView.lineWrapping,
      ];

      const langExt = getLanguageExtension(language);
      if (langExt) extensions.push(langExt);

      if (readOnly) {
        extensions.push(EditorState.readOnly.of(true));
        extensions.push(EditorView.editable.of(false));
      } else {
        extensions.push(
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current?.(update.state.doc.toString());
            }
          })
        );
        extensions.push(
          keymap.of([
            {
              key: "Mod-s",
              run: () => {
                onSaveRef.current?.();
                return true;
              },
            },
            {
              key: "Escape",
              run: () => {
                onCancelRef.current?.();
                return true;
              },
            },
          ])
        );
      }

      return EditorState.create({ doc, extensions });
    },
    [language, readOnly, isDark]
  );

  useEffect(() => {
    if (!containerRef.current) return;

    const view = new EditorView({
      state: createState(value),
      parent: containerRef.current,
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [createState]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (currentDoc !== value) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: value },
      });
    }
  }, [value]);

  return <div ref={containerRef} className="h-full" />;
}
