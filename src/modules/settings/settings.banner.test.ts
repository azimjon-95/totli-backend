import '../../test/env.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isSafeLink,
  isSafeMediaUrl,
  mergeBanner,
  resolveBanner,
  type BannerSettings,
} from './settings.service.js';
import { bannerSchema } from './settings.routes.js';

const IMG = 'https://res.cloudinary.com/x/image/upload/v1/totli/images/a.jpg';
const VID = 'https://res.cloudinary.com/x/video/upload/v1/totli/videos/a.mp4';
const POSTER = 'https://res.cloudinary.com/x/video/upload/v1/totli/videos/a.jpg';

const base = (): BannerSettings => resolveBanner(null);

describe('banner payload (what the admin panel sends)', () => {
  it('accepts a mix of image and video slides — the shape that used to be silently dropped', () => {
    const parsed = bannerSchema.safeParse({
      title: 'T',
      slides: [
        { id: 'a', kind: 'image', url: IMG, durationMs: 5000, title: 'Hello', ctaText: 'Go', ctaLink: '/catalog' },
        { id: 'b', kind: 'video', url: VID, posterUrl: POSTER },
      ],
    });
    assert.equal(parsed.success, true);
    assert.equal(parsed.data?.slides?.length, 2, 'slides survive validation');
  });

  it('accepts an empty slide list (clearing the carousel)', () => {
    assert.equal(bannerSchema.safeParse({ slides: [] }).success, true);
  });

  it('rejects a slide whose media is not an https URL', () => {
    for (const url of ['http://x/a.jpg', 'javascript:alert(1)', 'data:image/png;base64,AAA', '//x/a.jpg', 'a.jpg', '']) {
      assert.equal(bannerSchema.safeParse({ slides: [{ url }] }).success, false, url);
    }
  });

  it('rejects a poster that is not https either', () => {
    assert.equal(bannerSchema.safeParse({ slides: [{ url: VID, posterUrl: 'http://x/p.jpg' }] }).success, false);
  });

  it('allows links inside the app or to https, and nothing else', () => {
    for (const ctaLink of ['/catalog', '/category/toy', 'https://t.me/totli', '']) {
      assert.equal(bannerSchema.safeParse({ ctaLink }).success, true, ctaLink);
    }
    for (const ctaLink of ['javascript:alert(1)', '//evil.example', 'http://x', 'catalog']) {
      assert.equal(bannerSchema.safeParse({ ctaLink }).success, false, ctaLink);
    }
  });

  it('allows at most 10 slides', () => {
    const slides = (n: number) => Array.from({ length: n }, () => ({ url: IMG }));
    assert.equal(bannerSchema.safeParse({ slides: slides(10) }).success, true);
    assert.equal(bannerSchema.safeParse({ slides: slides(11) }).success, false);
  });

  it('rejects over-long text', () => {
    assert.equal(bannerSchema.safeParse({ title: 'x'.repeat(121) }).success, false);
    assert.equal(bannerSchema.safeParse({ slides: [{ url: IMG, subtitle: 'x'.repeat(301) }] }).success, false);
  });
});

