# Runner-managed Start Time via built-in Steps

**Status:** Approved
**Date:** 2026-04-09

## Kontext

Der `bitdiver-runner` hat bereits eine Timing-Infrastruktur für zeitgesteuerte
Steps:

- `suite.timing.startAfterStep` setzt die Referenzzeit nach einem bestimmten Step
- `stepDefinition.timing.offsetSeconds` gibt an, wann ein timed Step relativ zur
  Referenzzeit ausgeführt werden soll
- `Runner._waitForTimedStep()` wartet entsprechend

Für Performance-Tests hat sich im alten `e2e-tool-fix-performance` ein komplexeres
Muster etabliert, das mit der aktuellen Runner-Implementierung nicht abgebildet
werden kann:

1. Ein Step berechnet die **zukünftige** Startzeit als `now + offset + n*delay`,
   wobei `n` die Anzahl aktiver Testfälle ist
2. Zwischen Startzeit-Berechnung und Beginn des timed-Blocks laufen weitere
   Setup-Steps, die Zeit verbrauchen (`offset` + `n*delay` ist das Zeit-Budget)
3. Ein weiterer Step prüft kurz vor dem timed-Block, ob das Budget eingehalten
   wurde. Falls nicht, wird der Lauf abgebrochen mit einem informativen Log,
   damit der User `offset`/`delay` anpassen kann

Heute wird das über externe Steps gelöst (`@rbltng/e2e-tool-nt-step-set-start-time`,
`@rbltng/e2e-tool-nt-step-check-start-time`). Das Ziel ist, diese Logik in den
Runner zu verlagern — analog zu `StepWait`, der auch built-in ist.

## Ziel

- Die bestehende `suite.timing`-Konfiguration wird **entfernt**.
- Zwei neue built-in Steps werden in bitdiver-runner ergänzt:
  - `StepDetermineStartTime` — berechnet die zukünftige Referenzzeit
  - `StepCheckStartTime` — prüft, ob das Budget eingehalten wurde
- Beide Steps speichern/lesen die Referenzzeit über `environmentRun.map`.
- Timing funktioniert sowohl in **Batch-Mode** als auch in **Normal-Mode**.
- Im Normal-Mode wird die Startzeit **pro Testfall** neu berechnet.

## Design

### Neue built-in Steps

Beide Steps werden als `StepSingle` implementiert und vom `StepRegistry`
automatisch registriert (wie `StepWait`).

#### `StepDetermineStartTime`

Berechnet die zukünftige Referenzzeit und schreibt sie in
`environmentRun.map`.

```ts
class StepDetermineStartTime extends StepSingle {
  needData = false

  async run() {
    const offsetSeconds = (this.data?.[0]?.offsetSeconds as number) ?? 0
    const delaySeconds = (this.data?.[0]?.delaySeconds as number) ?? 0
    const activeCount = this.environmentTestcase.length

    const referenceTime =
      Date.now() + offsetSeconds * 1000 + activeCount * delaySeconds * 1000

    this.environmentRun.map.set('referenceTime', referenceTime)
    await this.logInfo({
      message: 'Start time determined',
      referenceTime: new Date(referenceTime).toISOString(),
      offsetSeconds,
      delaySeconds,
      activeCount
    })
  }
}
```

**Parameter** (aus `step.data[0]`, befüllt über Suite-Config-Entry):

- `offsetSeconds` (number, default 0) — fixer Offset ab "jetzt"
- `delaySeconds` (number, default 0) — Pufferzeit pro aktivem Testfall

**Verhalten:**

- Im **Batch-Mode** ist `environmentTestcase` ein Array aller aktiven Testfälle
  → `activeCount = n`
- Im **Normal-Mode** ist `environmentTestcase` ein 1-elementiges Array
  → `activeCount = 1` (siehe "Runner-Änderungen" unten)
- Schreibt das Ergebnis in `environmentRun.map.set('referenceTime', <ms>)`

#### `StepCheckStartTime`

Prüft, ob wir uns noch vor der Referenzzeit befinden, wartet ggf. bis dahin
oder bricht ab.

```ts
class StepCheckStartTime extends StepSingle {
  needData = false

  async run() {
    const referenceTime = this.environmentRun.map.get('referenceTime') as
      | number
      | undefined
    if (referenceTime === undefined) {
      await this.logError({
        message: 'No referenceTime set — DetermineStartTime must run first'
      })
      return
    }

    const diff = referenceTime - Date.now()
    if (diff > 0) {
      await this.logInfo({
        message: 'On schedule, waiting until start time',
        waitMs: diff
      })
      if (!this.testMode) {
        await new Promise<void>((resolve) => setTimeout(resolve, diff))
      }
    } else {
      await this.logFatal({
        message: 'Start time overrun — increase offsetSeconds or delaySeconds',
        overrunMs: -diff
      })
    }
  }
}
```

**Verhalten:**

- `diff > 0` (on schedule) → log INFO mit `waitMs`, wartet bis `referenceTime`
- `diff ≤ 0` (overrun) → log FATAL mit `overrunMs`, der Runner bricht den Lauf
  danach ab (FATAL setzt `environmentRun.status`)

### Runner-Änderungen

#### 1. `suite.timing` entfällt

Die `timing`-Struktur in `SuiteTypeConfig` (suite-builder/types.ts) und
`SuiteDefinitionInterface` wird entfernt. `startAfterStep`,
`startOffsetSeconds`, `testcaseDelaySeconds` werden nicht mehr unterstützt.

Die Per-Step-Timing-Struktur (`StepDefinitionInterface.timing.offsetSeconds`)
**bleibt** — sie wird weiterhin vom `buildTimedSteps` automatisch aus den
Dateinamen befüllt (`120_ri-fahrt-v1_*.json` → `offsetSeconds: 120`).

