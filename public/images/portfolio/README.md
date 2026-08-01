# Portfolio source images

Drop new portfolio photos here, then run:

```bash
npm run portfolio:optimize
```

Optimized JPEGs are written to `src/assets/images/portfolio/` and served via Astro's
`<Image>` component (WebP/AVIF + responsive srcset at build time).

Remove source files from this folder after optimizing if you no longer need the originals.
