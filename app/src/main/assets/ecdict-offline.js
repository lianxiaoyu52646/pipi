/* Sprint7 full ECDICT offline dictionary: 256 on-demand shards, no external lookup. */
(function (root) {
  'use strict';
  const PREFIX = './ecdict/';
  const shardPromises = new Map();
  let manifestPromise;
  function normalize(word) {
    return String(word || '').trim().toLowerCase().replace(/[\u2019\u2018]/g, "'").normalize('NFC');
  }
  function shardFor(word) {
    const bytes = new TextEncoder().encode(word);
    let hash = 2166136261;
    for (const b of bytes) { hash ^= b; hash = Math.imul(hash, 16777619) >>> 0; }
    return (hash & 255).toString(16).padStart(2, '0');
  }
  async function fromCache(url) {
    // Also works with an offline service worker on mobile after pre-caching.
    if ('caches' in root) {
      const hit = await caches.match(url).catch(() => null);
      if (hit) return hit;
    }
    return fetch(url, { cache: 'no-cache' });
  }
  async function manifest() {
    if (!manifestPromise) manifestPromise = (async () => {
      const response = await fromCache(PREFIX + 'manifest.json');
      if (!response.ok) throw new Error('完整词典尚未安装；先运行安装脚本。');
      const data = await response.json();
      if (data.format !== 'sprint7-ecdict-v1' || data.shards !== 256) throw new Error('词典数据版本不兼容');
      return data;
    })().catch(e => { manifestPromise = null; throw e; });
    return manifestPromise;
  }
  async function shard(id) {
    if (!shardPromises.has(id)) {
      const promise = (async () => {
        const response = await fromCache(PREFIX + id + '.json');
        if (!response.ok) throw new Error('词典分片读取失败：' + id);
        return response.json();
      })().catch(e => { shardPromises.delete(id); throw e; });
      shardPromises.set(id, promise);
      // Keep mobile memory use bounded even if many different words are queried.
      if (shardPromises.size > 12) {
        const first = shardPromises.keys().next().value;
        if (first !== id) shardPromises.delete(first);
      }
    }
    return shardPromises.get(id);
  }
  async function exact(word) {
    const data = await shard(shardFor(word));
    const row = data[word];
    if (!row) return null;
    if (row.r) return exact(normalize(row.r));
    return { word, original: word, translation: row.t || '', definition: row.d || '',
      phonetic: row.p || '', exchange: row.e || '', pos: row.o || '', tag: row.g || '',
      collins: row.c || '', oxford: row.x || '', bnc: row.b || '', frq: row.f || '',
      detail: row.j || '', audio: row.a || '' };
  }
  function baseForms(word) {
    const out = [word];
    if (word.endsWith("'s")) out.push(word.slice(0, -2));
    if (word.endsWith('ies')) out.push(word.slice(0, -3) + 'y');
    if (word.endsWith('ves')) out.push(word.slice(0, -3) + 'f', word.slice(0, -3) + 'fe');
    if (word.endsWith('es')) out.push(word.slice(0, -2));
    if (word.endsWith('s')) out.push(word.slice(0, -1));
    if (word.endsWith('ing')) { const stem = word.slice(0, -3); out.push(stem, stem + 'e'); if (/(.)\1$/.test(stem)) out.push(stem.slice(0, -1)); }
    if (word.endsWith('ied')) out.push(word.slice(0, -3) + 'y');
    if (word.endsWith('ed')) { const stem = word.slice(0, -2); out.push(stem, stem + 'e'); if (/(.)\1$/.test(stem)) out.push(stem.slice(0, -1)); }
    return [...new Set(out.filter(Boolean))];
  }
  async function lookup(input) {
    const word = normalize(input);
    if (!word) return null;
    await manifest();
    for (const candidate of baseForms(word)) {
      const row = await exact(candidate);
      if (row) { row.query = word; row.inflected = candidate !== word; return row; }
    }
    return null;
  }
  async function precacheAll(progress) {
    await manifest();
    if (!('caches' in root)) throw new Error('浏览器不支持离线缓存');
    const cache = await caches.open('sprint7-ecdict-full-v14');
    await cache.add(PREFIX + 'manifest.json');
    let total = 0;
    // Limit concurrency to avoid saturating mobile network and memory.
    for (let index = 0; index < 256; index += 4) {
      const ids = Array.from({length: Math.min(4, 256-index)}, (_, k) => (index+k).toString(16).padStart(2,'0'));
      await Promise.all(ids.map(async id => {
        const url = PREFIX + id + '.json';
        const match = await cache.match(url);
        if (!match) { const response = await fetch(url); if (!response.ok) throw new Error('无法缓存 '+id); await cache.put(url, response); }
        total++;
        if (progress) progress(total, 256);
      }));
    }
    return total;
  }
  root.SprintECDICT = {lookup, exact, manifest, precacheAll, shardFor, normalize};
})(window);
