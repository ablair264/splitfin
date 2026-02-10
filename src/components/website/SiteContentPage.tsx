import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, Upload, ChevronDown, ChevronRight, Image as ImageIcon, Video, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { siteContentService } from '@/services/siteContentService';
import { usePageTitle } from '@/hooks/usePageTitle';
import PageHeader from '@/components/shared/PageHeader';
import type { SiteSection } from '@/types/domain';

function isRemoteUrl(url: string | null | undefined): boolean {
  return !!url && url.startsWith('http');
}

interface CategoryHero {
  id: number;
  name: string;
  slug: string;
  hero_image_url: string | null;
  hero_placeholder: string | null;
}

// ── Image Upload Button ──────────────────────────────────────
function ImageUploadButton({
  onUpload,
  uploading,
  label = 'Upload Image',
  className,
}: {
  onUpload: (file: File) => void;
  uploading: boolean;
  label?: string;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) onUpload(file);
        e.target.value = '';
      }} />
      <button
        onClick={() => ref.current?.click()}
        disabled={uploading}
        className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-dashed border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground hover:bg-primary/5 transition-all disabled:opacity-50', className)}
      >
        {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
        {label}
      </button>
    </>
  );
}

// ── Collapsible Section ──────────────────────────────────────
function Section({
  title,
  count,
  defaultOpen = true,
  children,
}: {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-border/40 bg-card/50">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-5 py-4 text-left"
      >
        <div className="flex items-center gap-3">
          {open ? <ChevronDown size={16} className="text-muted-foreground" /> : <ChevronRight size={16} className="text-muted-foreground" />}
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <span className="text-[10px] font-medium text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">{count}</span>
        </div>
      </button>
      {open && <div className="px-5 pb-5 space-y-4">{children}</div>}
    </div>
  );
}

