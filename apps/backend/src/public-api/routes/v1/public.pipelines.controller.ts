import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Organization } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { PipelineService } from '@gitroom/nestjs-libraries/database/prisma/pipelines/pipeline.service';
import { normalizeIdempotencyKey } from '@gitroom/nestjs-libraries/database/prisma/pipelines/public.pipeline.enqueue';
import { queuePromoteWithoutDate } from '@gitroom/nestjs-libraries/database/prisma/pipelines/public.queue.promote';
import * as Sentry from '@sentry/nestjs';

@ApiTags('Public API')
@Controller('/public/v1')
export class PublicPipelinesController {
  constructor(private _pipelineService: PipelineService) {}

  @Get('/pipelines')
  getPipelines(@GetOrgFromRequest() org: Organization) {
    Sentry.metrics.count('public_api-request', 1);
    return this._pipelineService.getPublicPipelines(org.id);
  }

  @Post('/pipelines/enqueue')
  enqueue(@GetOrgFromRequest() org: Organization, @Body() rawBody: any) {
    Sentry.metrics.count('public_api-request', 1);
    const normalized = normalizeIdempotencyKey(rawBody?.idempotencyKey);
    if ('error' in normalized) {
      throw new HttpException({ msg: normalized.error }, 400);
    }
    const body = { ...(rawBody ?? {}) };
    delete body.idempotencyKey;
    return this._pipelineService.enqueue(org.id, body, 'API', normalized.key);
  }

  @Get('/pipelines/queue/:id')
  async getQueueItem(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    const item = await this._pipelineService.getPublicQueueItem(org.id, id);
    if (!item) {
      throw new HttpException({ msg: 'Queue item not found' }, 404);
    }
    return item;
  }

  @Post('/pipelines/queue/:id/schedule')
  async scheduleQueueItem(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: { date?: string }
  ) {
    Sentry.metrics.count('public_api-request', 1);
    if (body?.date) {
      try {
        await this._pipelineService.scheduleItem(org.id, id, body.date);
      } catch (err) {
        if (err instanceof NotFoundException) {
          throw new HttpException({ msg: 'Queue item not found' }, 404);
        }
        if (err instanceof BadRequestException) {
          throw new HttpException({ msg: err.message }, 400);
        }
        throw err;
      }
    } else {
      const current = await this._pipelineService.getPublicQueueItem(
        org.id,
        id
      );
      if (!current) {
        throw new HttpException({ msg: 'Queue item not found' }, 404);
      }
      if ('code' in queuePromoteWithoutDate(current)) {
        throw new HttpException(
          { code: 'no_free_slot', msg: 'Pipeline has no free slot' },
          409
        );
      }
      return current;
    }

    const item = await this._pipelineService.getPublicQueueItem(org.id, id);
    if (!item) {
      throw new HttpException({ msg: 'Queue item not found' }, 404);
    }
    return item;
  }

  @Delete('/pipelines/queue/group/:group')
  deleteQueueItemByGroup(
    @GetOrgFromRequest() org: Organization,
    @Param('group') group: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return this.deleteQueueItem(
      this._pipelineService.deletePublicQueueItemByGroup(org.id, group)
    );
  }

  @Delete('/pipelines/queue/:id')
  deleteQueueItemById(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return this.deleteQueueItem(
      this._pipelineService.deletePublicQueueItem(org.id, id)
    );
  }

  private async deleteQueueItem(
    result: ReturnType<PipelineService['deletePublicQueueItem']>
  ) {
    const deleted = await result;
    if (deleted.outcome === 'missing') {
      throw new HttpException({ msg: 'Queue item not found' }, 404);
    }
    if (deleted.outcome === 'rejected') {
      throw new HttpException(
        { msg: 'Only a queued or failed item can be deleted' },
        409
      );
    }
    return { id: deleted.id };
  }
}
