import { api } from './apiClient';

export interface GeneratedDraft {
  title: string;
  excerpt: string;
  body: string;
  tags: string[];
  meta_title: string;
  meta_description: string;
}

export interface InlineHelperResult {
  html?: string;
  headings?: string[];
  meta_title?: string;
  meta_description?: string;
}

export const journalAIService = {
  async generateDraft(
    topic: string,
    brief?: string,
    tone?: string,
    wordCount?: number,
  ): Promise<GeneratedDraft> {
    return api.post<GeneratedDraft>('/api/ai/generate-journal-draft', {
      topic,
      brief,
      tone,
      wordCount,
    });
  },

  async inlineHelper(
    action: 'expand' | 'rewrite' | 'suggest_headings' | 'generate_seo',
    text: string,
    context?: string,
  ): Promise<InlineHelperResult> {
    return api.post<InlineHelperResult>('/api/ai/journal-inline-helper', {
      action,
      text,
      context,
    });
  },
};
