# Pet image assets

The eleven pets other than the Flying Squirrel use the high-resolution shared
sprite sheet `assets/pets/pet-sprite-hd.webp`.

- Canvas: 2048 × 1536 pixels
- Grid: 4 columns × 3 rows
- Each pet cell: 512 × 512 pixels
- Format: WebP with transparency

Cell order matches `PET_SPRITE_POSITIONS` in `index.html`:
Alien, forest pet (Totoro), Flying Squirrel, Fox, Hedgehog, Rabbit, Hamster,
Shiba Inu, Cat, Panda, Penguin, Capybara.

The Flying Squirrel continues to use its separate full-resolution artwork at
`assets/pets/flyingsquirrel.webp` so its ear tips and gliding membranes are
not cropped. Keep the existing emoji fallback in the avatar renderer.