describe('mergeBanner — slides', () => {
  const merge = (slides: unknown[], current = base()) =>
    mergeBanner(current, { slides: slides as never });

  it('keeps images and videos apart, in the order given', () => {
    const { slides } = merge([{ url: IMG }, { kind: 'video', url: VID }, { url: IMG }]);
    assert.deepEqual(
      slides.map((s) => s.kind),
      ['image', 'video', 'image']
    );
  });

  it('gives a video no duration — it ends when the clip does', () => {
    const [video] = merge([{ kind: 'video', url: VID, durationMs: 9000 }]).slides;
    assert.equal(video.durationMs, undefined);
  });

  it('keeps an image on screen between 2 and 30 seconds', () => {
    const durations = merge([
      { url: IMG, durationMs: 100 },
      { url: IMG, durationMs: 6000 },
      { url: IMG, durationMs: 999_999 },
      { url: IMG },
      { url: IMG, durationMs: 'soon' },
    ]).slides.map((s) => s.durationMs);
    assert.deepEqual(durations, [2000, 6000, 30000, 6000, 6000]);
  });

  it('numbers slides that have no id', () => {
    const ids = merge([{ url: IMG }, { id: 'mine', url: IMG }]).slides.map((s) => s.id);
    assert.deepEqual(ids, ['slide-1', 'mine']);
  });

  it('drops slides with no usable media instead of failing the whole save', () => {
    const { slides } = merge([{ url: IMG }, { url: 'http://insecure/a.jpg' }, { url: '' }, null, 'junk', { url: VID, kind: 'video' }]);
    assert.deepEqual(
      slides.map((s) => s.url),
      [IMG, VID]
    );
  });

  it('keeps at most 10', () => {
    assert.equal(merge(Array.from({ length: 14 }, () => ({ url: IMG }))).slides.length, 10);
  });

  it('only keeps a poster that is https, and a link that is safe', () => {
    const [good, bad] = merge([
      { kind: 'video', url: VID, posterUrl: POSTER, ctaLink: '/catalog' },
      { kind: 'video', url: VID, posterUrl: 'http://x/p.jpg', ctaLink: 'javascript:alert(1)' },
    ]).slides;
    assert.equal(good.posterUrl, POSTER);
    assert.equal(good.ctaLink, '/catalog');
    assert.equal(bad.posterUrl, undefined);
    assert.equal(bad.ctaLink, undefined);
  });

  it('leaves the existing slides alone when an edit does not mention them', () => {
    const withSlides = merge([{ url: IMG }, { kind: 'video', url: VID }]);
    const edited = mergeBanner(withSlides, { title: 'New headline' });
    assert.equal(edited.title, 'New headline');
    assert.deepEqual(edited.slides, withSlides.slides);
  });

  it('clears the carousel when given an empty list', () => {
    const withSlides = merge([{ url: IMG }]);
    assert.deepEqual(mergeBanner(withSlides, { slides: [] }).slides, []);
  });
});

describe('legacy imageUrl', () => {
  const legacy = resolveBanner({ imageUrl: IMG, title: 'Old', ctaText: 'Go', ctaLink: '/x' });

  it('is served as a single slide, so old banners keep working', () => {
    assert.equal(legacy.slides.length, 1);
    assert.equal(legacy.slides[0].id, 'legacy');
    assert.equal(legacy.slides[0].url, IMG);
    assert.equal(legacy.slides[0].title, 'Old');
  });

  it('does not come back after the admin removes every slide', () => {
    const cleared = mergeBanner(legacy, { slides: [] });
    assert.equal(cleared.imageUrl, '');
    assert.deepEqual(resolveBanner(cleared).slides, [], 'no resurrected "legacy" slide');
  });

  it('is retired as soon as real slides are saved', () => {
    const saved = mergeBanner(legacy, { slides: [{ url: VID, kind: 'video' }] });
    assert.equal(saved.imageUrl, '');
    assert.equal(resolveBanner(saved).slides.length, 1);
  });
});

describe('mergeBanner — fallback text', () => {
  it('changes only what is given', () => {
    const current = base();
    const next = mergeBanner(current, { subtitle: 'Fresh' });
    assert.equal(next.subtitle, 'Fresh');
    assert.equal(next.title, current.title);
    assert.equal(next.ctaLink, current.ctaLink);
  });

  it('falls back to /catalog for a link that is not safe', () => {
    assert.equal(mergeBanner(base(), { ctaLink: 'javascript:alert(1)' }).ctaLink, '/catalog');
    assert.equal(mergeBanner(base(), { ctaLink: '//evil.example' }).ctaLink, '/catalog');
    assert.equal(mergeBanner(base(), { ctaLink: '/category/toy' }).ctaLink, '/category/toy');
  });

  it('has working defaults before anything is saved', () => {
    const fresh = base();
    assert.ok(fresh.title);
    assert.equal(fresh.ctaLink, '/catalog');
    assert.deepEqual(fresh.slides, []);
  });
});

describe('url helpers', () => {
  it('isSafeMediaUrl: https only, no whitespace', () => {
    assert.equal(isSafeMediaUrl(IMG), true);
    assert.equal(isSafeMediaUrl('HTTPS://X.COM/A'), true);
    assert.equal(isSafeMediaUrl('http://x.com/a'), false);
    assert.equal(isSafeMediaUrl('https://x.com/a b'), false);
    assert.equal(isSafeMediaUrl(''), false);
  });
  it('isSafeLink: in-app path or https', () => {
    assert.equal(isSafeLink('/'), true);
    assert.equal(isSafeLink('/catalog?x=1'), true);
    assert.equal(isSafeLink('//evil'), false);
    assert.equal(isSafeLink('catalog'), false);
  });
});
