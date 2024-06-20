"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("./index");
/**
 * resolveFast
 *
 * The one-and-only purpose of this function, is triggerring an event-loop iteration.
 * It is relevant whenever a test needs to simulate tasks from the Node.js' micro-tasks queue.
 */
const resolveFast = () => __awaiter(void 0, void 0, void 0, function* () {
    expect(14).toBeGreaterThan(3);
});
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
        test('should trigger executions as expected, when all executions succeed', () => __awaiter(void 0, void 0, void 0, function* () {
            // Each job execution returns a pending promise, and we store its resolve callback,
            // which enables us to control the flow (resolve time).
            let resolveCurrentJobExecution;
            const job = () => new Promise(res => resolveCurrentJobExecution = res);
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
                yield resolveFast();
                expect(jobSpy).toHaveBeenCalledTimes(currentExecution);
                expect(scheduler.isStopped).toBe(false);
                expect(scheduler.isCurrentlyExecuting).toBe(true); // Till we resolve, the promise is in pending-state.
                resolveCurrentJobExecution();
                yield scheduler.waitTillCurrentExecutionSettles();
                expect(scheduler.isStopped).toBe(false);
                expect(scheduler.isCurrentlyExecuting).toBe(false);
            }
            yield scheduler.stop();
            expect(scheduler.isStopped).toBe(true);
            expect(scheduler.isCurrentlyExecuting).toBe(false);
        }));
        test('should trigger executions as expected, when all executions fail (job promise rejects)', () => __awaiter(void 0, void 0, void 0, function* () {
            // Each job execution returns a pending promise, and we store its reject callback,
            // which enables us to control the flow (resolve time).
            let rejectCurrentJobExecution;
            const job = () => new Promise((_, rej) => rejectCurrentJobExecution = rej);
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
                yield resolveFast();
                expect(jobSpy).toHaveBeenCalledTimes(currentExecution);
                expect(scheduler.isStopped).toBe(false);
                expect(scheduler.isCurrentlyExecuting).toBe(true); // Till we reject, the promise is in pending-state.
                rejectCurrentJobExecution(new Error('Why bad things happen to good jobs?'));
                yield scheduler.waitTillCurrentExecutionSettles();
                expect(scheduler.isStopped).toBe(false);
                expect(scheduler.isCurrentlyExecuting).toBe(false);
            }
            yield scheduler.stop();
            expect(scheduler.isStopped).toBe(true);
            expect(scheduler.isCurrentlyExecuting).toBe(false);
        }));
        test('should trigger executions as expected, when some succeed and some fail', () => __awaiter(void 0, void 0, void 0, function* () {
            let jobNumber = 1;
            let finishCurrentJobExecution; // Either resolve or reject.
            const job = () => {
                return new Promise((res, rej) => {
                    if (jobNumber % 2 == 0) {
                        finishCurrentJobExecution = res;
                    }
                    else {
                        finishCurrentJobExecution = rej;
                    }
                    ++jobNumber;
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
                yield resolveFast();
                expect(jobSpy).toHaveBeenCalledTimes(currentExecution);
                expect(scheduler.isStopped).toBe(false);
                expect(scheduler.isCurrentlyExecuting).toBe(true);
                finishCurrentJobExecution();
                yield scheduler.waitTillCurrentExecutionSettles();
                expect(scheduler.isStopped).toBe(false);
                expect(scheduler.isCurrentlyExecuting).toBe(false);
            }
            yield scheduler.stop();
            expect(scheduler.isStopped).toBe(true);
            expect(scheduler.isCurrentlyExecuting).toBe(false);
        }));
    });
    describe('Negative path tests', () => {
        test('should throw when starting an already started instance', () => {
            const job = () => new Promise(_ => { }); // Never resolves. A job won't be executed anyway.
            const jobSpy = jest.fn()
                .mockImplementation(job);
            const scheduler = new index_1.NonOverlappingPeriodicJobScheduler(jobSpy, nextDelayCalculatorSpy);
            scheduler.start();
            expect(scheduler.isStopped).toBe(false);
            expect(scheduler.isCurrentlyExecuting).toBe(false);
            expect(jobSpy).toHaveBeenCalledTimes(0);
            expect(() => scheduler.start()).toThrow();
        });
    });
});
//# sourceMappingURL=non-overlapping-periodic-job-scheduler.test.js.map