# @xhubio/bitdiver-runner

Test-Execution-Framework fuer automatisierte End-to-End Tests. Fuehrt Tests als Suites mit Steps aus, vergleicht Ergebnisse und liefert strukturiertes Reporting.

## Quickstart

```bash
npm install
npm run build     # biome check + tsc
npm run test      # build + vitest
npm run test:only # nur tests (ohne build)
```

## Architektur

```
┌─────────────────────────────────────────────────────────┐
│                    Suite-Config (YAML/JSON)              │
│    setup: [Step1, Step2]                                │
│    timed: auto (scannt Testdaten-Dateien)               │
│    teardown: [CheckStep, ReportStep]                    │
└──────────────────────┬──────────────────────────────────┘
                       │
              createSuiteFromConfig()
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│                   suite.json                            │
│  steps: ["Step1", "Step2", "SendData 120", "CheckStep"] │
│  stepDefinitions: { "Step1": {id, name, desc}, ... }    │
│  testcases: [{ name: "TC1", data: { "Step1": {...} } }] │
└──────────────────────┬──────────────────────────────────┘
                       │
                    Runner
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
      StepNormal   StepSingle   StepTimed
      (1x pro TC)  (1x fuer     (wartet auf
                    alle TCs)    Zeitpunkt)
```

## Module

### config — Konfigurationsmanagement

Laedt Konfiguration aus JSON-Dateien mit Environment-Variable-Overrides und Zod-Validierung.

```typescript
import { z } from 'zod'
import { loadConfig } from '@bitdiver/core'

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
      - SetStartTime
    timed: auto
    teardown:
      - ExportResults
      - CheckResults
      - StoreArtifacts

  NUR_FAHRTEN:
    setup:
      - SetupEnvironmentRun
      - SetStartTime
    timed: auto
    teardown:
      - StoreArtifacts
```

#### Drei Phasen

| Phase | Beschreibung |
|-------|-------------|
| **setup** | Vorbereitende Steps, sequentiell abgearbeitet |
| **timed** | Automatisch generiert aus Testdaten-Dateien. Dateiname-Pattern: `<zeit>_<typ>_<rest>.json`. Steps sortiert nach Zeit. |
| **teardown** | Nachbereitende Steps (Export, Pruefung, Reporting) |

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
import { createSuiteFromConfig } from '@bitdiver/core'

const suite = await createSuiteFromConfig({
  config: suiteConfigYaml,  // geparstes YAML/JSON
  suiteType: 'TEST_FIX',
  testDataDir: './testdaten',
  suiteName: 'regression-paket1'
})

// suite ist ein SuiteDefinitionInterface — kann als JSON gespeichert
// oder direkt an den Runner uebergeben werden
```

---

### definition — Suite-Format

Das kompakte Suite-Format mit Sparse-Data-Maps.

```json
{
  "executionMode": "batch",
  "name": "regression-paket1",
  "steps": ["SetupStep", "SendData 120", "CheckStep"],
  "stepDefinitions": {
    "SetupStep": { "id": "SetupStep", "name": "SetupStep", "description": "..." },
    "SendData 120": { "id": "SendDataTime", "name": "SendData 120", "description": "" },
    "CheckStep": { "id": "CheckStep", "name": "CheckStep", "description": "..." }
  },
  "testcases": [
    {
      "name": "TC_01_Entlastung",
      "data": {
        "SendData 120": { "offsetTime": 120, "files": ["TC_01/120_data.json"] }
      }
    }
  ]
}
```

**Vorteile gegenueber dem alten Format:**
- `steps` ist ein Array (einmal fuer alle TCs, nicht pro TC wiederholt)
- `data` ist eine Map (`stepName → data`), keine positionalen Arrays mit 93% Nulls
- `stepDefinitions` sind separat von der Reihenfolge

---

### model — Steps und Environments

#### StepNormal

Ein Step der **einmal pro Testcase** ausgefuehrt wird. Jede Instanz hat genau einen Testcase-Kontext.

```typescript
import { StepNormal } from '@bitdiver/core'

