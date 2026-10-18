import { PostActivity } from '@gitroom/orchestrator/activities/post.activity';
import { postWorkflowV112 } from '@gitroom/orchestrator/workflows/post-workflows/post.workflow.v1.1.2';
import { proxyActivities, startChild } from '@temporalio/workflow';
import { TypedSearchAttributes } from '@temporalio/common';
import {
  organizationId,
  postId,
} from '@gitroom/nestjs-libraries/temporal/temporal.search.attribute';

type PipelinePostWorkflowV1Request = {
  taskQueue: string;
  postId: string;
  organizationId: string;
  pipelineExecutionId: string;
};

const { getPost } = proxyActivities<PostActivity>({
  startToCloseTimeout: '2 minutes',
  retry: {
    maximumAttempts: 3,
    initialInterval: '5 seconds',
    backoffCoefficient: 2,
  },
});

// Wraps the current post publisher so a Pipeline slot can start it without
// changing post.workflow.v1.1.2, which is already running in production.
export async function pipelinePostWorkflowV1(
  request: PipelinePostWorkflowV1Request
) {
  const post = await getPost(request.organizationId, request.postId);
  if (!post || post.state === 'ERROR') {
    return false;
  }
  if (post.state === 'PUBLISHED') {
    return true;
  }
  if (post.state !== 'QUEUE') {
    return false;
  }

  const child = await startChild(postWorkflowV112, {
    workflowId: `post_${request.postId}_pipeline_${request.pipelineExecutionId}`,
    args: [
      {
        taskQueue: request.taskQueue,
        postId: request.postId,
        organizationId: request.organizationId,
      },
    ],
    typedSearchAttributes: new TypedSearchAttributes([
      { key: postId, value: request.postId },
      { key: organizationId, value: request.organizationId },
    ]),
  });
  return child.result();
}
