<h2 align="middle">Non-Overlapping Periodic Job Scheduler</h2>

The `NonOverlappingPeriodicJobScheduler` class implements a slim yet highly flexible periodic-job scheduler for Node.js projects, ensuring non-overlapping job executions.

The delay between executions is determined by a **user-defined calculator function**, allowing scheduling to be either interval-based or time-based, while also considering runtime factors known to the user.

## Table of Contents

* [Key Features](#key-features)
* [API](#api)
* [Getter Methods](#getter-methods)
* [Non-Overlapping Executions](#non-overlapping-executions)
* [Dynamic Execution Interval](#dynamic-execution-interval)
* [Graceful and Deterministic Termination](#graceful-teardown)
* [Zero Over-Engineering, No External Dependencies](#no-dependencies)
* [Non-Persistent Scheduling](#non-persistent)
* [Error Handling](#error-handling)
* [Use-case Example](#use-case-example)
* [Time-Based Scheduling Policies](#time-based-scheduling-examples)
* [Interval-Based Scheduling Policies](#interval-based-scheduling-examples)
* [Breaking Change in Version 2.0.0](#breaking-change-2)
* [Breaking Change in Version 3.0.0](#breaking-change-3)
* [Breaking Changes in Version 4.0.0](#breaking-change-4)
* [Naming Convention](#naming-convention)
* [License](#license)

## Key Features :sparkles:<a id="key-features"></a>

* __Non-Overlapping Executions :lock:__: Prevents race conditions ([Race Conditions: How Are They Possible in Single-Threaded JavaScript?](https://www.npmjs.com/package/zero-overhead-promise-lock#race-conditions)) and provides precise control over resource usage. Ideal for batch processing tasks that must run exclusively to manage network bandwidth efficiently.
* __Dynamic Interval between Executions :gear:__: The user provides a **custom delay calculator**, invoked immediately *after* each execution finishes. It receives runtime metadata - such as duration and any thrown error - and determines the delay before the next run. This design allows users to **consider various runtime factors** if required, while the scheduler remains agnostic to the user-defined scheduling policy.
- __Robust Error Handling :warning:__: If a job throws, the error is forwarded to the delay calculator. This allows the user to adjust behavior accordingly (e.g., retry faster after failures). The scheduler itself performs no logging, remaining agnostic to logging tools or conventions.
* __Graceful and Deterministic Teardown :hourglass_flowing_sand:__: When the `stop` method is invoked during task execution, it resolves only **after** the execution is complete. This guarantees smooth resource cleanup, making it well-suited for production environments (e.g., `onModuleDestroy` in [NestJS](https://docs.nestjs.com/fundamentals/lifecycle-events)) and maintaining a clean state between unit tests.
- __Comprehensive documentation :books:__: Fully documented, enabling IDEs to provide intelligent **tooltips** for an enhanced development experience.
* __Fully Tested :test_tube:__: Extensively covered by unit tests.
- __Zero Runtime Dependencies :dove:__: Only development dependencies are included.
- __ES2020 Compatibility__: The project targets ES2020 for modern JavaScript support.
- __Full TypeScript Support__: Designed for seamless TypeScript integration.
* Non-durable scheduling: If the app crashes or goes down, scheduling stops.

## API :globe_with_meridians:<a id="api"></a>

The `NonOverlappingPeriodicJobScheduler` class provides the following methods:

* __start__: Initiates the scheduling of periodic jobs.
* __stop__: Stops the scheduling of periodic jobs. If this method is invoked during an ongoing execution, it resolves once the current execution is complete. This guarantee provides determinism and allows for graceful termination.
* __waitUntilCurrentExecutionCompletes__: Resolves when the current execution completes, whether it resolves or rejects, if called during an ongoing execution. If no execution is in progress, it resolves immediately.

If needed, refer to the code documentation for a more comprehensive description of each method.

## Getter Methods :mag:<a id="getter-methods"></a>

The `NonOverlappingPeriodicJobScheduler` class provides the following getter methods to reflect the scheduler's current state:

* __isCurrentlyExecuting__: Indicates whether the periodic job is actively running, as opposed to being between executions.
* __status__: Indicates the current instance status, which can be one of the following: `active`, `inactive`, or `terminating`.

## Non-Overlapping Executions :lock:<a id="non-overlapping-executions"></a>

Executions do not overlap because the (i+1)th execution is scheduled immediately **after** the ith execution completes. This is suitable for scenarios where overlapping executions may cause race conditions, or negatively impact performance.

## Dynamic Execution Interval :gear:<a id="dynamic-execution-interval"></a>

User provides a custom calculator function, to determine the delay until the next execution, based on the runtime metadata of the just-finished execution (duration, error if thrown).

This calculator is invoked at the **end** of each execution, enabling flexible interval policies based on user-defined criteria. This approach ensures that the scheduler remains agnostic of scheduling-policy preferences, focusing solely on the scheduling process. In this way, we adhere to the following principles:
* __Information Expert Principle__: The interval policy is defined by the user.
* __Single Responsibility Principle__: The scheduler's sole responsibility is to manage the scheduling process.

## Graceful and Deterministic Teardown :hourglass_flowing_sand:<a id="graceful-teardown"></a>

This topic is **often overlooked** in the context of schedulers.  
When stopping periodic executions, it is crucial to ensure that any potentially ongoing execution is completed before termination. This deterministic termination approach ensures that no unfinished executions leave objects in memory, which could otherwise lead to unexpected behavior.

Without deterministic teardown, leftover references from incomplete executions can cause issues, such as unexpected behavior during unit tests. A clean state is necessary for each test, and ongoing jobs from a previous test can interfere with subsequent tests.

## Zero Runtime Dependencies :dove:<a id="no-dependencies"></a>

This component offers a lightweight, dependency-free solution. It can also serve as a building block for
more advanced implementations, if necessary.

## Non-Persistent Scheduling<a id="non-persistent"></a>

This component features non-durable scheduling, which means that if the app crashes or goes down, scheduling stops.

If you need to guarantee durability over a multi-node deployment, consider using this scheduler as a building block or use other custom-made solutions for that purpose.

## Error Handling :warning:<a id="error-handling"></a>

If a periodic job throws an error, the error will be passed to the calculator function. The scheduler does not perform any logging, as it is designed to be **agnostic of user preferences**, such as specific loggers or logging styles.

## Use-case Example :man_technologist:<a id="use-case-example"></a>

```ts
import { 
  ComputeNextDelay,
  NonOverlappingPeriodicJobScheduler,
} from 'non-overlapping-periodic-job-scheduler';

const MS_DELAY_AFTER_COMPLETION = 5000;
/**
 * Basic implementation:
 * After each execution, the scheduler waits a fixed duration (5000 ms),
 * before triggering the next one.
 * First execution starts 5000ms after `start` is called.
 */ 
const computeDelayUntilNextFetch: ComputeNextDelay = () => MS_DELAY_AFTER_COMPLETION;

class ThreatIntelligenceAggregator {
  private readonly _threatFeedsScheduler = 
    new NonOverlappingPeriodicJobScheduler(
      this.fetchLatestThreatFeeds.bind(this),
      computeDelayUntilNextFetch
    );

  public start(): void {
    this._threatFeedsScheduler.start();
    // Additional start operations.
  }

  public async stop(): Promise<void> {
    // Stop may not be immediate, as given a job-execution is currently ongoing,
    // `stop` resolves only once that execution completes.
    await this._threatFeedsScheduler.stop();
    // Additional stop operations.
  }

  private async fetchLatestThreatFeeds(): Promise<void> {
    // Do your magic here.
  }
}
```

## Time-Based Scheduling Policies :clock3:<a id="time-based-scheduling-examples"></a>

Time-based scheduling **disregards** the execution's metadata (such as duration or thrown errors) and is measured against absolute timestamps on the clock. While the `ComputeNextDelay` callback type accepts an `IPreviousExecutionMetadata` argument, its use is **optional** in user implementations.

### Every 20 minutes on the clock :man_technologist:

Consider a scenario where executions should occur at fixed times of the day, for example, three times per hour at XX:00:00, XX:20:00, and XX:40:00. In other words, every 20 minutes on the clock. This scheduling policy can be implemented using the following calculator:
```ts
const MS_DELAY_BETWEEN_STARTS = 20 * 60 * 1000; // 20 minutes in milliseconds.
const computeNextDelay: ComputeNextDelay = 
  (): number => {
    return MS_DELAY_BETWEEN_STARTS - Date.now() % MS_DELAY_BETWEEN_STARTS;
  };
```
Please note that due to the non-overlapping nature of this scheduler, if an execution exceeds 20 minutes, its subsequent scheduled start time (e.g., 00:40:00) will be skipped.

### Daily execution at a Fixed Hour :man_technologist:

Consider a scenario where the execution should occur once a day at 16:00 (4 PM). A suitable calculator function might be:
```ts
const MS_IN_ONE_DAY = 24 * 60 * 60 * 1000;
const computeNextDelay: ComputeNextDelay = 
  (): number => {
    const todayAt16 = new Date();
    todayAt16.setHours(16, 0, 0, 0);

    const msTillExecution = todayAt16.getTime() - Date.now();
    if (msTillExecution >= 0) {
      return msTillExecution;
    }

    return MS_IN_ONE_DAY + msTillExecution;
  };
```

## Interval-Based Scheduling Policies :repeat:<a id="interval-based-scheduling-examples"></a>

Interval-based scheduling ignores absolute timestamps on the clock. It is applicable when the interval **between executions** matters more than the exact timing of each execution. Unlike most schedulers, this variant allows the gap to be determined during runtime, enabling consideration of runtime factors.

### Basic example :man_technologist:

Let's start with the simplest example, which involves having a fixed interval. Formally, the determined interval is the delay between the **end** of the i-th execution and the **start** of the (i+1)-th execution.
```ts
const FIXED_MS_DELAY_BETWEEN_EXECUTIONS = 5000;
const computeNextDelay: ComputeNextDelay = 
  () => FIXED_MS_DELAY_BETWEEN_EXECUTIONS;
```

### Considering the Error Argument :man_technologist:

A more advanced example might take the potentially thrown error into account via the `IPreviousExecutionMetadata` argument of the `ComputeNextDelay` callback - for instance, if the user prefers a more frequent interval until successful execution.  
The `ComputeNextDelay` type alias accepts a generic `JobError` type, defaulting to `Error` if not explicitly specified. Refer to the full documentation of the `ComputeNextDelay` alias for more information if needed.
```ts
import {
  NO_PREVIOUS_EXECUTION,
  IPreviousExecutionMetadata,
  ComputeNextDelay,
} from 'non-overlapping-periodic-job-scheduler';

const FIRST_EXECUTION_MS_DELAY = 10 * 1000;
const MS_DELAY_AFTER_SUCCESS = 20 * 1000;
const MS_DELAY_AFTER_FAILURE = 4000;
// Note the use of a generic CustomError type, defaulting to `Error`.
const computeNextDelay: ComputeNextDelay<CustomError> = (
  previousExecutionMetadata: Readonly<IPreviousExecutionMetadata>
): number => {
  const { durationMs, error } = previousExecutionMetadata;

  if (durationMs === NO_PREVIOUS_EXECUTION) {
    return FIRST_EXECUTION_MS_DELAY;
  }

  if (error) {
    console.error(`Last execution failed. Reason: ${error.message}`);
    return MS_DELAY_AFTER_FAILURE;
  }

  return MS_DELAY_AFTER_SUCCESS;
};
```

### Mimicking 'setInterval' :man_technologist:

If you want to mimic the behavior of `setInterval`, which maintains a fixed interval between **start** times, you should be aware that the duration of a job execution might exceed the interval. A simple scheduling policy might decide that, under such circumstances, the next execution should occur immediately.
```ts
import {
  IPreviousExecutionMetadata,
  ComputeNextDelay,
  NO_PREVIOUS_EXECUTION
} from 'non-overlapping-periodic-job-scheduler';

const FIXED_MS_DELAY = 5000;
const computeNextDelay: ComputeNextDelay = (
  previousExecutionMetadata: Readonly<IPreviousExecutionMetadata>
): number => {
  const { durationMs, error } = previousExecutionMetadata;

  if (durationMs === NO_PREVIOUS_EXECUTION) {
    return FIXED_MS_DELAY;
  }

  if (durationMs > FIXED_MS_DELAY) {
    return 0;
  }

  // For example, if a just-finished execution took 1000ms, and the desired
  // interval-between-starts is 5000ms, the next execution should start within
  // 4000ms.
  return FIXED_MS_DELAY - durationMs;
};
```

### Alternative 'setInterval' mimicking :man_technologist:

Another approach to mimicking the `setInterval` policy, while dealing with potential overlapping executions, is to schedule only according to the originally planned start time. Overlapped start times will be skipped.

Formally, start times will correspond to the formula START_TIMESTAMP + N * FIXED_MS_DELAY, where N is a natural number. For example, the following ascending start times sequence implies that the first execution took more than FIXED_MS_DELAY, but less than 2 * FIXED_MS_DELAY. This can be deduced by the missing start timestamp:
* START_TIMESTAMP + FIXED_MS_DELAY
* START_TIMESTAMP + 3 * FIXED_MS_DELAY
* START_TIMESTAMP + 4 * FIXED_MS_DELAY
* START_TIMESTAMP + 5 * FIXED_MS_DELAY

Such a scheduling policy can be useful for aggregation jobs, where a recently executed job implies that the data is still fresh.
```ts
import {
  IPreviousExecutionMetadata,
  ComputeNextDelay,
  NO_PREVIOUS_EXECUTION
} from 'non-overlapping-periodic-job-scheduler';

const FIXED_MS_DELAY = 5000;
const computeNextDelay: ComputeNextDelay = (
  previousExecutionMetadata: Readonly<IPreviousExecutionMetadata>
): number => {
  const { durationMs, error } = previousExecutionMetadata;

  if (durationMs === NO_PREVIOUS_EXECUTION) {
    return FIXED_MS_DELAY;
  }

  // For example, if a just-finished execution took 6000ms, and the desired
  // interval-between-starts is 5000ms, it means that next execution should
  // start within 4000ms.
  return FIXED_MS_DELAY - durationMs % FIXED_MS_DELAY;
};
```

## Breaking Change in Version 2.0.0<a id="breaking-change-2"></a>

In version 2.0.0, the target compatibility has been upgraded from ES6 to ES2020. This change was made to leverage the widespread adoption of ES2020, in particular its native support for async/await.

## Breaking Change in Version 3.0.0<a id="breaking-change-3"></a>

In version 3.0.0, the method `waitTillCurrentExecutionSettles` was renamed to `waitUntilCurrentExecutionCompletes` for improved clarify.

## Breaking Changes in Version 4.0.0<a id="breaking-change-4"></a>

* The license has changed to [Apache 2.0](LICENSE).
* The user-defined delay calculator type alias was renamed to `ComputeNextDelay`. Instead of multiple arguments, it now accepts a single argument of type `IPreviousExecutionMetadata`.
* The `isStopped` getter was replaced with the `status` getter, which provides more detailed information.
* Documentation has been improved.

## Naming Convention<a id="naming-convention"></a>

It is highly recommended to assign a use-case-specific name to your scheduler instances. This practice helps in clearly identifying the purpose of each scheduler in the codebase. Examples include:
- deleteExpiredDataScheduler
- syncAccessPermissionsScheduler
- updateFirewallRulesScheduler
- healthDiagnosticsScheduler
- archiveOldLogsScheduler

## License :scroll:<a id="license"></a>

[Apache 2.0](LICENSE)
