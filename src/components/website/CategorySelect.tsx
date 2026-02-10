import { useState, useRef, useEffect, useCallback } from 'react';
import { Plus, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { websiteProductService } from '@/services/websiteProductService';
import type { WebsiteCategory } from '@/types/domain';

interface CategorySelectProps {
  categories: WebsiteCategory[];
  value: number | null;
  onChange: (categoryId: number | null) => void;
  onCategoryCreated: (category: WebsiteCategory) => void;
  className?: string;
  placeholder?: string;
}

export function CategorySelect({
  categories, value, onChange, onCategoryCreated, className, placeholder = 'Select category...',
}: CategorySelectProps) {
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showNew) inputRef.current?.focus();
  }, [showNew]);

  const handleCreate = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    setError(null);
    try {
      const category = await websiteProductService.createCategory(name);
      onCategoryCreated(category);
      onChange(category.id);
      setNewName('');
      setShowNew(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create category');
    } finally {
      setCreating(false);
    }
  }, [newName, onChange, onCategoryCreated]);

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === '__new__') {
      setShowNew(true);
      return;
    }
    onChange(val ? Number(val) : null);
  };

  if (showNew) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex gap-1.5">
          <input
            ref={inputRef}
            type="text"
            value={newName}
            onChange={(e) => { setNewName(e.target.value); setError(null); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') { setShowNew(false); setNewName(''); setError(null); }
            }}
            placeholder="Category name..."
            className={cn('flex-1 px-2 py-1.5 rounded-md bg-background border border-primary/40 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30', className)}
            disabled={creating}
          />
          <button
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
            className="px-2 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {creating ? <Loader2 size={12} className="animate-spin" /> : 'Add'}
          </button>
          <button
            onClick={() => { setShowNew(false); setNewName(''); setError(null); }}
            className="px-1.5 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <X size={12} />
          </button>
        </div>
        {error && <span className="text-[10px] text-destructive">{error}</span>}
      </div>
    );
  }

  return (
    <select
      value={value ?? ''}
      onChange={handleSelectChange}
      className={cn('w-full px-2 py-1.5 rounded-md bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50', className)}
    >
      <option value="">{placeholder}</option>
      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      <option value="__new__">+ Add New Category</option>
    </select>
  );
}
