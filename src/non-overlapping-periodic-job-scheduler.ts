/**
 * Copyright 2025 Ori Cohen https://github.com/ori88c
 * https://github.com/ori88c/non-overlapping-periodic-job-scheduler
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  ComputeNextDelay,
  IPreviousExecutionMetadata,
  ActivityStatus,
  NO_PREVIOUS_EXECUTION,
} from './types';

/**
 * A slim, dependency-free periodic job scheduler focused on three key aspects often overlooked:
 * 1. **Non-overlapping executions**
 * 2. **Graceful teardown**
 * 3. **Dynamic delay between executions**
 *
 * ### Non-Overlapping Executions
 * Ensures that job executions never overlap, making it suitable for use cases where concurrent runs
 * could cause race conditions or degrade performance.
 *
 * ### Graceful / Deterministic Teardown
 * Proper resource deallocation is critical when *stopping* periodic executions. This scheduler
 * guarantees that any ongoing execution is completed before shutdown, preventing memory leaks or
 * incomplete state. Without graceful teardown, leftover references from unfinished executions can lead
 * to unpredictable behavior - especially in unit tests, where isolated clean state is essential.
 *
 * ### Dynamic Execution Interval
 * The user provides a custom delay calculator, invoked immediately *after* each execution finishes.
 * It receives runtime metadata - such as duration and any thrown error - and determines the delay
 * before the next run. This allows flexible interval strategies based on application-specific logic.
 * By delegating this responsibility, the scheduler adheres to:
 * 1. **Information Expert Principle**: The user defines how the interval should adapt.
 * 2. **Single Responsibility Principle**: The scheduler solely manages job execution and timing.
 *
 * ### Zero Overengineering, No External Dependencies
 * `setInterval` often falls short with fixed intervals, overlapping executions, and non-deterministic
 * termination of the last execution. This class offers a minimalistic and efficient alternative
 * without introducing runtime dependencies.
 *
 * ### Robust Error Handling
 * If a job throws, the error is forwarded to the delay calculator. This allows the user to adjust
 * behavior accordingly (e.g., retry faster after failures). The scheduler itself performs no logging,
 * remaining agnostic to logging tools or conventions.
 *
 * ### Tests
 * This class is fully covered by an extensive suite of unit tests.
 */
export class NonOverlappingPeriodicJobScheduler<JobError = Error> {
  private _status: ActivityStatus = 'inactive';
  private _nextExecutionTimer?: NodeJS.Timeout;
  private _currentExecutionPromise?: Promise<void>;

  // The `setTimeout` callback is deliberately non-async, to prevent dangling promises.
  // Such are undesired, as they cannot be awaited, which is crucial for a graceful
  // (deterministic) `stop` operation.
  private readonly _initiateExecutionCycle = (): void => {
    this._currentExecutionPromise = this._runAndScheduleNext();
  };

  /**
   * @param _periodicJob The asynchronous job to execute periodically.
   * @param _computeNextDelay A function that determines the delay (in milliseconds) until the next
   *                          execution, based on the duration and any error of the previous execution.
   */
  constructor(
    private readonly _periodicJob: () => Promise<void>,
    private readonly _computeNextDelay: ComputeNextDelay<JobError>,
  ) {}

  /**
   * Indicates whether the periodic job is actively running, as opposed to being between executions.
   *
   * @returns `true` if the periodic job is currently executing, otherwise `false`.
   */
  public get isCurrentlyExecuting(): boolean {
    return this._currentExecutionPromise !== undefined;
  }

  /**
   * Returns the current instance status, which can be one of the following:
   * - `active`: Currently managing recurring executions.
   * - `inactive`: Not managing any recurring executions.
   * - `terminating`: A stop attempt was made, but the last execution from the
   *    previous session is still ongoing.
   *
   * @returns One of the following values: `active`, `inactive`, or `terminating`.
   */
  public get status(): ActivityStatus {
    return this._status;
  }

