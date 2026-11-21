import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Organization } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { PipelineService } from '@gitroom/nestjs-libraries/database/prisma/pipelines/pipeline.service';
import { toPublicPipelines } from '@gitroom/nestjs-libraries/database/prisma/pipelines/public.pipeline.list';
import { IntegrationManager, socialIntegrationList } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { getValidationSchemas } from '@gitroom/nestjs-libraries/chat/validation.schemas.helper';
import * as Sentry from '@sentry/nestjs';

@ApiTags('Public API')
@Controller('/public/v1')
export class PublicPipelinesController {
  constructor(
    private _pipelineService: PipelineService,
    private _integrationManager: IntegrationManager
  ) {}

  @Get('/pipelines')
  async getPipelines(@GetOrgFromRequest() org: Organization) {
    Sentry.metrics.count('public_api-request', 1);
    const pipelines = await this._pipelineService.getPublicPipelines(org.id);
    return toPublicPipelines(pipelines, {
      rules: this._integrationManager.getAllRulesDescription(),
      tools: this._integrationManager.getAllTools(),
      schemas: getValidationSchemas(),
      providers: socialIntegrationList,
    });
  }
}
