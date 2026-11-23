import { TemporalService } from 'nestjs-temporal-core';
import { InfiniteWorkflowRegister } from './infinite.workflow.register';

const makeRegister = (start: jest.Mock) =>
  new InfiniteWorkflowRegister({
    client: { getRawClient: () => ({ workflow: { start } }) },
  } as unknown as TemporalService);

const alreadyStarted = () =>
  Object.assign(new Error('Workflow execution already started'), {
    name: 'WorkflowExecutionAlreadyStartedError',
  });

describe('InfiniteWorkflowRegister', () => {
  const originalRunCron = process.env.RUN_CRON;

  beforeEach(() => {
    process.env.RUN_CRON = 'true';
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env.RUN_CRON = originalRunCron;
    jest.restoreAllMocks();
  });

  it('starts both workflows when neither is running', async () => {
    const start = jest.fn().mockResolvedValue(undefined);

    await expect(makeRegister(start).onModuleInit()).resolves.toBeUndefined();

    expect(start).toHaveBeenNthCalledWith(1, 'missingPostWorkflow', {
      workflowId: 'missing-post-workflow',
      taskQueue: 'main',
    });
    expect(start).toHaveBeenNthCalledWith(2, 'pipelineSchedulerWorkflowV1', {
      workflowId: 'pipeline-scheduler-workflow-v1',
      taskQueue: 'main',
    });
    expect(console.info).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it('still starts the scheduler when missing-post is already running', async () => {
    const start = jest
      .fn()
      .mockRejectedValueOnce(alreadyStarted())
      .mockResolvedValueOnce(undefined);

    await expect(makeRegister(start).onModuleInit()).resolves.toBeUndefined();

    expect(start).toHaveBeenCalledTimes(2);
    expect(start).toHaveBeenNthCalledWith(
      2,
      'pipelineSchedulerWorkflowV1',
      expect.objectContaining({ workflowId: 'pipeline-scheduler-workflow-v1' })
    );
    expect(console.info).toHaveBeenCalledWith(
      'Workflow missing-post-workflow is already running'
    );
    expect(console.error).not.toHaveBeenCalled();
  });

  it('treats an "already started" message without the error name as expected', async () => {
    const start = jest
      .fn()
      .mockRejectedValueOnce(new Error('workflow execution Already Started'))
      .mockResolvedValueOnce(undefined);

    await makeRegister(start).onModuleInit();

    expect(start).toHaveBeenCalledTimes(2);
    expect(console.info).toHaveBeenCalledTimes(1);
    expect(console.error).not.toHaveBeenCalled();
  });

  it('logs an unexpected error from the first start and still starts the scheduler', async () => {
    const start = jest
      .fn()
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValueOnce(undefined);

    await expect(makeRegister(start).onModuleInit()).resolves.toBeUndefined();

    expect(start).toHaveBeenCalledTimes(2);
    expect(start).toHaveBeenNthCalledWith(
      2,
      'pipelineSchedulerWorkflowV1',
      expect.objectContaining({ workflowId: 'pipeline-scheduler-workflow-v1' })
    );
    expect(console.error).toHaveBeenCalledWith(
      'Could not start workflow missing-post-workflow:',
      expect.objectContaining({ message: 'connection refused' })
    );
    expect(console.info).not.toHaveBeenCalled();
  });

  it('logs an unexpected error from the scheduler start without rejecting', async () => {
    const start = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('temporal unavailable'));

    await expect(makeRegister(start).onModuleInit()).resolves.toBeUndefined();

    expect(console.error).toHaveBeenCalledWith(
      'Could not start workflow pipeline-scheduler-workflow-v1:',
      expect.objectContaining({ message: 'temporal unavailable' })
    );
  });

  it('does nothing when RUN_CRON is unset', async () => {
    delete process.env.RUN_CRON;
    const start = jest.fn().mockResolvedValue(undefined);

    await makeRegister(start).onModuleInit();

    expect(start).not.toHaveBeenCalled();
  });
});
