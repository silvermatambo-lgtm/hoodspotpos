/* Generated illustrative photography for the twelve seeded sample products. */
const photos = new Map([
  ['Beer|castle lager','castle-lager'],
  ['Beer|zambezi lager','zambezi-lager'],
  ['Beer|carling black label','carling-black-label'],
  ['Beer|lion lager','lion-lager'],
  ['Cider|hunters gold','hunters-gold'],
  ['Cider|savanna dry','savanna-dry'],
  ['Spirits|jameson · single','jameson'],
  ['Spirits|gordons gin · single','gordons-gin'],
  ['Soft drinks|coca-cola','coca-cola'],
  ['Soft drinks|sprite','sprite'],
  ['Mixers|tonic water','tonic-water'],
  ['Soft drinks|still water','still-water'],
]);
export function productPhoto(category,name){
  const key=String(name??'').normalize('NFKC').toLowerCase().replace(/['’]/g,'').trim().replace(/\s+/g,' ');
  const slug=photos.get(category+'|'+key);
  return slug ? '/products/'+slug+'.webp' : '';
}
