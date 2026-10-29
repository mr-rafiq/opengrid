# Third-party dependencies

OpenGrid's original source is MIT licensed. The core has no runtime dependencies. The React adapter uses React as a peer dependency and references the core workspace package; the example uses React and React DOM (MIT). No AG Grid package is installed or bundled.

Development tooling includes TypeScript (Apache-2.0), Vite and Vitest (MIT), React Testing Library and user-event (MIT), Playwright (Apache-2.0), axe-core (MPL-2.0), jsdom (MIT), and their transitive dependencies. These are development/test tools rather than shipped grid runtime code. Their full copyright and license texts are included in the installed packages. The lockfile records exact resolved dependency versions.

Chromium downloaded by Playwright is test infrastructure and is not redistributed in the OpenGrid packages. Keep its upstream notices when redistributing a browser build. Local package tarballs include the OpenGrid MIT license; consumers remain responsible for retaining third-party notices when redistributing their own application bundle.