  /**
   * Initiates the scheduling of periodic jobs.
   *
   * ### Idempotency
   * This method is idempotent: calling it multiple times while the instance is already
   * active will *not* alter its state or trigger additional scheduling.
   *
   * ### Border Case: Invocation During a 'terminating' Status
   * If called while the instance is in a 'terminating' status (a rare scenario), this method
   * will first await a status change before determining whether the instance is active.
   * Please note that a well-designed application should strive to *avoid* such edge cases.
   *
   * ### Concurrency Considerations
   * The instance can transition between `active` and `inactive` states through successive calls
   * to `start` and `stop`, where each `start`-`stop` pair defines a **session**.
   * In **rare cases**, one task may stop an active instance while another concurrently attempts
   * to restart it, even as the final execution from the previous session is still ongoing.
   * While most real-world use cases involve a *single session throughout the application's
   * lifecycle*, this scenario is accounted for to ensure robustness.
   */
  public async start(): Promise<void> {
    while (this._status === 'terminating') {
      await this.waitUntilCurrentExecutionCompletes();
    }

    if (this._status === 'active') {
      return;
    }

    // Toggle from inactive to active.
    this._status = 'active';

    const syntheticPreviousExecutionMetadata: IPreviousExecutionMetadata<JobError> = {
      durationMs: NO_PREVIOUS_EXECUTION,
    };
    const firstExecutionDelay = this._computeNextDelay(syntheticPreviousExecutionMetadata);
    this._nextExecutionTimer = setTimeout(this._initiateExecutionCycle, firstExecutionDelay);
  }

  /**
   * Stops the scheduling of periodic jobs. If called during an ongoing execution, it resolves
   * only after that execution completes. This behavior ensures determinism and enables graceful
   * teardown.
   *
   * ### Idempotency
   * This method is **idempotent**: calling it multiple times while the status is not `active`
   * (either `inactive` or `terminating`) will *not* alter its state. It only deactivates job
   * scheduling if the instance is `active`.
   * In case the instance is in a `terminating` status (i.e., awaiting completion of the last
   * execution), a redundant call will wait for the ongoing execution to complete before resolving.
   * Please note that a well-designed application should strive to *avoid* such edge cases.
   */
  public async stop(): Promise<void> {
    if (this._status === 'inactive') {
      return;
    }

    if (this._status === 'terminating') {
      // A concurrent stop attempt was made. Wait for the ongoing execution to complete.
      await this.waitUntilCurrentExecutionCompletes();
      return;
    }

    // Toggle from active to terminating.
    this._status = 'terminating';

    if (this._nextExecutionTimer !== undefined) {
      clearTimeout(this._nextExecutionTimer);
      this._nextExecutionTimer = undefined;
    }

    await this.waitUntilCurrentExecutionCompletes();
    this._status = 'inactive';
  }

  /**
   * If an execution is in progress, resolves when it completes (regardless of success or failure).
   * If no execution is in progress, resolves immediately.
   */
  public waitUntilCurrentExecutionCompletes(): Promise<void> {
    return this._currentExecutionPromise ?? Promise.resolve();
  }

  private async _runAndScheduleNext(): Promise<void> {
    this._nextExecutionTimer = undefined;
    let thrownError: JobError = undefined;

    const startTime = Date.now();
    try {
      await this._periodicJob();
    } catch (err) {
      thrownError = err;
    }

    this._currentExecutionPromise = undefined;
    if (this._status !== 'active') {
      return;
    }

    const durationMs = Date.now() - startTime;
    try {
      const nextDelayMs = this._computeNextDelay({
        durationMs,
        error: thrownError,
      });
      this._nextExecutionTimer = setTimeout(this._initiateExecutionCycle, nextDelayMs);
    } catch (err) {
      // The calculator should *never* throw an error.
      // However, we handle this scenario to maintain robustness.
      this._status = 'inactive';

      // Propagating an error back to the calling stack can be critical and may crash
      // the application. Given the severity, this behavior is appropriate.
      throw err;
    }
  }
}