#### 2. `_waitForTimedStep` liest aus `environmentRun.map`

```ts
private async _waitForTimedStep(
  stepDefinition: StepDefinitionInterface
): Promise<void> {
  if (!stepDefinition.timing) return
  const refTime = this.environmentRun?.map.get('referenceTime') as
    | number
    | undefined
  if (refTime === undefined) return

  const target = refTime + stepDefinition.timing.offsetSeconds * 1000
  const delay = Math.max(0, target - Date.now())
  if (delay > 0 && !this.testMode) {
    await new Promise<void>((resolve) => setTimeout(resolve, delay))
  }
}
```

Die Runner-Instanzfelder `referenceTime` und `timing` werden entfernt.

#### 3. Alter `testcaseDelaySeconds`-Code entfällt

Der Block in `_executeStepBatch` (aktuell Zeile 459–476), der die Step-Instanzen
um `testcaseDelaySeconds` staffelt, wird entfernt. Das entspricht nicht der
gewünschten Semantik.

#### 4. `_doRunNormal` bekommt Timing-Support

Vor jeder Step-Ausführung wird `_waitForTimedStep(stepDefinition)` aufgerufen,
analog zum Batch-Mode.

Zusätzlich muss die `referenceTime` am Testfall-Ende aus `environmentRun.map`
gelöscht werden (`delete`), damit sie beim nächsten Testfall vom
`StepDetermineStartTime` neu gesetzt wird. Alternativ kann der Step sie beim
Aufruf einfach überschreiben — dann ist kein expliziter Reset nötig.
**Entscheidung:** Überschreiben, kein expliziter Reset. Einfacher.

#### 5. `_doRunNormal` Single-Step Daten-Konsistenz

Aktuell (Zeile 260–261) setzt `_doRunNormal`:

```ts
step.environmentTestcase = tcEnv       // Einzelwert
step.data = tc.data[stepId] ?? null    // Einzelwert
```

Für Single-Steps muss das im Normal-Mode auf ein 1-elementiges Array umgestellt
werden, damit `StepDetermineStartTime` und `StepCheckStartTime` einheitlich mit
`environmentTestcase.length` und `data[0]` arbeiten können:

```ts
if (step.type === StepType.single) {
  step.environmentTestcase = [tcEnv]
  step.data = [tc.data[stepId] ?? null]
} else {
  step.environmentTestcase = tcEnv
  step.data = tc.data[stepId] ?? null
}
```

Das ist eine Verhaltensänderung für alle StepSingle-Klassen im Normal-Mode.
Bestehende StepSingle-Implementierungen müssen geprüft werden, ob sie damit
kompatibel sind.

### Suite-Config-Beispiel

```jsonc
{
  "suiteTypes": {
    "performance": {
      "setup": [
        "SetupEnvironmentRun",
        "CognitoUserTokenStart",
        "VersionInfoStep",
        {
          "step": "DetermineStartTime",
          "offsetSeconds": 40,
          "delaySeconds": 0.3
        },
        "ClearDatabase",
        "ExtractTestdata",
        "CheckStartTime"
      ],
      "timed": "auto",
      "teardown": [
        "StopDbSink",
        "CognitoUserTokenStop"
      ]
    }
  }
}
```

Nach dem Setup bis einschließlich `VersionInfoStep` berechnet
`DetermineStartTime` die Referenzzeit. Die nachfolgenden Setup-Steps
(`ClearDatabase`, `ExtractTestdata`) verbrauchen das Zeitbudget.
`CheckStartTime` verifiziert, dass noch Budget übrig ist, wartet die
Restzeit ab und gibt dann den Startschuss für den timed-Block.

### StepEntry Schema-Anpassung

Die `stepEntrySchema` in `suite-builder/types.ts` unterstützt bereits das
Object-Format `{ step: "name", ...params }`. Die Parameter werden als
`data[0]` an den Step übergeben. Keine Änderung nötig — das funktioniert
bereits für `StepWait` und gilt analog für `StepDetermineStartTime`.

## Auswirkungen auf nachgelagerte Projekte

### `@rbltng/e2e-tool-nt-fix-steps`

- `@rbltng/e2e-tool-nt-step-set-start-time` aus den Dependencies entfernen
- `@rbltng/e2e-tool-nt-step-check-start-time` aus den Dependencies entfernen
- Entsprechende Registry-Einträge in `createStepRegistry.ts` entfernen

### `@rbltng/e2e-tool-nt-step-set-start-time` / `-check-start-time`

Beide Module werden obsolet und können aus dem Repo entfernt werden.

### `e2e-tool-nt-fix-performance` (Migration)

- Nutzt `DetermineStartTime` und `CheckStartTime` aus dem Runner
- Keine eigenen Timing-Steps mehr nötig
- Suite-Config enthält die beiden Steps im `setup`-Array

## Tests

- Unit-Test für `StepDetermineStartTime`:
  - Berechnung mit `activeCount = n` korrekt
  - `referenceTime` in `environmentRun.map` gesetzt
- Unit-Test für `StepCheckStartTime`:
  - `diff > 0` → log INFO, wartet
  - `diff ≤ 0` → log FATAL
  - Kein `referenceTime` → log ERROR
- Integrationstest Runner Batch-Mode:
  - Suite mit DetermineStartTime + timed Steps läuft korrekt
  - testMode: keine echten Wartezeiten
- Integrationstest Runner Normal-Mode:
  - `referenceTime` wird pro Testfall neu berechnet
  - timed Steps warten korrekt

## Offene Punkte

Keine.