class SendData extends StepNormal {
  async run(): Promise<void> {
    const env = this.tc              // typisiert: EnvironmentTestcase
    const payload = this.data        // Step-Daten aus der Suite
    const config = this.environmentRun?.map.get('kafka')

    await sendToKafka(config, payload)
    await this.logInfo(`Sent data for ${env.name}`)
  }
}
```

#### StepSingle

Ein Step der **einmal fuer alle Testcases** ausgefuehrt wird. Hat Zugriff auf alle TC-Environments.

```typescript
import { StepSingle } from '@bitdiver/core'

class ClearDatabase extends StepSingle {
  async run(): Promise<void> {
    // Einmal ausfuehren, nicht pro TC
    await db.clear()

    // Zugriff auf alle TCs:
    for (const { environment, data } of this.testcases) {
      environment.map.set('dbCleared', true)
    }
  }
}
```

#### StepTimed

Ein Step der bis zu einem bestimmten Zeitpunkt wartet bevor er ausfuehrt.

```typescript
import { StepTimed } from '@bitdiver/core'

class SendAtTime extends StepTimed {
  getReferenceTime(): string {
    return this.tc.map.get('START_TIME')
  }

  getOffsetSeconds(): number {
    return this.data.offsetTime  // z.B. 120
  }

  async doRun(): Promise<void> {
    // Wird erst nach 120 Sekunden ab Referenzzeit ausgefuehrt
    await sendData(this.data.files)
  }
}
```

Im `testMode` wird der Delay uebersprungen.

#### StepSetupConfig

Generischer Step der Konfiguration in die Run-Umgebung laedt.

```typescript
import { z } from 'zod'
import { StepSetupConfig } from '@bitdiver/core'

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
start()      → Initialisierung (alle Instanzen eines Steps)
beforeRun()  → Vorbereitung (Config laden, Pfade setzen)
run()        → Hauptarbeit
afterRun()   → Aufraeumen (temp Variablen loeschen)
end()        → Abschluss (alle Instanzen eines Steps)
```

#### StepRegistry

Registriert Step-Klassen unter einem Namen. Der Runner nutzt die Registry um Steps zu instanziieren.

```typescript
import { StepRegistry } from '@bitdiver/core'

const registry = new StepRegistry()
registry.registerStep({ stepName: 'SendData', step: SendData })
registry.registerStep({ stepName: 'ClearDB', step: ClearDatabase })

const step = registry.getStep('SendData')  // neue Instanz
```

---

### runner-server — Test-Ausfuehrung

#### Runner

Fuehrt eine Suite aus. Unterstuetzt zwei Modi:
- **batch** (Standard): Iteriert Steps, dann Testcases pro Step
- **normal**: Iteriert Testcases, dann Steps pro Testcase

```typescript
import { Runner, ProgressBarConsoleLogBatchJson, LogAdapterFile } from '@bitdiver/core'

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

#### ProgressMeter

Hooks fuer Live-Fortschritt. Basis-Klassen mit leeren `update()`-Methoden zum Subclassen:

| Hook | Wann |
|------|------|
| `init({ stepCount, testcaseCount, name })` | Run startet |
| `incStep(name)` | Neuer Step beginnt |
| `incTestcase(name)` | Neuer Testcase in Step |
| `setFail()` | Testcase fehlgeschlagen |
| `done()` | Run beendet |

Eingebaute Implementierungen: `ProgressBarConsoleBatch`, `ProgressBarConsoleLogBatch`, `ProgressBarConsoleLogBatchJson`.

---

### check — Ergebnis-Vergleich

Vergleicht Expected-Dateien mit Actual-Ergebnissen.

