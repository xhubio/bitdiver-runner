# CLAUDE.md — Kontext fuer Claude Code

## Projekt

`@xhubio/bitdiver-runner` — Test-Execution-Framework. Fuehrt E2E-Tests als Suites mit Steps aus.

Repo: `github.com/xhubio/bitdiver-runner`

## Befehle

```bash
pnpm run build       # biome check + tsc
pnpm run test        # format + lint + build + vitest
pnpm run test:only   # nur vitest (kein build)
pnpm run check       # biome check --write .
```

## Tooling

- **TypeScript** — strict mode
- **Vitest** — Test-Runner (config: `vitest.config.ts`)
- **Biome** — Linting + Formatting (config: `biome.json`). Kein ESLint, kein Prettier.
- **Zod** — Schema-Validierung und Config-Typen
- **Semantic Release** — Versionierung ueber Commit-Messages

## Code-Konventionen

- Kein Semikolon (`semicolons: "asNeeded"` in Biome)
- Single Quotes
- 2 Spaces Indent
- `node:` Prefix fuer Node.js Imports (`import fs from 'node:fs/promises'`)
- Keine `any` wo vermeidbar — `unknown` bevorzugen
- Native APIs statt npm-Pakete (`structuredClone`, `fs.promises.mkdir`, `String.padStart`)

## Architektur

### Module (in `src/`)

| Modul | Pfad | Verantwortung |
|-------|------|---------------|
| **config** | `src/config/` | Zod-basiertes Config-Laden mit Env-Overrides |
| **suite-builder** | `src/suite-builder/` | Deklarative Suite-Erstellung aus YAML/JSON Config |
| **definition** | `src/definition/` | Suite/Step/Testcase Interfaces + Zod-Validierung |
| **model** | `src/model/` | StepBase, StepNormal, StepSingle, StepTimed (deprecated), StepSetupConfig, StepRegistry, Environments, Persistence |
| **runner-server** | `src/runner-server/` | Runner (Suite-Ausfuehrung), Timing, ProgressMeter, RunnerLogAdapter |
| **check** | `src/check/` | Expected vs Actual Vergleich (nutzt @aikotools/datacompare) |
| **logadapter** | `src/logadapter/` | Console, ConsoleJson, File, Memory Logger |

### Kern-Konzepte

**Suite:** JSON mit `steps` (geordnete Liste), `stepDefinitions` (Metadaten + optionales Timing), `testcases` (Sparse-Data-Map), optionales `timing` (Referenzzeit + TC-Versatz).

**StepNormal:** 1 Instanz pro Testcase. Typisierter Zugriff via `this.tc` (EnvironmentTestcase) und `this.data`.

**StepSingle:** 1 Instanz fuer alle Testcases. Zugriff via `this.testcases` (Array von `{environment, data}`). Anwendungsfaelle: DB loeschen, Daten exportieren und TCs zuordnen.

**Runner-Timing:** Der Runner steuert die Zeitplanung:
- `suite.timing.startAfterStep` — nach diesem Step wird `referenceTime = now()` gesetzt
- `stepDefinition.timing.offsetSeconds` — Runner wartet bis `referenceTime + offset`
- `suite.timing.testcaseDelaySeconds` — Versatz zwischen TCs bei timed Steps
- Im `testMode` werden alle Delays uebersprungen

**StepTimed:** DEPRECATED. Timing wird jetzt vom Runner gesteuert. Existiert noch fuer Abwaertskompatibilitaet.

**Environment-Persistenz:** `writeVars`, `loadVars`, `exportVars` (write + delete), `loadTempVars` (auto-cleanup in afterRun). Arbeiten mit `EnvironmentTestcase.map`.

**Config-Laden:** `loadConfig({ schema, file, envPrefix, secrets })`. Prioritaet: Env > Inline > File > Defaults. camelCase wird zu UPPER_SNAKE_CASE fuer Env-Variablen.

### Suite-Builder

Deklarative Suite-Erstellung mit drei Phasen: `setup` (sequentiell) → `timed` (auto-generiert aus Dateiscan) → `teardown` (sequentiell).

Timed Steps werden aus Testdaten-Dateien generiert: `<zeit>_<typ>_<rest>.json` (z.B. `120_ri-fahrt-v1_23711.json`). Das `timedStepMapping` in der Config ordnet Datei-Typen Step-IDs zu.

### Logging

LogAdapter-Interface mit `log(logMessage)`. Der Runner nutzt `RunnerLogAdapter` als Bridge — intercepted Logs fuer Status-Management (TC-Status setzen bei Errors) und leitet an den eigentlichen LogAdapter weiter.

Run-Level Error-Logs haben ein `source`-Feld mit Testcase-Name, Step-Name und isSingleStep Marker.

## Tests

- 36 Test-Suites, 223 Tests
- Test-Verzeichnis: `tests/` (spiegelt `src/` Struktur)
- Test-Helper fuer Runner-Tests: `tests/runner-server/helper/` (StepNormalLocal, StepSingleLocal etc.)
- Volatile Test-Dateien (generiert zur Laufzeit) in `**/volatile/` — von git und biome ignoriert

## Abhaengigkeiten

**Runtime:** `zod`, `@aikotools/datacompare`, `luxon`, `uuid`, `md5`, `ts-progress`, `arangojs`

**Hinweis:** `arangojs` und `ts-progress` sind Legacy-Abhaengigkeiten die noch von aelteren Modulen genutzt werden. Bei Gelegenheit pruefen ob sie entfernt werden koennen.

## Verwandte Projekte

- **@aikotools/datacompare** — Deep-Object-Comparison Engine mit Direktiven (Time, Number, Regex etc.)
- **@aikotools/datafilter** — Filter-Engine fuer JSON-Matching
- **@aikotools/placeholder** — Placeholder-Template-Engine

Diese sind als npm-Dependencies eingebunden, nicht als Source-Code.
