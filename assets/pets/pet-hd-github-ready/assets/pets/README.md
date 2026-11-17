# Pet image assets

Each pet uses a dedicated transparent WebP image at `assets/pets/{pet-id}.webp`.

- 12 images, each 512 × 512 pixels
- WebP format with RGBA transparency
- Render with `object-contain`; no sprite-sheet cropping
- Keep the emoji fallback in `petAvatarHTML()` for image-load failures
