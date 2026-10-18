import { PipelineActivity } from '@gitroom/orchestrator/activities/pipeline.activity';
import { pipelinePostWorkflowV1 } from '@gitroom/orchestrator/workflows/pipeline-workflows/pipeline.post.workflow.v1';
import { PipelineSlotWorkflowV1Request } from '@gitroom/nestjs-libraries/database/prisma/pipelines/pipeline.execution';
import {
  proxyActivities,
  sleep,
  startChild,
  workflowInfo,
} from '@temporalio/workflow';
import { TypedSearchAttributes } from '@temporalio/common';
import {
  organizationId,
  postId,
} from '@gitroom/nestjs-libraries/temporal/temporal.search.attribute';

const {
  claimPipelineSlotV2,
  finalizePipelineSlot,
  getPipelinePostStateV1,
  recordPipelineSlotDispatchFailureV1,
} = proxyActivities<PipelineActivity>({
  startToCloseTimeout: '2 minutes',
  taskQueue: 'main',
  retry: {
    maximumAttempts: 3,
    initialInterval: '5 seconds',
    backoffCoefficient: 2,
  },
});

const failureDetail = (error: unknown) => {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
      ? error
      : 'Unknown Temporal child workflow error';
  return message.replace(/\s+/g, ' ').trim().slice(0, 500);
};

const isAlreadyStarted = (error: unknown): boolean => {
  const value = error as { name?: string; message?: string };
  return (
    value?.name === 'WorkflowExecutionAlreadyStartedError' ||
    !!value?.message?.toLowerCase().includes('already started')
  );
};

const waitForExistingPostWorkflow = async (
  executionId: string,
  postIdValue: string
) => {
  for (let attempt = 0; attempt < 720; attempt++) {
    const state = await getPipelinePostStateV1({
      executionId,
      postId: postIdValue,
    });
    if (state === 'PUBLISHED' || state === 'ERROR') {
      return true;
    }
    if (state === 'MISSING') {
      return false;
    }
    await sleep('30 seconds');
  }
  return false;
};

export async function pipelineSlotWorkflowV1(
  request: PipelineSlotWorkflowV1Request
) {
  const claim = await claimPipelineSlotV2({
    ...request,
    nowUtc: new Date().toISOString(),
    claimOwner: workflowInfo().workflowId,
  });
  if (claim.outcome !== 'CLAIMED' || !claim.executionId) {
    return claim;
  }

  await Promise.all(
    claim.roots.map(async (root) => {
      let child;
      try {
        child = await startChild(pipelinePostWorkflowV1, {
          workflowId: `post_${root.postId}_pipeline_${claim.executionId}`,
          args: [
            {
              taskQueue: root.taskQueue,
              postId: root.postId,
              organizationId: root.organizationId,
              pipelineExecutionId: claim.executionId,
            },
          ],
          typedSearchAttributes: new TypedSearchAttributes([
            { key: postId, value: root.postId },
            { key: organizationId, value: root.organizationId },
          ]),
        });
      } catch (error) {
        if (
          isAlreadyStarted(error) &&
          (await waitForExistingPostWorkflow(claim.executionId, root.postId))
        ) {
          return;
        }
        try {
          await recordPipelineSlotDispatchFailureV1({
            executionId: claim.executionId!,
            postId: root.postId,
            reason: `The publishing workflow for post ${
              root.postId
            } could not start. ${failureDetail(error)}`,
          });
        } catch {
          // The slot is already marked failed inside the activity when it runs.
        }
        return;
      }
      await child.result();
    })
  );

  return finalizePipelineSlot({ executionId: claim.executionId });
}