```typescript
import { StepCheck } from '@bitdiver/core'

// In der Suite als Step registrieren:
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

**Pipeline pro Check:**
1. **Mapping**: Actual-Dateien werden Expected-Dateien per Dateiname zugeordnet
2. **Vergleich**: Jedes Paar wird mit `@aikotools/datacompare` verglichen (Deep-Compare mit Direktiven: Time, Number, Regex, Contains etc.)
3. **Reporting**: `summary.json` + `details.json` + `mapping.json` pro Check

**Ergebnis-Dateien:**

```json
// summary.json
{
  "name": "kafka-events",
  "total": 15,
  "passed": 13,
  "failed": 1,
  "missing": 1,
  "unexpected": 0
}
```

---

### logadapter — Logging

Pluggable Log-Adapter mit strukturierten Messages.

| Adapter | Beschreibung |
|---------|-------------|
| `LogAdapterConsole` | Ausgabe auf stdout |
| `LogAdapterConsoleJson` | JSON-formatierte Ausgabe |
| `LogAdapterFile` | Schreibt in Dateisystem (organisiert nach Run/TC/Step) |
| `LogAdapterMemory` | Speichert in-memory (fuer Tests) |

**Log-Level:** `debug` (0), `info` (1), `warning` (2), `error` (3), `fatal` (4)

**Log-Message Struktur:**

```typescript
{
  meta: {
    run: { id, name, start },
    tc?: { id, name, tcCountCurrent, tcCountAll },
    step?: { id, name, stepCountCurrent, stepCountAll, type },
    source?: { testcases: string[], stepName?: string, isSingleStep?: boolean },
    logTime: number
  },
  data: any,
  logLevel: string
}
```

Das `source`-Feld in Run-Level Error-Logs zeigt welcher Testcase und Step den Fehler verursacht hat.

---

## Projekt-Struktur

```
src/
  index.ts                     Barrel-Export
  config/
    loadConfig.ts              Zod-basiertes Config-Laden
  suite-builder/
    types.ts                   Suite-Config Schema (Zod)
    scanTimedFiles.ts          Testdaten-Scanner
    buildTimedSteps.ts         Timed-Step-Generierung
    createSuiteFromConfig.ts   Suite aus Config erstellen
  definition/
    interfaceSuiteDefinition.ts
    interfaceTestcaseDefinition.ts
    interfaceStepDefinition.ts
    schema/validate.ts         Zod-Validierung
  model/
    StepBase.ts                Basis-Klasse (Lifecycle, Logging)
    StepNormal.ts              1 Instanz pro TC + Persistence
    StepSingle.ts              1 Instanz fuer alle TCs
    StepTimed.ts               Zeitgesteuerter Step
    StepSetupConfig.ts         Config-Lade-Step
    StepPersistence.ts         Disk-Persistenz Helpers
    StepRegistry.ts            Step-Klassen Registry
    EnvironmentRun.ts          Run-weite Umgebung
    EnvironmentTestcase.ts     TC-spezifische Umgebung
    generateLogs.ts            Log-Message Builder
  runner-server/
    Runner.ts                  Suite-Ausfuehrung
    RunnerLogAdapter.ts        Log-Interceptor
    pAll.ts                    Concurrency-Helper
    progress/                  ProgressMeter-Implementierungen
  check/
    StepCheck.ts               Generischer Check-Step
    runCheck.ts                Check-Orchestrierung
    mapFiles.ts                Datei-Mapping (Expected↔Actual)
    types.ts                   Check-Interfaces
  logadapter/
    LogAdapterConsole.ts
    LogAdapterConsoleJson.ts
    LogAdapterFile.ts
    LogAdapterMemory.ts
tests/
  35 Test-Suites, 208 Tests
```

## Tooling

| Tool | Zweck |
|------|-------|
| **Vitest** | Test-Runner |
| **Biome** | Linting + Formatting (ersetzt ESLint + Prettier) |
| **Zod** | Schema-Validierung + TypeScript-Typen |
| **TypeScript 5.6** | Typisierung |

## Dependencies

**Runtime:**
- `zod` — Schema-Validierung
- `@aikotools/datacompare` — Deep-Object-Comparison Engine
- `luxon` — Zeitberechnung (fuer StepTimed)
- `uuid` — Eindeutige IDs
- `md5` — Hashing

**Keine** weiteren Runtime-Dependencies. Ehemalige Dependencies (`clone`, `mkdirp`, `rimraf`, `sprintf-js`, `p-all`, `ajv`) wurden durch native Node.js APIs ersetzt.
