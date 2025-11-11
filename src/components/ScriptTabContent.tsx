"use client";

import * as React from "react";
import { Card } from "./ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import ChatClient from "./ChatClient";
import { ModelSelector } from "./ModelSelector";
import { ThinkingEffortSelector } from "./ThinkingEffortSelector";
import type { ThinkingEffort } from "./ModelSelector";
import { ZoomIn, ZoomOut, Bold as BoldIcon, Italic as ItalicIcon, Heading1, Heading2, Heading3, List, ListOrdered, Quote, Code as CodeIcon, Minus, Undo2, Redo2, Pilcrow, Link2, Link2Off } from "lucide-react";
import { cn } from "@/lib/utils";
import TiptapLink from "@tiptap/extension-link";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { DialogClose, DialogDescription, DialogFooter } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

// Mock script data - will be replaced with real data later
type Script = {
  id: string;
  date: string;
  content: string;
};

// Generate mock scripts for demonstration
function generateMockScripts(): Script[] {
  const scripts: Script[] = [];
  const today = new Date();
  
  for (let i = 0; i < 5; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i * 7); // One script per week
    
    scripts.push({
      id: `script-${i}`,
      date: date.toISOString(),
      content: `<h1>Client Script - ${date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</h1>

<h2>Opening</h2>

<p>Hello! I hope this message finds you well. I wanted to reach out because I noticed your company has been making great strides in the industry.</p>

<h2>Value Proposition</h2>

<p>We've helped similar companies achieve significant growth by implementing our solution. Our platform can help you:</p>

<ul>
<li>Increase efficiency by 40%</li>
<li>Reduce operational costs</li>
<li>Scale your business faster</li>
</ul>

<h2>Social Proof</h2>

<p>We've worked with companies like <a href="#">Client Name</a> and <a href="#">Another Client</a> who have seen remarkable results.</p>

<h2>Call to Action</h2>

<p>Would you be interested in a quick 15-minute call to discuss how we can help your business grow?</p>

<p>Best regards,<br>
[Your Name]</p>`,
    });
  }
  
  return scripts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

function formatScriptDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", { 
    month: "short", 
    day: "numeric",
    year: "numeric"
  });
}

