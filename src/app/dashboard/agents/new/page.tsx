"use client";

import { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Pencil, Loader2, ChevronDown } from "lucide-react";
import type {
  ModelInfo,
  AgentSummary,
  AgentCreateRequest,
  AgentGenerateRequest,
  AgentCreateResponse,
  ApiResponse,
} from "@/lib/types";
import { getAgentColor } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const STEPS = ["Identity", "Model", "Relationships", "Review"] as const;

function nameToId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function isValidId(id: string): boolean {
  return /^[a-z][a-z0-9-]*$/.test(id);
}

type AgentType = "full" | "subagent";

type WizardState = {
  agentType: AgentType;
  name: string;
  agentId: string;
  idLocked: boolean;
  purpose: string;
  personality: string;
  selectedModel: string;
  workspace: string;
  parentId: string;
  enableComms: boolean;
  subagents: string[];
  enableHooks: boolean;
  generateWithAi: boolean;
};

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-0">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={label} className="flex items-center">
            {i > 0 && (
              <div
                className={`h-px w-8 sm:w-12 ${
                  done ? "bg-sky-500" : "bg-border"
                }`}
              />
            )}
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`flex size-8 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                  done
                    ? "bg-sky-500 text-white"
                    : active
                      ? "bg-sky-500/15 text-sky-400 ring-1 ring-sky-500/40"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {done ? <Check className="size-3.5" /> : i + 1}
              </div>
              <span
                className={`text-xs ${
                  active ? "text-foreground font-medium" : "text-muted-foreground"
                }`}
              >
                {label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FieldLabel({
  htmlFor,
  required,
  children,
}: {
  htmlFor?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground">
      {children}
      {required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-red-400 mt-1">{message}</p>;
}

function CheckboxItem({
  id,
  label,
  sublabel,
  checked,
  onChange,
  color,
}: {
  id: string;
  label: string;
  sublabel?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  color?: ReturnType<typeof getAgentColor>;
}) {
  return (
    <label
      htmlFor={id}
      className="flex items-center gap-2.5 rounded-md px-2 py-1.5 cursor-pointer hover:bg-muted/50 transition-colors"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded border-border bg-muted text-sky-500 focus:ring-sky-500 focus:ring-offset-0"
      />
      <div className="flex items-center gap-2 min-w-0">
        {color && <span className={`size-2 rounded-full shrink-0 ${color.dot}`} />}
        <span className="text-sm text-foreground">{label}</span>
        {sublabel && (
          <span className="text-xs text-muted-foreground/60 truncate">{sublabel}</span>
        )}
      </div>
    </label>
  );
}

export default function NewAgentPage() {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>}>
      <NewAgentWizard />
    </Suspense>
  );
}

function NewAgentWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const parentFromUrl = searchParams.get("parent");

  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [state, setState] = useState<WizardState>({
    agentType: parentFromUrl ? "subagent" : "full",
    name: "",
    agentId: "",
    idLocked: false,
    purpose: "",
    personality: "",
    selectedModel: "",
    workspace: "",
    parentId: parentFromUrl ?? "",
    enableComms: !parentFromUrl,
    subagents: [],
    enableHooks: !parentFromUrl,
    generateWithAi: true,
  });

  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);

  const update = useCallback(
    <K extends keyof WizardState>(key: K, value: WizardState[K]) =>
      setState((s) => ({ ...s, [key]: value })),
    [],
  );

  useEffect(() => {
    if (!state.idLocked) {
      const derived = nameToId(state.name);
      setState((s) => ({
        ...s,
        agentId: derived,
        workspace: derived ? `~/.openclaw/workspace/${derived}` : "",
      }));
    }
  }, [state.name, state.idLocked]);

  useEffect(() => {
    if (state.idLocked) {
      setState((s) => ({
        ...s,
        workspace: s.agentId ? `~/.openclaw/workspace/${s.agentId}` : "",
      }));
    }
  }, [state.agentId, state.idLocked]);

  useEffect(() => {
    fetch("/api/models")
      .then((res) => res.json())
      .then((json: ApiResponse<ModelInfo[]>) => {
        if (json.data) setModels(json.data);
      })
      .catch(() => {})
      .finally(() => setModelsLoading(false));

    fetch("/api/agents")
      .then((res) => res.json())
      .then((json: ApiResponse<AgentSummary[]>) => {
        if (json.data)
          setAgents(json.data);
      })
      .catch(() => {})
      .finally(() => setAgentsLoading(false));
  }, []);

  const modelsByProvider = useMemo(() => {
    const groups: Record<string, ModelInfo[]> = {};
    for (const m of models) {
      (groups[m.provider] ??= []).push(m);
    }
    return groups;
  }, [models]);

  const validateStep = useCallback(
    (s: number): boolean => {
      const errs: Record<string, string> = {};
      if (s === 0) {
        if (!state.name.trim()) errs.name = "Name is required";
        if (!state.agentId.trim()) errs.agentId = "ID is required";
        else if (!isValidId(state.agentId))
          errs.agentId =
            "Must start with a letter, lowercase alphanumeric and hyphens only";
        if (!state.purpose.trim()) errs.purpose = "Purpose is required";
      }
      if (s === 2 && state.agentType === "subagent" && !state.parentId) {
        errs.parentId = "Sub-agents must have a parent";
      }
      setErrors(errs);
      return Object.keys(errs).length === 0;
    },
    [state.name, state.agentId, state.purpose, state.agentType, state.parentId],
  );

  const handleNext = useCallback(() => {
    if (validateStep(step)) {
      setStep((s) => Math.min(s + 1, 3));
    }
  }, [step, validateStep]);

  const handleBack = useCallback(() => {
    setErrors({});
    setStep((s) => Math.max(s - 1, 0));
  }, []);

  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const url = state.generateWithAi ? "/api/agents/generate" : "/api/agents";
      const base: AgentCreateRequest = {
        name: state.name.trim(),
        id: state.agentId,
        model: state.selectedModel || undefined,
        parentId: state.parentId || null,
        description: state.purpose.trim(),
        workspace: state.workspace || undefined,
      };

      const isSubagent = state.agentType === "subagent";
      const peers = isSubagent ? undefined : state.enableComms ? ["*"] : undefined;
      const subagents = state.subagents.length > 0 ? state.subagents : undefined;

      const body: AgentCreateRequest | AgentGenerateRequest = state.generateWithAi
        ? {
            ...base,
            purpose: state.purpose.trim(),
            personality: state.personality.trim() || null,
            peers,
            subagents,
            enableHooks: state.enableHooks,
            addToParentSpawnList: isSubagent,
          }
        : {
            ...base,
            peers,
            subagents,
            enableHooks: state.enableHooks,
            addToParentSpawnList: isSubagent,
          };

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = (await res.json()) as ApiResponse<AgentCreateResponse>;

      if (json.error) {
        setSubmitError(json.error.message);
        return;
      }

      if (json.data) {
        router.push(`/dashboard/${json.data.agentId}`);
      }
    } catch {
      setSubmitError("Failed to create agent. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }, [state, router]);

  const handleToggleSubagent = useCallback(
    (id: string, checked: boolean) => {
      setState((s) => ({
        ...s,
        subagents: checked
          ? [...s.subagents, id]
          : s.subagents.filter((p) => p !== id),
      }));
    },
    [],
  );

  const selectedModelInfo = useMemo(
    () => models.find((m) => `${m.provider}/${m.id}` === state.selectedModel),
    [models, state.selectedModel],
  );

  const parentAgent = useMemo(
    () => agents.find((a) => a.id === state.parentId),
    [agents, state.parentId],
  );

  const subagentCandidates = useMemo(
    () => agents.filter((a) => a.id !== state.parentId),
    [agents, state.parentId],
  );

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-[640px] px-6 py-8 space-y-8">
        <div>
          <h1 className="text-lg font-semibold text-foreground tracking-tight">
            Commission New Agent
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Set up a new crew member
          </p>
        </div>

        <StepIndicator current={step} />

        {step === 0 && (
          <Card className="bg-card border-border">
            <CardContent className="space-y-5 pt-1">
              <div className="space-y-1.5">
                <FieldLabel>Agent Type</FieldLabel>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setState((s) => ({ ...s, agentType: "full", enableComms: true, enableHooks: true }))}
                    className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                      state.agentType === "full"
                        ? "border-sky-500 bg-sky-500/10 ring-1 ring-sky-500/30"
                        : "border-border bg-card hover:bg-muted/50"
                    }`}
                  >
                    <span className="text-sm font-medium text-foreground">Full Agent</span>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Independent agent with its own communication
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setState((s) => ({ ...s, agentType: "subagent", enableComms: false, enableHooks: false }))}
                    className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                      state.agentType === "subagent"
                        ? "border-sky-500 bg-sky-500/10 ring-1 ring-sky-500/30"
                        : "border-border bg-card hover:bg-muted/50"
                    }`}
                  >
                    <span className="text-sm font-medium text-foreground">Spawnable Sub-agent</span>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Task worker spawned by a parent agent
                    </p>
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <FieldLabel htmlFor="agent-name" required>
                  Agent Name
                </FieldLabel>
                <Input
                  id="agent-name"
                  value={state.name}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder="e.g. Research Analyst"
                  autoFocus
                />
                <FieldError message={errors.name} />
              </div>

              <div className="space-y-1.5">
                <FieldLabel htmlFor="agent-id">Agent ID</FieldLabel>
                <div className="flex items-center gap-2">
                  <Input
                    id="agent-id"
                    value={state.agentId}
                    onChange={(e) => {
                      update("agentId", e.target.value);
                      if (!state.idLocked) update("idLocked", true);
                    }}
                    readOnly={!state.idLocked}
                    className={`font-mono text-sm ${!state.idLocked ? "text-muted-foreground" : ""}`}
                    placeholder="auto-generated"
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => update("idLocked", !state.idLocked)}
                    title={state.idLocked ? "Auto-generate from name" : "Edit manually"}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                </div>
                {!state.idLocked && state.agentId && (
                  <p className="text-xs text-muted-foreground/60">
                    Auto-generated from name
                  </p>
                )}
                <FieldError message={errors.agentId} />
              </div>

              <div className="space-y-1.5">
                <FieldLabel htmlFor="agent-purpose" required>
                  Purpose
                </FieldLabel>
                <p className="text-xs text-muted-foreground -mt-0.5">
                  What should this agent do?
                </p>
                <textarea
                  id="agent-purpose"
                  value={state.purpose}
                  onChange={(e) => update("purpose", e.target.value)}
                  rows={3}
                  className="w-full rounded-lg bg-transparent px-2.5 py-2 text-sm text-foreground border border-input focus:outline-none focus:border-ring focus:ring-3 focus:ring-ring/50 placeholder:text-muted-foreground dark:bg-input/30"
                  placeholder="Describe this agent's primary responsibilities..."
                />
                <FieldError message={errors.purpose} />
              </div>

              <div className="space-y-1.5">
                <FieldLabel htmlFor="agent-personality">Personality</FieldLabel>
                <p className="text-xs text-muted-foreground -mt-0.5">
                  Personality or working style? (optional)
                </p>
                <textarea
                  id="agent-personality"
                  value={state.personality}
                  onChange={(e) => update("personality", e.target.value)}
                  rows={2}
                  className="w-full rounded-lg bg-transparent px-2.5 py-2 text-sm text-foreground border border-input focus:outline-none focus:border-ring focus:ring-3 focus:ring-ring/50 placeholder:text-muted-foreground dark:bg-input/30"
                  placeholder="e.g. Methodical and thorough, prefers structured output..."
                />
              </div>
            </CardContent>
          </Card>
        )}

        {step === 1 && (
          <Card className="bg-card border-border">
            <CardContent className="space-y-5 pt-1">
              <div className="space-y-1.5">
                <FieldLabel htmlFor="model-select">Model</FieldLabel>
                {modelsLoading ? (
                  <Skeleton className="h-8 w-full bg-muted rounded-lg" />
                ) : (
                  <select
                    id="model-select"
                    value={state.selectedModel}
                    onChange={(e) => update("selectedModel", e.target.value)}
                    className="w-full rounded-lg bg-transparent border border-input px-2.5 py-1.5 text-sm text-foreground font-mono focus:outline-none focus:border-ring focus:ring-3 focus:ring-ring/50 dark:bg-input/30"
                  >
                    <option value="">Default model</option>
                    {Object.entries(modelsByProvider).map(([provider, providerModels]) => (
                      <optgroup key={provider} label={provider}>
                        {providerModels.map((m) => (
                          <option key={`${m.provider}/${m.id}`} value={`${m.provider}/${m.id}`}>
                            {m.name || m.id}
                            {m.contextWindow
                              ? ` (${Math.round(m.contextWindow / 1000)}k)`
                              : ""}
                            {m.reasoning ? " [reasoning]" : ""}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                )}
                <p className="text-xs text-muted-foreground/60">
                  Leave blank to use the default model
                </p>
              </div>

              {selectedModelInfo && (
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="font-mono text-xs">
                    {selectedModelInfo.provider}
                  </Badge>
                  {selectedModelInfo.contextWindow && (
                    <Badge variant="secondary" className="text-xs">
                      {Math.round(selectedModelInfo.contextWindow / 1000)}k context
                    </Badge>
                  )}
                  {selectedModelInfo.reasoning && (
                    <Badge variant="secondary" className="text-xs text-amber-400">
                      reasoning
                    </Badge>
                  )}
                </div>
              )}

              <div>
                <button
                  type="button"
                  onClick={() => setAdvancedOpen((o) => !o)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ChevronDown
                    className={`size-3.5 transition-transform ${advancedOpen ? "rotate-180" : ""}`}
                  />
                  Advanced
                </button>
                {advancedOpen && (
                  <div className="mt-3 space-y-1.5">
                    <FieldLabel htmlFor="workspace-path">Workspace Path</FieldLabel>
                    <Input
                      id="workspace-path"
                      value={state.workspace}
                      onChange={(e) => update("workspace", e.target.value)}
                      className="font-mono text-sm"
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card className="bg-card border-border">
            <CardContent className="space-y-6 pt-1">
              {agentsLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-8 w-full bg-muted rounded-lg" />
                  <Skeleton className="h-24 w-full bg-muted rounded-lg" />
                  <Skeleton className="h-24 w-full bg-muted rounded-lg" />
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <FieldLabel htmlFor="parent-select">
                      Parent Agent{state.agentType === "subagent" && <span className="text-red-400 ml-0.5">*</span>}
                    </FieldLabel>
                    <select
                      id="parent-select"
                      value={state.parentId}
                      onChange={(e) => update("parentId", e.target.value)}
                      className="w-full rounded-lg bg-transparent border border-input px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-3 focus:ring-ring/50 dark:bg-input/30"
                    >
                      {state.agentType === "full" && (
                        <option value="">No parent (top-level)</option>
                      )}
                      {state.agentType === "subagent" && !state.parentId && (
                        <option value="">Select a parent agent...</option>
                      )}
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.id})
                        </option>
                      ))}
                    </select>
                    <FieldError message={errors.parentId} />
                    {state.agentType === "subagent" && state.parentId && (
                      <p className="text-xs text-emerald-400">
                        {parentAgent?.name ?? state.parentId} will be able to spawn this agent
                      </p>
                    )}
                  </div>

                  {state.agentType === "full" && (
                    <>
                      <div className="pt-1">
                        <label className="flex items-center gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={state.enableComms}
                            onChange={(e) => update("enableComms", e.target.checked)}
                            className="rounded border-border bg-muted text-sky-500 focus:ring-sky-500 focus:ring-offset-0"
                          />
                          <div>
                            <span className="text-sm font-medium text-foreground">
                              Enable agent-to-agent messaging
                            </span>
                            <p className="text-xs text-muted-foreground">
                              Join the communication pool — can exchange messages with all other enabled agents
                            </p>
                          </div>
                        </label>
                      </div>

                      {agents.length > 0 && (
                        <div className="space-y-1.5">
                          <FieldLabel>Spawn Agents</FieldLabel>
                          <p className="text-xs text-muted-foreground -mt-0.5">
                            Agents this one can spawn for task delegation — one-shot sessions
                          </p>
                          <div className="rounded-lg border border-border max-h-40 overflow-y-auto">
                            {subagentCandidates.length > 0 ? (
                              subagentCandidates.map((a) => (
                                <CheckboxItem
                                  key={`sub-${a.id}`}
                                  id={`sub-${a.id}`}
                                  label={a.name}
                                  sublabel={a.id}
                                  checked={state.subagents.includes(a.id)}
                                  onChange={(checked) =>
                                    handleToggleSubagent(a.id, checked)
                                  }
                                  color={getAgentColor(a.id)}
                                />
                              ))
                            ) : (
                              <p className="px-3 py-2 text-xs text-muted-foreground/60 italic">
                                No other agents available
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                      <div className="pt-1">
                        <label className="flex items-center gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={state.enableHooks}
                            onChange={(e) => update("enableHooks", e.target.checked)}
                            className="rounded border-border bg-muted text-sky-500 focus:ring-sky-500 focus:ring-offset-0"
                          />
                          <div>
                            <span className="text-sm font-medium text-foreground">
                              Enable Bridge Command task hooks
                            </span>
                            <p className="text-xs text-muted-foreground">
                              Allows this agent to report task status back to the dashboard
                            </p>
                          </div>
                        </label>
                      </div>
                    </>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <Card className="bg-card border-border">
              <CardContent className="pt-1">
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Type</span>
                    <Badge variant="outline" className="text-xs">
                      {state.agentType === "subagent" ? "Spawnable Sub-agent" : "Full Agent"}
                    </Badge>
                  </div>
                  <div className="h-px bg-border" />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Name</span>
                    <span className="text-foreground font-medium">{state.name}</span>
                  </div>
                  <div className="h-px bg-border" />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ID</span>
                    <span className="text-foreground font-mono">{state.agentId}</span>
                  </div>
                  <div className="h-px bg-border" />
                  <div className="flex justify-between items-start gap-4">
                    <span className="text-muted-foreground shrink-0">Purpose</span>
                    <span className="text-foreground text-right">{state.purpose}</span>
                  </div>
                  {state.personality && (
                    <>
                      <div className="h-px bg-border" />
                      <div className="flex justify-between items-start gap-4">
                        <span className="text-muted-foreground shrink-0">Personality</span>
                        <span className="text-foreground text-right">
                          {state.personality}
                        </span>
                      </div>
                    </>
                  )}
                  <div className="h-px bg-border" />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Model</span>
                    <span className="text-foreground font-mono">
                      {state.selectedModel || "default"}
                    </span>
                  </div>
                  <div className="h-px bg-border" />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {state.agentType === "subagent" ? "Spawned by" : "Parent"}
                    </span>
                    <span className="text-foreground">
                      {parentAgent ? parentAgent.name : "None (top-level)"}
                    </span>
                  </div>
                  {state.agentType === "full" && (
                    <>
                      <div className="h-px bg-border" />
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Communication</span>
                        <Badge
                          variant={state.enableComms ? "default" : "outline"}
                          className="text-xs"
                        >
                          {state.enableComms ? "enabled" : "disabled"}
                        </Badge>
                      </div>
                      {state.subagents.length > 0 && (
                        <>
                          <div className="h-px bg-border" />
                          <div className="flex justify-between items-start gap-4">
                            <span className="text-muted-foreground shrink-0">Spawn Agents</span>
                            <div className="flex flex-wrap gap-1 justify-end">
                              {state.subagents.map((id) => {
                                const a = agents.find((x) => x.id === id);
                                return (
                                  <Badge key={id} variant="secondary" className="text-xs">
                                    {a?.name ?? id}
                                  </Badge>
                                );
                              })}
                            </div>
                          </div>
                        </>
                      )}
                    </>
                  )}
                  <div className="h-px bg-border" />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Task hooks</span>
                    <Badge
                      variant={state.enableHooks ? "default" : "outline"}
                      className="text-xs"
                    >
                      {state.enableHooks ? "enabled" : "disabled"}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardContent className="pt-1 space-y-3">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={state.generateWithAi}
                    onChange={(e) => update("generateWithAi", e.target.checked)}
                    className="rounded border-border bg-muted text-sky-500 focus:ring-sky-500 focus:ring-offset-0"
                  />
                  <span className="text-sm font-medium text-foreground">
                    Generate files with AI
                  </span>
                </label>
                <p className="text-xs text-muted-foreground pl-6">
                  {state.generateWithAi
                    ? "Bridge Command will generate tailored SOUL.md, IDENTITY.md, and other bootstrap files based on your description."
                    : "Agent will be created with empty bootstrap files."}
                </p>
              </CardContent>
            </Card>

            {submitError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3">
                <p className="text-sm text-red-400">{submitError}</p>
              </div>
            )}

            <Button
              size="lg"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="w-full bg-sky-600 hover:bg-sky-700 text-white"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Commissioning...
                </>
              ) : (
                "Commission Agent"
              )}
            </Button>
          </div>
        )}

        {step < 3 && (
          <div className="flex justify-between">
            <Button
              variant="ghost"
              onClick={handleBack}
              disabled={step === 0}
              className="text-muted-foreground"
            >
              <ChevronLeft className="size-4" />
              Back
            </Button>
            <Button onClick={handleNext} className="bg-sky-600 hover:bg-sky-700 text-white">
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
