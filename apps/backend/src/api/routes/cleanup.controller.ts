import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Organization } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { CleanupService } from '@gitroom/nestjs-libraries/database/prisma/cleanup/cleanup.service';
import {
  CleanupAction,
  CleanupActionDto,
} from '@gitroom/nestjs-libraries/dtos/cleanup/cleanup.dto';

type OrgWithRole = Organization & { users: { role: string }[] };

@ApiTags('Cleanup')
@Controller('/cleanup')
export class CleanupController {
  constructor(private _cleanupService: CleanupService) {}

  // The policy guard lets everything through on installs without Stripe, so
  // the role is checked here instead
  private assertAdmin(org: OrgWithRole, action?: CleanupAction) {
    const role = org.users?.[0]?.role;
    if (!['ADMIN', 'SUPERADMIN'].includes(role)) {
      throw new ForbiddenException();
    }
    // the upload directory is shared by every organization of the install
    if (action === CleanupAction.ORPHAN_FILES_DELETE && role !== 'SUPERADMIN') {
      throw new ForbiddenException();
    }
  }

  @Get('/')
  async getSummary(@GetOrgFromRequest() org: OrgWithRole) {
    this.assertAdmin(org);
    const summary = await this._cleanupService.getSummary(org.id);
    // whole-installation figures are for the superadmin only
    return org.users[0].role === 'SUPERADMIN'
      ? summary
      : { ...summary, canScanFiles: false, diskBytes: null };
  }

  @Get('/preview')
  preview(
    @GetOrgFromRequest() org: OrgWithRole,
    @Query() query: CleanupActionDto
  ) {
    this.assertAdmin(org, query.action);
    return this._cleanupService.preview(org.id, query.action);
  }

  @Post('/')
  run(@GetOrgFromRequest() org: OrgWithRole, @Body() body: CleanupActionDto) {
    this.assertAdmin(org, body.action);
    return this._cleanupService.run(org.id, body.action);
  }
}
