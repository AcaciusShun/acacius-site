# Crimson Nocturne / 绯红夜曲

Somlar 的第二套视觉皮肤。方向是 **Midnight Toon Noir**：西式动画的块面轮廓、Anime-influenced cartoon 的姿态与表情、克制的绯红黑色幽默。它不改变内容和信息架构，只改变视觉叙事。

## Visual language

- Midnight ink `#090B18`
- Panel violet `#171A30`
- Shadow lavender `#2B2D4A`
- Bone `#F2EEDF`
- Crimson pop `#FF376F`
- Motifs: tail-like vines, thorns, small flames, wing-shaped cuts, triangular grins
- Shape rule: large silhouettes, asymmetric notches, limited cel-shading, sparse glow

The reference screenshots supplied during exploration are not included in the site and are not used as page elements. The committed concept artwork is newly generated for this theme and depicts an original, fully clothed adult imp archivist.

## Performance rules

- Hero artwork is WebP and is requested only while `data-skin="nocturne"` is active.
- Decoration uses one pointer-free SVG layer and transform/opacity/clip-path motion.
- There are no looping canvas effects or fixed background images on mobile.
- `prefers-reduced-motion` disables the spreading transition and vine drawing.

The PNG files in this folder are design masters. Runtime derivatives live in `public/images/themes/crimson-nocturne/`.