// ── Hero Slide Card ──────────────────────────────────────────
function HeroSlideCard({
  item,
  onSave,
  onUploadImage,
}: {
  item: SiteSection;
  onSave: (id: number, data: Partial<SiteSection>) => Promise<void>;
  onUploadImage: (id: number, file: File) => Promise<void>;
}) {
  const [form, setForm] = useState({
    title: item.title || '',
    subtitle: item.subtitle || '',
    cta_label: item.cta_label || '',
    cta_link: item.cta_link || '',
    secondary_cta_label: item.secondary_cta_label || '',
    secondary_cta_link: item.secondary_cta_link || '',
    placeholder_gradient: item.placeholder_gradient || '',
    overlay_position: item.overlay_position || 'left',
    text_colour: item.text_colour || 'light',
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imageUrl, setImageUrl] = useState(item.image_url);

  const handleSave = async () => {
    setSaving(true);
    try { await onSave(item.id, form); } finally { setSaving(false); }
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      await onUploadImage(item.id, file);
    } finally { setUploading(false); }
  };

  // Sync image_url from parent when it changes (after upload)
  useEffect(() => { setImageUrl(item.image_url); }, [item.image_url]);

  return (
    <div className="rounded-lg border border-border/30 bg-background/50 p-4">
      <div className="flex gap-4">
        {/* Image preview */}
        <div className="shrink-0 w-48 h-28 rounded-lg overflow-hidden border border-border/30 relative">
          {isRemoteUrl(imageUrl) ? (
            <img src={imageUrl!} alt="" className="w-full h-full object-cover" />
          ) : imageUrl ? (
            <div className="w-full h-full bg-muted/20 flex flex-col items-center justify-center px-2">
              <ImageIcon size={16} className="text-muted-foreground/40 mb-1" />
              <span className="text-[9px] text-muted-foreground/50 text-center truncate w-full">Local: {imageUrl}</span>
            </div>
          ) : form.placeholder_gradient ? (
            <div className={cn('w-full h-full', form.placeholder_gradient)} />
          ) : (
            <div className="w-full h-full bg-muted/30 flex items-center justify-center">
              <ImageIcon size={20} className="text-muted-foreground/30" />
            </div>
          )}
          <div className="absolute bottom-1 right-1">
            <ImageUploadButton onUpload={handleUpload} uploading={uploading} label="" className="px-1.5 py-1 bg-card/80 backdrop-blur-sm border-border/40" />
          </div>
        </div>

        {/* Fields */}
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50 w-10">Key</span>
            <span className="text-xs font-mono text-muted-foreground">{item.slot_key}</span>
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">Title</label>
            <textarea
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              rows={2}
              className="w-full mt-0.5 px-2 py-1 rounded-md bg-background border border-border/50 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">Subtitle</label>
            <input
              value={form.subtitle}
              onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
              className="w-full mt-0.5 px-2 py-1 rounded-md bg-background border border-border/50 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">CTA Label</label>
              <input value={form.cta_label} onChange={(e) => setForm({ ...form, cta_label: e.target.value })} className="w-full mt-0.5 px-2 py-1 rounded-md bg-background border border-border/50 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30" />
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">CTA Link</label>
              <input value={form.cta_link} onChange={(e) => setForm({ ...form, cta_link: e.target.value })} className="w-full mt-0.5 px-2 py-1 rounded-md bg-background border border-border/50 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary/30" />
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">2nd CTA Label</label>
              <input value={form.secondary_cta_label} onChange={(e) => setForm({ ...form, secondary_cta_label: e.target.value })} className="w-full mt-0.5 px-2 py-1 rounded-md bg-background border border-border/50 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30" />
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">2nd CTA Link</label>
              <input value={form.secondary_cta_link} onChange={(e) => setForm({ ...form, secondary_cta_link: e.target.value })} className="w-full mt-0.5 px-2 py-1 rounded-md bg-background border border-border/50 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary/30" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">Gradient Class</label>
              <input value={form.placeholder_gradient} onChange={(e) => setForm({ ...form, placeholder_gradient: e.target.value })} className="w-full mt-0.5 px-2 py-1 rounded-md bg-background border border-border/50 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary/30" placeholder="bg-cream-100" />
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">Overlay Pos</label>
              <select value={form.overlay_position} onChange={(e) => setForm({ ...form, overlay_position: e.target.value })} className="w-full mt-0.5 px-2 py-1 rounded-md bg-background border border-border/50 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30">
                <option value="left">Left</option>
                <option value="center">Center</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">Text Colour</label>
              <select value={form.text_colour} onChange={(e) => setForm({ ...form, text_colour: e.target.value })} className="w-full mt-0.5 px-2 py-1 rounded-md bg-background border border-border/50 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30">
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>
          </div>
        </div>
      </div>
      <div className="flex justify-end mt-3">
        <Button intent="primary" size="sm" onPress={handleSave} isDisabled={saving}>
          {saving ? <Loader2 size={12} className="animate-spin mr-1" /> : <Save size={12} className="mr-1" />}
          Save
        </Button>
      </div>
    </div>
  );
}

