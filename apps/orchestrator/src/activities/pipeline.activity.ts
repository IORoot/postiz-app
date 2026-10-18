import { Injectable, Logger } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { PipelineExecutionRepository } from '@gitroom/nestjs-libraries/database/prisma/pipelines/pipeline.execution.repository';
import {
  ClaimPipelineSlotRequest,
  ClaimPipelineSlotResponse,
  ClaimPipelineSlotV2Request,
  DiscoverDuePipelineSlotsRequest,
  DiscoverDuePipelineSlotsResponse,
  FinalizePipelineSlotRequest,
  FinalizePipelineSlotResponse,
  GetPipelinePostStateV1Request,
  PipelinePostStateV1,
  PipelineSlotFailureContext,
  RecordPipelineSlotDispatchFailureV1Request,
} from '@gitroom/nestjs-libraries/database/prisma/pipelines/pipeline.execution';
import { NotificationService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service';

@Injectable()
@Activity()
export class PipelineActivity {
  private readonly _logger = new Logger(PipelineActivity.name);

  constructor(
    private _pipelineExecutionRepository: PipelineExecutionRepository,
    private _notificationService: NotificationService
  ) {}

  @ActivityMethod()
  discoverDuePipelineSlots(
    request: DiscoverDuePipelineSlotsRequest
  ): Promise<DiscoverDuePipelineSlotsResponse> {
    return this._pipelineExecutionRepository.discoverDueSlots(request);
  }

  @ActivityMethod()
  async claimPipelineSlot(
    request: ClaimPipelineSlotRequest
  ): Promise<ClaimPipelineSlotResponse> {
    const result = await this._pipelineExecutionRepository.claimSlot(request);
    await this.reportSkippedSlot(request, result);
    if (result.outcome === 'FAILED' && result.executionId) {
      const context = await this._pipelineExecutionRepository.getFailureContext(
        result.executionId
      );
      await this.reportFailure(
        context,
        result.reason ||
          'Pipeline content could not be prepared for publishing'
      );
    }
    return result;
  }

  @ActivityMethod()
  async claimPipelineSlotV2(
    request: ClaimPipelineSlotV2Request
  ): Promise<ClaimPipelineSlotResponse> {
    const result = await this._pipelineExecutionRepository.claimSlotV2(request);
    await this.reportSkippedSlot(request, result);
    if (result.outcome === 'FAILED' && result.executionId) {
      const context = await this._pipelineExecutionRepository.getFailureContext(
        result.executionId
      );
      await this.reportFailure(
        context,
        result.reason ||
          'Pipeline content could not be prepared for publishing'
      );
    }
    return result;
  }

  @ActivityMethod()
  async finalizePipelineSlot(
    request: FinalizePipelineSlotRequest
  ): Promise<FinalizePipelineSlotResponse> {
    const result = await this._pipelineExecutionRepository.finalizeSlot(
      request.executionId
    );
    if (result.outcome === 'FAILED') {
      const context = await this._pipelineExecutionRepository.getFailureContext(
        request.executionId
      );
      await this.reportFailure(
        context,
        result.reason || 'One or more Pipeline channel posts did not publish'
      );
    }
    return result;
  }

  @ActivityMethod()
  async recordPipelineSlotDispatchFailureV1(
    request: RecordPipelineSlotDispatchFailureV1Request
  ): Promise<void> {
    const context =
      await this._pipelineExecutionRepository.recordDispatchFailureV1(request);
    await this.reportFailure(context, request.reason);
  }

  @ActivityMethod()
  getPipelinePostStateV1(
    request: GetPipelinePostStateV1Request
  ): Promise<PipelinePostStateV1> {
    return this._pipelineExecutionRepository.getPipelinePostStateV1(request);
  }

  private async reportSkippedSlot(
    request: ClaimPipelineSlotRequest,
    result: ClaimPipelineSlotResponse
  ) {
    if (
      result.outcome !== 'SKIPPED' ||
      !result.organizationId ||
      (result.reason !== 'MISSED' &&
        result.reason !== 'INACTIVE' &&
        result.reason !== 'STALE_REVISION' &&
        result.reason !== 'STALE_SLOT')
    ) {
      return;
    }
    const detail =
      result.reason === 'MISSED'
        ? 'The scheduled time passed and the post was not sent.'
        : result.reason === 'INACTIVE'
        ? 'The Pipeline is inactive, so this post was not sent.'
        : result.reason === 'STALE_REVISION'
        ? 'The Pipeline changed after that time, so this slot was not sent.'
        : 'That time is no longer on the Pipeline schedule, so this slot was not sent.';
    const pipelineName = result.pipelineName || 'Pipeline';
    this._logger.warn(
      `Pipeline slot skipped (${result.reason}) for ${request.pipelineId} at ${request.scheduledFor}`
    );
    await this.notify(
      result.organizationId,
      `Postiz did not send the scheduled ${pipelineName} post for ${request.scheduledFor}. ${detail} The post is still in the Pipeline queue.`
    );
  }

  private async reportFailure(
    context: PipelineSlotFailureContext | undefined,
    reason: string
  ) {
    const normalizedReason =
      reason.replace(/\s+/g, ' ').trim().slice(0, 2000) ||
      'Pipeline publishing failed';
    this._logger.error(
      `Pipeline publish failed: ${context?.pipelineId || 'unknown'} ${normalizedReason}`
    );
    if (!context) {
      return;
    }
    await this.notify(
      context.organizationId,
      `Postiz could not publish the scheduled item from Pipeline "${context.pipelineName}" at ${context.scheduledFor}. ${normalizedReason} Open the Pipeline's Failed section to review the item.`
    );
  }

  private async notify(orgId: string, message: string) {
    try {
      await this._notificationService.inAppNotification(
        orgId,
        'Pipeline',
        message
      );
    } catch (error) {
      this._logger.error(
        `Pipeline notification failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}
