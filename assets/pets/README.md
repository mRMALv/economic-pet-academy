# Pet image assets

Each of the 12 pets now uses a dedicated transparent WebP image at
`assets/pets/{pet-id}.webp`.

- Image dimensions: 512 × 512 pixels each
- Format: WebP with alpha transparency
- Rendering: `object-contain`, no sprite-sheet cropping
- Emoji fallback remains available when an image cannot load

The individual filenames are: `alien.webp`, `totoro.webp`,
`flyingsquirrel.webp`, `fox.webp`, `hedgehog.webp`, `rabbit.webp`,
`hamster.webp`, `shiba.webp`, `cat.webp`, `panda.webp`, `penguin.webp`,
and `capybara.webp`.