// ── Category Grid Card ───────────────────────────────────────
function CategoryGridCard({
  item,
  onSave,
  onUploadImage,
  onUploadPoster,
}: {
  item: SiteSection;
  onSave: (id: number, data: Partial<SiteSection>) => Promise<void>;
  onUploadImage: (id: number, file: File) => Promise<void>;
  onUploadPoster: (id: number, file: File) => Promise<void>;
}) {
  const [form, setForm] = useState({
    title: item.title || '',
    video_url: item.video_url || '',
    image_alt: item.image_alt || '',
  });
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingPoster, setUploadingPoster] = useState(false);

  const hasVideo = !!item.video_url || !!form.video_url;

  const handleSave = async () => {
    setSaving(true);
    try { await onSave(item.id, form); } finally { setSaving(false); }
  };

  return (
    <div className="rounded-lg border border-border/30 bg-background/50 p-4">
      <div className="flex gap-4">
        {/* Preview */}
        <div className="shrink-0 w-32 h-40 rounded-lg overflow-hidden border border-border/30 relative">
          {isRemoteUrl(item.image_url) ? (
            <img src={item.image_url!} alt="" className="w-full h-full object-cover" />
          ) : item.image_url ? (
            <div className="w-full h-full bg-muted/20 flex flex-col items-center justify-center px-2">
              <ImageIcon size={16} className="text-muted-foreground/40 mb-1" />
              <span className="text-[9px] text-muted-foreground/50 text-center leading-tight break-all line-clamp-3">Local file</span>
            </div>
          ) : hasVideo ? (
            <div className="w-full h-full bg-muted/30 flex items-center justify-center">
              <Video size={20} className="text-muted-foreground/30" />
            </div>
          ) : (
            <div className="w-full h-full bg-muted/30 flex items-center justify-center">
              <ImageIcon size={20} className="text-muted-foreground/30" />
            </div>
          )}
          <div className="absolute bottom-1 right-1">
            <ImageUploadButton
              onUpload={async (file) => { setUploadingImage(true); try { await onUploadImage(item.id, file); } finally { setUploadingImage(false); } }}
              uploading={uploadingImage}
              label=""
              className="px-1.5 py-1 bg-card/80 backdrop-blur-sm border-border/40"
            />
          </div>
        </div>

        {/* Fields */}
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">Slug</span>
            <span className="text-xs font-mono text-muted-foreground">/category/{item.slot_key}</span>
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">Title</label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full mt-0.5 px-2 py-1 rounded-md bg-background border border-border/50 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30" />
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">Alt Text</label>
            <input value={form.image_alt} onChange={(e) => setForm({ ...form, image_alt: e.target.value })} className="w-full mt-0.5 px-2 py-1 rounded-md bg-background border border-border/50 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30" placeholder="Image description..." />
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">Video URL (optional)</label>
            <input value={form.video_url} onChange={(e) => setForm({ ...form, video_url: e.target.value })} className="w-full mt-0.5 px-2 py-1 rounded-md bg-background border border-border/50 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary/30" placeholder="/videos/example.mp4" />
          </div>
          {hasVideo && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground/60">Poster:</span>
              {item.poster_url ? (
                <img src={item.poster_url} alt="" className="w-8 h-8 rounded object-cover border border-border/30" />
              ) : (
                <span className="text-[10px] text-muted-foreground/40">None</span>
              )}
              <ImageUploadButton
                onUpload={async (file) => { setUploadingPoster(true); try { await onUploadPoster(item.id, file); } finally { setUploadingPoster(false); } }}
                uploading={uploadingPoster}
                label="Poster"
                className="text-[10px]"
              />
            </div>
          )}
        </div>
      </div>
      <div className="flex justify-end mt-3">
        <Button intent="primary" size="sm" onPress={handleSave} isDisabled={saving}>
          {saving ? <Loader2 size={12} className="animate-spin mr-1" /> : <Save size={12} className="mr-1" />}
          Save
        </Button>
      </div>
    </div>
  );
}

