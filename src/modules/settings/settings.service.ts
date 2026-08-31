import { getSetting, setSetting } from '../notifications/settings.model.js';
import { sanitizePlainText } from '../../shared/sanitize.js';

export type SlideKind = 'image' | 'video';

export interface BannerSlide {
  id: string;
  kind: SlideKind;
  /** Cloudinary URL of the image or video. */
  url: string;
  /** Poster frame for videos — shown while the file buffers. */
  posterUrl?: string;
  title?: string;
  subtitle?: string;
  ctaText?: string;
  ctaLink?: string;
  /**
   * How long an image stays on screen, in milliseconds. Ignored for videos:
   * those advance when playback ends, so the slide always matches the clip.
   */
  durationMs?: number;
}

export interface BannerSettings {
  /** Legacy single-slide fields — still served so old clients keep working. */
  title: string;
  subtitle: string;
  imageUrl: string;
  ctaText: string;
  ctaLink: string;
  slides: BannerSlide[];
}

const DEFAULT_BANNER: BannerSettings = {
  title: 'Bugun siz uchun qanday tort?',
  subtitle: 'Mazali, nozik va betakror tortlarimiz bilan har demingizni shirin qiling.',
  imageUrl: '',
  ctaText: "Tortlarni ko'rish",
  ctaLink: '/catalog',
  slides: [],
};

const MAX_SLIDES = 10;
const MIN_DURATION_MS = 2_000;
const MAX_DURATION_MS = 30_000;
const DEFAULT_IMAGE_DURATION_MS = 6_000;

function trimUrl(value: unknown, max = 600): string {
  return String(value ?? '')
    .trim()
    .slice(0, max);
}

function normalizeSlide(input: unknown, index: number): BannerSlide | null {
  if (typeof input !== 'object' || input === null) return null;
  const raw = input as Record<string, unknown>;

  const url = trimUrl(raw.url);
  if (!url) return null;

  const kind: SlideKind = raw.kind === 'video' ? 'video' : 'image';

  const duration = Number(raw.durationMs);
  const durationMs =
    kind === 'video'
      ? undefined
      : Math.min(
          MAX_DURATION_MS,
          Math.max(MIN_DURATION_MS, Number.isFinite(duration) ? duration : DEFAULT_IMAGE_DURATION_MS)
        );

  return {
    id: sanitizePlainText(String(raw.id ?? ''), 40) || `slide-${index + 1}`,
    kind,
    url,
    posterUrl: trimUrl(raw.posterUrl) || undefined,
    title: sanitizePlainText(String(raw.title ?? ''), 120) || undefined,
    subtitle: sanitizePlainText(String(raw.subtitle ?? ''), 300) || undefined,
    ctaText: sanitizePlainText(String(raw.ctaText ?? ''), 60) || undefined,
    ctaLink: trimUrl(raw.ctaLink, 120) || undefined,
    durationMs,
  };
}

export const SettingsService = {
  async getBanner(): Promise<BannerSettings> {
    const saved = await getSetting<Partial<BannerSettings>>('web_banner');
    const banner = { ...DEFAULT_BANNER, ...(saved || {}) };

    // A banner saved before slides existed still has an imageUrl; surface it
    // as a single slide so the storefront only ever deals with one shape.
    if (banner.slides.length === 0 && banner.imageUrl) {
      banner.slides = [
        {
          id: 'legacy',
          kind: 'image',
          url: banner.imageUrl,
          title: banner.title,
          subtitle: banner.subtitle,
          ctaText: banner.ctaText,
          ctaLink: banner.ctaLink,
          durationMs: DEFAULT_IMAGE_DURATION_MS,
        },
      ];
    }

    return banner;
  },

  async setBanner(input: Partial<BannerSettings>): Promise<BannerSettings> {
    const current = await this.getBanner();

    const slides = Array.isArray(input.slides)
      ? input.slides
          .slice(0, MAX_SLIDES)
          .map(normalizeSlide)
          .filter((s): s is BannerSlide => s !== null)
      : current.slides;

    const next: BannerSettings = {
      title: sanitizePlainText(input.title ?? current.title, 120) || current.title,
      subtitle: sanitizePlainText(input.subtitle ?? current.subtitle, 300) || current.subtitle,
      imageUrl: trimUrl(input.imageUrl ?? current.imageUrl, 500),
      ctaText: sanitizePlainText(input.ctaText ?? current.ctaText, 60) || current.ctaText,
      ctaLink: trimUrl((input.ctaLink ?? current.ctaLink) || '/catalog', 120),
      slides,
    };

    await setSetting('web_banner', next);
    return next;
  },
};
