/** Picks a Bootstrap icon for a category when it has no uploaded image. */
const RULES: [RegExp, string][] = [
  [/shoe|foot|chappal|sandal/i, 'bi-bag-heart'],
  [/cloth|garment|fashion|wear|shirt|saree|kurta/i, 'bi-bag'],
  [/grocery|kirana|food|rice|atta|dal|staple/i, 'bi-basket'],
  [/fruit|veg/i, 'bi-apple'],
  [/dairy|milk/i, 'bi-cup-straw'],
  [/snack|biscuit|sweet|namkeen/i, 'bi-cookie'],
  [/drink|beverage|juice|tea|coffee/i, 'bi-cup-hot'],
  [/mobile|phone|electronic|gadget/i, 'bi-phone'],
  [/home|kitchen|house/i, 'bi-house'],
  [/beauty|personal|care|cosmetic/i, 'bi-droplet'],
  [/medic|health|pharma/i, 'bi-capsule'],
  [/stationer|book/i, 'bi-book'],
  [/toy|kid|baby/i, 'bi-balloon'],
  [/sport|fitness/i, 'bi-bicycle'],
];
export function catIcon(name = ''): string {
  return RULES.find(([rx]) => rx.test(name))?.[1] ?? 'bi-grid';
}
