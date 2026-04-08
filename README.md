# @xhubio/bitdiver-runner

Test-Execution-Framework fuer automatisierte End-to-End Tests. Fuehrt Tests als Suites mit Steps aus, vergleicht Ergebnisse und liefert strukturiertes Reporting.

## Quickstart

```bash
pnpm install
pnpm run build     # biome check + tsc
pnpm run test      # build + vitest
pnpm run test:only # nur tests (ohne build)
```

## Architektur

```
┌─────────────────────────────────────────────────────────┐
│                    Suite-Config (YAML/JSON)              │
│    setup: [Step1, Step2]                                │
│    timed: auto (scannt Testdaten-Dateien)               │
│    timing: { startAfterStep, testcaseDelaySeconds }     │
│    teardown: [CheckStep, ReportStep]                    │
└──────────────────────┬──────────────────────────────────┘
                       │
              createSuiteFromConfig()
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│                   suite.json                            │
│  steps: ["Step1", "Step2", "SendData 120", "CheckStep"] │
│  stepDefinitions: { "SendData 120": { timing: {120} } } │
│  timing: { startAfterStep: "Step2", delay: 0.2 }       │
│  testcases: [{ name: "TC1", data: { ... } }]           │
└──────────────────────┬──────────────────────────────────┘
                       │
                    Runner
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
      StepNormal   StepSingle   Timed Steps
      (1x pro TC)  (1x fuer     (Runner wartet
                    alle TCs)    auf Zeitpunkt)
```

## Module

### config — Konfigurationsmanagement

Laedt Konfiguration aus JSON-Dateien mit Environment-Variable-Overrides und Zod-Validierung.

```typescript
import { z } from 'zod'
import { loadConfig } from '@xhubio/bitdiver-runner'

const schema = z.object({
  database: z.object({
    url: z.string(),
    password: z.string(),
    maxConnections: z.number().default(10)
  }),
  debug: z.boolean().default(false)
})

const { config, toString } = await loadConfig({
  schema,
  file: './config.json',
  envPrefix: 'MYAPP',       // MYAPP_DATABASE_URL, MYAPP_DEBUG etc.
  secrets: ['database.password']
})

console.log(toString())     // password als *** maskiert
console.log(config.debug)   // boolean, typisiert
```

**Prioritaet (hoechste gewinnt):**
1. Environment-Variablen (`MYAPP_DATABASE_URL`)
2. Inline-Values
3. JSON-Datei
4. Schema-Defaults

**Env-Variable-Namenskonvention:**
`<prefix>_<PFAD_IN_UPPER_SNAKE_CASE>` — z.B. `database.maxConnections` wird zu `MYAPP_DATABASE_MAX_CONNECTIONS`.

---

### suite-builder — Deklarative Suite-Erstellung

Erstellt Suites aus einer YAML/JSON-Konfiguration statt aus Code.

#### Suite-Config Format

```yaml
timedStepMapping:
  ri-fahrt-v1: SendRiFahrtV1Time
  playwright: SendPlaywrightTestTime
  bi-basis-fahrt-v3: SendBiBasisFahrtTimeV3

suiteTypes:
  TEST_FIX:
    setup:
      - SetupEnvironmentRun
      - ClearDatabase
      - CheckStartTime
    timing:
      startAfterStep: CheckStartTime
      testcaseDelaySeconds: 0.2
    timed: auto
    teardown:
      - ExportResults
      - CheckResults
      - StoreArtifacts
```

#### Drei Phasen

| Phase | Beschreibung |
|-------|-------------|
| **setup** | Vorbereitende Steps, sequentiell abgearbeitet |
| **timed** | Automatisch generiert aus Testdaten-Dateien. Dateiname-Pattern: `<zeit>_<typ>_<rest>.json`. Steps sortiert nach Zeit. |
| **teardown** | Nachbereitende Steps (Export, Pruefung, Reporting) |

#### Runner-gesteuertes Timing

Der Runner uebernimmt die Zeitsteuerung — Steps muessen nicht selbst warten:

```
Setup-Steps laufen sequentiell
  Setup → ClearDB → CheckStartTime
                          ↓
          Runner merkt: referenceTime = now()
                          ↓
Timed Steps: Runner wartet auf den richtigen Zeitpunkt
  +120s: SendRiFahrtV1Time 120 (TC1, +0.2s TC2, +0.4s TC3, ...)
  +240s: SendRiFahrtV1Time 240 (TC1, +0.2s TC2, +0.4s TC3, ...)
                          ↓
Teardown-Steps laufen sequentiell
  ExportResults → CheckResults → StoreArtifacts
```

**Konfiguration:**
- `timing.startAfterStep`: Nach diesem Step beginnt die Zeitmessung
- `timing.testcaseDelaySeconds`: Versatz zwischen Testcases (z.B. 0.2s)
- `stepDefinition.timing.offsetSeconds`: Sekunden nach Referenzzeit