export default function ScriptTabContent() {
  const [scripts] = React.useState<Script[]>(generateMockScripts());
  const [selectedScript, setSelectedScript] = React.useState<Script | null>(null);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [scriptContent, setScriptContent] = React.useState<string>(""); // Now stores HTML
  const [selectedModel, setSelectedModel] = React.useState("openai/gpt-5");
  const [thinkingEffort, setThinkingEffort] = React.useState<ThinkingEffort>("medium");
  const [isPdfPreviewOpen, setIsPdfPreviewOpen] = React.useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = React.useState<string>("");
  const [zoomLevel, setZoomLevel] = React.useState<number | "auto">("auto");
  const editorContainerRef = React.useRef<HTMLDivElement>(null);
  const isUserEditingRef = React.useRef(false);
  const lastAIContentRef = React.useRef<string>("");
  const [toolbarVersion, setToolbarVersion] = React.useState(0);
  const [isLinkDialogOpen, setIsLinkDialogOpen] = React.useState(false);
  const [linkUrl, setLinkUrl] = React.useState("");
  const linkRangeRef = React.useRef<{ from: number; to: number } | null>(null);
  const [linkPopoverOpen, setLinkPopoverOpen] = React.useState(false);
  const [linkPopoverPos, setLinkPopoverPos] = React.useState<{ x: number; y: number } | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const [lastSavedTime, setLastSavedTime] = React.useState<Date | null>(null);
  const saveTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const isSavingRef = React.useRef(false);
  const handleAutoSaveRef = React.useRef<(() => Promise<void>) | null>(null);
  const editorRef = React.useRef<ReturnType<typeof useEditor> | null>(null);
  const isDialogOpenRef = React.useRef(isDialogOpen);
  const [aiFlash, setAiFlash] = React.useState(false);
  const aiStreamTimersRef = React.useRef<number[]>([]);

  // Utilities to detect changed blocks between HTML versions
  const getBlockTexts = React.useCallback((html: string): string[] => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const nodes = Array.from(doc.querySelectorAll("h1,h2,h3,p,li"));
      return nodes.map((n) => n.textContent || "");
    } catch {
      return [];
    }
  }, []);

  const cleanupAiStreams = React.useCallback(() => {
    // Clear timers
    aiStreamTimersRef.current.forEach((id) => clearInterval(id));
    aiStreamTimersRef.current = [];
    // Remove overlays and restore visibility
    const container = editorContainerRef.current;
    if (!container) return;
    const page = container.querySelector(".script-page");
    if (!page) return;
    const overlays = Array.from(page.querySelectorAll(".ai-type-overlay"));
    overlays.forEach((el) => el.remove());
    const containers = Array.from(page.querySelectorAll(".ai-type-container")) as HTMLElement[];
    containers.forEach((el) => {
      el.style.visibility = "";
      el.classList.remove("ai-type-container");
    });
  }, []);
  const ribbonButtonHoverClass = "cursor-pointer hover:bg-primary/90 hover:text-white hover:shadow-lg hover:-translate-y-0.5 hover:scale-[1.02] transition-all duration-200 active:translate-y-0 active:scale-100";

  // TipTap editor for manual editing
  const editor = useEditor({
    extensions: [
      StarterKit,
      TiptapLink.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        protocols: ["http", "https", "mailto", "tel"],
        HTMLAttributes: {
          rel: "noopener noreferrer",
          target: null,
        },
      }),
    ],
    content: "",
    immediatelyRender: false, // Required for SSR compatibility
    onUpdate: ({ editor }) => {
      // Mark that user is editing
      isUserEditingRef.current = true;
      // Get HTML directly - no conversion needed
      const html = editor.getHTML();
      setScriptContent(html);
      // Ensure toolbar reacts to content changes
      setToolbarVersion((v) => v + 1);
      // Trigger save immediately on every keystroke
      if (isDialogOpen && handleAutoSaveRef.current && !isSavingRef.current) {
        handleAutoSaveRef.current();
      }
      // Reset flag after a short delay
      setTimeout(() => {
        isUserEditingRef.current = false;
      }, 100);
    },
    onSelectionUpdate: () => {
      // Re-render ribbon on caret move/selection changes so active states stay in sync
      setToolbarVersion((v) => v + 1);
    },
    editorProps: {
      attributes: {
        class: "prose prose-sm dark:prose-invert max-w-none focus:outline-none",
      },
    },
  });

  // Keep refs in sync
  React.useEffect(() => {
    editorRef.current = editor;
  }, [editor]);
  
  React.useEffect(() => {
    isDialogOpenRef.current = isDialogOpen;
  }, [isDialogOpen]);

  // Auto-save function (mockup - simulates saving) - stable reference
  const handleAutoSave = React.useCallback(async () => {
    if (!editorRef.current || !isDialogOpenRef.current || isSavingRef.current) return;
    
    isSavingRef.current = true;
    setIsSaving(true);
    // Simulate save delay (reduced for faster feedback)
    await new Promise(resolve => setTimeout(resolve, 300));
    setLastSavedTime(new Date());
    setIsSaving(false);
    isSavingRef.current = false;
  }, []); // No dependencies - uses refs instead

  // Store save function in ref so it can be called from onUpdate
  React.useEffect(() => {
    handleAutoSaveRef.current = handleAutoSave;
  }, [handleAutoSave]);

  // Format time as "xx:xx am/pm"
  const formatTime = React.useCallback((date: Date): string => {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).toLowerCase();
  }, []);

  // Update editor content when scriptContent changes (from AI updates or script selection)
  React.useEffect(() => {
    if (editor && scriptContent && !isUserEditingRef.current) {
      // Only update if this is an AI update or script selection, not user editing
      const currentHtml = editor.getHTML();
      if (currentHtml !== scriptContent) {
        editor.commands.setContent(scriptContent);
        lastAIContentRef.current = scriptContent;
      }
    }
  }, [scriptContent, editor]);

  // Calculate autofit scale based on container width
  const calculateAutofitScale = React.useCallback(() => {
    if (!editorContainerRef.current) return 1;
    const containerWidth = editorContainerRef.current.clientWidth - 32; // Account for padding
    const pageWidth = 8.5 * 96; // 8.5 inches in pixels at 96 DPI
    return Math.min(1, containerWidth / pageWidth);
  }, []);

  // Get current zoom scale
  const zoomScale = React.useMemo(() => {
    if (zoomLevel === "auto") {
      return calculateAutofitScale();
    }
    return zoomLevel;
  }, [zoomLevel, calculateAutofitScale]);

  // Recalculate autofit when dialog opens or container becomes available
  React.useEffect(() => {
    if (isDialogOpen && zoomLevel === "auto" && editorContainerRef.current) {
      // Small delay to ensure container is fully rendered
      const timer = setTimeout(() => {
        setZoomLevel("auto");
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isDialogOpen, zoomLevel]);

  // Update autofit on window resize
  React.useEffect(() => {
    if (zoomLevel === "auto") {
      const handleResize = () => {
        // Force re-render to recalculate autofit
        setZoomLevel("auto");
      };
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }
  }, [zoomLevel]);

  const handleZoomIn = () => {
    const currentScale = zoomScale;
    const newScale = Math.min(2, currentScale + 0.1);
    setZoomLevel(newScale);
  };

  const handleZoomOut = () => {
    const currentScale = zoomScale;
    const newScale = Math.max(0.25, currentScale - 0.1);
    setZoomLevel(newScale);
  };

  const handleZoomAuto = () => {
    setZoomLevel("auto");
  };

  const handleScriptClick = (script: Script) => {
    setSelectedScript(script);
    isUserEditingRef.current = false; // Reset flag when selecting new script
    setScriptContent(script.content);
    setIsDialogOpen(true);
  };

  // Open link dialog for current selection (or current link)
  const openLinkDialog = React.useCallback(() => {
    if (!editor) return;
    const chain = editor.chain().focus();
    // If inside link, expand to it; else keep current selection
    chain.extendMarkRange("link").run();
    const { from, to } = editor.state.selection;
    linkRangeRef.current = { from, to };
    const current = editor.getAttributes("link") as { href?: string };
    setLinkUrl(current?.href || "");
    setIsLinkDialogOpen(true);
  }, [editor]);

  const handleLinkSave = React.useCallback(() => {
    if (!editor) return;
    const url = (linkUrl || "").trim();
    // Restore selection so we always edit the intended range
    const range = linkRangeRef.current || { from: editor.state.selection.from, to: editor.state.selection.to };
    editor
      .chain()
      .focus()
      .setTextSelection(range)
      .extendMarkRange("link")
      .run();
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    } else {
      editor.chain().focus().unsetLink().run();
    }
    setIsLinkDialogOpen(false);
    setToolbarVersion((v) => v + 1);
  }, [editor, linkUrl]);

  const handleEditorClick = React.useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const anchor = target.closest("a");
    if (anchor) {
      e.preventDefault();
      e.stopPropagation();
      const href = anchor.getAttribute("href") || "";
      setLinkUrl(href);
      // Expand selection to clicked link for later editing
      editor?.chain().focus().extendMarkRange("link").run();
      if (editor) {
        const { from, to } = editor.state.selection;
        linkRangeRef.current = { from, to };
      }
      setLinkPopoverPos({ x: e.clientX, y: e.clientY });
      setLinkPopoverOpen(true);
    }
  }, [editor]);

  // Global capture for Tab to keep focus in editor even with Dialog focus trap
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      if (!editor || !editor.isFocused) return;
      e.preventDefault();
      e.stopPropagation();
      if (editor.isActive("bulletList") || editor.isActive("orderedList")) {
        if (e.shiftKey) {
          editor.chain().focus().liftListItem("listItem").run();
        } else {
          editor.chain().focus().sinkListItem("listItem").run();
        }
        return;
      }
      if (editor.isActive("codeBlock")) {
        editor.chain().focus().insertContent("\t").run();
        return;
      }
      // Insert indent to match list styling (2em = standard indent)
      // Using 4 non-breaking spaces to approximate 2em (roughly 32px at 16px font size)
      editor.chain().focus().insertContent("\u00A0\u00A0\u00A0\u00A0").run();
    };
    window.addEventListener("keydown", handler, true);
    return () => {
      window.removeEventListener("keydown", handler, true);
    };
  }, [editor]);

  // Apply heading: if caret is at end of a block and nothing selected,
  // split the block and apply heading to the new empty line instead of
  // converting the existing paragraph.
  const applyHeading = React.useCallback((level: 1 | 2 | 3) => {
    if (!editor) return;
    const sel: any = editor.state.selection as any;
    const isEmpty = sel?.empty;
    const $from = sel?.$from;
    const atEndOfBlock =
      $from &&
      typeof $from.parentOffset === "number" &&
      typeof $from.parent?.content?.size === "number" &&
      $from.parentOffset === $from.parent.content.size;
    
    const chain = editor.chain().focus();
    if (isEmpty && atEndOfBlock) {
      chain.splitBlock().toggleHeading({ level }).run();
      setToolbarVersion((v) => v + 1);
      return;
    }
    chain.toggleHeading({ level }).run();
    setToolbarVersion((v) => v + 1);
  }, [editor]);

  // Toggle list/blockquote/code as new block if at end of a paragraph with collapsed selection
  const applyBlockToggle = React.useCallback((type: "bulletList" | "orderedList" | "blockquote" | "codeBlock") => {
    if (!editor) return;
    const sel: any = editor.state.selection as any;
    const isEmpty = sel?.empty;
    const $from = sel?.$from;
    const atEndOfBlock =
      $from &&
      typeof $from.parentOffset === "number" &&
      typeof $from.parent?.content?.size === "number" &&
      $from.parentOffset === $from.parent.content.size;
    
    let chain = editor.chain().focus();
    if (isEmpty && atEndOfBlock) {
      chain = chain.splitBlock();
    }
    if (type === "bulletList") chain.toggleBulletList().run();
    if (type === "orderedList") chain.toggleOrderedList().run();
    if (type === "blockquote") chain.toggleBlockquote().run();
    if (type === "codeBlock") chain.toggleCodeBlock().run();
    setToolbarVersion((v) => v + 1);
  }, [editor]);

  const handleToolResult = React.useCallback((toolCall: {
    id: string;
    name: string;
    status: string;
    result?: unknown;
  }) => {
    if (toolCall.name === "update_document" && toolCall.status === "success" && toolCall.result) {
      const result = toolCall.result as { updatedContent?: string };
      if (result.updatedContent) {
        isUserEditingRef.current = false; // Mark as AI update
        // Compute changed blocks between current and new content
        const before = editor ? editor.getHTML() : scriptContent;
        const beforeBlocks = getBlockTexts(before || "");
        const afterBlocks = getBlockTexts(result.updatedContent);
        const changedIndexes: number[] = [];
        const maxLen = Math.max(beforeBlocks.length, afterBlocks.length);
        for (let i = 0; i < maxLen; i++) {
          if ((beforeBlocks[i] || "") !== (afterBlocks[i] || "")) {
            changedIndexes.push(i);
          }
        }
        // Replace content
        setScriptContent(result.updatedContent);
        // Clean previous streaming overlays if any
        cleanupAiStreams();
        // After render, decorate and stream only changed blocks
        setTimeout(() => {
          const container = editorContainerRef.current;
          if (!container) return;
          const page = container.querySelector(".script-page");
          if (!page) return;
          const blocks = Array.from(
            page.querySelectorAll("h1,h2,h3,p,li")
          ) as HTMLElement[];
          // Apply per-block streaming overlay
          changedIndexes.forEach((idx) => {
            const el = blocks[idx];
            if (!el) return;
            const finalText = el.textContent || "";
            el.classList.add("ai-flash-block");
            el.classList.add("ai-type-container");
            const overlay = document.createElement("div");
            overlay.className = "ai-type-overlay";
            overlay.textContent = "";
            el.appendChild(overlay);
            // Hide underlying text while we stream overlay
            el.style.visibility = "hidden";
            overlay.style.visibility = "visible";
            // Type in chunks
            let i = 0;
            const len = finalText.length;
            // Choose chunkSize roughly based on length
            const steps = Math.min(60, Math.max(20, Math.floor(len / 3)));
            const chunkSize = Math.max(1, Math.ceil(len / steps));
            const interval = window.setInterval(() => {
              i = Math.min(len, i + chunkSize);
              overlay.textContent = finalText.slice(0, i);
              if (i >= len) {
                clearInterval(interval);
                // Reveal real content, remove overlay
                overlay.remove();
                el.style.visibility = "";
                el.classList.remove("ai-type-container");
                // Leave flash effect then remove
                setTimeout(() => el.classList.remove("ai-flash-block"), 900);
              }
            }, 20);
            aiStreamTimersRef.current.push(interval);
          });
          // Temporary AI caret on last changed block
          const last = blocks[changedIndexes[changedIndexes.length - 1]];
          if (last) {
            last.classList.add("ai-caret");
            setTimeout(() => last.classList.remove("ai-caret"), 1400);
          }
        }, 60);
      }
    }
  }, [editor, editorContainerRef, getBlockTexts, scriptContent, cleanupAiStreams]);

  const handleFinalize = React.useCallback(() => {
    if (!editor) return;
    
    // Get HTML directly from TipTap editor
    const editorHtml = editor.getHTML();
    
    // Generate PDF preview HTML with page structure
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            * {
              box-sizing: border-box;
            }
            @page {
              size: letter;
              margin: 1in;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              background: #f5f5f5;
              padding: 20px;
              margin: 0;
            }
            .page {
              width: 8.5in;
              min-height: 11in;
              padding: 1in;
              margin: 0 auto 0.5in;
              background: white;
              box-shadow: 0 0 10px rgba(0,0,0,0.1);
              page-break-after: always;
              overflow-y: auto;
            }
            .page:last-child {
              page-break-after: auto;
              margin-bottom: 0;
            }
            h1 { 
              font-size: 2em; 
              margin-top: 0; 
              margin-bottom: 0.5em; 
              font-weight: 700;
              line-height: 1.2;
              page-break-after: avoid;
            }
            h2 { 
              font-size: 1.5em; 
              margin-top: 1.5em; 
              margin-bottom: 0.5em; 
              font-weight: 600;
              line-height: 1.3;
              page-break-after: avoid;
            }
            h3 { 
              font-size: 1.25em; 
              margin-top: 1em; 
              margin-bottom: 0.5em; 
              font-weight: 600;
              line-height: 1.4;
              page-break-after: avoid;
            }
            p { 
              margin-bottom: 1em; 
              line-height: 1.6;
              orphans: 3;
              widows: 3;
            }
            ul, ol { 
              margin-bottom: 1em; 
              padding-left: 2em; 
              page-break-inside: avoid;
            }
            li { 
              margin-bottom: 0.5em; 
              line-height: 1.6;
            }
            code { 
              background: #f4f4f4; 
              padding: 2px 6px; 
              border-radius: 3px; 
              font-family: 'Courier New', monospace;
              font-size: 0.9em;
            }
            pre { 
              background: #f4f4f4; 
              padding: 1em; 
              border-radius: 5px; 
              overflow-x: auto;
              margin-bottom: 1em;
              page-break-inside: avoid;
            }
            pre code {
              background: transparent;
              padding: 0;
            }
            blockquote { 
              border-left: 4px solid #ddd; 
              padding-left: 1em; 
              margin-left: 0; 
              margin-bottom: 1em;
              color: #666; 
              font-style: italic;
              page-break-inside: avoid;
            }
            a { 
              color: #0066cc; 
              text-decoration: none; 
            }
            a:hover { 
              text-decoration: underline; 
            }
            strong {
              font-weight: 600;
            }
            em {
              font-style: italic;
            }
            hr {
              border: none;
              border-top: 1px solid #ddd;
              margin: 2em 0;
              page-break-after: avoid;
            }
            @media print {
              body {
                background: white;
                padding: 0;
              }
              .page {
                box-shadow: none;
                margin: 0;
                page-break-after: always;
              }
              .page:last-child {
                page-break-after: auto;
              }
            }
          </style>
        </head>
        <body>
          <div class="page">
            ${editorHtml}
          </div>
        </body>
      </html>
    `;
    
    // Create blob URL for preview
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    setPdfPreviewUrl(url);
    setIsPdfPreviewOpen(true);
  }, [editor]);

  // Cleanup blob URL on unmount
  React.useEffect(() => {
    return () => {
      if (pdfPreviewUrl) {
        URL.revokeObjectURL(pdfPreviewUrl);
      }
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [pdfPreviewUrl]);

  // Initialize saved time when dialog opens with existing script
  React.useEffect(() => {
    if (isDialogOpen && selectedScript && !lastSavedTime) {
      setLastSavedTime(new Date());
    }
  }, [isDialogOpen, selectedScript, lastSavedTime]);

  return (
    <div className="space-y-4">
      {scripts.length === 0 ? (
        <Card className="bg-linear-to-br from-background to-background/95 border-foreground/10 shadow-md">
          <div className="p-12 text-center">
            <p className="text-sm text-foreground/60 font-light">
              No scripts yet. Scripts will appear here once they are automatically generated.
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {scripts.map((script) => (
            <Card
              key={script.id}
              className="bg-linear-to-br from-background to-background/95 border-foreground/10 shadow-md cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => handleScriptClick(script)}
            >
              <div className="p-4">
                <div className="text-sm font-medium text-foreground mb-2">
                  {formatScriptDate(script.date)}
                </div>
                <div className="text-xs text-foreground/60 font-light line-clamp-2">
                  {script.content.replace(/<[^>]+>/g, '').substring(0, 100)}...
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-[90vw] w-[90vw] max-h-[90vh] h-[90vh] flex flex-col p-0 gap-0 sm:max-w-[90vw]">
          <DialogHeader className="px-6 py-4 border-b">
            <div className="flex items-center justify-between">
              <DialogTitle>
                {selectedScript ? `Script - ${formatScriptDate(selectedScript.date)}` : "Script Editor"}
              </DialogTitle>
              {/* Save status indicator - centered */}
              <div className="absolute left-1/2 transform -translate-x-1/2">
                {isSaving ? (
                  <div className="flex items-center gap-2 text-sm text-foreground/70 font-medium">
                    <span className="animate-pulse">Saving...</span>
                  </div>
                ) : lastSavedTime ? (
                  <div className="flex items-center gap-2 text-sm text-foreground/70 font-medium">
                    <span className="text-green-600 dark:text-green-400">Saved</span>
                    <span>{formatTime(lastSavedTime)}</span>
                  </div>
                ) : null}
              </div>
              <div className="flex items-center gap-2 mr-8">
                <ModelSelector value={selectedModel} onValueChange={setSelectedModel} />
                <ThinkingEffortSelector value={thinkingEffort} onValueChange={setThinkingEffort} />
              </div>
            </div>
          </DialogHeader>
          
          <div className="flex-1 flex overflow-hidden flex-col">
            <div className="flex-1 flex overflow-hidden">
              {/* Left side - Document Editor with PDF Preview Style */}
              <div className="w-1/2 border-r overflow-hidden bg-gray-100 flex flex-col">
                {/* Match finalize preview styling (scoped) */}
                <style>
                  {`
                    .script-page {
                      width: 8.5in;
                      min-height: 11in;
                      padding: 1in;
                      margin: 0 auto 0.5in;
                      background: white;
                      box-shadow: 0 0 10px rgba(0,0,0,0.1);
                      overflow-y: auto;
                      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                      line-height: 1.6;
                      color: #333;
                    }
                    .script-page h1 { 
                      font-size: 2em; 
                      margin-top: 0; 
                      margin-bottom: 0.5em; 
                      font-weight: 700;
                      line-height: 1.2;
                    }
                    .script-page h2 { 
                      font-size: 1.5em; 
                      margin-top: 1.5em; 
                      margin-bottom: 0.5em; 
                      font-weight: 600;
                      line-height: 1.3;
                    }
                    .script-page h3 { 
                      font-size: 1.25em; 
                      margin-top: 1em; 
                      margin-bottom: 0.5em; 
                      font-weight: 600;
                      line-height: 1.4;
                    }
                    .script-page p { 
                      margin-bottom: 1em; 
                      line-height: 1.6;
                    }
                    .script-page ul, 
                    .script-page ol { 
                      margin-bottom: 1em; 
                      padding-left: 2em; 
                    }
                    .script-page li { 
                      margin-bottom: 0.5em; 
                      line-height: 1.6;
                    }
                    .script-page code { 
                      background: #f4f4f4; 
                      padding: 2px 6px; 
                      border-radius: 3px; 
                      font-family: 'Courier New', monospace;
                      font-size: 0.9em;
                    }
                    .script-page pre { 
                      background: #f4f4f4; 
                      padding: 1em; 
                      border-radius: 5px; 
                      overflow-x: auto;
                      margin-bottom: 1em;
                    }
                    .script-page pre code {
                      background: transparent;
                      padding: 0;
                    }
                    .script-page blockquote { 
                      border-left: 4px solid #ddd; 
                      padding-left: 1em; 
                      margin-left: 0; 
                      margin-bottom: 1em;
                      color: #666; 
                      font-style: italic;
                    }
                    .script-page a { 
                      color: #0066cc; 
                      text-decoration: none; 
                    }
                    .script-page a:hover { 
                      text-decoration: underline; 
                    }
                    .script-page strong { font-weight: 600; }
                    .script-page em { font-style: italic; }
                    .script-page hr {
                      border: none;
                      border-top: 1px solid #ddd;
                      margin: 2em 0;
                    }
                    /* AI highlight flash - applied when container has ai-flash */
                    .script-page.ai-flash p,
                    .script-page.ai-flash li,
                    .script-page.ai-flash h1,
                    .script-page.ai-flash h2,
                    .script-page.ai-flash h3 {
                      background: rgba(34,197,94,0.22);
                      animation: aiFlash 1.2s ease-out forwards;
                    }
                    @keyframes aiFlash {
                      0% { background: rgba(34,197,94,0.35); }
                      100% { background: transparent; }
                    }
                    /* Per-block flash + typing shimmer */
                    .ai-flash-block {
                      background: rgba(34,197,94,0.22);
                      animation: aiFlash 1.2s ease-out forwards;
                    }
                    .ai-typing {
                      background-image: linear-gradient(90deg, rgba(124,58,237,0.25), rgba(124,58,237,0.0) 60%);
                      background-size: 200% 100%;
                      animation: aiType 0.9s linear infinite;
                    }
                    @keyframes aiType {
                      0% { background-position: 0% 0; }
                      100% { background-position: -200% 0; }
                    }
                    .ai-caret::after {
                      content: "";
                      display: inline-block;
                      width: 2px;
                      height: 1em;
                      background: #7c3aed;
                      margin-left: 2px;
                      animation: blink 1.1s step-end infinite;
                      vertical-align: text-bottom;
                    }
                    .ai-type-container { position: relative; }
                    .ai-type-overlay {
                      position: absolute;
                      left: 0;
                      top: 0;
                      width: 100%;
                      white-space: pre-wrap;
                      color: currentColor;
                      pointer-events: none;
                    }
                    @keyframes blink {
                      50% { opacity: 0; }
                    }
                  `}
                </style>
                {/* Zoom Controls */}
                <div className="flex items-center justify-between px-4 py-2 border-b border-foreground/10 bg-background">
                  <div className="flex items-center flex-wrap gap-2">
                    <TooltipProvider delayDuration={1000}>
                    {/* Zoom */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleZoomOut}
                          className={cn("h-8 w-8 p-0", ribbonButtonHoverClass)}
                        >
                          <ZoomOut className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Zoom out</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleZoomAuto}
                          className={cn("h-8 px-3 text-xs", ribbonButtonHoverClass)}
                        >
                          {zoomLevel === "auto" ? "Auto" : `${Math.round(zoomScale * 100)}%`}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Auto fit</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleZoomIn}
                          className={cn("h-8 w-8 p-0", ribbonButtonHoverClass)}
                        >
                          <ZoomIn className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Zoom in</TooltipContent>
                    </Tooltip>
                    
                    <div className="w-px h-6 bg-foreground/10 mx-1" />
                    
                    {/* Basic styles */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!editor}
                          onClick={() => { editor?.chain().focus().toggleBold().run(); setToolbarVersion((v)=>v+1); }}
                          className={cn("h-8 w-8 p-0", ribbonButtonHoverClass, editor?.isActive("bold") && "bg-foreground/10")}
                        >
                          <BoldIcon className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Bold</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!editor}
                          onClick={() => { editor?.chain().focus().toggleItalic().run(); setToolbarVersion((v)=>v+1); }}
                          className={cn("h-8 w-8 p-0", ribbonButtonHoverClass, editor?.isActive("italic") && "bg-foreground/10")}
                        >
                          <ItalicIcon className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Italic</TooltipContent>
                    </Tooltip>
                    
                    {/* Link controls */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!editor}
                          onClick={openLinkDialog}
                          className={cn("h-8 w-8 p-0", ribbonButtonHoverClass, editor?.isActive("link") && "bg-foreground/10")}
                        >
                          <Link2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Add/edit link</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!editor || !editor.isActive("link")}
                          onClick={() => { editor?.chain().focus().extendMarkRange("link").unsetLink().run(); setToolbarVersion((v)=>v+1); }}
                          className={cn("h-8 w-8 p-0", ribbonButtonHoverClass)}
                        >
                          <Link2Off className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Remove link</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!editor}
                          onClick={() => { editor?.chain().focus().setParagraph().run(); setToolbarVersion((v)=>v+1); }}
                          className={cn("h-8 w-8 p-0", ribbonButtonHoverClass, editor?.isActive("paragraph") && "bg-foreground/10")}
                        >
                          <Pilcrow className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Paragraph</TooltipContent>
                    </Tooltip>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!editor}
                      onClick={() => applyHeading(1)}
                      className={cn("h-8 w-8 p-0", ribbonButtonHoverClass, editor?.isActive("heading", { level: 1 }) && "bg-foreground/10")}
                    >
                      <Heading1 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!editor}
                      onClick={() => applyHeading(2)}
                      className={cn("h-8 w-8 p-0", ribbonButtonHoverClass, editor?.isActive("heading", { level: 2 }) && "bg-foreground/10")}
                    >
                      <Heading2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!editor}
                      onClick={() => applyHeading(3)}
                      className={cn("h-8 w-8 p-0", ribbonButtonHoverClass, editor?.isActive("heading", { level: 3 }) && "bg-foreground/10")}
                    >
                      <Heading3 className="h-4 w-4" />
                    </Button>
                    
                    <div className="w-px h-6 bg-foreground/10 mx-1" />
                    
                    {/* Lists & quote */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!editor}
                          onClick={() => applyBlockToggle("bulletList")}
                          className={cn("h-8 w-8 p-0", ribbonButtonHoverClass, editor?.isActive("bulletList") && "bg-foreground/10")}
                        >
                          <List className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Bulleted list</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!editor}
                          onClick={() => applyBlockToggle("orderedList")}
                          className={cn("h-8 w-8 p-0", ribbonButtonHoverClass, editor?.isActive("orderedList") && "bg-foreground/10")}
                        >
                          <ListOrdered className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Numbered list</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!editor}
                          onClick={() => applyBlockToggle("blockquote")}
                          className={cn("h-8 w-8 p-0", ribbonButtonHoverClass, editor?.isActive("blockquote") && "bg-foreground/10")}
                        >
                          <Quote className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Blockquote</TooltipContent>
                    </Tooltip>
                    
                    <div className="w-px h-6 bg-foreground/10 mx-1" />
                    
                    {/* Code, HR */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!editor}
                          onClick={() => applyBlockToggle("codeBlock")}
                          className={cn("h-8 w-8 p-0", ribbonButtonHoverClass, editor?.isActive("codeBlock") && "bg-foreground/10")}
                        >
                          <CodeIcon className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Code block</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!editor}
                          onClick={() => editor?.chain().focus().setHorizontalRule().run()}
                          className={cn("h-8 w-8 p-0", ribbonButtonHoverClass)}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Horizontal rule</TooltipContent>
                    </Tooltip>
                    
                    <div className="w-px h-6 bg-foreground/10 mx-1" />
                    
                    {/* Undo/Redo */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!editor}
                          onClick={() => editor?.chain().focus().undo().run()}
                          className={cn("h-8 w-8 p-0", ribbonButtonHoverClass)}
                        >
                          <Undo2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Undo</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!editor}
                          onClick={() => editor?.chain().focus().redo().run()}
                          className={cn("h-8 w-8 p-0", ribbonButtonHoverClass)}
                        >
                          <Redo2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Redo</TooltipContent>
                    </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
                
                <div 
                  ref={editorContainerRef}
                  className="flex-1 overflow-auto p-4"
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'flex-start',
                  }}
                >
                  <div
                    style={{
                      transform: `scale(${zoomScale})`,
                      transformOrigin: 'top center',
                      transition: 'transform 0.2s ease',
                    }}
                  >
                    <div className={`script-page ${aiFlash ? "ai-flash" : ""}`}>
                      {editor && (
                        <EditorContent 
                          editor={editor}
                          onClick={handleEditorClick}
                          className="focus:outline-none"
                        />
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Footer with Finalize button */}
                <div className="border-t border-foreground/10 px-6 py-4 bg-background">
                  <Button
                    onClick={handleFinalize}
                    className="w-full cursor-pointer hover:bg-primary/90 hover:shadow-lg hover:-translate-y-0.5 hover:scale-[1.02] transition-all duration-200 active:translate-y-0 active:scale-100"
                  >
                    Finalize
                  </Button>
                </div>
              </div>

              {/* Right side - AI Chat */}
              <div className="w-1/2 overflow-hidden flex flex-col">
                <ChatClient
                  model={selectedModel}
                  thinkingEffort={thinkingEffort}
                  extraPayload={{
                    documentContext: {
                      content: scriptContent,
                    },
                  }}
                  onToolResult={handleToolResult}
                  storageKeyPrefix="script-editor"
                  emptyStateTitle="AI Script Editor"
                  emptyStateDescription="Ask me to edit the script. I can help you modify, improve, or customize it."
                />
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Link action popover (Open | Edit) */}
      {linkPopoverPos && (
        <Popover open={linkPopoverOpen} onOpenChange={setLinkPopoverOpen}>
          <PopoverTrigger asChild>
            <span
              style={{
                position: 'fixed',
                left: linkPopoverPos.x,
                top: linkPopoverPos.y,
                width: 1,
                height: 1,
              }}
            />
          </PopoverTrigger>
          <PopoverContent className="p-2 w-40" side="top" align="start">
            <div className="flex flex-col gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (linkUrl) window.open(linkUrl, "_blank", "noopener,noreferrer");
                  setLinkPopoverOpen(false);
                }}
              >
                Open link
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setLinkPopoverOpen(false);
                  setIsLinkDialogOpen(true);
                }}
              >
                Edit link
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      )}

      {/* Link add/edit dialog */}
      <Dialog open={isLinkDialogOpen} onOpenChange={setIsLinkDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit link</DialogTitle>
            <DialogDescription>
              Enter a URL for the selected text. Use a full URL like https://example.com
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-3">
              <Label htmlFor="link-url">URL</Label>
              <Input
                id="link-url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://example.com"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleLinkSave}>Save changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PDF Preview Dialog */}
      <Dialog 
        open={isPdfPreviewOpen} 
        onOpenChange={(open) => {
          setIsPdfPreviewOpen(open);
          if (!open && pdfPreviewUrl) {
            // Cleanup blob URL when dialog closes
            URL.revokeObjectURL(pdfPreviewUrl);
            setPdfPreviewUrl("");
          }
        }}
      >
        <DialogContent className="max-w-[90vw] w-[90vw] max-h-[90vh] h-[90vh] flex flex-col p-0 gap-0 sm:max-w-[90vw]">
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle>PDF Preview</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto overflow-x-hidden bg-gray-100 p-4">
            {pdfPreviewUrl && (
              <iframe
                src={pdfPreviewUrl}
                className="w-full border-0 bg-transparent"
                style={{ minHeight: '100%' }}
                title="PDF Preview"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

