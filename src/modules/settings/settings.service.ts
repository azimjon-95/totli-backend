import { getSetting, setSetting } from '../notifications/settings.model.js';
import { sanitizePlainText } from '../../shared/sanitize.js';

export interface BannerSettings {
  title: string;
  subtitle: string;
  imageUrl: string;
  ctaText: string;
  ctaLink: string;
}

const DEFAULT_BANNER: BannerSettings = {
  title: 'Bugun siz uchun qanday tort?',
  subtitle: 'Mazali, nozik va betakror tortlarimiz bilan har demingizni shirin qiling.',
  imageUrl: '',
  ctaText: "Tortlarni ko'rish",
  ctaLink: '/catalog',
};

export const SettingsService = {
  async getBanner(): Promise<BannerSettings> {
    const saved = await getSetting<Partial<BannerSettings>>('web_banner');
    return { ...DEFAULT_BANNER, ...(saved || {}) };
  },

  async setBanner(input: Partial<BannerSettings>): Promise<BannerSettings> {
    const current = await this.getBanner();
    const next: BannerSettings = {
      title: sanitizePlainText(input.title ?? current.title, 120) || current.title,
      subtitle:
        sanitizePlainText(input.subtitle ?? current.subtitle, 300) || current.subtitle,
      imageUrl: String(input.imageUrl ?? current.imageUrl).trim().slice(0, 500),
      ctaText:
        sanitizePlainText(input.ctaText ?? current.ctaText, 60) || current.ctaText,
      ctaLink: String((input.ctaLink ?? current.ctaLink) || '/catalog')
        .trim()
        .slice(0, 120),
    };
    await setSetting('web_banner', next);
    return next;
  },
};
