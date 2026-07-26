# Umbra Vale — Unreal Engine 5 Edition

A cinematic dark-fantasy snake, built as a **code-only UE5 project**: there are
no binary assets at all. The entire scene — night sky, moonlight, volumetric
fog, Lumen-lit arena, glowing food, the wyrm itself and the film-look
post-processing — is constructed from C++ at runtime on top of the engine's
empty `Entry` map and basic shape primitives.

هذه نسخة Unreal Engine 5 من اللعبة — مشروع C++ خالص بدون أي أصول ثنائية:
المشهد كله (السماء الليلية، ضوء القمر، الضباب الحجمي، إضاءة Lumen، الطعام
المتوهج، الدودة، والمعالجة السينمائية) يُبنى برمجيًا عند التشغيل.

## Requirements | المتطلبات

- Windows 10/11, a DX12-capable GPU (Lumen needs Shader Model 6 — any RTX
  card is perfect | أي كرت RTX ممتاز)
- **Unreal Engine 5.4+** from the Epic Games Launcher
- **Visual Studio 2022** with the *Game development with C++* workload
  (اختر حزمة "Game development with C++" عند التثبيت)

## Build & Run | البناء والتشغيل

1. Clone the repo and open the `unreal/UmbraVale` folder.
   استنسخ المستودع وافتح مجلد `unreal/UmbraVale`.
2. Right-click `UmbraVale.uproject` → **Generate Visual Studio project files**.
   (If your engine is newer than 5.4, first pick **Switch Unreal Engine
   version…** and select your version — the code targets stable 5.x APIs and
   the build targets use `BuildSettingsVersion.Latest`, so no upgrade prompt
   should appear. If one does, answering **Yes** is safe.)
   كليك يمين على `UmbraVale.uproject` ثم "Generate Visual Studio project
   files"، وإذا كان محركك أحدث من 5.4 اختر أولًا "Switch Unreal Engine version".
3. Double-click `UmbraVale.uproject`. When prompted to build the missing
   module, choose **Yes** — the first build takes a few minutes.
   افتح الملف بنقرة مزدوجة ووافق على بناء الموديول؛ أول بناء يستغرق دقائق.
4. Press **Play** (Alt+P). | اضغط زر التشغيل.

## Controls | التحكم

- **WASD / arrows / gamepad stick** — steer the wyrm (it always glides
  forward, you bend its path) | توجيه الدودة
- **R** — restart the run | إعادة المحاولة
- Eat the glowing orbs, avoid the boulders, the pillar ring and your own
  tail. | كل الأجرام المتوهجة وتجنب الصخور وحلقة الأعمدة وذيلك.

## Where the "Unreal look" comes from | من أين يأتي المظهر

- **Lumen** global illumination + reflections (`Config/DefaultEngine.ini`)
- Volumetric fog lit by a cold directional moon (`SnakeGameMode.cpp`)
- Cinematic camera post-processing — bloom, vignette, film grain, chromatic
  aberration, split-tone grading, motion blur (`SnakePawn.cpp`, the
  `FPostProcessSettings` block)
- Every light source (head lantern, food orbs, rune boulders, pillar ring)
  bounces through Lumen, so the scene reads as *lit*, not painted.

## Extending | التطوير لاحقًا

This scaffold is intentionally asset-free so it builds anywhere. The natural
next steps: replace the primitive spheres with sculpted meshes, add Niagara
trails for the fever state, and swap the canvas HUD for UMG — all of which
need authored assets created in the editor on your machine.

الهيكل متعمد بلا أصول ليُبنى في أي مكان؛ الخطوات التالية الطبيعية هي استبدال
الكرات بمجسمات منحوتة، وإضافة مؤثرات Niagara، وواجهة UMG — وكلها تُصنع في
المحرر على جهازك.
