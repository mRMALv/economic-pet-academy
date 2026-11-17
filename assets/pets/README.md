# Pet image assets

The application loads one optimized sprite sheet: `assets/pets/pet-sprite.jpg`.

The sheet is a 4-column × 3-row grid. Each cell is 160 × 160 pixels. The
`PET_SPRITE_POSITIONS` map in `index.html` maps existing pet IDs to grid
coordinates; keep the map and sheet in the same order when replacing artwork.

| Row | Column 1 | Column 2 | Column 3 | Column 4 |
|---|---|---|---|---|
| 1 | 三眼仔 / Alien | 森林精靈 / Forest pet | 飛鼠 / Flying squirrel | 狐狸 / Fox |
| 2 | 刺蝟 / Hedgehog | 兔子 / Rabbit | 倉鼠 / Hamster | 柴犬 / Shiba Inu |
| 3 | 橘貓 / Cat | 熊貓 / Panda | 企鵝 / Penguin | 水豚 / Capybara |

Eight illustrations are cropped from the supplied original 4 × 3 mascot sheet.
The four additional illustrations (Shiba Inu, fox, capybara, and forest pet)
were created to match the existing species without relabeling unrelated
animals. The forest pet is an original fluffy forest creature.
