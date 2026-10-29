# Third-party dependencies

OpenGrid's original source is MIT licensed. The core has no runtime dependencies. The React adapter uses React as a peer dependency and references the core workspace package; the example uses React and React DOM (MIT). No AG Grid package is installed or bundled.

Development tooling includes TypeScript (Apache-2.0), Vite and Vitest (MIT), React Testing Library and user-event (MIT), Playwright (Apache-2.0), axe-core (MPL-2.0), jsdom (MIT), and their transitive dependencies. These are development/test tools rather than shipped grid runtime code. Their full copyright and license texts are included in the installed packages. The lockfile records exact resolved dependency versions.

The optional `@opengrid/export` runtime uses ExcelJS 4.4.0 (MIT), pdf-lib 1.17.1 (MIT), JSZip 3.10.2 (MIT license option), and saxes 6.0.0 (ISC), with their dependencies. Independent PDF tests use PDF.js (Apache-2.0). UUID 11.1.1 (MIT) is pinned/overridden in this workspace's installed source dependency graph. ExcelJS's prebuilt browser distribution embeds upstream dependencies independently of npm overrides; an installed-tree audit is not an audit or rewrite of that bundled artifact. The example loads document tools only on demand, and the core/React packages do not depend on them.

Chromium downloaded by Playwright is test infrastructure and is not redistributed in the OpenGrid packages. Keep its upstream notices when redistributing a browser build. Local package tarballs include the OpenGrid MIT license; consumers remain responsible for retaining third-party notices when redistributing their own application bundle.
