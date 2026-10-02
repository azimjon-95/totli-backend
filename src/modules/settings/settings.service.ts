import { getSetting, setSetting } from '../notifications/settings.model.js';
import { env } from '../../config/env.js';
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

/** What `setBanner` accepts: slides may omit `id`/`kind` — `normalizeSlide` fills them in. */
export type BannerInput = Partial<Omit<BannerSettings, 'slides'>> & {
  slides?: Partial<BannerSlide>[];
};

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
  if (!url || !isSafeMediaUrl(url)) return null;

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
    posterUrl: isSafeMediaUrl(trimUrl(raw.posterUrl)) ? trimUrl(raw.posterUrl) : undefined,
    title: sanitizePlainText(String(raw.title ?? ''), 120) || undefined,
    subtitle: sanitizePlainText(String(raw.subtitle ?? ''), 300) || undefined,
    ctaText: sanitizePlainText(String(raw.ctaText ?? ''), 60) || undefined,
    ctaLink: isSafeLink(trimUrl(raw.ctaLink, 120)) ? trimUrl(raw.ctaLink, 120) : undefined,
    durationMs,
  };
}

/**
 * Only an `https://` URL is shown, and a link may only stay inside the app
 * (`/catalog`) or go to an `https://` address. This is also what the route
 * validates; repeating it here keeps stored data clean whatever calls in.
 */
export function isSafeMediaUrl(value: string): boolean {
  return /^https:\/\/\S+$/i.test(value);
}

export function isSafeLink(value: string): boolean {
  return /^\/(?!\/)\S*$/.test(value) || isSafeMediaUrl(value);
}

/**
 * Stored banner → what is served. A banner saved before slides existed still
 * carries an `imageUrl`; it is surfaced as one slide so the storefront only
 * ever deals with a single shape.
 */
export function resolveBanner(saved: Partial<BannerSettings> | null | undefined): BannerSettings {
  const banner: BannerSettings = { ...DEFAULT_BANNER, ...(saved ?? {}) };
  if (!Array.isArray(banner.slides)) banner.slides = [];

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
}

/**
 * Applies an admin's edit to the current banner.
 *
 * When the edit carries a `slides` list it is authoritative — including an
 * empty one, which clears the carousel — and the legacy `imageUrl` is retired,
 * otherwise an old image would reappear as a slide the admin had just removed.
 */
export function mergeBanner(current: BannerSettings, input: BannerInput): BannerSettings {
  const slidesGiven = Array.isArray(input.slides);

  const slides = slidesGiven
    ? input.slides!
        .slice(0, MAX_SLIDES)
        .map(normalizeSlide)
        .filter((slide): slide is BannerSlide => slide !== null)
    : current.slides;

  const ctaLink = trimUrl((input.ctaLink ?? current.ctaLink) || '/catalog', 120);

  return {
    title: sanitizePlainText(input.title ?? current.title, 120) || current.title,
    subtitle: sanitizePlainText(input.subtitle ?? current.subtitle, 300) || current.subtitle,
    imageUrl: slidesGiven ? '' : trimUrl(input.imageUrl ?? current.imageUrl, 500),
    ctaText: sanitizePlainText(input.ctaText ?? current.ctaText, 60) || current.ctaText,
    ctaLink: isSafeLink(ctaLink) ? ctaLink : '/catalog',
    slides,
  };
}

export const SettingsService = {
  /**
   * Contact phone lives in `.env`, not the database — it changes rarely and
   * shouldn't need a database round trip or an admin-panel form of its own.
   * Riding along on the banner response (already fetched on every home page
   * load) means the client needs no extra request for the phone button.
   */
  getContactPhone(): string | null {
    return env.CONTACT_PHONE || null;
  },

  /** The banner is edited in the TOTLI admin panel and stored in MongoDB — never taken from LokmaGo. */
  async getBanner(): Promise<BannerSettings> {
    return resolveBanner(await getSetting<Partial<BannerSettings>>('web_banner'));
  },

  async setBanner(input: BannerInput): Promise<BannerSettings> {
    const next = mergeBanner(await SettingsService.getBanner(), input);
    await setSetting('web_banner', next);
    return next;
  },
};
