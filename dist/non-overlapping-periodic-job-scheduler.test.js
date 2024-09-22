"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("./index");
const createError = (jobID) => ({
    name: 'CustomJobError',
    message: `Job no. ${jobID} has failed`,
    jobID
});
/**
 * resolveFast
 *
 * The one-and-only purpose of this function, is triggerring an event-loop iteration.
 * It is relevant whenever a test needs to simulate tasks from the Node.js' micro-tasks queue.
 */
const resolveFast = async () => {
    expect(14).toBeGreaterThan(3);
};
const MOCK_FIRST_EXECUTION_MS_DELAY = 500;
const MOCK_MS_DELAY_AFTER_FAILED_JOB = 3 * 1000;
const MOCK_INTERVAL_BETWEEN_CONSECUTIVE_STARTS = 5 * 1000;
describe('NonOverlappingPeriodicJobScheduler tests', () => {
    let setTimeoutSpy;
    let nextDelayCalculatorSpy;
    let lastThrownError;
    /**
     * mockCalculateDelayTillNextExecution
     *
     * This implementation is provided as an illustrative example for the context of these tests.
     * While a basic Jest mock function would suffice, this implementation demonstrates a potential
     * real-world scenario.
     * Since we use Jest's mock timers, the mock delay times do not affect the tests' execution time.
     *
     * This function mimics a real-life scenario by maintaining a fixed interval between the
     * start times of consecutive executions, similar to `setInterval`.
     * If an execution lasts longer than expected, the next execution is scheduled according
     * to the originally planned start time.
     */
    const mockCalculateDelayTillNextExecution = (justFinishedExecutionDurationMs, justFinishedExecutionError) => {
        if (justFinishedExecutionError) {
            expect(justFinishedExecutionError).toBe(lastThrownError);
            expect(justFinishedExecutionError).toEqual(lastThrownError);
        }
        else {
            expect(lastThrownError).toBeUndefined();
        }
        if (justFinishedExecutionDurationMs === index_1.NO_PREVIOUS_EXECUTION) {
            return MOCK_FIRST_EXECUTION_MS_DELAY;
        }
        if (justFinishedExecutionError) {
            return MOCK_MS_DELAY_AFTER_FAILED_JOB;
        }
        // For example, if a just-finished execution took 1000ms, and the desired interval-between-starts
        // is 5000ms, the next execution should start within 4000ms.
        return MOCK_INTERVAL_BETWEEN_CONSECUTIVE_STARTS -
            (justFinishedExecutionDurationMs % MOCK_INTERVAL_BETWEEN_CONSECUTIVE_STARTS);
    };
    beforeEach(() => {
        jest.useFakeTimers();
        setTimeoutSpy = jest.spyOn(global, 'setTimeout');
        lastThrownError = undefined;
        nextDelayCalculatorSpy = jest.fn();
        nextDelayCalculatorSpy.mockImplementation(mockCalculateDelayTillNextExecution);
    });
    afterEach(() => {
        jest.restoreAllMocks();
        jest.useRealTimers();
    });
    describe('Happy path tests', () => {
        test('should trigger executions as expected when all jobs succeed', async () => {
            // We create unresolved promises, simulating an async work in progress.
            // They will be resolved later, once we want to simulate a successful completion of the async work.
            let completeCurrentJob;
            const job = () => new Promise(res => completeCurrentJob = res);
            const jobSpy = jest.fn()
                .mockImplementation(job);
            const scheduler = new index_1.NonOverlappingPeriodicJobScheduler(jobSpy, nextDelayCalculatorSpy);
            // Not started yet.
            expect(scheduler.isStopped).toBe(true);
            expect(scheduler.isCurrentlyExecuting).toBe(false);
            scheduler.start();
            const numberOfExecutions = 14;
            for (let ithExecution = 1; ithExecution <= numberOfExecutions; ++ithExecution) {
                expect(scheduler.isStopped).toBe(false);
                expect(scheduler.isCurrentlyExecuting).toBe(false);
                expect(setTimeoutSpy).toHaveBeenCalledTimes(ithExecution);
                expect(nextDelayCalculatorSpy).toHaveBeenCalledTimes(ithExecution);
                // The next-execution's `setTimeout` callback will be invoked now.
                jest.runOnlyPendingTimers();
                await resolveFast();
                expect(jobSpy).toHaveBeenCalledTimes(ithExecution);
                expect(scheduler.isStopped).toBe(false);
                expect(scheduler.isCurrentlyExecuting).toBe(true); // Until we resolve, the promise is in a pending state.
                completeCurrentJob();
                await scheduler.waitUntilCurrentExecutionCompletes();
                expect(scheduler.isStopped).toBe(false);
                expect(scheduler.isCurrentlyExecuting).toBe(false);
            }
            await scheduler.stop();
            expect(scheduler.isStopped).toBe(true);
            expect(scheduler.isCurrentlyExecuting).toBe(false);
        });
        test('should handle job rejections and trigger executions as expected', async () => {
            // We create unresolved promises, simulating an async work in progress.
            // They will be rejected later, once we want to simulate a failed-completion of the async work.
            let failCurrentJob;
            const job = () => new Promise((_, rej) => failCurrentJob = rej);
            const jobSpy = jest.fn()
                .mockImplementation(job);
            const scheduler = new index_1.NonOverlappingPeriodicJobScheduler(jobSpy, nextDelayCalculatorSpy);
            // Not started yet.
            expect(scheduler.isStopped).toBe(true);
            expect(scheduler.isCurrentlyExecuting).toBe(false);
            scheduler.start();
            const numberOfExecutions = 15;
            for (let ithExecution = 1; ithExecution <= numberOfExecutions; ++ithExecution) {
                expect(scheduler.isStopped).toBe(false);
                expect(scheduler.isCurrentlyExecuting).toBe(false);
                expect(setTimeoutSpy).toHaveBeenCalledTimes(ithExecution);
                expect(nextDelayCalculatorSpy).toHaveBeenCalledTimes(ithExecution);
                // The next-execution's `setTimeout` callback will be invoked now.
                jest.runOnlyPendingTimers();
                await resolveFast();
                expect(jobSpy).toHaveBeenCalledTimes(ithExecution);
                expect(scheduler.isStopped).toBe(false);
                expect(scheduler.isCurrentlyExecuting).toBe(true); // Until we reject, the promise is in a pending state.
                lastThrownError = createError(ithExecution);
                failCurrentJob(lastThrownError);
                await scheduler.waitUntilCurrentExecutionCompletes();
            }
            await scheduler.stop();
            expect(scheduler.isStopped).toBe(true);
            expect(scheduler.isCurrentlyExecuting).toBe(false);
        });
        test('should handle mixed job outcomes (success or failure) and trigger executions as expected', async () => {
            let ithJobExecution = 1;
            let completeCurrentJob; // Either resolves or rejects.
            const job = () => new Promise((res, rej) => {
                lastThrownError = undefined;
                const shouldSucceed = ithJobExecution % 2 === 0;
                completeCurrentJob = () => {
                    if (shouldSucceed) {
                        res();
                    }
                    else {
                        lastThrownError = createError(ithJobExecution);
                        rej(lastThrownError);
                    }
                };
                ++ithJobExecution;
            });
            const jobSpy = jest.fn()
                .mockImplementation(job);
            const scheduler = new index_1.NonOverlappingPeriodicJobScheduler(jobSpy, nextDelayCalculatorSpy);
            // Not started yet.
            expect(scheduler.isStopped).toBe(true);
            expect(scheduler.isCurrentlyExecuting).toBe(false);
            scheduler.start();
            const numberOfExecutions = 14;
            for (let ithExecution = 1; ithExecution <= numberOfExecutions; ++ithExecution) {
                expect(scheduler.isStopped).toBe(false);
                expect(scheduler.isCurrentlyExecuting).toBe(false);
                expect(setTimeoutSpy).toHaveBeenCalledTimes(ithExecution);
                expect(nextDelayCalculatorSpy).toHaveBeenCalledTimes(ithExecution);
                // The next-execution's `setTimeout` callback will be invoked now.
                jest.runOnlyPendingTimers();
                await resolveFast();
                expect(jobSpy).toHaveBeenCalledTimes(ithExecution);
                expect(scheduler.isStopped).toBe(false);
                expect(scheduler.isCurrentlyExecuting).toBe(true);
                completeCurrentJob();
                await scheduler.waitUntilCurrentExecutionCompletes();
            }
            await scheduler.stop();
            expect(scheduler.isStopped).toBe(true);
            expect(scheduler.isCurrentlyExecuting).toBe(false);
        });
    });
    describe('Negative path tests', () => {
        test('should throw when starting an already started instance', () => {
            let wasExcetued = false;
            const job = () => new Promise(_ => {
                wasExcetued = true; // The flow should not reach this point.
            });
            const jobSpy = jest.fn()
                .mockImplementation(job);
            const scheduler = new index_1.NonOverlappingPeriodicJobScheduler(jobSpy, nextDelayCalculatorSpy);
            scheduler.start();
            expect(scheduler.isStopped).toBe(false);
            expect(scheduler.isCurrentlyExecuting).toBe(false);
            expect(jobSpy).toHaveBeenCalledTimes(0);
            expect(() => scheduler.start()).toThrow();
            expect(wasExcetued).toBe(false);
        });
    });
});
//# sourceMappingURL=non-overlapping-periodic-job-scheduler.test.js.map