// ── Category Hero Card ───────────────────────────────────────
function CategoryHeroCard({
  category,
  onUploadHeroImage,
  onSave,
}: {
  category: CategoryHero;
  onUploadHeroImage: (categoryId: number, file: File) => Promise<void>;
  onSave: (categoryId: number, data: { hero_placeholder?: string }) => Promise<void>;
}) {
  const [placeholder, setPlaceholder] = useState(category.hero_placeholder || '');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [heroUrl, setHeroUrl] = useState(category.hero_image_url);

  useEffect(() => { setHeroUrl(category.hero_image_url); }, [category.hero_image_url]);

  return (
    <div className="rounded-lg border border-border/30 bg-background/50 p-4 flex gap-4 items-center">
      {/* Preview */}
      <div className="shrink-0 w-36 h-20 rounded-lg overflow-hidden border border-border/30 relative">
        {isRemoteUrl(heroUrl) ? (
          <img src={heroUrl!} alt="" className="w-full h-full object-cover" />
        ) : heroUrl ? (
          <div className="w-full h-full bg-muted/20 flex flex-col items-center justify-center px-2">
            <ImageIcon size={14} className="text-muted-foreground/40 mb-0.5" />
            <span className="text-[9px] text-muted-foreground/50 text-center">Local file</span>
          </div>
        ) : placeholder ? (
          <div className={cn('w-full h-full', placeholder)} />
        ) : (
          <div className="w-full h-full bg-muted/30 flex items-center justify-center">
            <ImageIcon size={16} className="text-muted-foreground/30" />
          </div>
        )}
        <div className="absolute bottom-1 right-1">
          <ImageUploadButton
            onUpload={async (file) => { setUploading(true); try { await onUploadHeroImage(category.id, file); } finally { setUploading(false); } }}
            uploading={uploading}
            label=""
            className="px-1.5 py-1 bg-card/80 backdrop-blur-sm border-border/40"
          />
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-medium text-foreground">{category.name}</h4>
        <span className="text-[10px] font-mono text-muted-foreground">/category/{category.slug}</span>
        <div className="mt-1.5">
          <label className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">Placeholder Class</label>
          <input
            value={placeholder}
            onChange={(e) => setPlaceholder(e.target.value)}
            className="w-full mt-0.5 px-2 py-1 rounded-md bg-background border border-border/50 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary/30"
            placeholder="bg-cream-200"
          />
        </div>
      </div>

      <Button intent="primary" size="sm" onPress={async () => { setSaving(true); try { await onSave(category.id, { hero_placeholder: placeholder }); } finally { setSaving(false); } }} isDisabled={saving}>
        {saving ? <Loader2 size={12} className="animate-spin mr-1" /> : <Save size={12} className="mr-1" />}
        Save
      </Button>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────
export default function SiteContentPage() {
  usePageTitle('Site Content');

  const [sections, setSections] = useState<SiteSection[]>([]);
  const [categories, setCategories] = useState<CategoryHero[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [sectionsRes, catsRes] = await Promise.allSettled([
        siteContentService.list(),
        siteContentService.getCategories(),
      ]);
      if (sectionsRes.status === 'fulfilled') setSections(sectionsRes.value.data);
      else console.error('Failed to load sections:', sectionsRes.reason);
      if (catsRes.status === 'fulfilled') setCategories(catsRes.value as CategoryHero[]);
      else console.error('Failed to load categories:', catsRes.reason);
    } catch (err) {
      console.error('Failed to load site content:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const heroSlides = sections.filter((s) => s.section === 'hero_slides').sort((a, b) => a.display_order - b.display_order);
  const gridItems = sections.filter((s) => s.section === 'category_grid').sort((a, b) => a.display_order - b.display_order);

  const handleSaveSection = useCallback(async (id: number, data: Partial<SiteSection>) => {
    await siteContentService.update(id, data);
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...data, updated_at: new Date().toISOString() } : s)));
  }, []);

  const handleUploadImage = useCallback(async (id: number, file: File) => {
    const result = await siteContentService.uploadImage(id, file);
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, image_url: result.image_url } : s)));
  }, []);

  const handleUploadPoster = useCallback(async (id: number, file: File) => {
    const result = await siteContentService.uploadPoster(id, file);
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, poster_url: result.poster_url } : s)));
  }, []);

  const handleUploadCategoryHero = useCallback(async (categoryId: number, file: File) => {
    const result = await siteContentService.uploadCategoryHeroImage(categoryId, file);
    setCategories((prev) => prev.map((c) => (c.id === categoryId ? { ...c, hero_image_url: result.hero_image_url } : c)));
  }, []);

  const handleSaveCategory = useCallback(async (categoryId: number, data: { hero_placeholder?: string }) => {
    await siteContentService.updateCategory(categoryId, data);
    setCategories((prev) => prev.map((c) => (c.id === categoryId ? { ...c, ...data } : c)));
  }, []);

  if (loading) {
    return (
      <div>
        <PageHeader title="Site Content" />
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Site Content"
        subtitle="Manage homepage sections and category heroes"
      />

      <div className="space-y-4 mt-4">
        <Section title="Hero Carousel" count={heroSlides.length}>
          {heroSlides.map((item) => (
            <HeroSlideCard
              key={item.id}
              item={item}
              onSave={handleSaveSection}
              onUploadImage={handleUploadImage}
            />
          ))}
        </Section>

        <Section title="Category Grid" count={gridItems.length}>
          {gridItems.map((item) => (
            <CategoryGridCard
              key={item.id}
              item={item}
              onSave={handleSaveSection}
              onUploadImage={handleUploadImage}
              onUploadPoster={handleUploadPoster}
            />
          ))}
        </Section>

        <Section title="Category Page Heroes" count={categories.length}>
          {categories.map((cat) => (
            <CategoryHeroCard
              key={cat.id}
              category={cat}
              onUploadHeroImage={handleUploadCategoryHero}
              onSave={handleSaveCategory}
            />
          ))}
        </Section>
      </div>
    </div>
  );
}