Im `testMode` werden alle Delays uebersprungen.

#### Timed Steps

Dateien in den Testdaten-Verzeichnissen werden gescannt:

```
TC_01/
  1_ri-fahrt-v1_23711.json      → SendRiFahrtV1Time 1
  120_playwright_soll.json       → SendPlaywrightTestTime 120
  240_ri-fahrt-v1_update.json    → SendRiFahrtV1Time 240
```

Das `timedStepMapping` ordnet den Datei-Typ (`ri-fahrt-v1`) dem Step-ID (`SendRiFahrtV1Time`) zu. Die Step-Daten enthalten `{ offsetTime: 120, files: [...] }`.

#### Usage

```typescript
import { createSuiteFromConfig } from '@xhubio/bitdiver-runner'

const suite = await createSuiteFromConfig({
  config: suiteConfigYaml,  // geparstes YAML/JSON
  suiteType: 'TEST_FIX',
  testDataDir: './testdaten',
  suiteName: 'regression-paket1'
})
```

---

### definition — Suite-Format

Das kompakte Suite-Format mit Sparse-Data-Maps und optionalem Timing.

```json
{
  "executionMode": "batch",
  "name": "regression-paket1",
  "steps": ["SetupStep", "SendData 120", "CheckStep"],
  "stepDefinitions": {
    "SetupStep": { "id": "SetupStep", "name": "SetupStep", "description": "..." },
    "SendData 120": {
      "id": "SendDataTime", "name": "SendData 120", "description": "",
      "timing": { "offsetSeconds": 120 }
    },
    "CheckStep": { "id": "CheckStep", "name": "CheckStep", "description": "..." }
  },
  "testcases": [
    {
      "name": "TC_01_Entlastung",
      "data": {
        "SendData 120": { "offsetTime": 120, "files": ["TC_01/120_data.json"] }
      }
    }
  ],
  "timing": {
    "startAfterStep": "SetupStep",
    "testcaseDelaySeconds": 0.2
  }
}
```

**Designprinzipien:**
- `steps` ist ein Array (einmal fuer alle TCs, nicht pro TC wiederholt)
- `data` ist eine Map (`stepName -> data`), keine positionalen Arrays mit Nulls
- `stepDefinitions` mit optionalem `timing` fuer zeitgesteuerte Steps
- `timing` auf Suite-Ebene fuer Referenzzeit und TC-Versatz

---

### model — Steps und Environments

#### StepNormal

Ein Step der **einmal pro Testcase** ausgefuehrt wird. Auch fuer zeitgesteuerte Steps — der Runner uebernimmt das Timing.

```typescript
import { StepNormal } from '@xhubio/bitdiver-runner'

class SendData extends StepNormal {
  async run(): Promise<void> {
    const env = this.tc              // typisiert: EnvironmentTestcase
    const payload = this.data        // Step-Daten aus der Suite

    await sendToKafka(payload)
    await this.logInfo(`Sent data for ${env.name}`)
  }
}
```

#### StepSingle

Ein Step der **einmal fuer alle Testcases** ausgefuehrt wird. Hat Zugriff auf alle TC-Environments.

```typescript
import { StepSingle } from '@xhubio/bitdiver-runner'

class ClearDatabase extends StepSingle {
  async run(): Promise<void> {
    await db.clear()

    for (const { environment, data } of this.testcases) {
      environment.map.set('dbCleared', true)
    }
  }
}
```

#### StepSetupConfig

Generischer Step der Konfiguration in die Run-Umgebung laedt.

```typescript
import { z } from 'zod'
import { StepSetupConfig } from '@xhubio/bitdiver-runner'

const mySchema = z.object({
  kafka: z.object({
    brokers: z.string(),
    password: z.string()
  }),
  targetEnvironment: z.string().default('tu2')
})

class SetupMyEnv extends StepSetupConfig<typeof mySchema.shape> {
  getConfigSchema() { return mySchema }
  getSecrets() { return ['kafka.password'] }
}
```

Step-Daten: `{ "configFile": "./config.json", "envPrefix": "CUSTOM" }`

#### Environment-Persistenz

Steps koennen Daten zwischen Steps austauschen ueber `environmentTestcase.map`. Fuer grosse Daten gibt es Disk-Persistenz:

```typescript
class ExportStep extends StepNormal {
  async run(): Promise<void> {
    this.tc.map.set('results', largeData)

    // Auf Disk schreiben + aus Memory entfernen
    await this.exportVars(['results'], './results/TC_01')

    // Spaeter wieder laden
    await this.loadVars(['results'], './results/TC_01')
  }
}

class StepWithTempData extends StepNormal {
  async run(): Promise<void> {
    // Automatisch aufgeraeumt nach afterRun()
    await this.loadTempVars(['cached'], './cache')
    const data = this.tc.map.get('cached')
  }
}
```

#### Step-Lifecycle

