"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import {
  Bold,
  Italic,
  Underline,
  Heading2,
  Heading3,
  Pilcrow,
  List,
  ListOrdered,
  Highlighter,
  Undo2,
  Redo2,
  RemoveFormatting,
  Code,
  Eye,
} from "lucide-react";

export interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

type HighlightColor = "none" | "gold" | "green" | "amber";

const HIGHLIGHT_OPTIONS: { id: HighlightColor; label: string; class: string; bg: string; dot: string }[] = [
  { id: "gold", label: "Bento Gold", class: "bento-highlight-gold", bg: "#FAF4E6", dot: "#B99A60" },
  { id: "green", label: "Forest Moss", class: "bento-highlight-green", bg: "#EAF1EA", dot: "#354B35" },
  { id: "amber", label: "Warm Amber", class: "bento-highlight-amber", bg: "#FEF3C7", dot: "#D97706" },
  { id: "none", label: "Clear Highlight", class: "", bg: "#FFFFFF", dot: "#9CA3AF" },
];

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Write a chef-crafted description for this healthy meal...",
  className = "",
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [viewSource, setViewSource] = useState(false);
  const [activeFormats, setActiveFormats] = useState({
    bold: false,
    italic: false,
    underline: false,
    heading2: false,
    heading3: false,
    paragraph: false,
    unorderedList: false,
    orderedList: false,
  });
  const [showHighlightMenu, setShowHighlightMenu] = useState(false);
  const highlightMenuRef = useRef<HTMLDivElement>(null);

  // Sync incoming value to editor DOM without resetting cursor during typing
  useEffect(() => {
    if (!editorRef.current) return;
    const currentHtml = editorRef.current.innerHTML;
    const normalizedIncoming = value || "";
    // Only update innerHTML if it genuinely differs (prevents cursor jumping)
    if (currentHtml !== normalizedIncoming && document.activeElement !== editorRef.current) {
      editorRef.current.innerHTML = normalizedIncoming;
    }
  }, [value]);

  // Click outside to close highlight dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (highlightMenuRef.current && !highlightMenuRef.current.contains(event.target as Node)) {
        setShowHighlightMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Update active toolbar button states based on selection
  const updateActiveStates = useCallback(() => {
    if (!editorRef.current || document.activeElement !== editorRef.current) return;

    try {
      const isBold = document.queryCommandState("bold");
      const isItalic = document.queryCommandState("italic");
      const isUnderline = document.queryCommandState("underline");
      const isUl = document.queryCommandState("insertUnorderedList");
      const isOl = document.queryCommandState("insertOrderedList");

      const selection = window.getSelection();
      let isH2 = false;
      let isH3 = false;
      let isP = false;

      if (selection && selection.rangeCount > 0) {
        let node: Node | null = selection.anchorNode;
        while (node && node !== editorRef.current) {
          if (node.nodeName === "H2") isH2 = true;
          if (node.nodeName === "H3") isH3 = true;
          if (node.nodeName === "P") isP = true;
          node = node.parentNode;
        }
      }

      setActiveFormats({
        bold: isBold,
        italic: isItalic,
        underline: isUnderline,
        heading2: isH2,
        heading3: isH3,
        paragraph: isP,
        unorderedList: isUl,
        orderedList: isOl,
      });
    } catch {
      // Ignored if queryCommandState is unavailable
    }
  }, []);

  const handleInput = () => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    onChange(html === "<p><br></p>" || html === "<br>" ? "" : html);
    updateActiveStates();
  };

  const executeCommand = (command: string, arg: string | undefined = undefined) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(command, false, arg);
    handleInput();
    updateActiveStates();
  };

  const handleFormatBlock = (tag: "h2" | "h3" | "p") => {
    executeCommand("formatBlock", `<${tag}>`);
  };

  const handleApplyHighlight = (color: HighlightColor) => {
    setShowHighlightMenu(false);
    if (!editorRef.current) return;
    editorRef.current.focus();

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return;
    }

    const range = selection.getRangeAt(0);
    const selectedContent = range.extractContents();

    if (color === "none") {
      // Flatten or remove mark tags inside selection
      const fragment = document.createDocumentFragment();
      Array.from(selectedContent.childNodes).forEach((child) => {
        if (child.nodeName === "MARK") {
          while (child.firstChild) {
            fragment.appendChild(child.firstChild);
          }
        } else {
          fragment.appendChild(child);
        }
      });
      range.insertNode(fragment);
    } else {
      const mark = document.createElement("mark");
      mark.className = `bento-highlight-${color}`;
      mark.appendChild(selectedContent);
      range.insertNode(mark);
    }

    handleInput();
  };

  const handleClearFormatting = () => {
    executeCommand("removeFormat");
    executeCommand("formatBlock", "<p>");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const isMac = typeof window !== "undefined" && navigator.platform.toUpperCase().indexOf("MAC") >= 0;
    const modifier = isMac ? e.metaKey : e.ctrlKey;

    if (modifier && !e.shiftKey && !e.altKey) {
      if (e.key === "b" || e.key === "B") {
        e.preventDefault();
        executeCommand("bold");
      } else if (e.key === "i" || e.key === "I") {
        e.preventDefault();
        executeCommand("italic");
      } else if (e.key === "u" || e.key === "U") {
        e.preventDefault();
        executeCommand("underline");
      } else if (e.key === "z" || e.key === "Z") {
        e.preventDefault();
        executeCommand("undo");
      } else if (e.key === "y" || e.key === "Y") {
        e.preventDefault();
        executeCommand("redo");
      }
    } else if (modifier && e.shiftKey && (e.key === "z" || e.key === "Z")) {
      e.preventDefault();
      executeCommand("redo");
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const html = e.clipboardData.getData("text/html");
    const text = e.clipboardData.getData("text/plain");

    if (html) {
      // Strip any <img> tags, <svg> tags, scripts, and base64 data URIs
      const cleanHtml = html
        .replace(/<img\b[^>]*>/gi, "")
        .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, "")
        .replace(/data:image\/[^;]+;base64,[a-zA-Z0-9+/=]+/gi, "")
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");

      document.execCommand("insertHTML", false, cleanHtml);
    } else if (text) {
      document.execCommand("insertText", false, text);
    }
    handleInput();
  };

  return (
    <div
      className={`rounded-2xl border border-[#E5DFC5] bg-white overflow-hidden shadow-2xs transition-all focus-within:border-[#354B35] focus-within:ring-1 focus-within:ring-[#354B35]/20 ${className}`}
    >
      {/* Editor Toolbar */}
      <div className="flex flex-wrap items-center gap-1 p-2 bg-[#F7F3EA] border-b border-[#E5DFC5] text-xs">
        {/* Headings / Block Dropdown */}
        <div className="flex items-center gap-0.5 bg-white rounded-lg p-0.5 border border-[#E5DFC5]">
          <button
            type="button"
            onClick={() => handleFormatBlock("p")}
            className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition-colors ${
              activeFormats.paragraph
                ? "bg-[#354B35] text-white"
                : "text-[#4A584A] hover:bg-[#F2ECE1]"
            }`}
            title="Paragraph formatting"
            aria-label="Format as Paragraph"
          >
            <Pilcrow className="w-3 h-3" />
            <span>P</span>
          </button>
          <button
            type="button"
            onClick={() => handleFormatBlock("h2")}
            className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition-colors ${
              activeFormats.heading2
                ? "bg-[#354B35] text-white"
                : "text-[#4A584A] hover:bg-[#F2ECE1]"
            }`}
            title="Heading 2 (Major Section)"
            aria-label="Format as Heading 2"
          >
            <Heading2 className="w-3.5 h-3.5" />
            <span>H2</span>
          </button>
          <button
            type="button"
            onClick={() => handleFormatBlock("h3")}
            className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition-colors ${
              activeFormats.heading3
                ? "bg-[#354B35] text-white"
                : "text-[#4A584A] hover:bg-[#F2ECE1]"
            }`}
            title="Heading 3 (Sub-section)"
            aria-label="Format as Heading 3"
          >
            <Heading3 className="w-3.5 h-3.5" />
            <span>H3</span>
          </button>
        </div>

        <div className="h-4 w-px bg-[#E5DFC5] mx-1" />

        {/* Inline Formatting: Bold, Italic, Underline */}
        <div className="flex items-center gap-0.5 bg-white rounded-lg p-0.5 border border-[#E5DFC5]">
          <button
            type="button"
            onClick={() => executeCommand("bold")}
            className={`p-1.5 rounded transition-colors ${
              activeFormats.bold
                ? "bg-[#354B35] text-white shadow-xs"
                : "text-[#4A584A] hover:bg-[#F2ECE1]"
            }`}
            title="Bold (Ctrl/Cmd+B)"
            aria-label="Bold"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => executeCommand("italic")}
            className={`p-1.5 rounded transition-colors ${
              activeFormats.italic
                ? "bg-[#354B35] text-white shadow-xs"
                : "text-[#4A584A] hover:bg-[#F2ECE1]"
            }`}
            title="Italic (Ctrl/Cmd+I)"
            aria-label="Italic"
          >
            <Italic className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => executeCommand("underline")}
            className={`p-1.5 rounded transition-colors ${
              activeFormats.underline
                ? "bg-[#354B35] text-white shadow-xs"
                : "text-[#4A584A] hover:bg-[#F2ECE1]"
            }`}
            title="Underline (Ctrl/Cmd+U)"
            aria-label="Underline"
          >
            <Underline className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Controlled Color Highlight Dropdown */}
        <div className="relative" ref={highlightMenuRef}>
          <button
            type="button"
            onClick={() => setShowHighlightMenu((prev) => !prev)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-[#E5DFC5] text-[11px] font-semibold text-[#4A584A] hover:bg-[#F2ECE1] transition-colors"
            title="Highlight selected text"
            aria-label="Text Highlight Colors"
          >
            <Highlighter className="w-3.5 h-3.5 text-[#B99A60]" />
            <span>Highlight</span>
          </button>

          {showHighlightMenu && (
            <div className="absolute left-0 top-full mt-1 w-44 bg-white rounded-xl shadow-lg border border-[#E5DFC5] py-1.5 z-50 animate-in fade-in zoom-in-95">
              <div className="px-3 py-1 text-[10px] uppercase font-bold text-[#8A9A86] tracking-wider">
                Highlight Color
              </div>
              {HIGHLIGHT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleApplyHighlight(opt.id)}
                  className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-[#F7F3EA] transition-colors"
                >
                  <span
                    className="w-3 h-3 rounded-full border border-black/10 shrink-0"
                    style={{ backgroundColor: opt.dot }}
                  />
                  <span className="font-medium text-[#222922]">{opt.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="h-4 w-px bg-[#E5DFC5] mx-1" />

        {/* Lists: Unordered, Ordered */}
        <div className="flex items-center gap-0.5 bg-white rounded-lg p-0.5 border border-[#E5DFC5]">
          <button
            type="button"
            onClick={() => executeCommand("insertUnorderedList")}
            className={`p-1.5 rounded transition-colors ${
              activeFormats.unorderedList
                ? "bg-[#354B35] text-white shadow-xs"
                : "text-[#4A584A] hover:bg-[#F2ECE1]"
            }`}
            title="Bullet List"
            aria-label="Bullet List"
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => executeCommand("insertOrderedList")}
            className={`p-1.5 rounded transition-colors ${
              activeFormats.orderedList
                ? "bg-[#354B35] text-white shadow-xs"
                : "text-[#4A584A] hover:bg-[#F2ECE1]"
            }`}
            title="Numbered List"
            aria-label="Numbered List"
          >
            <ListOrdered className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="h-4 w-px bg-[#E5DFC5] mx-1" />

        {/* Undo, Redo, Clear Formatting */}
        <div className="flex items-center gap-0.5 bg-white rounded-lg p-0.5 border border-[#E5DFC5]">
          <button
            type="button"
            onClick={() => executeCommand("undo")}
            className="p-1.5 rounded text-[#4A584A] hover:bg-[#F2ECE1] transition-colors"
            title="Undo (Ctrl/Cmd+Z)"
            aria-label="Undo"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => executeCommand("redo")}
            className="p-1.5 rounded text-[#4A584A] hover:bg-[#F2ECE1] transition-colors"
            title="Redo (Ctrl/Cmd+Y)"
            aria-label="Redo"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleClearFormatting}
            className="p-1.5 rounded text-[#4A584A] hover:bg-[#F2ECE1] transition-colors"
            title="Clear Formatting"
            aria-label="Clear Formatting"
          >
            <RemoveFormatting className="w-3.5 h-3.5 text-rose-600" />
          </button>
        </div>

        {/* View HTML Source Toggle */}
        <div className="ml-auto">
          <button
            type="button"
            onClick={() => setViewSource((v) => !v)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors ${
              viewSource
                ? "bg-[#354B35] text-white border-[#354B35]"
                : "bg-white text-[#4A584A] border-[#E5DFC5] hover:bg-[#F2ECE1]"
            }`}
            title={viewSource ? "Switch to Visual Editor" : "View HTML Source"}
          >
            {viewSource ? (
              <>
                <Eye className="w-3.5 h-3.5 text-[#DFC89B]" />
                <span>Visual</span>
              </>
            ) : (
              <>
                <Code className="w-3.5 h-3.5 text-[#B99A60]" />
                <span>HTML</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Editor Content Area */}
      {viewSource ? (
        <textarea
          rows={6}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full p-3 font-mono text-xs text-[#222922] bg-[#FAF8F5] focus:outline-none min-h-[140px] max-h-[220px] resize-y"
        />
      ) : (
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onBlur={handleInput}
          onKeyUp={updateActiveStates}
          onMouseUp={updateActiveStates}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          data-placeholder={placeholder}
          className="bento-rich-editor-content p-3.5 min-h-[140px] max-h-[220px] overflow-y-auto focus:outline-none text-xs sm:text-sm text-[#222922] leading-relaxed"
        />
      )}

      {/* Inline Scoped Styles for Editor Content */}
      <style jsx global>{`
        .bento-rich-editor-content:empty:before {
          content: attr(data-placeholder);
          color: #8A9A86;
          pointer-events: none;
        }
        .bento-rich-editor-content h2 {
          font-family: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;
          font-size: 1.15rem;
          font-weight: 700;
          color: #354B35;
          margin-top: 0.6rem;
          margin-bottom: 0.3rem;
          border-bottom: 1px solid #F0ECE1;
          padding-bottom: 0.2rem;
        }
        .bento-rich-editor-content h3 {
          font-family: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;
          font-size: 1rem;
          font-weight: 700;
          color: #222922;
          margin-top: 0.5rem;
          margin-bottom: 0.25rem;
        }
        .bento-rich-editor-content p {
          margin-top: 0.25rem;
          margin-bottom: 0.4rem;
          line-height: 1.5;
        }
        .bento-rich-editor-content ul {
          list-style-type: disc;
          padding-left: 1.25rem;
          margin-top: 0.3rem;
          margin-bottom: 0.4rem;
        }
        .bento-rich-editor-content ol {
          list-style-type: decimal;
          padding-left: 1.25rem;
          margin-top: 0.3rem;
          margin-bottom: 0.4rem;
        }
        .bento-rich-editor-content li {
          margin-bottom: 0.2rem;
        }
        .bento-rich-editor-content mark.bento-highlight-gold,
        .bento-highlight-gold {
          background-color: #FAF4E6;
          color: #7A612A;
          border: 1px solid #EADBBD;
          padding: 0.1rem 0.35rem;
          border-radius: 0.25rem;
          font-weight: 500;
        }
        .bento-rich-editor-content mark.bento-highlight-green,
        .bento-highlight-green {
          background-color: #EAF1EA;
          color: #253525;
          border: 1px solid #C5D8C5;
          padding: 0.1rem 0.35rem;
          border-radius: 0.25rem;
          font-weight: 500;
        }
        .bento-rich-editor-content mark.bento-highlight-amber,
        .bento-highlight-amber {
          background-color: #FEF3C7;
          color: #92400E;
          border: 1px solid #FDE68A;
          padding: 0.1rem 0.35rem;
          border-radius: 0.25rem;
          font-weight: 500;
        }
        .bento-rich-editor-content u {
          text-decoration: underline;
          text-decoration-color: #B99A60;
          text-decoration-thickness: 2px;
          text-underline-offset: 2px;
        }
      `}</style>
    </div>
  );
}
