# Pet image assets

Most pets are displayed from the shared optimized sprite sheet:
`assets/pets/pet-sprite.jpg` (4 columns × 3 rows).

The Flying Squirrel uses a dedicated high-resolution 512 × 512 transparent
WebP image: `assets/pets/flyingsquirrel.webp`. This prevents its wide ears
and gliding membranes from being clipped by the sprite-cell crop.

The `PET_SPRITE_POSITIONS` map in `index.html` retains the existing 12 pet
IDs and locations for the shared sheet. Keep the Flying Squirrel override in
`petAvatarHTML` when updating the renderer.