```
start()      -> Initialisierung (alle Instanzen eines Steps)
beforeRun()  -> Vorbereitung (Config laden, Pfade setzen)
run()        -> Hauptarbeit
afterRun()   -> Aufraeumen (temp Variablen loeschen)
end()        -> Abschluss (alle Instanzen eines Steps)
```

#### StepRegistry

Registriert Step-Klassen unter einem Namen. Der Runner nutzt die Registry um Steps zu instanziieren.

```typescript
import { StepRegistry } from '@xhubio/bitdiver-runner'

const registry = new StepRegistry()
registry.registerStep({ stepName: 'SendData', step: SendData })
registry.registerStep({ stepName: 'ClearDB', step: ClearDatabase })
```

---

### runner-server — Test-Ausfuehrung

#### Runner

Fuehrt eine Suite aus. Unterstuetzt zwei Modi:
- **batch** (Standard): Iteriert Steps, dann Testcases pro Step
- **normal**: Iteriert Testcases, dann Steps pro Testcase

```typescript
import { Runner, ProgressBarConsoleLogBatchJson, LogAdapterFile } from '@xhubio/bitdiver-runner'

const runner = new Runner({
  id: 'run-001',
  dataDirectory: './data',
  suite: suiteJson,
  stepRegistry: registry,
  logAdapter: new LogAdapterFile({ targetDir: './logs' }),
  progressMeterBatch: new ProgressBarConsoleLogBatchJson({ name: 'my-run' }),
  parallelExecution: true,
  maxParallelSteps: 20,
  testMode: false
})

await runner.run()
```

**Timing-Steuerung:** Der Runner liest `suite.timing` und `stepDefinition.timing`:
- Setzt `referenceTime` nach dem konfigurierten `startAfterStep`
- Wartet bei timed Steps bis `referenceTime + offsetSeconds`
- Fuegt `testcaseDelaySeconds` Versatz zwischen TCs ein
- Ueberspringt alle Delays im `testMode`

#### ProgressMeter

Hooks fuer Live-Fortschritt:

| Hook | Wann |
|------|------|
| `init({ stepCount, testcaseCount, name })` | Run startet |
| `incStep(name)` | Neuer Step beginnt |
| `incTestcase(name)` | Neuer Testcase in Step |
| `setFail()` | Testcase fehlgeschlagen |
| `done()` | Run beendet |

---

### check — Ergebnis-Vergleich

Vergleicht Expected-Dateien mit Actual-Ergebnissen.

```typescript
import { StepCheck } from '@xhubio/bitdiver-runner'

registry.registerStep({ stepName: 'CheckResults', step: StepCheck })
```

Step-Daten:

```json
{
  "resultDir": "/path/to/results/TC_01",
  "dataDir": "/path/to/expected/TC_01",
  "checks": [{
    "name": "kafka-events",
    "actualDir": "events/kafka",
    "expectedDir": "expected/kafka",
    "dataPath": ["data"],
    "ignorePaths": [
      { "path": ["header", "messageId"], "doc": ["System-generiert"] }
    ]
  }]
}
```

**Pipeline:** Mapping (Dateiname) -> Vergleich (@aikotools/datacompare) -> Reporting (summary.json + details.json)

---

### logadapter — Logging

| Adapter | Beschreibung |
|---------|-------------|
| `LogAdapterConsole` | Ausgabe auf stdout |
| `LogAdapterConsoleJson` | JSON-formatierte Ausgabe |
| `LogAdapterFile` | Schreibt in Dateisystem (Run/TC/Step Struktur) |
| `LogAdapterMemory` | In-memory (fuer Tests) |

**Log-Level:** `debug` (0), `info` (1), `warning` (2), `error` (3), `fatal` (4)

Run-Level Error-Logs enthalten ein `source`-Feld mit Testcase-Name, Step-Name und SingleStep-Marker.

---

## Projekt-Struktur

```
src/
  index.ts                     Barrel-Export
  config/                      Zod-basiertes Config-Laden
  suite-builder/               Deklarative Suite-Erstellung
  definition/                  Suite/Step/Testcase Interfaces + Zod-Validierung
  model/                       Steps, Environments, Persistence, Registry
  runner-server/               Runner, Timing, ProgressMeter, LogAdapter-Bridge
  check/                       Expected vs Actual Vergleich
  logadapter/                  Pluggable Logging
tests/
  36 Test-Suites, 223 Tests
```

## Tooling

| Tool | Zweck |
|------|-------|
| **Vitest** | Test-Runner |
| **Biome** | Linting + Formatting |
| **Zod** | Schema-Validierung + TypeScript-Typen |
| **TypeScript** | Typisierung |

## Dependencies

**Runtime:** `zod`, `@aikotools/datacompare`, `luxon`, `uuid`, `md5`

Ehemalige Dependencies (`clone`, `mkdirp`, `rimraf`, `sprintf-js`, `p-all`, `ajv`) wurden durch native Node.js APIs ersetzt.
