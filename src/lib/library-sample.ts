// Sample data for the Library (书影音) prototype.
//
// The shape below mirrors what NeoDB's API returns per mark
// (`MarkSchema` + nested `ItemSchema`), so the real build-time loader
// can produce the exact same `LibraryItem[]` and the UI won't change:
//   - rating   ← mark.rating_grade   (1–10)
//   - comment  ← mark.comment_text
//   - tags     ← mark.tags
//   - date     ← mark.created_time    (timeline anchor)
//   - shelf    ← mark.shelf_type
//   - title    ← item.display_title
//   - cover    ← item.cover_image_url
//   - url      ← item.url
//
// Replace `libraryItems` with the API fetch once the design is approved.

import type { LibraryItem } from "./neodb";

const NEODB = "https://neodb.social";

export const libraryItems: LibraryItem[] = [
  // ── Books ──
  { uuid: "b1", category: "book", title: "克拉拉与太阳", cover: null, rating: 8, comment: "石黑一雄写 AI 的眼睛，温柔得让人难过。", tags: ["科幻", "外文"], date: "2026-05-18", shelf: "complete", url: NEODB },
  { uuid: "b2", category: "book", title: "置身事内", cover: null, rating: 9, comment: "讲中国政府与经济，难得把复杂的事说清楚。", tags: ["社科"], date: "2026-04-06", shelf: "complete", url: NEODB },
  { uuid: "b3", category: "book", title: "三体", cover: null, rating: 10, comment: "重读依然震撼，黑暗森林封神。", tags: ["科幻", "重读"], date: "2026-02-11", shelf: "complete", url: NEODB },
  { uuid: "b4", category: "book", title: "我们仨", cover: null, rating: null, comment: "在读。", tags: [], date: "2026-05-02", shelf: "progress", url: NEODB },
  { uuid: "b5", category: "book", title: "你想活出怎样的人生", cover: null, rating: null, comment: "想读原著。", tags: [], date: "2026-05-24", shelf: "wishlist", url: NEODB },

  // ── Movies ──
  { uuid: "m1", category: "movie", title: "奥本海默", cover: null, rating: 9, comment: "诺兰的对白节奏像鼓点，IMAX 值回票价。", tags: ["传记"], date: "2026-05-10", shelf: "complete", url: NEODB },
  { uuid: "m2", category: "movie", title: "瞬息全宇宙", cover: null, rating: 8, comment: "贝果与石头，荒诞里全是爱。", tags: [], date: "2026-03-22", shelf: "complete", url: NEODB },
  { uuid: "m3", category: "movie", title: "Perfect Days", cover: null, rating: 9, comment: "役所广司用扫厕所演出了禅。", tags: ["日影"], date: "2026-04-15", shelf: "complete", url: NEODB },
  { uuid: "m4", category: "movie", title: "沙丘 2", cover: null, rating: 8, comment: "沙虫登场封神，后半节奏略赶。", tags: ["科幻"], date: "2026-01-20", shelf: "complete", url: NEODB },

  // ── TV ──
  { uuid: "t1", category: "tv", title: "漫长的季节", cover: null, rating: 10, comment: "打个响指，玉米地里全是时代的眼泪。", tags: ["国剧", "悬疑"], date: "2026-04-28", shelf: "complete", url: NEODB },
  { uuid: "t2", category: "tv", title: "最后生还者", cover: null, rating: 8, comment: "第三集是剧版高光。", tags: ["改编"], date: "2026-02-03", shelf: "complete", url: NEODB },

  // ── Music ──
  { uuid: "u1", category: "music", title: "范特西 · 周杰伦", cover: null, rating: 10, comment: "二十年后再听，依旧是华语流行的天花板。", tags: ["华语"], date: "2026-03-09", shelf: "complete", url: NEODB },
  { uuid: "u2", category: "music", title: "Random Access Memories", cover: null, rating: 9, comment: "Daft Punk 的告别，复古迪斯科做到极致。", tags: [], date: "2026-05-21", shelf: "complete", url: NEODB },

  // ── Games ──
  { uuid: "g1", category: "game", title: "艾尔登法环", cover: null, rating: 10, comment: "交错王城那一刻，我原谅了它所有的劝退。", tags: ["魂系"], date: "2026-02-25", shelf: "complete", url: NEODB },
  { uuid: "g2", category: "game", title: "极乐迪斯科", cover: null, rating: 9, comment: "用文字把 RPG 写成了文学。", tags: ["CRPG", "神作"], date: "2026-01-12", shelf: "complete", url: NEODB },
  { uuid: "g3", category: "game", title: "塞尔达：王国之泪", cover: null, rating: null, comment: "在玩，造车停不下来。", tags: [], date: "2026-05-06", shelf: "progress", url: NEODB },

  // ── Podcasts ──
  { uuid: "p1", category: "podcast", title: "故事 FM", cover: null, rating: 8, comment: "普通人的声音，比虚构更有力量。", tags: [], date: "2026-04-19", shelf: "complete", url: NEODB },
  { uuid: "p2", category: "podcast", title: "忽左忽右", cover: null, rating: 8, comment: "选题杂而不乱，通勤必备。", tags: ["人文"], date: "2026-03-15", shelf: "complete", url: NEODB },
];
