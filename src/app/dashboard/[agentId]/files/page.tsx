"use client";

import { useEffect, useState, useCallback, useRef, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Highlighter } from "shiki";
import type {
  AgentView,
  ApiResponse,
  FileEntry,
  FileContent,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

let highlighterPromise: Promise<Highlighter> | null = null;
function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = import("shiki").then((shiki) =>
      shiki.createHighlighter({
        themes: ["github-dark", "github-light"],
        langs: [
          "typescript", "tsx", "javascript", "jsx", "json", "markdown",
          "yaml", "css", "html", "bash", "python", "rust", "go", "sql",
          "toml", "xml",
        ],
      })
    );
  }
  return highlighterPromise;
}
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

function buildBreadcrumbs(currentPath: string, rootLabel: string) {
  if (currentPath === ".") return [{ label: rootLabel, path: "." }];
  const parts = currentPath.split("/");
  const crumbs = [{ label: rootLabel, path: "." }];
  for (let i = 0; i < parts.length; i++) {
    crumbs.push({
      label: parts[i],
      path: parts.slice(0, i + 1).join("/"),
    });
  }
  return crumbs;
}

function FileIcon({ type }: { type: "file" | "directory" }) {
  if (type === "directory") {
    return (
      <svg
        className="size-4 shrink-0 text-muted-foreground"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z"
        />
      </svg>
    );
  }
  return (
    <svg
      className="size-4 shrink-0 text-muted-foreground"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
      />
    </svg>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AgentWorkspacePage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialPath = searchParams.get("path") || ".";
  const initialFile = searchParams.get("open") || null;

  const [agent, setAgent] = useState<AgentView | null>(null);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [selectedFile, setSelectedFile] = useState<FileContent | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [loadingContent, setLoadingContent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const newFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!selectedFile?.content || !selectedFile.language) {
      setHighlightedHtml(null);
      return;
    }
    let cancelled = false;
    getHighlighter().then((h) => {
      if (cancelled) return;
      try {
        const html = h.codeToHtml(selectedFile.content, {
          lang: selectedFile.language ?? "text",
          themes: { dark: "github-dark", light: "github-light" },
        });
        setHighlightedHtml(html);
      } catch {
        setHighlightedHtml(null);
      }
    });
    return () => { cancelled = true; };
  }, [selectedFile?.content, selectedFile?.language]);

  const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico", ".bmp"]);
  function isImageFile(filePath: string): boolean {
    const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
    return IMAGE_EXTS.has(ext);
  }

  useEffect(() => {
    if (!isEditing) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isEditing]);

  function pushUrl(dirPath: string, filePath?: string) {
    const params = new URLSearchParams();
    if (dirPath && dirPath !== ".") params.set("path", dirPath);
    if (filePath) params.set("open", filePath);
    const qs = params.toString();
    router.push(`/dashboard/${agentId}/files${qs ? `?${qs}` : ""}`);
  }

  useEffect(() => {
    async function fetchAgent() {
      try {
        const res = await fetch(`/api/agents/${agentId}`);
        const json = (await res.json()) as ApiResponse<AgentView>;
        if (json.error) {
          setError(json.error.message);
          return;
        }
        setAgent(json.data);
      } catch {
        setError("Failed to load agent");
      }
    }
    fetchAgent();
  }, [agentId]);

  const fetchFiles = useCallback(
    async (dirPath: string) => {
      setLoadingFiles(true);
      try {
        const sp = new URLSearchParams({ path: dirPath });
        const res = await fetch(`/api/agents/${agentId}/files?${sp}`);
        const json = (await res.json()) as ApiResponse<FileEntry[]>;
        if (json.error) {
          setError(json.error.message);
          return;
        }
        setFiles(json.data);
        setCurrentPath(dirPath);
      } catch {
        setError("Failed to load files");
      } finally {
        setLoadingFiles(false);
      }
    },
    [agentId]
  );

  useEffect(() => {
    fetchFiles(initialPath);
  }, [fetchFiles, initialPath]);

  useEffect(() => {
    if (initialFile) {
      openFile(initialFile);
    }
  }, [initialFile]);

  async function openFile(filePath: string) {
    setIsEditing(false);
    setEditContent("");
    setLoadingContent(true);
    setSelectedFile(null);
    setSelectedImage(null);

    if (isImageFile(filePath)) {
      const sp = new URLSearchParams({ path: filePath });
      setSelectedImage(`/api/agents/${agentId}/files/raw?${sp}`);
      setLoadingContent(false);
      return;
    }

    try {
      const sp = new URLSearchParams({ path: filePath });
      const res = await fetch(`/api/agents/${agentId}/files/read?${sp}`);
      const json = (await res.json()) as ApiResponse<FileContent>;
      if (json.error) {
        setError(json.error.message);
        return;
      }
      setSelectedFile(json.data);
    } catch {
      setError("Failed to read file");
    } finally {
      setLoadingContent(false);
    }
  }

  async function saveFile() {
    if (!selectedFile || saving) return;
    setSaving(true);
    try {
      const sp = new URLSearchParams({ path: selectedFile.path });
      const res = await fetch(`/api/agents/${agentId}/files/read?${sp}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent }),
      });
      const json = (await res.json()) as ApiResponse<FileContent>;
      if (json.error) {
        setError(json.error.message);
        return;
      }
      setIsEditing(false);
      openFile(selectedFile.path);
    } catch {
      setError("Failed to save file");
    } finally {
      setSaving(false);
    }
  }

  async function createFile(fileName: string) {
    if (!fileName.trim()) return;
    const filePath =
      currentPath === "." ? fileName.trim() : `${currentPath}/${fileName.trim()}`;
    try {
      const sp = new URLSearchParams({ path: filePath });
      const res = await fetch(`/api/agents/${agentId}/files/read?${sp}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "" }),
      });
      const json = (await res.json()) as ApiResponse<FileContent>;
      if (json.error) {
        setError(json.error.message);
        return;
      }
      setIsCreating(false);
      setNewFileName("");
      await fetchFiles(currentPath);
      pushUrl(currentPath, filePath);
      setIsEditing(true);
      setEditContent("");
    } catch {
      setError("Failed to create file");
    }
  }

  async function deleteEntry(entry: FileEntry) {
    if (!window.confirm(`Delete ${entry.name}?`)) return;
    try {
      const sp = new URLSearchParams({ path: entry.path });
      const res = await fetch(`/api/agents/${agentId}/files/read?${sp}`, {
        method: "DELETE",
      });
      const json = (await res.json()) as ApiResponse<{ deleted: boolean }>;
      if (json.error) {
        setError(json.error.message);
        return;
      }
      if (selectedFile?.path === entry.path) {
        setSelectedFile(null);
        setIsEditing(false);
        pushUrl(currentPath);
      }
      fetchFiles(currentPath);
    } catch {
      setError("Failed to delete entry");
    }
  }

  useEffect(() => {
    if (isCreating && newFileInputRef.current) {
      newFileInputRef.current.focus();
    }
  }, [isCreating]);

  useEffect(() => {
    const urlPath = searchParams.get("path") || ".";
    const urlFile = searchParams.get("open") || null;

    if (urlPath !== currentPath) {
      fetchFiles(urlPath);
    }
    if (urlFile && urlFile !== selectedFile?.path) {
      openFile(urlFile);
    }
    if (!urlFile && (selectedFile || selectedImage)) {
      setSelectedFile(null);
      setSelectedImage(null);
    }
  }, [searchParams]);

  function handleEntryClick(entry: FileEntry) {
    if (entry.type === "directory") {
      pushUrl(entry.path);
    } else {
      pushUrl(currentPath, entry.path);
    }
  }

  const crumbs = buildBreadcrumbs(currentPath, agent?.workspaceLabel ?? agentId);

  if (error && !agent) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center gap-4 border-b border-border px-6 py-3">
        <Breadcrumb>
          <BreadcrumbList>
            {crumbs.map((crumb, i) => {
              const isLast = i === crumbs.length - 1;
              return (
                <BreadcrumbItem key={crumb.path}>
                  {i > 0 && <BreadcrumbSeparator />}
                  {isLast ? (
                    <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink
                      onClick={(e: React.MouseEvent) => {
                        e.preventDefault();
                        pushUrl(crumb.path);
                      }}
                      href="#"
                      className="cursor-pointer"
                    >
                      {crumb.label}
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
        {agent && (
          <span className="ml-auto text-xs text-muted-foreground">{agent.name}</span>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-72 shrink-0 border-r border-border">
          <ScrollArea className="h-full">
            <div className="p-2">
              <div className="mb-1 flex items-center justify-between px-2">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
                  Files
                </span>
                <button
                  onClick={() => {
                    setIsCreating(true);
                    setNewFileName("");
                  }}
                  className="rounded p-0.5 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
                >
                  <svg
                    className="size-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 4.5v15m7.5-7.5h-15"
                    />
                  </svg>
                </button>
              </div>
              {isCreating && (
                <div className="mb-1">
                  <input
                    ref={newFileInputRef}
                    type="text"
                    value={newFileName}
                    onChange={(e) => setNewFileName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        createFile(newFileName);
                      }
                      if (e.key === "Escape") {
                        setIsCreating(false);
                        setNewFileName("");
                      }
                    }}
                    onBlur={() => {
                      if (!newFileName.trim()) {
                        setIsCreating(false);
                        setNewFileName("");
                      }
                    }}
                    placeholder="filename.ext"
                    className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-ring"
                  />
                </div>
              )}
              {loadingFiles ? (
                <div className="space-y-1 p-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-7 w-full bg-muted" />
                  ))}
                </div>
              ) : files.length === 0 && !isCreating ? (
                <p className="p-4 text-sm text-muted-foreground">Empty directory</p>
              ) : (
                files.map((entry) => (
                  <div
                    key={entry.path}
                    className="group/entry relative"
                  >
                    <button
                      onClick={() => handleEntryClick(entry)}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted ${
                        selectedFile?.path === entry.path
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      <FileIcon type={entry.type} />
                      <span className="truncate">{entry.name}</span>
                      {entry.type === "file" && (
                        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/50 group-hover/entry:hidden">
                          {formatSize(entry.size)}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteEntry(entry);
                      }}
                      className="absolute right-2 top-1/2 hidden -translate-y-1/2 rounded p-0.5 text-muted-foreground/50 transition-colors hover:text-red-400 group-hover/entry:block"
                    >
                      <svg
                        className="size-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                        />
                      </svg>
                    </button>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden">
          {loadingContent ? (
            <div className="space-y-2 p-6">
              <Skeleton className="h-4 w-48 bg-muted" />
              <Skeleton className="h-4 w-full bg-muted" />
              <Skeleton className="h-4 w-3/4 bg-muted" />
              <Skeleton className="h-4 w-5/6 bg-muted" />
              <Skeleton className="h-4 w-2/3 bg-muted" />
            </div>
          ) : selectedImage ? (
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-4 py-2">
                <span className="text-sm text-muted-foreground">
                  {searchParams.get("open") ?? "Image"}
                </span>
              </div>
              <ScrollArea className="flex-1">
                <div className="flex items-center justify-center p-6">
                  <img
                    src={selectedImage}
                    alt={searchParams.get("open") ?? "Image"}
                    className="max-w-full rounded-md border border-border"
                  />
                </div>
              </ScrollArea>
            </div>
          ) : selectedFile ? (
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-4 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {selectedFile.path}
                  </span>
                  {!isEditing && (
                    <Button
                      variant="ghost"
                      size="xs"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setEditContent(selectedFile.content);
                        setIsEditing(true);
                      }}
                    >
                      <svg
                        className="size-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125"
                        />
                      </svg>
                      Edit
                    </Button>
                  )}
                </div>
                <span className="text-xs text-muted-foreground/50">
                  {formatSize(selectedFile.size)}
                  {selectedFile.language && ` \u00b7 ${selectedFile.language}`}
                </span>
              </div>
              {isEditing ? (
                <div className="flex flex-1 flex-col overflow-hidden">
                  <textarea
                    className="flex-1 resize-none bg-background p-4 font-mono text-sm leading-6 text-foreground outline-none"
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "s" && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        saveFile();
                      }
                      if (e.key === "Escape") {
                        setIsEditing(false);
                        setEditContent("");
                      }
                    }}
                    spellCheck={false}
                  />
                  <div className="flex items-center gap-2 border-t border-border px-4 py-2">
                    <Button
                      size="sm"
                      className="bg-sky-600 text-white hover:bg-sky-500"
                      onClick={() => saveFile()}
                      disabled={saving}
                    >
                      {saving ? "Saving\u2026" : "Save"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setIsEditing(false);
                        setEditContent("");
                      }}
                    >
                      Cancel
                    </Button>
                    <span className="ml-auto text-xs text-muted-foreground/50">
                      Ctrl+S to save \u00b7 Esc to cancel
                    </span>
                  </div>
                </div>
              ) : (
                <ScrollArea className="flex-1">
                  {highlightedHtml ? (
                    <div
                      className="shiki-wrapper text-sm [&_pre]:!bg-transparent [&_pre]:p-4 [&_code]:font-mono [&_.line]:leading-6"
                      dangerouslySetInnerHTML={{ __html: highlightedHtml }}
                    />
                  ) : (
                    <pre className="p-0 text-sm leading-6">
                      <code>
                        {selectedFile.content.split("\n").map((line, i) => (
                          <div
                            key={i}
                            className="flex hover:bg-muted/50"
                          >
                            <span className="inline-block w-12 shrink-0 select-none pr-4 text-right font-mono text-xs leading-6 text-muted-foreground/50">
                              {i + 1}
                            </span>
                            <span className="flex-1 whitespace-pre-wrap break-all font-mono text-foreground">
                              {line}
                            </span>
                          </div>
                        ))}
                      </code>
                    </pre>
                  )}
                </ScrollArea>
              )}
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-sm text-muted-foreground/50">
                Select a file to view its contents
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
