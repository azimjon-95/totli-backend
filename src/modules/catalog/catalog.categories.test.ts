import '../../test/env.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_CATEGORIES,
  matchAppCategory,
  normalizeSectionKey,
  organizeCatalog,
} from './catalog.categories.js';
import { buildCatalog } from '../../infrastructure/lokmago/lokmago.mapper.js';
import { dish, lokmagoExport } from '../../test/fixtures/lokmago.js';

const slugOf = (section: string) => matchAppCategory(section)?.slug;

describe('matchAppCategory — LokmaGo sections onto the storefront categories', () => {
  it('maps every section in the live export', () => {
    assert.equal(slugOf('Bayram tortlari'), 'bayram');
    assert.equal(slugOf('Bentolar'), 'bento');
    assert.equal(slugOf('Bolalar tortlari'), 'bolalar');
    assert.equal(slugOf('Setlar'), 'set');
    assert.equal(slugOf("To'y tortlari"), 'toy');
    assert.equal(slugOf("Tug'ilgan kun tortlari"), 'tugilgan-kun');
    assert.equal(slugOf('Unashtiruv tortlari'), 'unashtiruv');
  });

  it('leaves a section with no matching category unmatched', () => {
    assert.equal(slugOf('Milliy taom'), undefined);
    assert.equal(slugOf('Boshqa'), undefined);
  });

  it('ignores case, spacing and every Uzbek apostrophe', () => {
    for (const apostrophe of ["'", '‘', '’', 'ʻ', 'ʼ', '`', '']) {
      assert.equal(slugOf(`  TO${apostrophe}Y   Tortlari `), 'toy', `apostrophe: "${apostrophe}"`);
      assert.equal(slugOf(`Tug${apostrophe}ilgan kun`), 'tugilgan-kun');
    }
  });

  it('accepts the section with or without its "tortlari"-style ending', () => {
    for (const name of ["To'y", "To'y torti", "To'y tortlari", "To'y tortlar"]) {
      assert.equal(slugOf(name), 'toy', name);
    }
    assert.equal(slugOf('Barcha bayram tortlari'), 'bayram');
    assert.equal(slugOf('Yangi yil tortlari'), 'yangi-yil');
    assert.equal(slugOf('Korporativ tortlar'), 'korporativ');
  });

  it('recognises Russian names', () => {
    assert.equal(slugOf('Свадебные торты'), 'toy');
    assert.equal(slugOf('Детские торты'), 'bolalar');
  });

  it('does not match on a word that merely appears inside a longer name', () => {
    assert.equal(slugOf("Bayramga sovg'alar to'plami"), undefined);
    assert.equal(slugOf('Setlar va aksessuarlar'), undefined);
  });

  it('normalises keys', () => {
    assert.equal(normalizeSectionKey('  To‘y  Tortlari! '), 'toy tortlari');
  });
});

