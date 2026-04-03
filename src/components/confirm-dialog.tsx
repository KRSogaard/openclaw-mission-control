"use client";

import { useState, useCallback } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";

type ConfirmState = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
};

type PromptState = {
  open: boolean;
  title: string;
  description: string;
  placeholder?: string;
  confirmLabel?: string;
  allowEmpty?: boolean;
  onConfirm: (value: string) => void;
};

export function useConfirmDialog() {
  const [state, setState] = useState<ConfirmState>({
    open: false,
    title: "",
    description: "",
    onConfirm: () => {},
  });

  const confirm = useCallback(
    (opts: Omit<ConfirmState, "open">) =>
      new Promise<boolean>((resolve) => {
        setState({
          ...opts,
          open: true,
          onConfirm: () => {
            opts.onConfirm?.();
            resolve(true);
          },
        });
      }),
    [],
  );

  const dialog = (
    <AlertDialog open={state.open} onOpenChange={(open) => { if (!open) setState((s) => ({ ...s, open: false })); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{state.title}</AlertDialogTitle>
          <AlertDialogDescription>{state.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => { state.onConfirm(); setState((s) => ({ ...s, open: false })); }}
            className={state.destructive ? "bg-red-600 hover:bg-red-700 text-white" : ""}
          >
            {state.confirmLabel ?? "Confirm"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirm, ConfirmDialog: dialog };
}

export function usePromptDialog() {
  const [state, setState] = useState<PromptState & { value: string }>({
    open: false,
    title: "",
    description: "",
    value: "",
    onConfirm: () => {},
  });

  const prompt = useCallback(
    (opts: Omit<PromptState, "open">) =>
      new Promise<string | null>((resolve) => {
        setState({
          ...opts,
          open: true,
          value: "",
          onConfirm: (val: string) => {
            resolve(val);
          },
        });
      }),
    [],
  );

  const dialog = (
    <AlertDialog open={state.open} onOpenChange={(open) => { if (!open) { setState((s) => ({ ...s, open: false })); } }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{state.title}</AlertDialogTitle>
          <AlertDialogDescription>{state.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <Input
          value={state.value}
          onChange={(e) => setState((s) => ({ ...s, value: e.target.value }))}
          placeholder={state.placeholder}
          className="mt-2"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && (state.allowEmpty || state.value.trim())) {
              state.onConfirm(state.value);
              setState((s) => ({ ...s, open: false }));
            }
          }}
        />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => { state.onConfirm(state.value); setState((s) => ({ ...s, open: false })); }}
            disabled={!state.allowEmpty && !state.value.trim()}
          >
            {state.confirmLabel ?? "Submit"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { prompt, PromptDialog: dialog };
}

type SelectOption = {
  value: string;
  label: string;
};

type SelectState = {
  open: boolean;
  title: string;
  description: string;
  options: SelectOption[];
  confirmLabel?: string;
  onConfirm: (value: string) => void;
};

export function useSelectDialog() {
  const [state, setState] = useState<SelectState & { value: string }>({
    open: false,
    title: "",
    description: "",
    options: [],
    value: "",
    onConfirm: () => {},
  });

  const select = useCallback(
    (opts: Omit<SelectState, "open">) => {
      setState({
        ...opts,
        open: true,
        value: opts.options[0]?.value ?? "",
        onConfirm: opts.onConfirm,
      });
    },
    [],
  );

  const dialog = (
    <AlertDialog open={state.open} onOpenChange={(open) => { if (!open) setState((s) => ({ ...s, open: false })); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{state.title}</AlertDialogTitle>
          <AlertDialogDescription>{state.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <select
          value={state.value}
          onChange={(e) => setState((s) => ({ ...s, value: e.target.value }))}
          className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          {state.options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => { state.onConfirm(state.value); setState((s) => ({ ...s, open: false })); }}
            disabled={!state.value}
          >
            {state.confirmLabel ?? "Select"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { select, SelectDialog: dialog };
}
