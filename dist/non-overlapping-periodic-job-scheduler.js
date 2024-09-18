"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NonOverlappingPeriodicJobScheduler = void 0;
const types_1 = require("./types");
/**
 * NonOverlappingPeriodicJobScheduler
 *
 * This class implements a slim periodic-job scheduler, focusing on three aspects often overlooked:
 * 1. **Non-overlapping executions**.
 * 2. **Deterministic termination**.
 * 3. **Dynamic delay between executions**.
 *
 * ## Non-Overlapping Executions
 * Ensures that executions do not overlap. This is suitable for scenarios where overlapping executions
 * may cause race conditions or negatively impact performance.
 *
 * ## Deterministic / Graceful Termination
 * When stopping periodic executions, it is crucial to ensure that any ongoing execution is completed
 * before termination. This deterministic termination approach ensures that no unfinished executions
 * leave objects in memory, which could otherwise lead to unexpected behavior.
 * Without deterministic termination, leftover references from incomplete executions can cause
 * issues, such as unexpected behavior during unit tests. A clean state is necessary for each test,
 * and ongoing jobs from a previous test can interfere with subsequent tests.
 *
 * ## Dynamic Execution Interval
 * User provides a custom calculator function, to determine the delay until the next execution, based on
 * the runtime metadata of the just-finished execution (duration, error if thrown).
 * This calculator is invoked at the **end** of each execution, enabling flexible interval policies based
 * on user-defined criteria. This approach ensures that the scheduler remains agnostic of scheduling-policy
 * preferences, focusing solely on the scheduling process. In this way, we adhere to the following principles:
 * 1. **Information Expert Principle**: The interval policy is defined by the user.
 * 2. **Single Responsibility Principle**: The scheduler's sole responsibility is to manage the scheduling
 *    process.
 *
 * ## Zero Over-Engineering, No External Dependencies
 * `setInterval` often falls short with fixed intervals, overlapping executions, and non-deterministic
 * termination of the last execution. Custom solutions or external libraries usually come with numerous
 * runtime dependencies, which can unnecessarily increase the project's size.
 * This class offers a lightweight, dependency-free solution. It can also serve as a building block for
 * more advanced implementations, if necessary.
 *
 * ## Error Handling
 * If a periodic job throws an error, the error will be passed to the calculator function. The scheduler
 * does not perform any logging, as it is designed to be agnostic of user preferences, such as specific
 * loggers or logging styles.
 *
 * ## Fully Coverged
 * This class is fully covered by unit tests.
 *
 */
class NonOverlappingPeriodicJobScheduler {
    /**
     * constructor
     *
     * @param _periodicJob the periodic job
     * @param _calculateDelayTillNextExecution check full documentation at types.ts
     */
    constructor(_periodicJob, _calculateDelayTillNextExecution) {
        this._periodicJob = _periodicJob;
        this._calculateDelayTillNextExecution = _calculateDelayTillNextExecution;
        this._isStopped = true;
        this._nextExecutionTimer = null;
        this._currentExecutionPromise = null;
        // The `setTimeout` callback is deliberately non-async, to prevent dangling promises.
        // Such are undesired, as they cannot be awaited, which is crucial for a deterministic
        // (graceful) `stop` operation.
        this._triggerExecution = () => {
            this._currentExecutionPromise = this._triggerCurrentExecutionAndScheduleNext();
        };
    }
    get isCurrentlyExecuting() {
        return this._currentExecutionPromise !== null;
    }
    get isStopped() {
        return this._isStopped;
    }
    /**
     * start
     *
     * Initiates the scheduling of periodic jobs.
     */
    start() {
        if (!this._isStopped) {
            throw new Error('Cannot start an already started NonOverlappingPeriodicJobScheduler instance');
        }
        this._isStopped = false;
        const firstExecutionDelay = this._calculateDelayTillNextExecution(types_1.NO_PREVIOUS_EXECUTION);
        this._nextExecutionTimer = setTimeout(this._triggerExecution, firstExecutionDelay);
    }
    waitTillCurrentExecutionSettles() {
        return this._currentExecutionPromise ?? Promise.resolve();
    }
    /**
     * stop
     *
     * Stops the scheduling of periodic jobs. If this method is invoked during an ongoing execution,
     * it resolves once the current execution is complete. This guarantee provides determinism and
     * allows for graceful termination.
     */
    stop() {
        this._isStopped = true;
        if (this._nextExecutionTimer) {
            clearTimeout(this._nextExecutionTimer);
            this._nextExecutionTimer = null;
        }
        return this.waitTillCurrentExecutionSettles();
    }
    async _triggerCurrentExecutionAndScheduleNext() {
        this._nextExecutionTimer = null;
        let thrownError = undefined;
        const startTime = Date.now();
        try {
            await this._periodicJob();
        }
        catch (err) {
            thrownError = err;
        }
        this._currentExecutionPromise = null;
        if (this._isStopped) {
            return;
        }
        const justFinishedExecutionDurationMs = Date.now() - startTime;
        try {
            const delayTillNextExecution = this._calculateDelayTillNextExecution(justFinishedExecutionDurationMs, thrownError);
            this._nextExecutionTimer = setTimeout(this._triggerExecution, delayTillNextExecution);
        }
        catch (err) {
            // The calculator should never throw an error, so this scenario is unlikely.
            // However, we handle it to ensure robustness.
            this._isStopped = true;
            throw err;
        }
    }
}
exports.NonOverlappingPeriodicJobScheduler = NonOverlappingPeriodicJobScheduler;
//# sourceMappingURL=non-overlapping-periodic-job-scheduler.js.map