describe('organizeCatalog', () => {
  const source = buildCatalog(lokmagoExport());
  const organized = organizeCatalog(source);
  const cat = (slug: string) => organized.categories.find((c) => c.slug === slug)!;
  const product = (id: string) => organized.products.find((p) => p._id === id)!;

  it('lists all storefront categories first, in their own order, even when empty', () => {
    const slugs = organized.categories.map((c) => c.slug);
    assert.deepEqual(slugs.slice(0, APP_CATEGORIES.length), APP_CATEGORIES.map((c) => c.slug));
    assert.equal(cat('yangi-yil').totalCount, 0, 'no LokmaGo section matches it, but it exists');
    assert.equal(cat('korporativ').availableCount, 0);
  });

  it('shows a section that matches no category as its own, after the storefront ones', () => {
    const milliy = organized.categories.find((c) => c.name.uz === 'Milliy taom')!;
    assert.equal(milliy.kind, 'extra');
    assert.equal(milliy.slug, 'milliy-taom');
    assert.equal(milliy.sortOrder, APP_CATEGORIES.length);
    assert.equal(milliy.totalCount, 3);
    assert.equal(milliy.availableCount, 0);
    assert.equal(organized.categories.at(-1), milliy);
  });

  it('files dishes under the matched storefront category', () => {
    const rafaelo = product('6aa076f3f31bf39e960645e3');
    assert.equal(rafaelo.categorySlug, 'bayram');
    assert.equal(rafaelo.categoryId, 'bayram');
    assert.equal(rafaelo.categorySource, 'auto');
    assert.equal(rafaelo.autoCategorySlug, 'bayram');
    assert.equal(rafaelo.section, 'Bayram tortlari', 'the LokmaGo section is kept');
  });

  it('merges several sections that match one category', () => {
    const merged = organizeCatalog(
      buildCatalog(
        lokmagoExport({
          dishes: [
            dish('a', "To'y tortlari", 'A', 1),
            dish('b', "To'y torti", 'B', 1),
            dish('c', 'TOY', 'C', 1),
          ],
        })
      )
    );
    assert.equal(merged.categories.filter((c) => c.slug === 'toy').length, 1);
    assert.equal(merged.categories.find((c) => c.slug === 'toy')!.totalCount, 3);
    assert.ok(merged.categories.every((c) => c.kind === 'app'), 'no extra category needed');
  });

  it('counts orderable dishes apart from all dishes', () => {
    assert.equal(cat('toy').availableCount, 3);
    assert.equal(cat('toy').totalCount, 3);
  });

  it('numbers extra categories in the order LokmaGo first mentions them', () => {
    const result = organizeCatalog(
      buildCatalog(
        lokmagoExport({
          dishes: [dish('1', 'Zeta', 'a', 1), dish('2', 'Alfa', 'b', 1), dish('3', 'Zeta', 'c', 1)],
        })
      )
    );
    const extras = result.categories.filter((c) => c.kind === 'extra');
    assert.deepEqual(
      extras.map((c) => c.name.uz),
      ['Zeta', 'Alfa']
    );
    assert.deepEqual(
      extras.map((c) => c.sortOrder),
      [APP_CATEGORIES.length, APP_CATEGORIES.length + 1]
    );
  });

  it('never lets an extra category take a storefront slug', () => {
    const result = organizeCatalog(
      buildCatalog(lokmagoExport({ dishes: [dish('1', 'Toy!!!!', 'a', 1)] }))
    );
    // "Toy!!!!" normalises to "toy", so it matches — no extra at all.
    assert.ok(result.categories.every((c) => c.kind === 'app'));

    const clash = organizeCatalog(
      buildCatalog(lokmagoExport({ dishes: [dish('1', 'Bento Box', 'a', 1), dish('2', 'Bento-Box', 'b', 1)] }))
    );
    const slugs = clash.categories.filter((c) => c.kind === 'extra').map((c) => c.slug);
    assert.equal(new Set(slugs).size, slugs.length, 'extra slugs are unique');
    assert.ok(slugs.every((s) => s !== 'bento'));
  });

  it('keeps unrecognised section names as they are, including "Boshqa" for dishes without one', () => {
    const result = organizeCatalog(
      buildCatalog(
        lokmagoExport({ dishes: [{ ...dish('x', 'tmp', 'Orphan', 5), section: undefined }] })
      )
    );
    assert.equal(result.categories.at(-1)!.name.uz, 'Boshqa');
    assert.equal(result.products[0].categorySlug, 'boshqa');
  });

  describe('admin choices', () => {
    const choose = (entries: Array<[string, string]>) =>
      organizeCatalog(source, new Map(entries));

    it('moves a dish to the chosen category and says so', () => {
      const result = choose([['6aa076f3f31bf39e960645e3', 'yangi-yil']]);
      const moved = result.products.find((p) => p._id === '6aa076f3f31bf39e960645e3')!;

      assert.equal(moved.categorySlug, 'yangi-yil');
      assert.equal(moved.categorySource, 'manual');
      assert.equal(moved.autoCategorySlug, 'bayram', 'the automatic spot is still reported');
    });

    it('updates the counts on both shelves', () => {
      const result = choose([['6aa076f3f31bf39e960645e3', 'yangi-yil']]);
      const get = (slug: string) => result.categories.find((c) => c.slug === slug)!;
      assert.equal(get('bayram').availableCount, 1);
      assert.equal(get('yangi-yil').availableCount, 1);
    });

    it('can shelve a dish in an extra category too', () => {
      const result = choose([['6aa076f3f31bf39e960645e3', 'milliy-taom']]);
      assert.equal(
        result.products.find((p) => p._id === '6aa076f3f31bf39e960645e3')!.categorySlug,
        'milliy-taom'
      );
    });

    it('ignores a choice pointing at a category that no longer exists', () => {
      const result = choose([['6aa076f3f31bf39e960645e3', 'gone-forever']]);
      const p = result.products.find((x) => x._id === '6aa076f3f31bf39e960645e3')!;
      assert.equal(p.categorySlug, 'bayram');
      assert.equal(p.categorySource, 'auto');
    });

    it('ignores a choice for a dish that is not in the catalog', () => {
      const result = choose([['no-such-dish', 'toy']]);
      assert.equal(result.products.length, source.products.length);
    });
  });
});
