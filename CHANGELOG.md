# Changelog

## [0.1.1](https://github.com/einord/pxlpad/compare/pxlpad-v0.1.0...pxlpad-v0.1.1) (2026-03-18)


### Features

* add undo/redo support ([ac8ec60](https://github.com/einord/pxlpad/commit/ac8ec6049fe6775f37eb61bda92581205f80ebc5))
* add undo/redo support ([05babcb](https://github.com/einord/pxlpad/commit/05babcbab533a94cbfa2129c09fe2baeb4eb38da)), closes [#2](https://github.com/einord/pxlpad/issues/2)
* add variable brush size support ([809c90c](https://github.com/einord/pxlpad/commit/809c90c7d1a367a57176e08bb64c76ee2e45fe67))
* add variable brush size support for pencil and eraser tools ([4d761a8](https://github.com/einord/pxlpad/commit/4d761a8bce0946f71e0225ca8fc1dfb18fcbea9a)), closes [#3](https://github.com/einord/pxlpad/issues/3)
* center and fit sprite on initial load ([a7f2b58](https://github.com/einord/pxlpad/commit/a7f2b58c324eb1c4c77f8dc33ec31fbdf2fff6e3))
* implemented early basic code structure ([91965ca](https://github.com/einord/pxlpad/commit/91965ca54d5fa46e76eefa1843a35b99fac13b87))
* replace emoji icons with Lucide icon library ([4f2bae3](https://github.com/einord/pxlpad/commit/4f2bae3428451189143d7c6635f9811dc016e962))
* replace Tauri template with server status dashboard ([f7831a8](https://github.com/einord/pxlpad/commit/f7831a888f0fcf838face2bc4adfb210524e43d7))
* static checkerboard background and sprite border ([8eecbd3](https://github.com/einord/pxlpad/commit/8eecbd360c2b09ca1a1f99e564ef6833a1f2f05e))
* sync Aseprite palette to client ([4018530](https://github.com/einord/pxlpad/commit/4018530abb3c788f11d0b4d2993de94471a87417))
* sync Aseprite palette to client via WebSocket ([cffa50f](https://github.com/einord/pxlpad/commit/cffa50fc0f816cf90d164abb15b8520cb2b5c718)), closes [#5](https://github.com/einord/pxlpad/issues/5)


### Bug Fixes

* account for UI panels when fitting sprite on load ([faaa886](https://github.com/einord/pxlpad/commit/faaa8860bb9189c3caa7c3ba5f405268ff24655b))
* add tray icon and hide dock icon on macOS ([e8169af](https://github.com/einord/pxlpad/commit/e8169af09d036831f59fc95499c8a57a3f9207dc))
* block pen/mouse events from reaching pixi-viewport entirely ([90553ef](https://github.com/einord/pxlpad/commit/90553ef3ed769591f062c578f81bcc02a0303178))
* discard stale server data during drawing, request fresh after ([07c9811](https://github.com/einord/pxlpad/commit/07c9811140e1e8b7351a5be0d30e4bec26e60034))
* fix Aseprite extension init errors ([5a2ff73](https://github.com/einord/pxlpad/commit/5a2ff736e87cd274f27b6c2f0e35cbd9489c21e0))
* handle draw commands for cels smaller than sprite ([2df6197](https://github.com/einord/pxlpad/commit/2df6197edc4eda309bb29bf182aca14e574e27cb))
* move plugin.preferences access into init function ([d53d2e5](https://github.com/einord/pxlpad/commit/d53d2e54b40c89c359266b184f0629774ff14939))
* prevent dropped strokes on iPad and improve trackpad controls ([0ccab59](https://github.com/einord/pxlpad/commit/0ccab59d20a270d2eb03042b19a41625d139549a))
* prevent iPadOS Scribble from swallowing Apple Pencil events ([1bcbf55](https://github.com/einord/pxlpad/commit/1bcbf555171e58744bc64966f7b4d4592256ae25))
* prevent server data from overwriting active local strokes ([4f2a609](https://github.com/einord/pxlpad/commit/4f2a609e2546c661ad488cb40b0c5bdd83ee8d2d))
* proxy WebSocket through Vite dev server for iPad compatibility ([191f448](https://github.com/einord/pxlpad/commit/191f448ba9dc6f7194040c1ab4f39444eb203a19))
* removed unnecessary github actions ([4ac4e16](https://github.com/einord/pxlpad/commit/4ac4e164df4abcdac7383504045d213b88615820))
* resolve merge conflict with undo/redo routing ([92fc2d4](https://github.com/einord/pxlpad/commit/92fc2d4122c9564bc097d991da673b2971404ee2))
* update extension package.json to match Aseprite format ([76cb760](https://github.com/einord/pxlpad/commit/76cb7602709378011be29c086a1cc650a3fe4455))
* use correct Aseprite WebSocket API ([fbef95e](https://github.com/einord/pxlpad/commit/fbef95e6edf4376e29f0854f33d127a92c9aec20))
