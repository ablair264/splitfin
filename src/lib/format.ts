const BRAND_DISPLAY_NAMES: Record<string, string> = {
  'ppd PAPERPRODUCTS DESIGN GmbH': 'PPD',
};

export function formatBrand(brand: string): string {
  return BRAND_DISPLAY_NAMES[brand] || brand;
}

export function formatDate(
  date: Date | string | number | undefined,
  opts: Intl.DateTimeFormatOptions = {},
) {
  if (!date) return "";

  try {
    return new Intl.DateTimeFormat("en-US", {
      month: opts.month ?? "long",
      day: opts.day ?? "numeric",
      year: opts.year ?? "numeric",
      ...opts,
    }).format(new Date(date));
  } catch (_err) {
    return "";
  }
}
