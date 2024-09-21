"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("./index");
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
/**
 * mockCalculateDelayTillNextExecution
 *
 * Note: This implementation is intended to be illustrative in the context of these tests,
 * as all timers are mocked (delay times do not impact execution time). A simple Jest mock
 * function would suffice.
 *
 * This function mimics a real-life scenario by maintaining a fixed interval between the
 * start times of consecutive executions, similar to `setInterval`.
 * If an execution lasts longer than expected, the next execution is scheduled according
 * to the originally planned start time.
 */
const mockCalculateDelayTillNextExecution = (justFinishedExecutionDurationMs, justFinishedExecutionError) => {
    if (justFinishedExecutionDurationMs === index_1.NO_PREVIOUS_EXECUTION) {
        return MOCK_FIRST_EXECUTION_MS_DELAY;
    }
    if (justFinishedExecutionError) {
        return MOCK_MS_DELAY_AFTER_FAILED_JOB;
    }
    // For example, if a just-finished execution took 1000ms, and the desired interval-between-starts is
    // 5000ms, the next execution should start within 4000ms.
    return MOCK_INTERVAL_BETWEEN_CONSECUTIVE_STARTS -
        (justFinishedExecutionDurationMs % MOCK_INTERVAL_BETWEEN_CONSECUTIVE_STARTS);
};
describe('NonOverlappingPeriodicJobScheduler tests', () => {
    let setTimeoutSpy;
    let nextDelayCalculatorSpy;
    beforeEach(() => {
        jest.useFakeTimers();
        setTimeoutSpy = jest.spyOn(global, 'setTimeout');
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
            for (let currentExecution = 1; currentExecution <= numberOfExecutions; ++currentExecution) {
                expect(scheduler.isStopped).toBe(false);
                expect(scheduler.isCurrentlyExecuting).toBe(false);
                expect(setTimeoutSpy).toHaveBeenCalledTimes(currentExecution);
                expect(nextDelayCalculatorSpy).toHaveBeenCalledTimes(currentExecution);
                // The next-execution's `setTimeout` callback will be invoked now.
                jest.runOnlyPendingTimers();
                await resolveFast();
                expect(jobSpy).toHaveBeenCalledTimes(currentExecution);
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
            let completeCurrentJob;
            const job = () => new Promise((_, rej) => completeCurrentJob = rej);
            const jobSpy = jest.fn()
                .mockImplementation(job);
            const scheduler = new index_1.NonOverlappingPeriodicJobScheduler(jobSpy, nextDelayCalculatorSpy);
            // Not started yet.
            expect(scheduler.isStopped).toBe(true);
            expect(scheduler.isCurrentlyExecuting).toBe(false);
            scheduler.start();
            const numberOfExecutions = 15;
            for (let currentExecution = 1; currentExecution <= numberOfExecutions; ++currentExecution) {
                expect(scheduler.isStopped).toBe(false);
                expect(scheduler.isCurrentlyExecuting).toBe(false);
                expect(setTimeoutSpy).toHaveBeenCalledTimes(currentExecution);
                expect(nextDelayCalculatorSpy).toHaveBeenCalledTimes(currentExecution);
                // The next-execution's `setTimeout` callback will be invoked now.
                jest.runOnlyPendingTimers();
                await resolveFast();
                expect(jobSpy).toHaveBeenCalledTimes(currentExecution);
                expect(scheduler.isStopped).toBe(false);
                expect(scheduler.isCurrentlyExecuting).toBe(true); // Until we reject, the promise is in a pending state.
                completeCurrentJob(new Error('Why bad things happen to good schedulers?'));
                await scheduler.waitUntilCurrentExecutionCompletes();
                expect(scheduler.isStopped).toBe(false);
                expect(scheduler.isCurrentlyExecuting).toBe(false);
            }
            await scheduler.stop();
            expect(scheduler.isStopped).toBe(true);
            expect(scheduler.isCurrentlyExecuting).toBe(false);
        });
        test('should handle mixed job outcomes (success or failure) and trigger executions as expected', async () => {
            let ithJobExecution = 1;
            let completeCurrentJob; // Either resolves or rejects.
            const job = () => {
                return new Promise((res, rej) => {
                    completeCurrentJob = (ithJobExecution % 2 === 0) ? res : rej;
                    ++ithJobExecution;
                });
            };
            const jobSpy = jest.fn()
                .mockImplementation(job);
            const scheduler = new index_1.NonOverlappingPeriodicJobScheduler(jobSpy, nextDelayCalculatorSpy);
            // Not started yet.
            expect(scheduler.isStopped).toBe(true);
            expect(scheduler.isCurrentlyExecuting).toBe(false);
            scheduler.start();
            const numberOfExecutions = 14;
            for (let currentExecution = 1; currentExecution <= numberOfExecutions; ++currentExecution) {
                expect(scheduler.isStopped).toBe(false);
                expect(scheduler.isCurrentlyExecuting).toBe(false);
                expect(setTimeoutSpy).toHaveBeenCalledTimes(currentExecution);
                expect(nextDelayCalculatorSpy).toHaveBeenCalledTimes(currentExecution);
                // The next-execution's `setTimeout` callback will be invoked now.
                jest.runOnlyPendingTimers();
                await resolveFast();
                expect(jobSpy).toHaveBeenCalledTimes(currentExecution);
                expect(scheduler.isStopped).toBe(false);
                expect(scheduler.isCurrentlyExecuting).toBe(true);
                completeCurrentJob();
                await scheduler.waitUntilCurrentExecutionCompletes();
                expect(scheduler.isStopped).toBe(false);
                expect(scheduler.isCurrentlyExecuting).toBe(false);
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