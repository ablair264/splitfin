import { useCallback, useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import {
  ArrowLeft, Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Heading2, Heading3, List, ListOrdered, Quote, Link as LinkIcon,
  ImagePlus, AlignLeft, AlignCenter, AlignRight, Undo2, Redo2,
  Save, Send, Upload, X, Star, Eye, Loader2, Sparkles, Wand2,
  ChevronDown,
} from "lucide-react";
import { journalPostService } from "@/services/journalPostService";
import { websiteProductService } from "@/services/websiteProductService";
import { journalAIService } from "@/services/journalAIService";
import { usePageTitle } from "@/hooks/usePageTitle";
import type { JournalPost, WebsiteTag } from "@/types/domain";

export default function JournalPostEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id || id === "new";
  usePageTitle(isNew ? "New Post" : "Edit Post");

  const [post, setPost] = useState<JournalPost | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [author, setAuthor] = useState("Pop! Home");
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [coverAlt, setCoverAlt] = useState("");
  const [isFeatured, setIsFeatured] = useState(false);
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [status, setStatus] = useState<"draft" | "published" | "archived">("draft");

  // Tags
  const [allTags, setAllTags] = useState<WebsiteTag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);

  // AI state
  const [aiTopic, setAiTopic] = useState("");
  const [aiBrief, setAiBrief] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiHelperLoading, setAiHelperLoading] = useState<string | null>(null);
  const [aiPanelOpen, setAiPanelOpen] = useState(true);

  const coverInputRef = useRef<HTMLInputElement>(null);
  const inlineImageRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Image.configure({ inline: false, allowBase64: false }),
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: "Start writing your post..." }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: "",
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none focus:outline-none min-h-[400px] px-4 py-3",
      },
    },
  });

  // Load existing post
  useEffect(() => {
    if (isNew) return;
    async function load() {
      try {
        const data = await journalPostService.getById(Number(id));
        setPost(data);
        setTitle(data.title);
        setSlug(data.slug);
        setExcerpt(data.excerpt || "");
        setAuthor(data.author);
        setCoverImage(data.cover_image);
        setCoverAlt(data.cover_alt || "");
        setIsFeatured(data.is_featured);
        setMetaTitle(data.meta_title || "");
        setMetaDescription(data.meta_description || "");
        setStatus(data.status);
        setSelectedTagIds(data.tags?.map((t) => t.id) || []);
        if (editor && data.body) {
          editor.commands.setContent(data.body);
        }
      } catch (err) {
        console.error("Failed to load post:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, isNew, editor]);

  // Load tags
  useEffect(() => {
    websiteProductService.getTags().then(setAllTags).catch(console.error);
  }, []);

  // Auto-generate slug from title (only for new posts)
  useEffect(() => {
    if (!isNew || slug) return;
    const generated = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    setSlug(generated);
  }, [title, isNew]);

  const handleSave = useCallback(async (publishStatus?: "draft" | "published") => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const body = editor?.getHTML() || "";
      const data: Partial<JournalPost> = {
        title,
        slug,
        excerpt: excerpt || null,
        body,
        cover_image: coverImage,
        cover_alt: coverAlt || null,
        author,
        status: publishStatus || status,
        is_featured: isFeatured,
        meta_title: metaTitle || null,
        meta_description: metaDescription || null,
      };

      if (isNew) {
        const created = await journalPostService.create(data);
        if (selectedTagIds.length > 0) {
          await journalPostService.setPostTags(created.id, selectedTagIds);
        }
        navigate(`/website/journal/${created.id}`, { replace: true });
      } else {
        await journalPostService.update(Number(id), data);
        // Sync tags
        await journalPostService.setPostTags(Number(id), selectedTagIds);
        setPost((prev) => prev ? { ...prev, ...data, status: publishStatus || status } as JournalPost : null);
        setStatus(publishStatus || status);
      }
    } catch (err) {
      console.error("Failed to save post:", err);
    } finally {
      setSaving(false);
    }
  }, [title, slug, excerpt, author, coverImage, coverAlt, isFeatured, metaTitle, metaDescription, status, editor, isNew, id, selectedTagIds, navigate]);

  const handleCoverUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (isNew) {
      // For new posts, need to create first
      const created = await journalPostService.create({ title: title || "Untitled", status: "draft" });
      const result = await journalPostService.uploadImage(created.id, file, "cover");
      setCoverImage(result.image_url);
      navigate(`/website/journal/${created.id}`, { replace: true });
      return;
    }
    try {
      const result = await journalPostService.uploadImage(Number(id), file, "cover");
      setCoverImage(result.image_url);
    } catch (err) {
      console.error("Cover upload failed:", err);
    }
  }, [isNew, id, title, navigate]);

  const handleInlineImage = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editor || isNew) return;
    try {
      const result = await journalPostService.uploadImage(Number(id), file);
      editor.chain().focus().setImage({ src: result.image_url }).run();
    } catch (err) {
      console.error("Image upload failed:", err);
    }
  }, [editor, id, isNew]);

  const toggleTag = useCallback((tagId: number) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  }, []);

  const handleGenerateDraft = useCallback(async () => {
    if (!aiTopic.trim() || aiGenerating) return;
    setAiGenerating(true);
    try {
      const draft = await journalAIService.generateDraft(aiTopic, aiBrief || undefined);
      setTitle(draft.title);
      setExcerpt(draft.excerpt);
      if (editor) editor.commands.setContent(draft.body);
      if (draft.meta_title) setMetaTitle(draft.meta_title);
      if (draft.meta_description) setMetaDescription(draft.meta_description);
      // Auto-generate slug from AI title
      const generated = draft.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
      setSlug(generated);
      setAiTopic("");
      setAiBrief("");
    } catch (err) {
      console.error("AI draft generation failed:", err);
    } finally {
      setAiGenerating(false);
    }
  }, [aiTopic, aiBrief, aiGenerating, editor]);

  const handleInlineHelper = useCallback(async (action: 'expand' | 'rewrite' | 'suggest_headings' | 'generate_seo') => {
    if (!editor || aiHelperLoading) return;
    setAiHelperLoading(action);
    try {
      const text = action === 'generate_seo'
        ? (editor.getHTML() || title)
        : (editor.state.selection.empty ? editor.getHTML() : editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to));

      if (!text) return;

      const result = await journalAIService.inlineHelper(action, text);

      if (action === 'generate_seo') {
        if (result.meta_title) setMetaTitle(result.meta_title);
        if (result.meta_description) setMetaDescription(result.meta_description);
      } else if (action === 'suggest_headings' && result.headings) {
        // Insert headings as H2 structure at the end
        const headingsHtml = result.headings.map((h) => `<h2>${h}</h2><p></p>`).join('');
        editor.chain().focus().insertContentAt(editor.state.doc.content.size - 1, headingsHtml).run();
      } else if (result.html) {
        if (editor.state.selection.empty) {
          // Replace all content
          editor.commands.setContent(result.html);
        } else {
          // Replace selection
          editor.chain().focus().deleteSelection().insertContent(result.html).run();
        }
      }
    } catch (err) {
      console.error(`AI ${action} failed:`, err);
    } finally {
      setAiHelperLoading(null);
    }
  }, [editor, aiHelperLoading, title]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/website/journal")} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground">
            <ArrowLeft size={18} />
          </button>
          <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium capitalize ${
            status === "published" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
            : status === "archived" ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
            : "bg-muted text-muted-foreground border-border"
          }`}>
            {status}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {status !== "published" && (
            <button
              onClick={() => handleSave("draft")}
              disabled={saving || !title.trim()}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50"
            >
              <Save size={14} /> Save Draft
            </button>
          )}
          <button
            onClick={() => handleSave("published")}
            disabled={saving || !title.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {status === "published" ? "Update" : "Publish"}
          </button>
        </div>
      </div>

      {/* AI Assistant Panel — top of page */}
      <div className="border-b border-border bg-muted/30">
        <button
          onClick={() => setAiPanelOpen(!aiPanelOpen)}
          className="flex w-full items-center justify-between px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Sparkles size={15} className="text-primary" />
            <span>AI Assistant</span>
            <span className="text-[10px] text-muted-foreground font-normal">— generate drafts with real products, rewrite, expand</span>
          </div>
          <ChevronDown size={14} className={`text-muted-foreground transition-transform ${aiPanelOpen ? "rotate-180" : ""}`} />
        </button>

        {aiPanelOpen && (
          <div className="px-4 pb-3 space-y-3">
            {/* Generate draft row */}
            <div className="flex gap-3">
              <div className="flex-1 space-y-2">
                <input
                  type="text"
                  value={aiTopic}
                  onChange={(e) => setAiTopic(e.target.value)}
                  placeholder="Topic — e.g. 'Spring home refresh ideas', 'Gift guide for candle lovers'..."
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleGenerateDraft()}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <textarea
                  value={aiBrief}
                  onChange={(e) => setAiBrief(e.target.value)}
                  placeholder="Optional brief — specific angle, products to feature, key points to cover..."
                  rows={2}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                />
              </div>
              <button
                onClick={handleGenerateDraft}
                disabled={aiGenerating || !aiTopic.trim()}
                className="inline-flex items-center gap-1.5 self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 shrink-0"
              >
                {aiGenerating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                Generate Draft
              </button>
            </div>

            {/* Inline helper buttons */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground mr-1">Quick tools:</span>
              {([
                { action: 'expand' as const, label: 'Expand selection' },
                { action: 'rewrite' as const, label: 'Rewrite selection' },
                { action: 'suggest_headings' as const, label: 'Suggest headings' },
                { action: 'generate_seo' as const, label: 'Generate SEO' },
              ]).map(({ action, label }) => (
                <button
                  key={action}
                  onClick={() => handleInlineHelper(action)}
                  disabled={aiHelperLoading !== null}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-accent disabled:opacity-50 transition-colors"
                >
                  {aiHelperLoading === action ? <Loader2 size={11} className="animate-spin" /> : <Wand2 size={11} />}
                  {label}
                </button>
              ))}
            </div>

            {aiGenerating && (
              <p className="text-xs text-muted-foreground animate-pulse">Generating draft with real product recommendations...</p>
            )}
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Editor area (left) */}
        <div className="flex-1 flex flex-col overflow-y-auto">
          {/* Title input */}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Post title..."
            className="w-full border-0 bg-transparent px-6 pt-6 pb-2 text-2xl font-bold text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
          />

          {/* Toolbar */}
          {editor && (
            <div className="flex flex-wrap items-center gap-0.5 border-y border-border px-4 py-1.5">
              <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Bold"><Bold size={15} /></ToolbarButton>
              <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Italic"><Italic size={15} /></ToolbarButton>
              <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Underline"><UnderlineIcon size={15} /></ToolbarButton>
              <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")} title="Strikethrough"><Strikethrough size={15} /></ToolbarButton>
              <ToolbarDivider />
              <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} title="Heading 2"><Heading2 size={15} /></ToolbarButton>
              <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive("heading", { level: 3 })} title="Heading 3"><Heading3 size={15} /></ToolbarButton>
              <ToolbarDivider />
              <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Bullet list"><List size={15} /></ToolbarButton>
              <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Ordered list"><ListOrdered size={15} /></ToolbarButton>
              <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")} title="Blockquote"><Quote size={15} /></ToolbarButton>
              <ToolbarDivider />
              <ToolbarButton onClick={() => {
                const url = window.prompt("Link URL:");
                if (url) editor.chain().focus().setLink({ href: url }).run();
              }} active={editor.isActive("link")} title="Link"><LinkIcon size={15} /></ToolbarButton>
              <ToolbarButton onClick={() => inlineImageRef.current?.click()} title="Image"><ImagePlus size={15} /></ToolbarButton>
              <ToolbarDivider />
              <ToolbarButton onClick={() => editor.chain().focus().setTextAlign("left").run()} active={editor.isActive({ textAlign: "left" })} title="Align left"><AlignLeft size={15} /></ToolbarButton>
              <ToolbarButton onClick={() => editor.chain().focus().setTextAlign("center").run()} active={editor.isActive({ textAlign: "center" })} title="Align center"><AlignCenter size={15} /></ToolbarButton>
              <ToolbarButton onClick={() => editor.chain().focus().setTextAlign("right").run()} active={editor.isActive({ textAlign: "right" })} title="Align right"><AlignRight size={15} /></ToolbarButton>
              <ToolbarDivider />
              <ToolbarButton onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Undo"><Undo2 size={15} /></ToolbarButton>
              <ToolbarButton onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Redo"><Redo2 size={15} /></ToolbarButton>
            </div>
          )}

          {/* Editor content */}
          <div className="flex-1 px-2">
            <EditorContent editor={editor} />
          </div>
        </div>

        {/* Sidebar (right) */}
        <div className="w-80 shrink-0 border-l border-border overflow-y-auto">
          <div className="flex flex-col gap-5 p-4">
            {/* Cover image */}
            <SidebarSection title="Cover Image">
              {coverImage ? (
                <div className="relative">
                  <img src={coverImage} alt={coverAlt} className="w-full aspect-video rounded-md object-cover bg-muted" />
                  <button onClick={() => setCoverImage(null)} className="absolute top-1.5 right-1.5 p-1 rounded-full bg-background/80 hover:bg-background text-foreground">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => coverInputRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-1.5 w-full aspect-video rounded-md border-2 border-dashed border-border hover:border-primary/50 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Upload size={20} />
                  <span className="text-xs">Upload cover</span>
                </button>
              )}
              {coverImage && (
                <input
                  type="text"
                  value={coverAlt}
                  onChange={(e) => setCoverAlt(e.target.value)}
                  placeholder="Alt text..."
                  className="mt-2 w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              )}
            </SidebarSection>

            {/* Excerpt */}
            <SidebarSection title="Excerpt">
              <textarea
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
                placeholder="A brief summary..."
                rows={3}
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
            </SidebarSection>

            {/* Slug */}
            <SidebarSection title="Slug">
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="post-url-slug"
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </SidebarSection>

            {/* Author */}
            <SidebarSection title="Author">
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </SidebarSection>

            {/* Tags */}
            <SidebarSection title="Tags">
              <div className="flex flex-wrap gap-1.5">
                {allTags.map((tag) => (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(tag.id)}
                    className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors ${
                      selectedTagIds.includes(tag.id)
                        ? "bg-primary/20 text-primary border-primary/30"
                        : "bg-muted text-muted-foreground border-border hover:border-primary/30"
                    }`}
                  >
                    {tag.name}
                  </button>
                ))}
                {allTags.length === 0 && <span className="text-xs text-muted-foreground">No tags available</span>}
              </div>
            </SidebarSection>

            {/* Featured */}
            <SidebarSection title="Featured">
              <button
                onClick={() => setIsFeatured(!isFeatured)}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  isFeatured
                    ? "bg-primary/20 text-primary border-primary/30"
                    : "bg-muted text-muted-foreground border-border hover:border-primary/30"
                }`}
              >
                <Star size={13} className={isFeatured ? "fill-primary" : ""} />
                {isFeatured ? "Featured" : "Not featured"}
              </button>
            </SidebarSection>

            {/* SEO */}
            <SidebarSection title="SEO">
              <input
                type="text"
                value={metaTitle}
                onChange={(e) => setMetaTitle(e.target.value)}
                placeholder="Meta title..."
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring mb-2"
              />
              <textarea
                value={metaDescription}
                onChange={(e) => setMetaDescription(e.target.value)}
                placeholder="Meta description..."
                rows={2}
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
            </SidebarSection>

            {/* Status */}
            <SidebarSection title="Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </SidebarSection>

            {/* Preview link (only for published) */}
            {status === "published" && slug && (
              <a
                href={`https://pophome.co.uk/journal/${slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
              >
                <Eye size={13} /> View on site
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Hidden file inputs */}
      <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
      <input ref={inlineImageRef} type="file" accept="image/*" className="hidden" onChange={handleInlineImage} />
    </div>
  );
}

// Toolbar helpers
function ToolbarButton({
  onClick, active, disabled, title, children,
}: {
  onClick: () => void; active?: boolean; disabled?: boolean; title: string; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded-md transition-colors ${
        active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
      } ${disabled ? "opacity-30 cursor-not-allowed" : ""}`}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <div className="w-px h-5 bg-border mx-0.5" />;
}

function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{title}</h3>
      {children}
    </div>
  );
}
