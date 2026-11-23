import { Global, Injectable, Module, OnModuleInit } from '@nestjs/common';
import { TemporalService } from 'nestjs-temporal-core';

const isAlreadyStarted = (error: unknown): boolean => {
  const value = error as { name?: string; message?: string };
  return (
    value?.name === 'WorkflowExecutionAlreadyStartedError' ||
    !!value?.message?.toLowerCase().includes('already started')
  );
};

@Injectable()
export class InfiniteWorkflowRegister implements OnModuleInit {
  constructor(private _temporalService: TemporalService) {}

  async onModuleInit(): Promise<void> {
    if (!!process.env.RUN_CRON) {
      await this.startWorkflow('missingPostWorkflow', 'missing-post-workflow');
      await this.startWorkflow(
        'pipelineSchedulerWorkflowV1',
        'pipeline-scheduler-workflow-v1'
      );
    }
  }

  // Each start is independent: a failure here must not stop the next one.
  private async startWorkflow(type: string, workflowId: string): Promise<void> {
    try {
      await this._temporalService.client
        ?.getRawClient()
        ?.workflow?.start(type, {
          workflowId,
          taskQueue: 'main',
        });
    } catch (err) {
      if (isAlreadyStarted(err)) {
        console.info(`Workflow ${workflowId} is already running`);
        return;
      }
      console.error(`Could not start workflow ${workflowId}:`, err);
    }
  }
}

@Global()
@Module({
  imports: [],
  controllers: [],
  providers: [InfiniteWorkflowRegister],
  get exports() {
    return this.providers;
  },
})
export class InfiniteWorkflowRegisterModule {}
